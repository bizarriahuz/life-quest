// Journal photos, kept in a private Cloudflare R2 bucket (the JOURNAL binding).
// Each person's photos live under u/<their id>/, and only they can add, see or delete them.
// Photos arrive already shrunk by the app (longest side 1600px, JPEG).
import { whoIs, json, sameSite, allowed } from '../_shared/auth.js';

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_PHOTOS = 2000;   // per person
const KEY = /^u\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.jpg$/;

async function gate(request, env) {
  if (!sameSite(request)) return { error: json({ error: 'Not allowed' }, 403) };
  if (!env.JOURNAL) return { error: json({ error: 'Journal photos aren’t switched on yet' }, 503) };
  const id = await whoIs(request);
  if (!id) return { error: json({ error: 'Sign in to use photos' }, 401) };
  return { id };
}
const own = (key, id) => { const m = KEY.exec(key || ''); return m && m[1] === id; };

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env); if (g.error) return g.error;
  if (!allowed(`p:${g.id}`, 120)) return json({ error: 'Too many uploads this hour' }, 429);
  if (!/^image\/jpeg$/.test(request.headers.get('content-type') || '')) return json({ error: 'Photos only' }, 415);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return json({ error: 'That photo is too big' }, 413);
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_BYTES) return json({ error: 'That photo is too big' }, 413);
  const head = new Uint8Array(body.slice(0, 3));
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return json({ error: 'Photos only' }, 415);
  let count = 0; let cursor;
  do { const l = await env.JOURNAL.list({ prefix: `u/${g.id}/`, cursor, limit: 1000 }); count += l.objects.length; cursor = l.truncated ? l.cursor : null; } while (cursor && count < MAX_PHOTOS);
  if (count >= MAX_PHOTOS) return json({ error: 'You’ve reached the photo limit for the journal' }, 409);
  const key = `u/${g.id}/${crypto.randomUUID()}.jpg`;
  await env.JOURNAL.put(key, body, { httpMetadata: { contentType: 'image/jpeg' } });
  return json({ key }, 201);
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env); if (g.error) return g.error;
  const key = new URL(request.url).searchParams.get('key');
  if (!own(key, g.id)) return json({ error: 'Not found' }, 404);
  const obj = await env.JOURNAL.get(key);
  if (!obj) return json({ error: 'Not found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } });
}

export async function onRequestDelete({ request, env }) {
  const g = await gate(request, env); if (g.error) return g.error;
  const key = new URL(request.url).searchParams.get('key');
  if (!own(key, g.id)) return json({ error: 'Not found' }, 404);
  await env.JOURNAL.delete(key);
  return json({ ok: true });
}
