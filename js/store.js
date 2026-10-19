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
      return ok(await sb.from(table).insert({ ...row, user_id: user.id }).select().single());
    },
    async update(table, id, patch) {
      return ok(await sb.from(table).update(patch).eq('id', id).select().single());
    },
    async remove(table, id) { ok(await sb.from(table).delete().eq('id', id)); },
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
  tasks: { kind: 'side', due_on: null, done: false, done_on: null },
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
  contacts: { relation: null, every_days: 30, note: null },
  contact_logs: { how: 'message', note: null },
  watchlist: { kind: 'film', status: 'queued', rating: null, note: null, done_on: null },
};
const UNIQUE = { prayer_logs: ['prayed_on', 'prayer'], hobbies: ['name'], finance_categories: ['kind', 'name'], sleep_logs: ['slept_on'], moods: ['logged_on'] };

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
      tbl(table).push(rec); save();
      return structuredClone(rec);
    },
    async update(table, id, patch) {
      const rec = tbl(table).find((r) => r.id === id);
      if (!rec) throw new Error('Not found.');
      Object.assign(rec, patch); save();
      return structuredClone(rec);
    },
    async remove(table, id) {
      db[table] = tbl(table).filter((r) => r.id !== id);
      if (table === 'hobbies') db.hobby_sessions = tbl('hobby_sessions').filter((s) => s.hobby_id !== id);
      if (table === 'savings_goals') db.savings_contributions = tbl('savings_contributions').filter((c) => c.goal_id !== id);
      const KIDS = { goals: ['goal_milestones', 'goal_id'], learning_items: ['learning_sessions', 'item_id'], mtg_decks: ['mtg_matches', 'deck_id'], contacts: ['contact_logs', 'contact_id'] };
      if (KIDS[table]) { const [kt, fk] = KIDS[table]; db[kt] = tbl(kt).filter((r) => r[fk] !== id); }
      if (table === 'finance_categories') for (const x of tbl('transactions')) if (x.category_id === id) x.category_id = null;
      save();
    },
    async removeWhere(table, match) { db[table] = tbl(table).filter((r) => !matches(r, match)); save(); },
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
    async profile() { db.profile ??= { hero_name: 'You', sections: null, currency: 'SGD', sleep_goal_min: 480 }; save(); return { ...db.profile }; },
    async saveProfile(patch) { db.profile = { ...(db.profile || {}), ...patch }; save(); return { ...db.profile }; },
    async signOut() {},
  };
  return store;
}
