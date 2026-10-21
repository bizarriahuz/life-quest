// Makes switching sections instant: list() answers from memory when it can,
// then re-checks the server in the background and calls onStale() if anything
// changed. Every write clears the cached lists for that table.

const FRESH_MS = 3000;           // don't re-check the same list more often than this
const CASCADE = {
  hobbies: ['hobby_sessions'], savings_goals: ['savings_contributions'], finance_categories: ['transactions'],
  goals: ['goal_milestones', 'tasks'], projects: ['project_members', 'project_invites', 'project_entries', 'project_comments', 'project_reactions'], project_entries: ['project_comments', 'project_reactions'], learning_items: ['learning_sessions'], mtg_decks: ['mtg_matches'], contacts: ['contact_logs'],
}; // deleting a hobby deletes its sessions

export function withCache(store, onStale) {
  const cache = new Map();       // key -> { data, at, table }
  const inflight = new Map();    // key -> Promise
  let staleTimer;

  const fetchKey = (key, table, o) => {
    if (inflight.has(key)) return inflight.get(key);
    const p = store.list(table, o).then(
      (data) => { cache.set(key, { data, at: Date.now(), table }); inflight.delete(key); return data; },
      (err) => { inflight.delete(key); throw err; },
    );
    inflight.set(key, p);
    return p;
  };

  const invalidate = (table) => {
    const tables = [table, ...(CASCADE[table] || [])];
    for (const [k, v] of cache) if (tables.includes(v.table)) cache.delete(k);
  };

  const after = (table, fn) => async (...args) => {
    try { return await fn(...args); } finally { invalidate(table); }
  };

  return {
    ...store,
    async list(table, o = {}) {
      const key = `${table}|${JSON.stringify(o)}`;
      const hit = cache.get(key);
      if (!hit) return structuredClone(await fetchKey(key, table, o));
      if (Date.now() - hit.at > FRESH_MS) {
        const before = JSON.stringify(hit.data);
        fetchKey(key, table, o).then((data) => {
          if (JSON.stringify(data) !== before) { clearTimeout(staleTimer); staleTimer = setTimeout(onStale, 30); }
        }).catch(() => { /* keep showing what we have */ });
      }
      return structuredClone(hit.data);
    },
    insert: (t, row) => after(t, store.insert)(t, row),
    update: (t, id, patch) => after(t, store.update)(t, id, patch),
    remove: (t, id) => after(t, store.remove)(t, id),
    removeWhere: (t, match) => after(t, store.removeWhere)(t, match),
    updateWhere: (t, match, patch) => after(t, store.updateWhere)(t, match, patch),
    rpc: async (fn, args) => { try { return await store.rpc(fn, args); } finally { if (fn === 'join_project') { invalidate('projects'); } } },
    invalidate,
    clear: () => cache.clear(),
  };
}
