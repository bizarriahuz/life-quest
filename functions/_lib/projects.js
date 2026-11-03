// Shared projects and the couple space: the only rows other people can see.
// Same rules as the old Postgres policies and triggers: members read, owners/editors write, joining only by invite link.
import { forInsert, forUpdate } from './schema.js';
import { filters, tail, rows, one, insertSql, setSql } from './query.js';
import { fail, now, today, randomToken } from './util.js';
import { memberName } from './own.js';

export const SHARED = new Set(['projects', 'project_members', 'project_invites', 'project_entries', 'project_comments', 'project_reactions']);
const COUPLE_KINDS = ['idea', 'memory', 'countdown', 'love', 'answer'];

export async function role(db, uid, pid) {
  const r = await db.prepare('select role from project_members where project_id = ? and user_id = ?').bind(pid, uid).first();
  return r?.role || null;
}
const need = (r, ...ok) => { if (!r || !ok.includes(r)) fail(r ? 'You can’t change this project.' : 'That project isn’t available.', 403); };
export async function bump(db, pid) {
  await db.prepare('insert into project_versions(project_id, v) values (?, 1) on conflict(project_id) do update set v = v + 1').bind(pid).run();
}
async function myName(db, uid) {
  const p = await db.prepare('select hero_name from profiles where user_id = ?').bind(uid).first();
  return memberName(p?.hero_name);
}
async function inCouple(db, uid) {
  return !!(await db.prepare(`select 1 from project_members m join projects p on p.id = m.project_id where m.user_id = ? and p.kind = 'couple'`).bind(uid).first());
}
const isMember = (db, pid, uid) => db.prepare('select 1 from project_members where project_id = ? and user_id = ?').bind(pid, uid).first();
const MINE = 'project_id in (select project_id from project_members where user_id = ?)';

// ---------- read ----------
export async function list(db, uid, table, o) {
  const { w, args } = filters(table, o);
  let base;
  if (table === 'projects') base = ['id in (select project_id from project_members where user_id = ?)'];
  else if (table === 'project_invites') base = [`project_id in (select project_id from project_members where user_id = ? and role = 'owner')`];
  else if (table === 'project_entries') {
    // a day's answer shows only after you've given yours
    base = [MINE, `(kind <> 'answer' or author_id = ?1 or exists (select 1 from project_entries a where a.project_id = project_entries.project_id
      and a.kind = 'answer' and a.title = project_entries.title and a.author_id = ?1))`];
  } else base = [MINE];
  const sql = `select * from ${table} where ${[...base, ...w].join(' and ')}${tail(table, o)}`;
  // ?1 = the user everywhere it's used
  const all = sql.replace(/= \?(?!\d)/, '= ?1');
  return rows(db, table, renumber(all), uid, ...args);
}
// Turn the remaining plain "?" into ?2, ?3 … so ?1 can be reused for the user id.
function renumber(sql) { let n = 1; return sql.replace(/\?(\d+)?/g, (m, d) => (d ? m : `?${++n}`)); }

