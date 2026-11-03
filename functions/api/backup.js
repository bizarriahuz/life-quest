// For the nightly backup (bizarriahuz/life-quest-backups): read-only copy of everything, locked with a key.
// The key is a GitHub secret (BACKUP_KEY) in the backups repo; only its SHA-256 is here.
//   GET /api/backup?what=db              every table as JSON (accounts included, sessions left out)
//   GET /api/backup?what=photos          list of photo paths
//   GET /api/backup?what=photo&path=…    one photo
import { json, sha256 } from '../_lib/util.js';
import { ORDER } from '../_lib/order.js';
import { VERSION, SQL } from '../_lib/schema-sql.js';

const KEY_SHA256 = 'd55f9fe358deea6bb5280cfd6440def512955c2f714c3189282293a0827c07fa';

export async function onRequestGet({ request, env }) {
  const key = request.headers.get('x-backup-key') || '';
  if (!key || (await sha256(key)) !== KEY_SHA256) return json({ error: 'Not found' }, 404);
  const url = new URL(request.url);
  const what = url.searchParams.get('what');
  const db = env.DB;
  if (what === 'db') {
    const tables = {};
    for (const t of ORDER) tables[t] = (await db.prepare(`select * from ${t}`).all()).results;
    return json({ taken: new Date().toISOString(), schema_version: VERSION, schema: SQL, tables });
  }
  if (what === 'photos') {
    if (!env.PHOTOS) return json({ paths: [] });
    const paths = [];
    let cursor;
    do {
      const page = await env.PHOTOS.list({ cursor, limit: 1000 });
      paths.push(...page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return json({ paths });
  }
  if (what === 'photo') {
    const obj = env.PHOTOS && (await env.PHOTOS.get(url.searchParams.get('path') || ''));
    if (!obj) return json({ error: 'Not found' }, 404);
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream' } });
  }
  return json({ error: 'Unknown' }, 400);
}
