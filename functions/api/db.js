// The data API the app's store talks to: { action, table, ... } in, rows out.
// Private tables are filtered to the signed-in person; shared-project rules live in _lib/projects.js.
import { handler, fail, requireUser, now } from '../_lib/util.js';
import { TABLES, forInsert } from '../_lib/schema.js';
import { rows, one, insertSql, filters, tail } from '../_lib/query.js';
import * as own from '../_lib/own.js';
import * as proj from '../_lib/projects.js';

const known = (t) => { if (!TABLES[t] || t === 'profiles') fail(`Unknown table: ${t}`, 404); return t; };
const isAdmin = async (db, uid) => !!(await db.prepare('select 1 from app_admins where user_id = ?').bind(uid).first());

async function feedback(db, user, action, b) {
  const admin = await isAdmin(db, user.id);
  if (action === 'list') {
    const { w, args } = filters('feedback', b.o);
    const where = admin ? w : ['user_id = ?', ...w];
    return rows(db, 'feedback', `select * from feedback${where.length ? ` where ${where.join(' and ')}` : ''}${tail('feedback', b.o)}`, ...(admin ? args : [user.id, ...args]));
  }
  if (action === 'insert') {
    const h = await db.prepare('select count(*) n, sum(created_at > ?) recent from feedback where user_id = ?').bind(new Date(Date.now() - 3600e3).toISOString(), user.id).first();
    if ((h.recent || 0) >= 10) fail('Thanks! That’s a lot of feedback in one hour. Please try again a bit later.', 429);
    if (h.n >= 500) fail('Feedback limit reached.');
    const p = await db.prepare('select hero_name from profiles where user_id = ?').bind(user.id).first();
    const row = forInsert('feedback', { ...b.row, status: 'new', reply_to: null },
      { user_id: user.id, sender_name: p?.hero_name || null, reply_to: b.row?.reply_to ? user.email : null });
    const { sql, args } = insertSql('feedback', row);
    return one(db, 'feedback', sql, ...args);
  }
  if (action === 'update') {
    if (!admin) fail('Not allowed.', 403);
    const status = b.patch?.status;
    if (!['new', 'read', 'done'].includes(status)) fail('That status isn’t valid.');
    return one(db, 'feedback', 'update feedback set status = ? where id = ? returning *', status, b.id);
  }
  fail('Not allowed.', 403);
}

// Maker-only overview: names and activity counts, never anyone's entries or email.
async function adminStats(db, uid) {
  if (!(await isAdmin(db, uid))) fail('Not allowed.', 403);
  const week = new Date(Date.now() - 7 * 864e5).toISOString(), day = new Date(Date.now() - 864e5).toISOString();
  const month = new Date(Date.now() - 30 * 864e5).toISOString();
  const us = (await db.prepare(`select u.id, u.created_at, u.email_confirmed_at is not null confirmed, p.hero_name, p.sections,
      max(coalesce(u.last_sign_in_at, ''), coalesce(u.last_seen_at, ''), coalesce((select max(created_at) from xp_events x where x.user_id = u.id), '')) last_seen,
      (select count(*) from xp_events x where x.user_id = u.id and x.created_at > ?) xp7,
      (select coalesce(sum(amount), 0) from xp_events x where x.user_id = u.id) xp_total
    from users u left join profiles p on p.user_id = u.id`).bind(week).all()).results;
  const users = us.map((u) => {
    const sections = u.sections ? JSON.parse(u.sections) : null;
    return { ...u, last_seen: u.last_seen || null, sections };
  }).sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''));
  const secCount = {}, signups = {};
  for (const u of users) for (const s of u.sections || []) secCount[s] = (secCount[s] || 0) + 1;
  for (const u of users) if (u.created_at > month) {
    const d = new Date(Date.parse(u.created_at) + 8 * 3600e3).toISOString().slice(0, 10);
    signups[d] = (signups[d] || 0) + 1;
  }
  const fb = await db.prepare("select count(*) n from feedback where status = 'new'").first();
  const pk = await db.prepare("select sum(kind = 'couple') couples, sum(kind = 'project') projects from projects").first();
  return {
    total: users.length,
    confirmed: users.filter((u) => u.confirmed).length,
    active7: users.filter((u) => u.last_seen > week).length,
    active1: users.filter((u) => u.last_seen > day).length,
    new7: users.filter((u) => u.created_at > week).length,
    users: users.map((u) => ({
      me: u.id === uid, name: (u.hero_name || '').trim() || null, joined: u.created_at, confirmed: !!u.confirmed,
      last_seen: u.last_seen, xp7: u.xp7, xp_total: u.xp_total, sections: u.sections ? u.sections.length : null,
    })),
    sections: secCount,
    not_set_up: users.filter((u) => !u.sections).length,
    signups,
    feedback_new: fb.n,
    couples: pk.couples || 0,
    projects: pk.projects || 0,
  };
}

async function rpc(db, user, fn, a = {}) {
  switch (fn) {
    case 'is_admin': return isAdmin(db, user.id);
    case 'admin_stats': return adminStats(db, user.id);
    case 'invite_info': return proj.inviteInfo(db, user.id, a.p_token);
    case 'invite_kind': return proj.inviteKind(db, user.id, a.p_token);
    case 'join_project': return proj.join(db, user.id, a.p_token);
    case 'answer_authors': return proj.answerAuthors(db, user.id, a.p, a.d);
    default: fail(`Unknown function: ${fn}`, 404);
  }
}

// Everything in a table the person can see, for the backup download.
async function dump(db, user, table) {
  if (table === 'profiles') return [await own.profile(db, user.id)];
  if (table === 'feedback') return feedback(db, user, 'list', { o: { order: 'created_at', asc: true } });
  const order = { project_members: 'joined_at', project_invites: 'created_at' }[table] || 'id';
  const o = { order, asc: true };
  return proj.SHARED.has(table) ? proj.list(db, user.id, table, o) : own.list(db, user.id, table, o);
}

export const onRequest = handler(async ({ request, body: b, db }) => {
  const user = await requireUser(db, request);
  const uid = user.id;
  const t = b.table;
  switch (b.action) {
    case 'me': return { id: uid, email: user.email };
    case 'profile': return own.profile(db, uid);
    case 'saveProfile': return own.saveProfile(db, uid, b.patch);
    case 'totals': return own.totals(db, uid);
    case 'award': await own.award(db, uid, b.stat, b.amount, b.source, b.source_id); return { ok: true };
    case 'rpc': return { data: await rpc(db, user, b.fn, b.args) };
    case 'version': return { v: await proj.version(db, uid, b.project_id) };
    case 'dump': return dump(db, user, t);
    case 'now': return { now: now() };
  }
  known(t);
  if (t === 'feedback') return feedback(db, user, b.action, b);
  const mod = proj.SHARED.has(t) ? proj : own;
  switch (b.action) {
    case 'list': return mod.list(db, uid, t, b.o || {});
    case 'insert': return mod.insert(db, uid, t, b.row);
    case 'update': return mod.update(db, uid, t, String(b.id), b.patch);
    case 'remove': await mod.remove(db, uid, t, String(b.id)); return { ok: true };
    case 'removeWhere': await mod.removeWhere(db, uid, t, b.match); return { ok: true };
    case 'updateWhere': return mod.updateWhere(db, uid, t, b.match, b.patch);
    case 'restore':
      if (proj.SHARED.has(t)) fail('Shared projects can’t be restored from a file.', 400);
      return own.restore(db, uid, t, b.rows);
    default: fail('Unknown action', 404);
  }
});
