// Data layer. Two interchangeable stores with the same methods:
//   cloudStore  — the Life Quest server (Cloudflare D1 via /api, synced, signed in)
//   localStore  — this browser only (offline mode)
import { OFFLINE_ONLY } from './config.js';

export const cloudEnabled = !OFFLINE_ONLY;

// ---------- talking to the server ----------
export async function api(path, body) {
  let r;
  try {
    r = await fetch(`/api/${path}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
    });
  } catch {
    throw Object.assign(new Error('Couldn’t reach the server. Check your connection.'), { offline: true });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = Object.assign(new Error(data.error || `Something went wrong (${r.status}).`), { status: r.status, code: data.code });
    if (r.status === 401) window.dispatchEvent(new CustomEvent('lq:signedout'));
    throw err;
  }
  return data;
}
export const auth = (action, body = {}) => api('auth', { action, ...body });
const db = (action, body = {}) => api('db', { action, ...body });

export function cloudStore(user) {
  const store = {
    mode: 'cloud',
    user,
    list: (table, o = {}) => db('list', { table, o }),
    insert: (table, row) => db('insert', { table, row }),
    update: (table, id, patch) => db('update', { table, id, patch }),
    async remove(table, id) { await db('remove', { table, id }); },
    updateWhere: (table, match, patch) => db('updateWhere', { table, match, patch }),
    async removeWhere(table, match) { await db('removeWhere', { table, match }); },
    async rpc(fn, args) { return (await db('rpc', { fn, args })).data; },
    // Put rows back from a backup file. Rows that clash (already there, same day…) are skipped.
    async restore(table, rows) {
      let added = 0, skipped = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const r = await db('restore', { table, rows: rows.slice(i, i + 200) });
        added += r.added; skipped += r.skipped;
      }
      return { added, skipped };
    },
    dump: (table) => db('dump', { table }),
    async uploadPhoto(path, blob) {
      const r = await fetch(`/api/photo?path=${encodeURIComponent(path)}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'content-type': blob.type || 'image/jpeg' }, body: blob,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Couldn’t upload the photo.');
    },
    // Photos are served by the app itself (signed-in cookie), so a plain URL works in <img>.
    async photoUrls(paths) {
      return Object.fromEntries(paths.map((p) => [p, `/api/photo?path=${encodeURIComponent(p)}`]));
    },
    async removePhotos(paths) {
      if (!paths.length) return;
      await api('photo', { action: 'remove', paths });
    },
    // Live updates for people looking at the same project: check every few seconds while the page is visible.
    subscribe(projectId, onChange) {
      let last = null, stopped = false, timer = null;
      const tick = async () => {
        if (stopped) return;
        if (document.visibilityState === 'visible') {
          try {
            const { v } = await db('version', { project_id: projectId });
            if (last !== null && v !== last) for (const t of ['projects', 'project_members', 'project_entries', 'project_comments', 'project_reactions']) onChange(t);
            last = v;
          } catch { /* offline for a moment: try again next time */ }
        }
        if (!stopped) timer = setTimeout(tick, 4000);
      };
      tick();
      const wake = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); tick(); } };
      document.addEventListener('visibilitychange', wake);
      return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); };
    },
    async award(stat, amount, source, sourceId) {
      await db('award', { stat, amount, source, source_id: String(sourceId) });
    },
    async revoke(source, sourceId) {
      await store.removeWhere('xp_events', { source, source_id: String(sourceId) });
    },
    totals: () => db('totals'),
    profile: () => db('profile'),
    saveProfile: (patch) => db('saveProfile', { patch }),
    async signOut() {
      await auth('signout').catch(() => {});
      window.dispatchEvent(new CustomEvent('lq:signedout', { detail: { manual: true } }));
    },
  };
  return store;
}