// ---------- entries: the old entries_guard + photo_guard ----------
async function guardEntry(db, uid, r, old) {
  if (!old) {
    const c = await db.prepare(`select count(*) n, sum(author_id = ? and created_at > ?) recent from project_entries where project_id = ?`)
      .bind(uid, new Date(Date.now() - 60e3).toISOString(), r.project_id).first();
    if (c.n >= 5000) fail('This project is full (5,000 entries). Remove some old ones to add more.');
    const mine = await db.prepare('select count(*) n from project_entries where author_id = ? and created_at > ?').bind(uid, new Date(Date.now() - 60e3).toISOString()).first();
    if (mine.n >= 60) fail('Too many changes at once. Wait a minute and try again.', 429);
  } else {
    Object.assign(r, { project_id: old.project_id, author_id: old.author_id, author_name: old.author_name, created_at: old.created_at, kind: old.kind });
    if (['answer', 'love'].includes(old.kind) && uid !== old.author_id) {
      if (old.kind === 'answer') fail('You can only change your own answer.', 403);
      Object.assign(r, { title: old.title, body: old.body, assignee_id: old.assignee_id });
    }
    if (old.kind === 'love') r.assignee_id = old.assignee_id;
  }
  if (COUPLE_KINDS.includes(r.kind)) {
    const p = await db.prepare('select kind from projects where id = ?').bind(r.project_id).first();
    if (p?.kind !== 'couple') fail('That only works in a couple space.');
  }
  if (r.kind === 'answer' && !/^\d{4}-\d{2}-\d{2}$/.test(r.title)) fail('Answers belong to a day.');
  if (r.kind === 'love' && (!r.assignee_id || r.assignee_id === r.author_id)) fail('Notes are for your partner.');
  if (['countdown', 'event'].includes(r.kind) && !r.due_on) fail('Pick a date.');
  for (const c of ['assignee_id', 'paid_by']) {
    if (r[c] && !(await isMember(db, r.project_id, r[c]))) fail('That person isn’t in this project.');
  }
  if (!['task', 'love'].includes(r.kind)) r.assignee_id = null;
  if (!['task', 'idea', 'love'].includes(r.kind)) r.done = 0;
  if (!['task', 'countdown', 'memory', 'event'].includes(r.kind)) r.due_on = null;
  if (r.kind !== 'countdown') r.yearly = 0;
  if (r.kind !== 'event') { r.start_time = null; r.end_time = null; }
  if (!r.start_time) r.end_time = null;
  if (r.end_time && r.end_time < r.start_time) fail('The end time is before the start time.');
  if (r.kind !== 'expense') { r.amount = null; r.paid_by = null; }
  if (r.kind === 'expense' && r.amount == null) fail('Add an amount.');
  if (!r.done) { r.done_by = null; r.done_on = null; }
  else if (!old || !old.done) { r.done_by = uid; r.done_on = today(); }
  else { r.done_by = old.done_by; r.done_on = old.done_on; }
  r.updated_at = now();
  // photos (a photo entry, or a memory with a picture)
  if (r.kind === 'photo' || (r.kind === 'memory' && (old ? old.photo_path : r.photo_path))) {
    if (old) r.photo_path = old.photo_path;
    else {
      if (!r.photo_path || r.photo_path.split('/')[0] !== r.project_id) fail('Photo is missing.');
      const a = await db.prepare('select count(*) n from project_entries where project_id = ? and photo_path is not null').bind(r.project_id).first();
      if (a.n >= 300) fail('This space has 300 photos, the most it can hold. Remove some to add more.');
      const b = await db.prepare('select count(*) n from project_entries where author_id = ? and photo_path is not null').bind(uid).first();
      if (b.n >= 500) fail('You’ve added 500 photos across your projects, the most allowed. Remove some to add more.');
    }
  } else r.photo_path = old && r.kind === 'memory' ? old.photo_path : null;
}

// ---------- write ----------
export async function insert(db, uid, table, input) {
  input = input || {};
  if (table === 'projects') {
    const row = forInsert('projects', input, { owner_id: uid });
    const c = await db.prepare('select count(*) n, sum(created_at > ?) recent from projects where owner_id = ?').bind(new Date(Date.now() - 60e3).toISOString(), uid).first();
    if (c.n >= 50) fail('Limit reached: 50 projects at most.');
    if ((c.recent || 0) >= 10) fail('Too many changes at once. Wait a minute and try again.', 429);
    if (row.kind === 'couple' && (await inCouple(db, uid))) fail('You already have a couple space.');
    const { sql, args } = insertSql('projects', row);
    const [res] = await db.batch([
      db.prepare(sql).bind(...args),
      db.prepare('insert into project_members(project_id, user_id, role, display_name) values (?, ?, ?, ?)').bind(row.id, uid, 'owner', await myName(db, uid)),
    ]);
    return rows(db, 'projects', 'select * from projects where id = ?', res.results[0].id).then((r) => r[0]);
  }
  if (table === 'project_invites') {
    const pid = String(input.project_id || '');
    need(await role(db, uid, pid), 'owner');
    const live = await db.prepare('select count(*) n from project_invites where project_id = ? and expires_at > ?').bind(pid, now()).first();
    if (live.n >= 20) fail('Too many invite links. Delete an old one first.');
    const max = Date.now() + 30 * 864e5;
    const want = input.expires_at ? Date.parse(input.expires_at) : Date.now() + 7 * 864e5;
    const row = forInsert('project_invites', { ...input, expires_at: new Date(Math.min(Number.isNaN(want) ? max : want, max)).toISOString() },
      { token: randomToken(24).replace(/[-_]/g, 'x'), created_by: uid });
    const { sql, args } = insertSql('project_invites', row);
    return one(db, 'project_invites', sql, ...args);
  }
  if (table === 'project_entries') {
    const row = forInsert('project_entries', input, { author_id: uid });
    need(await role(db, uid, row.project_id), 'owner', 'editor');
    row.author_name = (await db.prepare('select display_name from project_members where project_id = ? and user_id = ?').bind(row.project_id, uid).first())?.display_name || 'Member';
    row.created_at = now();
    await guardEntry(db, uid, row, null);
    const { sql, args } = insertSql('project_entries', row);
    const r = await one(db, 'project_entries', sql, ...args);
    await bump(db, row.project_id);
    return r;
  }
  if (table === 'project_comments') {
    const row = forInsert('project_comments', input, { author_id: uid, removed: 0 });
    need(await role(db, uid, row.project_id), 'owner', 'editor');
    if (!(await db.prepare('select 1 from project_entries where id = ? and project_id = ?').bind(row.entry_id, row.project_id).first())) fail('That note isn’t in this project.');
    if (!row.body.trim()) fail('Write something first.');
    row.author_name = (await db.prepare('select display_name from project_members where project_id = ? and user_id = ?').bind(row.project_id, uid).first())?.display_name || 'Member';
    const c = await db.prepare('select count(*) n from project_comments where entry_id = ?').bind(row.entry_id).first();
    if (c.n >= 500) fail('This note has 500 comments, the most it can hold.');
    const m = await db.prepare('select count(*) n from project_comments where author_id = ? and created_at > ?').bind(uid, new Date(Date.now() - 60e3).toISOString()).first();
    if (m.n >= 30) fail('Too many comments at once. Wait a minute and try again.', 429);
    const { sql, args } = insertSql('project_comments', row);
    const r = await one(db, 'project_comments', sql, ...args);
    await bump(db, row.project_id);
    return r;
  }
  if (table === 'project_reactions') {
    const row = forInsert('project_reactions', input, { user_id: uid });
    if (!(await role(db, uid, row.project_id))) fail('That project isn’t available.', 403);
    if (!(await db.prepare('select 1 from project_entries where id = ? and project_id = ?').bind(row.entry_id, row.project_id).first())) fail('That note isn’t in this project.');
    const { sql, args } = insertSql('project_reactions', row);
    const r = await one(db, 'project_reactions', sql, ...args);
    await bump(db, row.project_id);
    return r;
  }
  fail('You can’t add that.', 403);
}

