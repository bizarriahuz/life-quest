// End-to-end API test against a local server:
//   npx wrangler pages dev . --d1 DB --r2 PHOTOS --port 8788 --binding DEV_MAIL=1
//   node test/api.mjs [http://localhost:8788]
const BASE = process.argv[2] || 'http://localhost:8788';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

function client() {
  let cookie = '';
  const call = async (path, body, init = {}) => {
    const r = await fetch(`${BASE}/api/${path}`, {
      method: init.method || 'POST',
      headers: { 'content-type': init.type || 'application/json', ...(cookie ? { cookie } : {}) },
      body: init.method === 'GET' ? undefined : init.raw ?? JSON.stringify(body || {}),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.arrayBuffer();
    return { status: r.status, ...(ct.includes('json') ? data : { bytes: data.byteLength, type: ct }) , _data: data };
  };
  const c = {
    auth: (action, b = {}) => call('auth', { action, ...b }),
    db: (action, b = {}) => call('db', { action, ...b }),
    raw: call,
  };
  return c;
}
const rnd = () => Math.random().toString(36).slice(2, 8);
const token = (link) => link.split('=')[1];
const arr = (r) => r._data;

// ---------- accounts ----------
const A = client(), B = client(), C = client();
const ea = `a-${rnd()}@test.dev`, eb = `b-${rnd()}@test.dev`, ec = `c-${rnd()}@test.dev`;
let r = await A.auth('signup', { email: ea, password: 'short' });
ok(r.status === 400, 'short password refused');
r = await A.auth('signup', { email: ea, password: 'password-a1' });
ok(r.confirm && r.dev_link?.includes('#confirm='), 'sign-up sends a confirmation link');
ok((await A.auth('signup', { email: ea.toUpperCase(), password: 'password-a1' })).code === 'exists', 'same email (any case) refused');
r = await A.auth('signin', { email: ea, password: 'password-a1' });
ok(r.code === 'unconfirmed', 'unconfirmed account cannot sign in yet');
ok((await A.auth('signin', { email: ea, password: 'nope-nope' })).status === 400, 'wrong password refused');
r = await A.auth('resend', { email: ea });
ok(r.dev_link && r.dev_link !== undefined, 'resend gives a new link');
ok((await A.auth('confirm', { token: 'x'.repeat(40) })).status === 400, 'bad confirm link refused');
r = await A.auth('confirm', { token: token(r.dev_link) });
ok(r.user?.email === ea, 'confirm link signs you in');
ok((await A.auth('session')).user?.email === ea, 'session cookie works');
for (const [cl, e] of [[B, eb], [C, ec]]) {
  const s = await cl.auth('signup', { email: e, password: 'password-xyz' });
  await cl.auth('confirm', { token: token(s.dev_link) });
}
const ida = (await A.db('me')).id, idb = (await B.db('me')).id, idc = (await C.db('me')).id;
ok(ida && idb && idc && ida !== idb, 'three accounts');

// ---------- private data ----------
let p = await A.db('profile');
ok(p.hero_name === 'HERO' && p.calendar_feeds.length === 0 && p.sections === null, 'profile created with defaults (lists as lists)');
p = await A.db('saveProfile', { patch: { hero_name: 'Zuhair', sections: ['tasks', 'couple', 'projects'], theme: 'ocean' } });
ok(p.hero_name === 'Zuhair' && p.sections.includes('couple'), 'profile saved');
ok((await A.db('saveProfile', { patch: { theme: 'neon' } })).status === 400, 'bad theme refused');
ok((await A.db('saveProfile', { patch: { sections: ['nope'] } })).status === 400, 'unknown section refused');

const goal = await A.db('insert', { table: 'goals', row: { title: 'Run 10k' } });
let t = await A.db('insert', { table: 'tasks', row: { title: 'Buy shoes', kind: 'main', goal_id: goal.id, user_id: idb } });
ok(t.id && t.user_id === ida && t.done === false && t.kind === 'main', 'task added (user_id forced to you, booleans are booleans)');
ok((await A.db('insert', { table: 'tasks', row: { title: '', kind: 'side' } })).status === 400, 'empty title refused');
ok((await A.db('insert', { table: 'tasks', row: { title: 'x', kind: 'daily', repeat: 'weekly' } })).status === 400, 'daily + repeat refused');
ok((await A.db('insert', { table: 'tasks', row: { title: 'x', bogus: 1 } })).status === 400, 'unknown field refused');
t = await A.db('update', { table: 'tasks', id: t.id, patch: { done: true, done_on: '2026-11-03' } });
ok(t.done === true && t.done_on === '2026-11-03', 'task updated');
ok((await B.db('update', { table: 'tasks', id: t.id, patch: { title: 'hacked' } })).status === 404, "someone else can't change your task");
ok(arr(await B.db('list', { table: 'tasks' })).length === 0, "someone else can't see your tasks");
ok((await B.db('insert', { table: 'tasks', row: { title: 'x', goal_id: goal.id } })).status === 409, "can't link to someone else's goal");
await A.db('insert', { table: 'tasks', row: { title: 'Second', due_on: '2026-11-05' } });
let list = arr(await A.db('list', { table: 'tasks', o: { order: 'due_on', asc: true } }));
ok(list.length === 2 && list[0].due_on === '2026-11-05' && list[1].due_on === null, 'order asc puts empty dates last (like before)');
list = arr(await A.db('list', { table: 'tasks', o: { match: { done: true } } }));
ok(list.length === 1, 'filter by boolean');
await A.db('remove', { table: 'goals', id: goal.id });
ok(arr(await A.db('list', { table: 'tasks', o: { match: { title: 'Buy shoes' } } }))[0].goal_id === null, 'deleting a goal unlinks its tasks');
const hob = await A.db('insert', { table: 'hobbies', row: { name: 'Guitar' } });
await A.db('insert', { table: 'hobby_sessions', row: { hobby_id: hob.id, duration_min: 30 } });
ok((await A.db('insert', { table: 'hobbies', row: { name: 'Guitar' } })).status === 409, 'duplicate hobby name refused');
await A.db('remove', { table: 'hobbies', id: hob.id });
ok(arr(await A.db('list', { table: 'hobby_sessions' })).length === 0, 'deleting a hobby removes its sessions');
const wg = await A.db('insert', { table: 'word_games', row: { day: '2026-11-03', guesses: ['crane'] } });
ok(Array.isArray(wg.guesses) && wg.guesses[0] === 'crane', 'lists stored and returned as lists');
ok((await A.db('insert', { table: 'word_games', row: { day: '2026-11-04', guesses: ['CRANE'] } })).status === 400, 'list item rules checked');
const tx = await A.db('insert', { table: 'transactions', row: { kind: 'expense', amount: 12.345, occurred_on: '2026-11-03' } });
ok(tx.amount === 12.35, 'money rounded to cents');
const sl = await A.db('insert', { table: 'sleep_logs', row: { slept_on: '2026-11-03', bed_time: '23:30', wake_time: '07:00', duration_min: 450 } });
ok(sl.bed_time === '23:30:00', 'times stored as HH:MM:SS');

// XP
await A.db('award', { stat: 'STR', amount: 30, source: 'task', source_id: 't1' });
await A.db('award', { stat: 'STR', amount: 30, source: 'task', source_id: 't1' });
await A.db('award', { stat: 'INT', amount: 10, source: 'book', source_id: 'b1' });
let tot = await A.db('totals');
ok(tot.STR === 30 && tot.INT === 10, 'XP awarded once per source');
await A.db('removeWhere', { table: 'xp_events', match: { source: 'task', source_id: 't1' } });
ok((await A.db('totals')).STR === undefined, 'XP revoked');

// restore + dump
const backup = arr(await A.db('dump', { table: 'tasks' }));
await A.db('remove', { table: 'tasks', id: backup[0].id });
r = await A.db('restore', { table: 'tasks', rows: backup });
ok(r.added === 1 && r.skipped === 1, 'restore puts back missing rows only');

// notes limit, row caps
ok((await A.db('insert', { table: 'notes', row: { title: 't', body: 'x'.repeat(20001) } })).status === 400, 'note too long refused');

// feedback
const fb = await A.db('insert', { table: 'feedback', row: { kind: 'bug', message: 'Something broke', reply_to: 'yes' } });
ok(fb.reply_to === ea && fb.sender_name === 'Zuhair' && fb.status === 'new', 'feedback: server fills reply email and name');
ok(arr(await B.db('list', { table: 'feedback' })).length === 0, "can't see other people's feedback");
ok((await A.db('rpc', { fn: 'is_admin' })).data === false, 'not admin by default');
ok((await A.db('rpc', { fn: 'admin_stats' })).status === 403, 'admin stats blocked for non-admins');

// ---------- shared projects ----------
const pr = await A.db('insert', { table: 'projects', row: { name: 'Trip' } });
ok(pr.owner_id === ida, 'project created');
let mem = arr(await A.db('list', { table: 'project_members', o: { match: { project_id: pr.id } } }));
ok(mem.length === 1 && mem[0].role === 'owner' && mem[0].display_name === 'Zuhair', 'owner added as member with their name');
ok(arr(await B.db('list', { table: 'projects' })).length === 0, "outsiders don't see the project");
ok((await B.db('insert', { table: 'project_invites', row: { project_id: pr.id } })).status === 403, "outsiders can't make invites");
const inv = await A.db('insert', { table: 'project_invites', row: { project_id: pr.id, role: 'viewer' } });
ok(inv.token?.length >= 30 && Date.parse(inv.expires_at) > Date.now() + 6 * 864e5, 'invite link made (7 days)');
let info = (await B.db('rpc', { fn: 'invite_info', args: { p_token: inv.token } })).data;
ok(info[0]?.name === 'Trip' && info[0].already === false && info[0].role === 'viewer', 'invite info');
ok((await B.db('rpc', { fn: 'join_project', args: { p_token: inv.token } })).data === pr.id, 'joined by link');
ok((await B.db('insert', { table: 'project_entries', row: { project_id: pr.id, kind: 'note', title: 'hi' } })).status === 403, "viewers can't add");
await A.db('updateWhere', { table: 'project_members', match: { project_id: pr.id, user_id: idb }, patch: { role: 'editor' } });
let e = await B.db('insert', { table: 'project_entries', row: { project_id: pr.id, kind: 'task', title: 'Book flights', done: true, author_id: ida } });
ok(e.author_id === idb && e.author_name === 'Member' && e.done_by === idb && e.done_on, 'editor adds; server sets author and who ticked it');
ok((await B.db('insert', { table: 'project_entries', row: { project_id: pr.id, kind: 'expense', title: 'Hotel', amount: 100, paid_by: idc } })).status === 400, "can't name someone outside the project");
const ex = await A.db('insert', { table: 'project_entries', row: { project_id: pr.id, kind: 'note', title: 'Plan', amount: 5 } });
ok(ex.amount === null, 'non-expense entries drop amounts');
const v1 = (await A.db('version', { project_id: pr.id })).v;
const cm = await B.db('insert', { table: 'project_comments', row: { project_id: pr.id, entry_id: ex.id, body: 'Nice' } });
ok(cm.author_id === idb && (await A.db('version', { project_id: pr.id })).v > v1, 'comment added and live-update number moves');
ok((await C.db('version', { project_id: pr.id })).v === null, "outsiders can't poll the project");
const re = await A.db('insert', { table: 'project_reactions', row: { project_id: pr.id, entry_id: ex.id, emoji: '👍' } });
ok(re.active === true, 'reaction');
ok((await B.db('update', { table: 'project_reactions', id: re.id, patch: { active: false } })).status === 404, "can't toggle someone else's reaction");
const cm2 = await A.db('update', { table: 'project_comments', id: cm.id, patch: { removed: true } });
ok(cm2.removed === true && cm2.body === '', 'owner removes a comment (text wiped)');
ok((await B.db('remove', { table: 'project_entries', id: ex.id })).status === 403, "editor can't remove someone else's entry");
await B.db('remove', { table: 'project_entries', id: e.id });
ok(arr(await A.db('list', { table: 'project_entries', o: { match: { project_id: pr.id } } })).length === 1, 'editor removes own entry');
ok((await B.db('update', { table: 'projects', id: pr.id, patch: { name: 'Mine now' } })).status === 403, "editor can't rename a normal project");
ok((await A.db('removeWhere', { table: 'project_members', match: { project_id: pr.id, user_id: ida } })).status === 403, "owner can't leave");
await B.db('removeWhere', { table: 'project_members', match: { project_id: pr.id, user_id: idb } });
ok(arr(await B.db('list', { table: 'projects' })).length === 0, 'member left');

// photos
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const path = `${pr.id}/${crypto.randomUUID()}.png`;
r = await A.raw(`photo?path=${path}`, null, { method: 'PUT', type: 'image/png', raw: png });
ok(r.status === 200, 'photo uploaded');
const ph = await A.db('insert', { table: 'project_entries', row: { project_id: pr.id, kind: 'photo', title: 'Pic', photo_path: path } });
ok(ph.photo_path === path, 'photo entry');
r = await A.raw(`photo?path=${path}`, null, { method: 'GET' });
ok(r.status === 200 && r.bytes === png.length, 'member sees the photo');
ok((await C.raw(`photo?path=${path}`, null, { method: 'GET' })).status === 404, "outsiders can't see it");
await A.raw('photo', { action: 'remove', paths: [path] });
ok((await A.raw(`photo?path=${path}`, null, { method: 'GET' })).status === 404, 'photo removed');

// ---------- couple space ----------
const cp = await A.db('insert', { table: 'projects', row: { name: 'Us', kind: 'couple' } });
ok((await A.db('insert', { table: 'projects', row: { name: 'Us 2', kind: 'couple' } })).status === 400, 'one couple space each');
const ci = await A.db('insert', { table: 'project_invites', row: { project_id: cp.id, role: 'viewer' } });
ok((await B.db('rpc', { fn: 'invite_kind', args: { p_token: ci.token } })).data[0].kind === 'couple', 'invite kind');
await B.db('rpc', { fn: 'join_project', args: { p_token: ci.token } });
ok(arr(await B.db('list', { table: 'project_members', o: { match: { project_id: cp.id, user_id: idb } } }))[0].role === 'editor', 'partner joins as editor');
ok((await C.db('rpc', { fn: 'join_project', args: { p_token: ci.token } })).status === 400, 'a third person cannot join');
ok((await B.db('update', { table: 'projects', id: cp.id, patch: { together_since: '2020-01-01', kind: 'project' } })).kind === 'couple', 'partner edits the couple space (kind stays)');
await A.db('insert', { table: 'project_entries', row: { project_id: cp.id, kind: 'answer', title: '2026-11-03', body: 'Pizza' } });
ok(arr(await B.db('list', { table: 'project_entries', o: { match: { project_id: cp.id, kind: 'answer' } } })).length === 0, "partner's answer hidden until you answer");
ok((await B.db('rpc', { fn: 'answer_authors', args: { p: cp.id, d: '2026-11-03' } })).data[0] === ida, 'but you can see that they answered');
await B.db('insert', { table: 'project_entries', row: { project_id: cp.id, kind: 'answer', title: '2026-11-03', body: 'Sushi' } });
ok(arr(await B.db('list', { table: 'project_entries', o: { match: { project_id: cp.id, kind: 'answer' } } })).length === 2, 'both answers show after answering');
ok((await A.db('insert', { table: 'project_entries', row: { project_id: cp.id, kind: 'answer', title: '2026-11-03', body: 'Again' } })).status === 409, 'one answer per day');
ok((await A.db('insert', { table: 'project_entries', row: { project_id: cp.id, kind: 'love', title: 'Hi', assignee_id: ida } })).status === 400, 'love notes are for your partner');
ok((await A.db('insert', { table: 'project_entries', row: { project_id: pr.id, kind: 'idea', title: 'x' } })).status === 400, 'couple kinds only in a couple space');
const ev = await A.db('insert', { table: 'project_entries', row: { project_id: pr.id, kind: 'event', title: 'Dinner', due_on: '2026-11-10', start_time: '19:00', end_time: '18:00' } });
ok(ev.status === 400, 'event end before start refused');

// ---------- sign out, reset password ----------
await A.auth('signout');
ok((await A.db('me')).status === 401, 'signed out');
r = await A.auth('forgot', { email: ea });
ok(r.ok && r.dev_link?.includes('#reset='), 'reset link sent');
ok((await A.auth('forgot', { email: 'nobody@test.dev' })).ok, "same answer for unknown emails");
r = await A.auth('reset', { token: token(r.dev_link), password: 'new-password-1' });
ok(r.user?.email === ea, 'password reset signs you in');
ok((await B.auth('signin', { email: ea, password: 'password-a1' })).status === 400, 'old password no longer works');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
