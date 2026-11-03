// Shared helpers for the Life Quest API (Cloudflare Pages Functions + D1).
import bcrypt from './vendor/bcrypt.cjs';

export class Fail extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const fail = (m, s) => { throw new Fail(m, s); };

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});

// Wrap a handler: JSON body in, JSON out, friendly errors.
export function handler(fn) {
  return async (ctx) => {
    try {
      const req = ctx.request;
      if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
      // Only same-site pages may call the API (cookies + this header together block cross-site requests).
      const site = req.headers.get('sec-fetch-site');
      if (site && !['same-origin', 'none'].includes(site)) return json({ error: 'Not allowed' }, 403);
      if (!(req.headers.get('content-type') || '').includes('application/json')) return json({ error: 'Not allowed' }, 415);
      const body = await req.json().catch(() => ({}));
      const res = await fn({ ...ctx, body, db: ctx.env.DB });
      return res instanceof Response ? res : json(res ?? { ok: true });
    } catch (e) {
      if (e && e.status) return json({ error: e.message }, e.status);
      const msg = String(e?.message || e);
      if (/UNIQUE constraint failed/i.test(msg)) return json({ error: 'That entry already exists.', code: '23505' }, 409);
      if (/FOREIGN KEY constraint failed/i.test(msg)) return json({ error: 'That item no longer exists.' }, 409);
      console.error(e);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  };
}

// ---------- tokens & hashing ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)));
export async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
export function randomToken(bytes = 32) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const ITER = 100000; // Workers' PBKDF2 maximum
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${hex(salt)}$${await pbkdf2(pw, salt, ITER)}`;
}
// { ok, legacy } — legacy = a bcrypt hash carried over from Supabase, to be upgraded after a good sign-in.
export async function verifyPassword(pw, stored) {
  if (!stored) return { ok: false };
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt, want] = stored.split('$');
    const got = await pbkdf2(pw, unhex(salt), Number(iter));
    let diff = got.length ^ want.length;
    for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
    return { ok: diff === 0, legacy: false };
  }
  if (/^\$2[aby]\$/.test(stored)) return { ok: bcrypt.compareSync(pw, stored), legacy: true };
  return { ok: false };
}

// ---------- sessions (HttpOnly cookie) ----------
export const COOKIE = 'lq_session';
const DAYS = 90;
export function sessionCookie(token, req) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return token
    ? `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure}`
    : `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
export function cookieToken(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}
export async function newSession(db, userId) {
  const token = randomToken();
  await db.prepare('insert into sessions(token_hash, user_id, last_seen) values (?, ?, ?)').bind(await sha256(token), userId, now()).run();
  return token;
}
// The signed-in user, or null.
export async function currentUser(db, req) {
  const token = cookieToken(req);
  if (!token) return null;
  const h = await sha256(token);
  const u = await db.prepare(`select u.id, u.email, u.email_confirmed_at, s.last_seen, s.created_at s_created
    from sessions s join users u on u.id = s.user_id where s.token_hash = ?`).bind(h).first();
  if (!u) return null;
  if (Date.parse(u.s_created) < Date.now() - DAYS * 864e5) { await db.prepare('delete from sessions where token_hash = ?').bind(h).run(); return null; }
  if (!u.last_seen || Date.parse(u.last_seen) < Date.now() - 3600e3) {
    await db.batch([
      db.prepare('update sessions set last_seen = ? where token_hash = ?').bind(now(), h),
      db.prepare('update users set last_seen_at = ? where id = ?').bind(now(), u.id),
    ]);
  }
  return { id: u.id, email: u.email, token_hash: h };
}
export async function requireUser(db, req) {
  const u = await currentUser(db, req);
  if (!u) fail('Please sign in again.', 401);
  return u;
}

// ---------- rate limits ----------
// Allows `max` hits per key within `minutes`; throws a friendly error past that.
export async function limit(db, key, max, minutes, message = 'Too many tries. Please wait a few minutes and try again.') {
  const since = new Date(Date.now() - minutes * 60e3).toISOString();
  const r = await db.prepare('select count(*) n from hits where key = ? and at > ?').bind(key, since).first();
  if (r.n >= max) fail(message, 429);
  await db.prepare('insert into hits(key) values (?)').bind(key).run();
  if (Math.random() < 0.02) await db.prepare("delete from hits where at < ?").bind(new Date(Date.now() - 864e5).toISOString()).run();
}

export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const clientIp = (req) => req.headers.get('cf-connecting-ip') || 'local';
