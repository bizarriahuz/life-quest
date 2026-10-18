// Progress layer: stats, XP rewards and levels.
// Stat keys (STR, DEX…) are what the database stores; names are what you see.

export const STATS = {
  STR: { name: 'Strength',   from: 'Fitness',         view: 'fitness' },
  DEX: { name: 'Discipline', from: 'Tasks',           view: 'tasks' },
  INT: { name: 'Knowledge',  from: 'Books',           view: 'books' },
  WIS: { name: 'Reflection', from: 'Notes & quotes',  view: 'notes' },
  CHA: { name: 'Craft',      from: 'Hobbies',         view: 'hobbies' },
  FTH: { name: 'Faith',      from: 'Prayer',          view: 'prayer' },
};

export const XP = {
  task: { main: 30, job: 30, side: 15, daily: 10 },
  prayer: 10,
  prayerFullDay: 20,
  note: 10,
  quote: 5,
  bookFinished: 50,
  pages: (pages) => (pages > 0 ? Math.max(1, Math.floor(pages / 10)) : 0),
  workout: (w) => Math.max(5, Math.min(120, Number(w.duration_min) || 0) + Math.round((Number(w.distance_km) || 0) * 5)),
  hobby: (min) => Math.max(5, Math.round((Number(min) || 0) / 2)),
};

// Overall level: 100 XP for level 2, then +50 more per level.
// Stat level: 50 XP for level 2, then +25 more per level.
export function levelFrom(xp, base = 100, step = 50) {
  let level = 1, need = base, left = Math.max(0, xp || 0);
  while (left >= need) { left -= need; level += 1; need = base + step * (level - 1); }
  return { level, into: left, need, pct: Math.floor((left / need) * 100) };
}
export const totalXP = (totals) => Object.values(totals || {}).reduce((a, b) => a + b, 0);
export const overallLevel = (totals) => levelFrom(totalXP(totals));
export const statLevel = (xp) => levelFrom(xp, 50, 25);

export function strongest(totals) {
  const top = Object.entries(totals || {}).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? STATS[top[0]].name : null;
}