const KEY = 'lifequest:v1';
const DEFAULTS = {
  tasks: { kind: 'side', due_on: null, done: false, done_on: null, repeat: null, goal_id: null, note: null },
  books: { isbn: null, cover_url: null, author: null, status: 'queued', pages_total: null, pages_read: 0, rating: null, started_on: null, finished_on: null },
  notes: { title: '', body: '', pinned: false },
  quotes: { source: null },
  workouts: { kind: 'run', duration_min: 0, distance_km: null, notes: null },
  prayer_logs: {},
  hobbies: {},
  hobby_sessions: { duration_min: 0, note: null },
  xp_events: {},
  finance_categories: { budget: null },
  sleep_logs: { quality: null, note: null },
  comics: { issue: null, publisher: null, format: 'issue', status: 'queued', owned: true, barcode: null, cover_url: null, rating: null, read_on: null },
  transactions: { category_id: null, note: null },
  savings_goals: {},
  savings_contributions: {},
  goals: { why: null, target_date: null, status: 'active', done_on: null },
  goal_milestones: { done: false, done_on: null, position: 0 },
  learning_items: { kind: 'course', provider: null, status: 'active', target_hours: null, done_on: null },
  learning_sessions: { note: null },
  client_projects: { stage: 'lead', value: null, due_on: null, note: null, paid_on: null },
  mtg_decks: { commander: null, format: 'commander', colors: '', art_url: null, decklist: null, upgrades: null, retired: false },
  mtg_matches: { players: 4, note: null, opponents: null, went_first: null, turns: null },
  moods: { gratitude: null },
  albums: { artist: null, year: null, tracks: null, genre: null, art_url: null, itunes_id: null, apple_url: null, status: 'want', listened_on: null, rating: null, note: null },
  contacts: { relation: null, every_days: 30, note: null },
  contact_logs: { how: 'message', note: null },
  word_games: { guesses: [], solved: false, finished: false },
  sudoku_games: { notes: [], mistakes: 0, seconds: 0, solved: false },
  hive_games: { words: [], score: 0 },
  chess_games: { result: null, ending: null, ended_on: null, pgn: '', moves: 0 },
  chess_puzzles: { solved: false, rating: null },
  feedback: { status: 'new', reply_to: null, sender_name: null, app_version: null, device: null, page: null },
  calendar_events: { ends_on: null, start_time: null, end_time: null, repeat: null, note: null },
  projects: { description: null, currency: 'SGD', kind: 'project', together_since: null },
  project_members: {},
  project_invites: { role: 'editor' },
  project_comments: { removed: false },
  project_reactions: { active: true },
  project_entries: { start_time: null, end_time: null, yearly: false, photo_path: null, body: null, amount: null, paid_by: null, assignee_id: null, due_on: null, done: false, done_by: null, done_on: null },
  watchlist: { season: null, episode: null, kind: 'film', status: 'queued', rating: null, note: null, done_on: null, tmdb_id: null, tmdb_type: null, imdb_id: null, year: null, poster_url: null, details: null, overview: null },
};
const UNIQUE = { word_games: ['day'], sudoku_games: ['day', 'level'], hive_games: ['day'], chess_puzzles: ['day'], prayer_logs: ['prayed_on', 'prayer'], hobbies: ['name'], finance_categories: ['kind', 'name'], sleep_logs: ['slept_on'], moods: ['logged_on'] };

const cmp = (a, b) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);

