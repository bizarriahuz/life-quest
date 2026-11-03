// ONE-OFF: copies the old Supabase data in, sent straight from the Supabase database (pg_net).
// Locked with a key whose SHA-256 is below; the key itself is never in the repo. Delete this file after the switch.
import { json, sha256 } from '../_lib/util.js';
import { TABLES, COLS } from '../_lib/schema.js';

const KEY_SHA256 = '9467b45d50b67024b546b817dff69dc555acc593ed766911c0fbd260e6a8a26c';

import { ORDER } from '../_lib/order.js';

const iso = (v) => (v == null ? null : new Date(v).toISOString());
function convert(table, r) {
  if (table === 'users') {
    return { id: r.id, email: String(r.email).toLowerCase(), password_hash: r.encrypted_password || '!', email_confirmed_at: iso(r.email_confirmed_at),
      created_at: iso(r.created_at), last_sign_in_at: iso(r.last_sign_in_at), last_seen_at: iso(r.last_seen_at) };
  }
  if (table === 'app_admins') return { user_id: r.user_id };
  const o = {};
  for (const [k, c] of Object.entries(COLS[table])) {
    let v = r[k];
    if (v === undefined) continue;
    if (v !== null) {
      if (c.type === 'bool') v = v ? 1 : 0;
      else if (c.type === 'json') v = JSON.stringify(v);
      else if (c.type === 'ts') v = iso(v);
      else if (c.type === 'time') v = String(v).slice(0, 8);
      else if (c.type === 'num' || c.type === 'int') v = Number(v);
    }
    o[k] = v;
  }
  return o;
}
const columns = (table) => (table === 'users'
  ? ['id', 'email', 'password_hash', 'email_confirmed_at', 'created_at', 'last_sign_in_at', 'last_seen_at']
  : table === 'app_admins' ? ['user_id'] : Object.keys(COLS[table]));

export async function importRows(db, table, input) {
  if (!ORDER.includes(table)) throw new Error(`unknown table ${table}`);
  const list = input.map((r) => convert(table, r));
  const cols = columns(table);
  const sql = `insert or ignore into ${table}(${cols.join(', ')}) select ${cols.map((c) => `value->>'${c}'`).join(', ')} from json_each(?)`;
  await db.prepare(sql).bind(JSON.stringify(list)).run();
  return list.length;
}

// start clean: children first
async function wipe(db) {
  await db.batch([...[...ORDER].reverse().map((t) => db.prepare(`delete from ${t}`)),
    db.prepare('delete from sessions'), db.prepare('delete from email_tokens'), db.prepare('delete from project_versions')]);
}

export async function onRequestPost({ request, env }) {
  const key = request.headers.get('x-import-key') || '';
  if (!key || (await sha256(key)) !== KEY_SHA256) return json({ error: 'Not found' }, 404);
  const b = await request.json().catch(() => ({}));
  const db = env.DB;
  if (b.action === 'wipe') { await wipe(db); return json({ ok: true }); }
  if (b.action === 'count') {
    const out = {};
    for (const t of ORDER) out[t] = (await db.prepare(`select count(*) n from ${t}`).first()).n;
    return json(out);
  }
  if (b.action === 'all') {
    // everything in one go (the whole database is about 250 KB): wipe, then each table parents-first
    await wipe(db);
    const done = {};
    try {
      for (const t of ORDER) if (Array.isArray(b.tables?.[t]) && b.tables[t].length) done[t] = await importRows(db, t, b.tables[t]);
    } catch (e) {
      return json({ error: String(e.message || e), done }, 500);
    }
    return json({ ok: true, done });
  }
  if (!Array.isArray(b.rows)) return json({ error: 'rows missing' }, 400);
  try {
    return json({ ok: true, table: b.table, rows: await importRows(db, b.table, b.rows) });
  } catch (e) {
    return json({ error: String(e.message || e), table: b.table }, 500);
  }
}

export { TABLES };
