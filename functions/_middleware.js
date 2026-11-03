// Runs before every request.
// 1. The app moved to lifequestapp.pages.dev. Anyone arriving at the old address
//    (old links, home-screen icons) is sent to the same page on the new one.
// 2. API calls make sure the database tables are up to date first (schema.sql, applied once per change).
import { VERSION, SQL } from './_lib/schema-sql.js';

const OLD = 'life-quest-7qp.pages.dev';
const NEW = 'lifequestapp.pages.dev';
let ready = null; // per isolate

async function ensureSchema(db) {
  const have = await db.prepare("select value from meta where key = 'schema'").first().catch(() => null);
  if (have?.value === VERSION) return;
  const statements = SQL.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
  await db.batch(statements.map((s) => db.prepare(s)));
  await db.prepare("insert into meta(key, value) values ('schema', ?) on conflict(key) do update set value = excluded.value").bind(VERSION).run();
}

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (url.hostname === OLD) {
    url.hostname = NEW;
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/ics' && !env.DB) {
    return new Response(JSON.stringify({ error: 'The database isn’t connected yet (Pages → Settings → Bindings → D1 “DB”).' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/ics') {
    ready ??= ensureSchema(env.DB).catch((e) => { ready = null; throw e; });
    try { await ready; } catch (e) {
      console.error('schema', e);
      return new Response(JSON.stringify({ error: 'The server is starting up. Please try again in a moment.' }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
  }
  return next();
}