export function localStore() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { db = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ } };
  const tbl = (t) => (db[t] ??= []);
  const matches = (r, m) => Object.entries(m).every(([k, v]) => r[k] === v);
  const now = () => new Date().toISOString();

  const store = {
    mode: 'local',
    user: { id: 'local', email: 'offline' },
    async list(table, o = {}) {
      let rows = tbl(table).filter((r) =>
        (!o.match || matches(r, o.match)) &&
        (!o.gte || r[o.gte[0]] >= o.gte[1]) &&
        (!o.lte || r[o.lte[0]] <= o.lte[1]));
      if (o.order) rows = [...rows].sort((a, b) => cmp(a[o.order], b[o.order]) * (o.asc ? 1 : -1));
      if (o.limit) rows = rows.slice(0, o.limit);
      return structuredClone(rows);
    },
    async insert(table, row) {
      const uniq = UNIQUE[table];
      if (uniq && tbl(table).some((r) => uniq.every((k) => r[k] === row[k]))) {
        throw new Error('That entry already exists.');
      }
      const rec = { ...DEFAULTS[table], ...row, id: crypto.randomUUID(), user_id: 'local', created_at: now() };
      if (table === 'notes') rec.updated_at = rec.created_at;
      if (table === 'project_entries') {
        Object.assign(rec, { author_id: 'local', author_name: db.profile?.hero_name || 'You', updated_at: rec.created_at });
        if (rec.done) Object.assign(rec, { done_by: 'local', done_on: new Date().toLocaleDateString('en-CA') });
      }
      if (table === 'feedback') Object.assign(rec, { user_id: 'local', sender_name: db.profile?.hero_name || null, reply_to: rec.reply_to ? 'offline' : null, status: 'new' });
      if (table === 'project_comments') Object.assign(rec, { author_id: 'local', author_name: db.profile?.hero_name || 'You', removed: false });
      if (table === 'project_invites') Object.assign(rec, { token: crypto.randomUUID().replace(/-/g, ''), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() });
      if (table === 'projects') {
        rec.owner_id = 'local';
        tbl('project_members').push({ project_id: rec.id, user_id: 'local', role: 'owner', display_name: db.profile?.hero_name || 'You', joined_at: rec.created_at });
      }
      tbl(table).push(rec); save();
      return structuredClone(rec);
    },
    async update(table, id, patch) {
      const rec = tbl(table).find((r) => r.id === id);
      if (!rec) throw new Error('Not found.');
      if (table === 'project_entries' && 'done' in patch && patch.done !== rec.done) {
        Object.assign(patch, patch.done ? { done_by: 'local', done_on: new Date().toLocaleDateString('en-CA') } : { done_by: null, done_on: null });
      }
      Object.assign(rec, patch); save();
      return structuredClone(rec);
    },
    async remove(table, id) {
      db[table] = tbl(table).filter((r) => r.id !== id);
      if (table === 'hobbies') db.hobby_sessions = tbl('hobby_sessions').filter((s) => s.hobby_id !== id);
      if (table === 'savings_goals') db.savings_contributions = tbl('savings_contributions').filter((c) => c.goal_id !== id);
      const KIDS = { goals: ['goal_milestones', 'goal_id'], learning_items: ['learning_sessions', 'item_id'], mtg_decks: ['mtg_matches', 'deck_id'], contacts: ['contact_logs', 'contact_id'] };
      if (KIDS[table]) { const [kt, fk] = KIDS[table]; db[kt] = tbl(kt).filter((r) => r[fk] !== id); }
      if (table === 'project_entries') for (const t of ['project_comments', 'project_reactions']) db[t] = tbl(t).filter((r) => r.entry_id !== id);
      if (table === 'projects') for (const t of ['project_members', 'project_invites', 'project_entries', 'project_comments', 'project_reactions']) db[t] = tbl(t).filter((r) => r.project_id !== id);
      if (table === 'goals') for (const x of tbl('tasks')) if (x.goal_id === id) x.goal_id = null;
      if (table === 'finance_categories') for (const x of tbl('transactions')) if (x.category_id === id) x.category_id = null;
      save();
    },
    async removeWhere(table, match) { db[table] = tbl(table).filter((r) => !matches(r, match)); save(); },
    async updateWhere(table, match, patch) { const rows = tbl(table).filter((r) => matches(r, match)); rows.forEach((r) => Object.assign(r, patch)); save(); return structuredClone(rows); },
    async rpc(fn) {
      if (fn === 'invite_info') return [];
      throw new Error('Joining shared projects needs a Life Quest account.');
    },
    async restore(table, rows) {
      let added = 0;
      const uniq = UNIQUE[table];
      for (const r of rows) {
        if (tbl(table).some((x) => x.id === r.id) || (uniq && tbl(table).some((x) => uniq.every((k) => x[k] === r[k])))) continue;
        tbl(table).push({ ...DEFAULTS[table], ...structuredClone(r), user_id: 'local' }); added += 1;
      }
      save();
      return { added, skipped: rows.length - added };
    },
    async dump(table) { return table === 'profiles' ? [structuredClone(db.profile || {})] : structuredClone(tbl(table)); },
    subscribe() { return () => {}; },
    // Offline mode keeps photos in this browser (small test use only).
    async uploadPhoto(path, blob) {
      const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      const all = JSON.parse(localStorage.getItem('lifequest:photos') || '{}'); all[path] = url;
      try { localStorage.setItem('lifequest:photos', JSON.stringify(all)); } catch { throw new Error('This browser is out of space for photos.'); }
    },
    async photoUrls(paths) { const all = JSON.parse(localStorage.getItem('lifequest:photos') || '{}'); return Object.fromEntries(paths.filter((p) => all[p]).map((p) => [p, all[p]])); },
    async removePhotos(paths) { const all = JSON.parse(localStorage.getItem('lifequest:photos') || '{}'); for (const p of paths) delete all[p]; localStorage.setItem('lifequest:photos', JSON.stringify(all)); },
    async award(stat, amount, source, sourceId) {
      const id = String(sourceId);
      if (tbl('xp_events').some((e) => e.source === source && e.source_id === id)) return;
      tbl('xp_events').push({ id: crypto.randomUUID(), stat, amount, source, source_id: id, created_at: now() });
      save();
    },
    async revoke(source, sourceId) { await store.removeWhere('xp_events', { source, source_id: String(sourceId) }); },
    async totals() {
      const t = {};
      for (const e of tbl('xp_events')) t[e.stat] = (t[e.stat] || 0) + e.amount;
      return t;
    },
    async profile() { db.profile ??= { hero_name: 'You', sections: null, currency: 'SGD', sleep_goal_min: 480, theme: 'midnight', lastfm_user: null, seen_intros: null }; save(); return { ...db.profile }; },
    async saveProfile(patch) { db.profile = { ...(db.profile || {}), ...patch }; save(); return { ...db.profile }; },
    async signOut() {},
  };
  return store;
}
