// Project / couple photos in R2 (bucket bound as PHOTOS). Paths look like "<project id>/<photo id>.jpg".
//   GET  /api/photo?path=…            members of the project see it
//   PUT  /api/photo?path=…  (image)   owners and editors add one (3 MB max)
//   POST /api/photo {action:'remove', paths:[…]}   the owner, or the editor who added it
import { json, requireUser, Fail } from '../_lib/util.js';
import { role } from '../_lib/projects.js';

const PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|webp|png)$/;
const TYPES = { jpg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
const MAX = 3 * 1024 * 1024;

export async function onRequest({ request: req, env }) {
  try {
    const site = req.headers.get('sec-fetch-site');
    if (site && !['same-origin', 'none'].includes(site)) return json({ error: 'Not allowed' }, 403);
    if (!env.PHOTOS) return json({ error: 'Photos aren’t set up yet.' }, 503);
    const db = env.DB;
    const user = await requireUser(db, req);
    const url = new URL(req.url);

    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (b.action !== 'remove' || !Array.isArray(b.paths)) return json({ error: 'Unknown action' }, 400);
      for (const p of b.paths.slice(0, 100)) {
        const m = PATH.exec(String(p));
        if (!m) continue;
        const r = await role(db, user.id, m[1]);
        const obj = r && (await env.PHOTOS.head(p));
        if (!obj) continue;
        if (r === 'owner' || (r === 'editor' && obj.customMetadata?.uploader === user.id)) await env.PHOTOS.delete(p);
        else return json({ error: 'You can only remove photos you added.' }, 403);
      }
      return json({ ok: true });
    }

    const path = url.searchParams.get('path') || '';
    const m = PATH.exec(path);
    if (!m) return json({ error: 'Not found' }, 404);
    const r = await role(db, user.id, m[1]);
    if (!r) return json({ error: 'Not found' }, 404);

    if (req.method === 'GET') {
      const obj = await env.PHOTOS.get(path);
      if (!obj) return json({ error: 'Not found' }, 404);
      return new Response(obj.body, { headers: { 'content-type': TYPES[m[2]], 'cache-control': 'private, max-age=86400', etag: obj.httpEtag } });
    }

    if (req.method === 'PUT') {
      if (!['owner', 'editor'].includes(r)) return json({ error: 'You can’t add photos to this project.' }, 403);
      const type = (req.headers.get('content-type') || '').split(';')[0];
      if (!Object.values(TYPES).includes(type)) return json({ error: 'Only JPG, WebP or PNG photos.' }, 415);
      const len = Number(req.headers.get('content-length') || 0);
      if (len > MAX) return json({ error: 'That photo is too big (3 MB at most).' }, 413);
      const buf = await req.arrayBuffer();
      if (buf.byteLength > MAX) return json({ error: 'That photo is too big (3 MB at most).' }, 413);
      if (await env.PHOTOS.head(path)) return json({ error: 'That photo already exists.' }, 409);
      await env.PHOTOS.put(path, buf, { httpMetadata: { contentType: type }, customMetadata: { uploader: user.id } });
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
