// Progress layer: sections, stats, XP rewards and levels.
// Stat keys (STR, DEX…) are what the database stores; names are what you see.

// Sections a person can switch on or off in Settings (Home is always on).
export const SECTIONS = [
  { id: 'tasks',   label: 'Tasks',   hint: 'To-dos, jobs and daily habits' },
  { id: 'prayer',  label: 'Prayer',  hint: 'Five daily prayers and the Daily Awrad' },
  { id: 'fitness', label: 'Fitness', hint: 'Runs, workouts and sport' },
  { id: 'books',   label: 'Books',   hint: 'Reading list and progress' },
  { id: 'comics',  label: 'Comics',  hint: 'Your collection and reading pile, with barcode scanning' },
  { id: 'notes',   label: 'Notes',   hint: 'Journal and notes' },
  { id: 'quotes',  label: 'Quotes',  hint: 'Words to live by' },
  { id: 'hobbies', label: 'Hobbies', hint: 'Time spent on things you love' },
  { id: 'finance', label: 'Finance', hint: 'Spending, budgets and savings goals' },
];
export const DEFAULT_SECTIONS = ['tasks', 'prayer', 'fitness', 'books', 'comics', 'notes', 'quotes', 'hobbies'];

export function enabledSections(profile) {
  const s = profile?.sections;
  return new Set(Array.isArray(s) ? s : DEFAULT_SECTIONS);
}

export const STATS = {
  STR: { name: 'Strength',   from: 'Fitness',        view: 'fitness', sections: ['fitness'] },
  DEX: { name: 'Discipline', from: 'Tasks',          view: 'tasks',   sections: ['tasks'] },
  INT: { name: 'Knowledge',  from: 'Books & comics', view: 'books',   sections: ['books', 'comics'] },
  WIS: { name: 'Reflection', from: 'Notes & quotes', view: 'notes',   sections: ['notes', 'quotes'] },
  CHA: { name: 'Craft',      from: 'Hobbies',        view: 'hobbies', sections: ['hobbies'] },
  FTH: { name: 'Faith',      from: 'Prayer',         view: 'prayer',  sections: ['prayer'] },
  WLT: { name: 'Wealth',     from: 'Finance',        view: 'finance', sections: ['finance'] },
};

export const statVisible = (key, sections) => STATS[key].sections.some((s) => sections.has(s));

// Only stats for sections in use count toward your level.
export function visibleTotals(totals, sections) {
  return Object.fromEntries(Object.entries(totals || {}).filter(([k]) => STATS[k] && statVisible(k, sections)));
}

export const XP = {
  task: { main: 30, job: 30, side: 15, daily: 10 },
  prayer: 10,
  prayerFullDay: 20,
  awrad: 20,
  note: 10,
  quote: 5,
  bookFinished: 50,
  comicRead: 15,
  pages: (pages) => (pages > 0 ? Math.max(1, Math.floor(pages / 10)) : 0),
  workout: (w) => Math.max(5, Math.min(120, Number(w.duration_min) || 0) + Math.round((Number(w.distance_km) || 0) * 5)),
  hobby: (min) => Math.max(5, Math.round((Number(min) || 0) / 2)),
  // Finance rewards the habit, never the spending.
  financeDay: 10,                                         // first entry logged on a given day
  saving: (amt) => Math.max(5, Math.min(50, Math.floor((Number(amt) || 0) / 10))), // per deposit into a goal
  budgetMonth: 50,                                        // a finished month at or under budget
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

// ---------- money ----------
export const CURRENCIES = ['SGD', 'MYR', 'IDR', 'BND', 'USD', 'EUR', 'GBP', 'AUD', 'JPY', 'INR', 'AED', 'SAR'];
export function money(n, currency = 'SGD', opts = {}) {
  try {
    const whole = opts.maximumFractionDigits === 0 ? { minimumFractionDigits: 0 } : {};
    return new Intl.NumberFormat('en-SG', { style: 'currency', currency, ...whole, ...opts }).format(Number(n) || 0);
  } catch { return `${currency} ${(Number(n) || 0).toFixed(2)}`; }
}
export const cents = (v) => Math.round((Number(String(v).replace(/[^0-9.]/g, '')) || 0) * 100) / 100;