export async function update(db, uid, table, id, patchIn) {
  if (table === 'projects') {
    const p = await db.prepare('select * from projects where id = ?').bind(id).first();
    const r = p && (await role(db, uid, id));
    if (!p || !(r === 'owner' || (p.kind === 'couple' && r === 'editor'))) fail('You can’t change this project.', 403);
    const { kind, ...rest } = patchIn || {};
    const patch = forUpdate('projects', rest);
    if (Object.keys(patch).length) {
      const { set, args } = setSql(patch);
      await db.prepare(`update projects set ${set} where id = ?`).bind(...args, id).run();
      await bump(db, id);
    }
    return one(db, 'projects', 'select * from projects where id = ?', id);
  }
  if (table === 'project_entries') {
    const old = await db.prepare('select * from project_entries where id = ?').bind(id).first();
    if (!old) fail('That item no longer exists.', 404);
    need(await role(db, uid, old.project_id), 'owner', 'editor');
    const r = { ...old, ...forUpdate('project_entries', patchIn) };
    await guardEntry(db, uid, r, old);
    const { id: _i, ...fields } = r;
    const { set, args } = setSql(fields);
    const res = await one(db, 'project_entries', `update project_entries set ${set} where id = ? returning *`, ...args, id);
    await bump(db, old.project_id);
    return res;
  }
  if (table === 'project_comments') {
    const old = await db.prepare('select * from project_comments where id = ?').bind(id).first();
    if (!old) fail('That comment no longer exists.', 404);
    const r = await role(db, uid, old.project_id);
    if (!r || !(old.author_id === uid || r === 'owner')) fail('You can’t change this comment.', 403);
    if (patchIn?.removed) {
      await db.prepare("update project_comments set removed = 1, body = '' where id = ?").bind(id).run();
      await bump(db, old.project_id);
    }
    return one(db, 'project_comments', 'select * from project_comments where id = ?', id);
  }
  if (table === 'project_reactions') {
    const old = await db.prepare('select * from project_reactions where id = ? and user_id = ?').bind(id, uid).first();
    if (!old || !(await role(db, uid, old.project_id))) fail('That reaction no longer exists.', 404);
    if (patchIn && 'active' in patchIn) {
      await db.prepare('update project_reactions set active = ? where id = ?').bind(patchIn.active ? 1 : 0, id).run();
      await bump(db, old.project_id);
    }
    return one(db, 'project_reactions', 'select * from project_reactions where id = ?', id);
  }
  fail('You can’t change that.', 403);
}

// Only member roles change this way (owner sets editor / viewer for someone else).
export async function updateWhere(db, uid, table, match, patchIn) {
  if (table !== 'project_members') fail('You can’t change that.', 403);
  const { project_id: pid, user_id: who } = match || {};
  if ((await role(db, uid, pid)) !== 'owner' || who === uid) fail('Only the owner can change roles.', 403);
  const target = await role(db, uid === who ? uid : who, pid);
  const newRole = patchIn?.role;
  if (!target) fail('That person isn’t in this project.', 404);
  if (target === 'owner' || newRole === 'owner') fail('The owner’s role can’t be changed.');
  if (!['editor', 'viewer'].includes(newRole)) fail('That role isn’t valid.');
  await db.prepare('update project_members set role = ? where project_id = ? and user_id = ?').bind(newRole, pid, who).run();
  await bump(db, pid);
  return rows(db, 'project_members', 'select * from project_members where project_id = ? and user_id = ?', pid, who);
}

