// Who is calling? The app sends the person's Supabase sign-in token; we ask Supabase who it
// belongs to. Answers are remembered for a few minutes inside this server copy so a page
// with several photos doesn't ask Supabase every time.
import { SUPABASE_URL, SUPABASE_KEY } from '../../js/config.js';

const seen = new Map();   // token -> { id, until }
export async function whoIs(request) {
  const m = /^Bearer\s+(\S{20,4096})$/.exec(request.headers.get('authorization') || '');
  if (!m || !SUPABASE_URL) return null;
  const token = m[1];
  const hit = seen.get(token);
  if (hit && hit.until > Date.now()) return hit.id;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!/^[0-9a-f-]{36}$/.test(u?.id || '')) return null;
  if (seen.size > 500) seen.clear();
  seen.set(token, { id: u.id, until: Date.now() + 5 * 60000 });
  return u.id;
}
export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});
export const sameSite = (request) => { const s = request.headers.get('sec-fetch-site'); return !s || s === 'same-origin' || s === 'none'; };

// A simple per-person allowance (per server copy): `max` calls per hour.
const calls = new Map();
export function allowed(id, max) {
  const now = Date.now(); const list = (calls.get(id) || []).filter((t) => now - t < 3600000);
  if (list.length >= max) { calls.set(id, list); return false; }
  list.push(now); calls.set(id, list); if (calls.size > 2000) calls.clear();
  return true;
}
