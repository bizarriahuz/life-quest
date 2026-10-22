// Data layer. Two interchangeable stores with the same methods:
//   cloudStore  — Supabase (synced, signed in)
//   localStore  — this browser only (offline mode)
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client = null;
export async function getClient() {
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return client;
}

// Shared project tables have no user_id: the server decides who owns or wrote a row.
const SHARED = new Set(['projects', 'project_members', 'project_invites', 'project_entries', 'project_comments', 'project_reactions']);

export function cloudStore(sb, user) {
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  const store = {
    mode: 'cloud',
    user,
    async list(table, o = {}) {
      let q = sb.from(table).select('*');
      if (o.match) q = q.match(o.match);
      if (o.gte) q = q.gte(o.gte[0], o.gte[1]);
      if (o.lte) q = q.lte(o.lte[0], o.lte[1]);
      if (o.order) q = q.order(o.order, { ascending: Boolean(o.asc) });
      if (o.limit) q = q.limit(o.limit);
      return ok(await q);
    },
    async insert(table, row) {
      return ok(await sb.from(table).insert(SHARED.has(table) ? row : { ...row, user_id: user.id }).select().single());
    },
    async update(table, id, patch) {
      return ok(await sb.from(table).update(patch).eq('id', id).select().single());
    },
    async remove(table, id) { ok(await sb.from(table).delete().eq('id', id)); },
    async updateWhere(table, match, patch) { return ok(await sb.from(table).update(patch).match(match).select()); },
    async rpc(fn, args) { return ok(await sb.rpc(fn, args)); },
    // Every row you can see in a table, 1,000 at a time (for "Download my data").
    async dump(table) {
      const out = [];
      for (let i = 0; i < 200000; i += 1000) {
        const rows = ok(await sb.from(table).select('*').order({ project_members: 'joined_at', profiles: 'user_id' }[table] || 'id', { ascending: true }).range(i, i + 999));
        out.push(...rows);
        if (rows.length < 1000) break;
      }
      return out;
    },
    // Project photos (private bucket; viewing links expire after an hour)
    async uploadPhoto(path, blob) {
      const { error } = await sb.storage.from('project-photos').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false, cacheControl: '86400' });
      if (error) throw error;
    },
    async photoUrls(paths) {
      if (!paths.length) return {};
      const { data, error } = await sb.storage.from('project-photos').createSignedUrls(paths, 3600);
      if (error) throw error;
      return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    },
    async removePhotos(paths) {
      if (!paths.length) return;
      const { error } = await sb.storage.from('project-photos').remove(paths);
      if (error) throw error;
    },
    // Live changes to one project. Returns a function that stops listening.
    subscribe(projectId, onChange) {
      const ch = sb.channel(`project:${projectId}:${Math.random().toString(36).slice(2)}`);
      for (const table of ['project_entries', 'project_members', 'project_comments', 'project_reactions'])
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `project_id=eq.${projectId}` }, () => onChange(table));
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` }, () => onChange('projects'));
      ch.subscribe();
      return () => { try { sb.removeChannel(ch); } catch { /* ignore */ } };
    },
    async removeWhere(table, match) { ok(await sb.from(table).delete().match(match)); },
    async award(stat, amount, source, sourceId) {
      ok(await sb.from('xp_events').upsert(
        { user_id: user.id, stat, amount, source, source_id: String(sourceId) },
        { onConflict: 'user_id,source,source_id', ignoreDuplicates: true },
      ));
    },
    async revoke(source, sourceId) {
      await store.removeWhere('xp_events', { source, source_id: String(sourceId) });
    },
    async totals() {
      const rows = ok(await sb.from('stat_totals').select('stat,xp'));
      return Object.fromEntries(rows.map((r) => [r.stat, r.xp]));
    },
    async profile() {
      const rows = ok(await sb.from('profiles').select('*').limit(1));
      if (rows.length) return rows[0];
      return ok(await sb.from('profiles').insert({ user_id: user.id }).select().single());
    },
    async saveProfile(patch) {
      return ok(await sb.from('profiles').update(patch).eq('user_id', user.id).select().single());
    },
    async signOut() { await sb.auth.signOut(); },
  };
  return store;
}

// ---------------------------------------------------------------------------
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
  mtg_decks: { commander: null, format: 'commander', colors: '', art_url: null, decklist: null, retired: false },
  mtg_matches: { players: 4, note: null },
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
