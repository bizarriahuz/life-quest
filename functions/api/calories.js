// Calorie estimate for a typed meal ("nasi lemak with fried chicken"). Runs on Cloudflare
// Workers AI (the AI binding). Signed-in people only, 60 estimates an hour each.
// It's an estimate: the app says so, and the person can change the number.
import { whoIs, json, sameSite, allowed } from '../_shared/auth.js';

// Llama 3.3 70B: supports JSON mode on Workers AI and isn't a "thinking" model (those can spend
// the whole reply allowance reasoning and return no answer).
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, portion: { type: 'string' }, kcal: { type: 'number' } }, required: ['name', 'kcal'] } },
    note: { type: 'string' },
  },
  required: ['items'],
};
const SYSTEM = `You estimate food energy. The user describes what they ate, often Singaporean or Malaysian dishes (hawker food), sometimes with portions.
Break it into items, assume a typical single portion where none is given, and estimate kilocalories for each.
Answer only with JSON: {"items":[{"name":"...","portion":"...","kcal":123}],"note":"..."}.
"note" is one short sentence on the biggest uncertainty (e.g. portion size or oil), or "".
If the text is not food or drink, answer {"items":[],"note":"That doesn't look like food."}.`;

function parse(out) {
  const msg = out?.choices?.[0]?.message;
  let text = out?.response ?? msg?.content ?? msg?.reasoning_content ?? out?.result?.response ?? out;
  if (text && typeof text === 'object') return Array.isArray(text.items) ? text : null;
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
    const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }];
    let d = null;
    try {
      d = parse(await env.AI.run(MODEL, { messages, max_tokens: 700, temperature: 0.2, response_format: { type: 'json_schema', json_schema: SCHEMA } }));
    } catch { /* JSON mode couldn't be met: ask again plainly below */ }
    if (!d) d = parse(await env.AI.run(MODEL, { messages, max_tokens: 700, temperature: 0.2 }));
    if (!d) throw new Error('no answer');
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