export async function remove(db, uid, table, id) {
  if (table === 'projects') {
    if ((await role(db, uid, id)) !== 'owner') fail('Only the owner can delete this project.', 403);
    await db.batch([db.prepare('delete from projects where id = ?').bind(id), db.prepare('delete from project_versions where project_id = ?').bind(id)]);
    return;
  }
  if (table === 'project_entries') {
    const e = await db.prepare('select project_id, author_id from project_entries where id = ?').bind(id).first();
    if (!e) return;
    const r = await role(db, uid, e.project_id);
    if (!(r === 'owner' || (e.author_id === uid && r === 'editor'))) fail('You can’t remove this.', 403);
    await db.prepare('delete from project_entries where id = ?').bind(id).run();
    await bump(db, e.project_id);
    return;
  }
  fail('You can’t remove that.', 403);
}

export async function removeWhere(db, uid, table, match) {
  if (table === 'project_invites') {
    const inv = await db.prepare('select project_id from project_invites where token = ?').bind(String(match?.token || '')).first();
    if (!inv) return;
    need(await role(db, uid, inv.project_id), 'owner');
    await db.prepare('delete from project_invites where token = ?').bind(match.token).run();
    return;
  }
  if (table === 'project_members') {
    const { project_id: pid, user_id: who } = match || {};
    const mine = await role(db, uid, pid);
    const theirs = await role(db, who, pid);
    if (!theirs) return;
    const leaving = who === uid && theirs !== 'owner';
    const removing = mine === 'owner' && who !== uid;
    if (!leaving && !removing) fail(who === uid ? 'The owner can’t leave. Delete the project instead.' : 'Only the owner can remove people.', 403);
    await db.prepare('delete from project_members where project_id = ? and user_id = ?').bind(pid, who).run();
    await bump(db, pid);
    return;
  }
  fail('You can’t remove that.', 403);
}

// ---------- invite links ----------
async function liveInvite(db, token) {
  return db.prepare('select * from project_invites where token = ? and expires_at > ?').bind(String(token || ''), now()).first();
}
export async function inviteInfo(db, uid, token) {
  const i = await liveInvite(db, token);
  if (!i) return [];
  const p = await db.prepare('select id, name from projects where id = ?').bind(i.project_id).first();
  const n = await db.prepare('select count(*) n from project_members where project_id = ?').bind(i.project_id).first();
  return [{ project_id: p.id, name: p.name, members: n.n, role: i.role, already: !!(await isMember(db, p.id, uid)) }];
}
export async function inviteKind(db, uid, token) {
  const i = await liveInvite(db, token);
  if (!i) return [];
  const p = await db.prepare('select kind from projects where id = ?').bind(i.project_id).first();
  const m = await db.prepare('select display_name from project_members where project_id = ? and user_id = ?').bind(i.project_id, i.created_by).first();
  return [{ kind: p.kind, inviter: m?.display_name || null }];
}
export async function join(db, uid, token) {
  const inv = await liveInvite(db, token);
  if (!inv) fail('This invite link has expired or isn’t valid. Ask for a new one.');
  if (await isMember(db, inv.project_id, uid)) return inv.project_id;
  let r = inv.role;
  const count = (await db.prepare('select count(*) n from project_members where project_id = ?').bind(inv.project_id).first()).n;
  const p = await db.prepare('select kind from projects where id = ?').bind(inv.project_id).first();
  if (p.kind === 'couple') {
    if (count >= 2) fail('This couple space already has two people.');
    if (await inCouple(db, uid)) fail('You’re already in a couple space. Leave it first to join this one.');
    r = 'editor';
  }
  if (count >= 50) fail('This project is full (50 people).');
  if ((await db.prepare('select count(*) n from project_members where user_id = ?').bind(uid).first()).n >= 100) fail('You’re in 100 projects already. Leave one to join another.');
  await db.prepare('insert into project_members(project_id, user_id, role, display_name) values (?, ?, ?, ?)').bind(inv.project_id, uid, r, await myName(db, uid)).run();
  await bump(db, inv.project_id);
  return inv.project_id;
}
// Who has answered a day's question (ids only, never the words).
export async function answerAuthors(db, uid, pid, day) {
  if (!(await role(db, uid, pid))) return [];
  const r = await db.prepare("select author_id from project_entries where project_id = ? and kind = 'answer' and title = ?").bind(pid, String(day)).all();
  return r.results.map((x) => x.author_id);
}
// Polling: a number that changes whenever anything in the project changes.
export async function version(db, uid, pid) {
  if (!(await role(db, uid, pid))) return null;
  const r = await db.prepare('select v from project_versions where project_id = ?').bind(pid).first();
  return r?.v || 0;
}
