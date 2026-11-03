// Private tables: every row belongs to one person (user_id) and only they can see or change it.
import { TABLES, COLS, forInsert, forUpdate, checkRow, Invalid } from './schema.js';
import { filters, tail, rows, one, insertSql, setSql, col } from './query.js';
import { fail } from './util.js';

const PER_MINUTE = 60;

async function caps(db, table, uid) {
  const d = TABLES[table];
  if (!d.cap) return;
  const since = new Date(Date.now() - 60e3).toISOString();
  const r = await db.prepare(`select count(*) total, sum(created_at > ?) recent from ${table} where user_id = ?`).bind(since, uid).first();
  if (r.total >= d.cap) fail(`Limit reached: ${d.cap.toLocaleString('en-US')} ${d.label} at most. Delete some old ones to add more.`);
  if ((r.recent || 0) >= PER_MINUTE) fail('Too many changes at once. Wait a minute and try again.', 429);
}

// Linked rows (a task's goal, a session's hobby …) must be your own.
async function refs(db, table, row, uid) {
  for (const [c, [parent]] of Object.entries(TABLES[table].refs || {})) {
    if (row[c] == null) continue;
    const ok = await db.prepare(`select 1 from ${parent} where id = ? and user_id = ?`).bind(row[c], uid).first();
    if (!ok) fail('That linked item no longer exists.', 409);
  }
}

async function notesTotal(db, uid, row, id = null) {
  const r = await db.prepare('select coalesce(sum(length(title) + length(body)), 0) used from notes where user_id = ? and id is not ?').bind(uid, id).first();
  if (r.used + [...(row.title || '')].length + [...(row.body || '')].length > 2000000) {
    fail('Notes are full (2 million characters in total). Delete some old notes to make room.');
  }
}

export const isOwn = (t) => !!TABLES[t]?.owner && t !== 'profiles';

export async function list(db, uid, table, o) {
  const { w, args } = filters(table, o);
  return rows(db, table, `select * from ${table} where ${['user_id = ?', ...w].join(' and ')}${tail(table, o)}`, uid, ...args);
}

export async function insert(db, uid, table, input) {
  const row = forInsert(table, input || {}, { user_id: uid });
  checkRow(table, row);
  await caps(db, table, uid);
  await refs(db, table, row, uid);
  if (table === 'notes') await notesTotal(db, uid, row);
  const { sql, args } = insertSql(table, row);
  return one(db, table, sql, ...args);
}

export async function update(db, uid, table, id, patchIn) {
  const patch = forUpdate(table, patchIn);
  const cur = await db.prepare(`select * from ${table} where id = ? and user_id = ?`).bind(id, uid).first();
  if (!cur) fail('That item no longer exists.', 404);
  if (!Object.keys(patch).length) return one(db, table, `select * from ${table} where id = ?`, id);
  const merged = { ...cur, ...patch };
  checkRow(table, merged);
  await refs(db, table, patch, uid);
  if (table === 'notes' && ('title' in patch || 'body' in patch)) await notesTotal(db, uid, merged, id);
  const { set, args } = setSql(patch);
  return one(db, table, `update ${table} set ${set} where id = ? and user_id = ? returning *`, ...args, id, uid);
}

export async function updateWhere(db, uid, table, match, patchIn) {
  const patch = forUpdate(table, patchIn);
  const { w, args } = filters(table, { match });
  if (!w.length) fail('Nothing to change.');
  if (!Object.keys(patch).length) return [];
  const { set, args: sa } = setSql(patch);
  return rows(db, table, `update ${table} set ${set} where ${['user_id = ?', ...w].join(' and ')} returning *`, ...sa, uid, ...args);
}

export async function remove(db, uid, table, id) {
  await db.prepare(`delete from ${table} where id = ? and user_id = ?`).bind(id, uid).run();
}

export async function removeWhere(db, uid, table, match) {
  const { w, args } = filters(table, { match });
  if (!w.length) fail('Nothing to remove.');
  await db.prepare(`delete from ${table} where ${['user_id = ?', ...w].join(' and ')}`).bind(uid, ...args).run();
}

// XP: one entry per (source, source id); repeats are ignored.
export async function award(db, uid, stat, amount, source, sourceId) {
  const row = forInsert('xp_events', { stat, amount, source, source_id: String(sourceId) }, { user_id: uid });
  const have = await db.prepare('select 1 from xp_events where user_id = ? and source = ? and source_id = ?').bind(uid, row.source, row.source_id).first();
  if (have) return;
  await caps(db, 'xp_events', uid);
  const { sql, args } = insertSql('xp_events', row);
  await db.prepare(sql.replace('insert into', 'insert or ignore into')).bind(...args).run();
}

export async function totals(db, uid) {
  const r = await db.prepare('select stat, sum(amount) xp from xp_events where user_id = ? group by stat').bind(uid).all();
  return Object.fromEntries(r.results.map((x) => [x.stat, x.xp]));
}

// Backup restore: put rows back, skipping any that clash. Ids from the file are kept so links between rows survive.
export async function restore(db, uid, table, input) {
  if (!Array.isArray(input) || input.length > 200) fail('Send at most 200 rows at a time.');
  let added = 0;
  for (const r of input) {
    try {
      const sys = { user_id: uid };
      if (r.id && COLS[table].id) sys.id = String(r.id);
      if (r.created_at) sys.created_at = new Date(r.created_at).toISOString();
      const { id, user_id, created_at, ...rest } = r;
      const row = forInsert(table, rest, sys);
      checkRow(table, row);
      await refs(db, table, row, uid);
      const { sql, args } = insertSql(table, row);
      const res = await db.prepare(sql.replace('insert into', 'insert or ignore into').replace(' returning *', '')).bind(...args).run();
      if (res.meta.changes) added += 1;
    } catch (e) {
      if (!(e instanceof Invalid) && !e.status) throw e;
    }
  }
  if (added) await caps(db, table, uid).catch(() => {});
  return { added, skipped: input.length - added };
}

// ---------- profile ----------
export const memberName = (heroName) => {
  const n = String(heroName || '').trim();
  return n && n !== 'HERO' && n !== 'You' ? n : 'Member';
};
export async function profile(db, uid) {
  let p = await one(db, 'profiles', 'select * from profiles where user_id = ?', uid);
  if (!p) {
    await db.prepare('insert or ignore into profiles(user_id) values (?)').bind(uid).run();
    p = await one(db, 'profiles', 'select * from profiles where user_id = ?', uid);
  }
  return p;
}
export async function saveProfile(db, uid, patchIn) {
  await profile(db, uid);
  const patch = forUpdate('profiles', patchIn);
  if (!Object.keys(patch).length) return profile(db, uid);
  const { set, args } = setSql(patch);
  const p = await one(db, 'profiles', `update profiles set ${set} where user_id = ? returning *`, ...args, uid);
  // your name in shared projects follows your Life Quest name
  if ('hero_name' in patch) {
    await db.prepare('update project_members set display_name = ? where user_id = ?').bind(memberName(p.hero_name), uid).run();
  }
  return p;
}

export { col };
