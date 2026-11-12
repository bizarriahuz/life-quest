// Calorie estimate for a typed meal ("nasi lemak with fried chicken"). Runs on Cloudflare
// Workers AI (the AI binding). Signed-in people only, 60 estimates an hour each.
// It's an estimate: the app says so, and the person can change the number.
import { whoIs, json, sameSite, allowed } from '../_shared/auth.js';

const MODEL = '@cf/zai-org/glm-4.7-flash';
const SYSTEM = `You estimate food energy. The user describes what they ate, often Singaporean or Malaysian dishes (hawker food), sometimes with portions.
Break it into items, assume a typical single portion where none is given, and estimate kilocalories for each.
Answer only with JSON: {"items":[{"name":"...","portion":"...","kcal":123}],"note":"..."}.
"note" is one short sentence on the biggest uncertainty (e.g. portion size or oil), or "".
If the text is not food or drink, answer {"items":[],"note":"That doesn't look like food."}.`;

function parse(out) {
  let text = out?.response ?? out?.choices?.[0]?.message?.content ?? out;
  if (text && typeof text === 'object') return text;
  text = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

export async function onRequestPost({ request, env }) {
  if (!sameSite(request)) return json({ error: 'Not allowed' }, 403);
  const id = await whoIs(request);
  if (!id) return json({ error: 'Sign in to get estimates' }, 401);
  if (!env.AI) return json({ error: 'Calorie estimates aren’t switched on yet' }, 503);
  if (!allowed(id, 60)) return json({ error: 'That’s a lot of estimates for one hour. Try again a bit later.' }, 429);
  let text = '';
  try { text = String((await request.json()).text || '').trim().slice(0, 200); } catch { /* bad body */ }
  if (text.length < 2) return json({ error: 'Type what you ate' }, 400);
  try {
    const out = await env.AI.run(MODEL, {
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }],
      max_tokens: 600, temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const d = parse(out);
    const items = (Array.isArray(d?.items) ? d.items : []).slice(0, 12).map((x) => ({
      name: String(x.name || '').slice(0, 60), portion: String(x.portion || '').slice(0, 40),
      kcal: Math.max(0, Math.min(5000, Math.round(Number(x.kcal) || 0))),
    })).filter((x) => x.name);
    const total = Math.min(5000, items.reduce((n, x) => n + x.kcal, 0));
    return json({ items, total, note: String(d?.note || '').slice(0, 160) });
  } catch {
    return json({ error: 'Couldn’t estimate that right now. You can type the number yourself.' }, 502);
  }
}
