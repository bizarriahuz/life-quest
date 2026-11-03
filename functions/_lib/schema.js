// Life Quest — the database, described once.
// This file is the single source of truth for: the D1 tables (scripts/gen-schema.mjs writes schema.sql from it),
// which columns the app may write, how values are stored (booleans 0/1, lists as JSON) and the validation rules.
//
// Column spec:  "<type>[!] [=default] [rule ...]"
//   types:  text, int, num, bool, date (YYYY-MM-DD), time (HH:MM:SS), ts (ISO time), uuid, json (list/object)
//   !       required (not null)
//   =x      default: =now (timestamp), =today (UTC date), =uuid, or a literal (='side', =0, =[] …)
//   rules:  len:1-200  in:a|b|c  range:1-5  re:<regex>  min:0  gt:0  ne:0  items:<max>  each:<regex>  of:a|b|c
// Columns marked `sys` are filled by the server and can't be written by the app.

const SECTIONS = 'tasks|goals|projects|calendar|clients|prayer|fitness|sleep|books|comics|learning|notes|mood|quotes|hobbies|games|chess|mtg|watchlist|music|people|finance|couple';
const REPEAT = 'daily|weekly|fortnightly|monthly|yearly';
const own = (cap, label, cols, extra = {}) => ({
  owner: 'user_id', cap, label,
  cols: { id: 'uuid! =uuid sys', user_id: 'uuid! sys', ...cols, created_at: 'ts! =now sys' },
  ...extra,
});

export const TABLES = {
  profiles: {
    owner: 'user_id', pk: 'user_id',
    cols: {
      user_id: 'uuid! sys',
      hero_name: "text! ='HERO' len:1-24",
      created_at: 'ts! =now sys',
      sections: `json of:${SECTIONS}`,
      currency: "text! ='SGD' re:^[A-Z]{3}$",
      sleep_goal_min: 'int! =480 range:240-720',
      theme: "text! ='midnight' in:midnight|ocean|forest|plum|dusk|paper|sand|blush|lavender|peach|mint|sky|butter|candy|sage",
      lastfm_user: 'text re:^[A-Za-z][A-Za-z0-9_-]{1,14}$',
      calendar_feeds: 'json! =[] items:5 maxbytes:4000',
      seen_intros: `json items:100 of:${SECTIONS}`,
    },
  },
  tasks: own(5000, 'tasks', {
    title: 'text! len:1-200',
    kind: "text! ='side' in:main|side|daily|job",
    due_on: 'date', done: 'bool! =0', done_on: 'date',
    repeat: `text in:${REPEAT}`,
    goal_id: 'uuid', note: 'text len:0-1000',
  }, { refs: { goal_id: ['goals', 'setnull'] }, check: (r) => (r.repeat && r.kind === 'daily' ? 'Daily tasks already repeat.' : null) }),
  books: own(2000, 'books', {
    title: 'text! len:1-200', author: 'text len:0-120',
    status: "text! ='queued' in:queued|reading|finished",
    pages_total: 'int gt:0', pages_read: 'int! =0 min:0', rating: 'int range:1-5',
    started_on: 'date', finished_on: 'date',
    isbn: 'text re:^[0-9]{9}[0-9X]$|^[0-9]{13}$', cover_url: 'text len:0-500 re:^https://',
  }),
  notes: own(2000, 'notes', {
    title: "text! ='' len:0-120", body: "text! ='' len:0-20000", pinned: 'bool! =0',
    updated_at: 'ts! =now',
  }),
  quotes: own(2000, 'quotes', { text: 'text! len:1-1000', source: 'text len:0-120' }),
  workouts: own(10000, 'workouts', {
    kind: "text! ='run' in:run|strength|cardio|sport|other",
    performed_on: 'date! =today', duration_min: 'int! =0 range:0-1440',
    distance_km: 'num min:0', notes: 'text len:0-200',
  }),
  prayer_logs: own(25000, 'prayer entries', {
    prayed_on: 'date!', prayer: 'text! in:fajr|dhuhr|asr|maghrib|isha|awrad',
  }, { unique: [['user_id', 'prayed_on', 'prayer']] }),
  hobbies: own(100, 'hobbies', { name: 'text! len:1-60' }, { unique: [['user_id', 'name']] }),
  hobby_sessions: own(10000, 'hobby sessions', {
    hobby_id: 'uuid!', session_on: 'date! =today', duration_min: 'int! =0 range:0-1440', note: 'text len:0-200',
  }, { refs: { hobby_id: ['hobbies', 'cascade'] } }),
  xp_events: own(60000, 'XP entries', {
    stat: 'text! in:STR|DEX|INT|WIS|CHA|FTH|WLT|RST|CON',
    amount: 'int! range:0-1000', source: 'text! len:0-32', source_id: 'text! len:0-80',
  }, { unique: [['user_id', 'source', 'source_id']] }),
  finance_categories: own(100, 'categories', {
    name: 'text! len:1-40', kind: 'text! in:expense|income', budget: 'num gt:0',
  }, { unique: [['user_id', 'kind', 'name']] }),
  transactions: own(20000, 'finance entries', {
    kind: 'text! in:expense|income|sadaqah', amount: 'num! gt:0', category_id: 'uuid',
    occurred_on: 'date! =today', note: 'text len:0-200',
  }, { refs: { category_id: ['finance_categories', 'setnull'] } }),
  savings_goals: own(50, 'savings goals', { name: 'text! len:1-60', target: 'num! gt:0' }),
  savings_contributions: own(10000, 'savings entries', {
    goal_id: 'uuid!', amount: 'num! ne:0', made_on: 'date! =today',
  }, { refs: { goal_id: ['savings_goals', 'cascade'] } }),
  comics: own(10000, 'comics', {
    title: 'text! len:1-200', issue: 'text len:0-20', publisher: 'text len:0-120',
    format: "text! ='issue' in:issue|trade|manga|graphic_novel|omnibus",
    status: "text! ='queued' in:queued|reading|read", owned: 'bool! =1',
    barcode: 'text re:^[0-9X]{8,18}$', cover_url: 'text len:0-500 re:^https://',
    rating: 'int range:1-5', read_on: 'date',
  }),
  sleep_logs: own(10000, 'sleep entries', {
    slept_on: 'date!', bed_time: 'time!', wake_time: 'time!', duration_min: 'int! range:1-1440',
    quality: 'int range:1-5', note: 'text len:0-200',
  }, { unique: [['user_id', 'slept_on']] }),
  goals: own(200, 'goals', {
    title: 'text! len:1-120', why: 'text len:0-300', target_date: 'date',
    status: "text! ='active' in:active|done|dropped", done_on: 'date',
  }),
  goal_milestones: own(5000, 'milestones', {
    goal_id: 'uuid!', title: 'text! len:1-120', done: 'bool! =0', done_on: 'date', position: 'int! =0',
  }, { refs: { goal_id: ['goals', 'cascade'] } }),
  learning_items: own(500, 'learning items', {
    title: 'text! len:1-120', kind: "text! ='course' in:course|certification|skill|other",
    provider: 'text len:0-120', status: "text! ='active' in:active|paused|done",
    target_hours: 'int range:1-10000', done_on: 'date',
  }),
  learning_sessions: own(20000, 'learning sessions', {
    item_id: 'uuid!', session_on: 'date! =today', duration_min: 'int! range:1-1440', note: 'text len:0-200',
  }, { refs: { item_id: ['learning_items', 'cascade'] } }),
  client_projects: own(5000, 'client projects', {
    client: 'text! len:1-120', title: 'text! len:1-160',
    stage: "text! ='lead' in:lead|quoted|active|done|paid|lost", value: 'num min:0',
    due_on: 'date', note: 'text len:0-500', paid_on: 'date', updated_at: 'ts! =now',
  }),
  mtg_decks: own(300, 'decks', {
    name: 'text! len:1-80', commander: 'text len:0-160',
    format: "text! ='commander' in:commander|standard|modern|pioneer|pauper|limited|other",
    colors: "text! ='' re:^W?U?B?R?G?$", art_url: 'text len:0-500 re:^https://',
    decklist: 'text len:0-20000', retired: 'bool! =0', upgrades: 'text len:0-5000',
  }),
  mtg_matches: own(20000, 'matches', {
    deck_id: 'uuid!', played_on: 'date! =today', result: 'text! in:win|loss|draw',
    players: 'int! =4 range:2-8', note: 'text len:0-200', opponents: 'text len:0-300',
    went_first: 'bool', turns: 'int range:1-99',
  }, { refs: { deck_id: ['mtg_decks', 'cascade'] } }),
  moods: own(10000, 'mood check-ins', {
    logged_on: 'date!', mood: 'int! range:1-5', gratitude: 'text len:0-300',
  }, { unique: [['user_id', 'logged_on']] }),
  contacts: own(300, 'people', {
    name: 'text! len:1-80', relation: 'text len:0-60', every_days: 'int! =30 range:1-365', note: 'text len:0-200',
  }),
  contact_logs: own(20000, 'catch-ups', {
    contact_id: 'uuid!', contacted_on: 'date! =today', how: "text! ='message' in:call|visit|message|other", note: 'text len:0-200',
  }, { refs: { contact_id: ['contacts', 'cascade'] } }),
  watchlist: own(5000, 'watchlist items', {
    title: 'text! len:1-200', kind: "text! ='film' in:film|series|anime|documentary|other",
    status: "text! ='queued' in:queued|watching|done", rating: 'int range:1-5', note: 'text len:0-200', done_on: 'date',
    tmdb_id: 'int gt:0', tmdb_type: 'text in:movie|tv', imdb_id: 'text re:^tt[0-9]{5,10}$',
    year: 'int range:1870-2100', poster_url: 'text len:0-300 re:^https://image\\.tmdb\\.org/',
    details: 'text len:0-200', overview: 'text len:0-700',
    season: 'int range:0-200', episode: 'int range:0-5000',
  }),
  albums: own(5000, 'albums', {
    title: 'text! len:1-200', artist: 'text len:0-200', year: 'int range:1900-2100', tracks: 'int range:1-500',
    genre: 'text len:0-60', art_url: 'text len:0-400 re:^https://', itunes_id: 'int gt:0',
    apple_url: 'text len:0-400 re:^https://(music|itunes)\\.apple\\.com/',
    status: "text! ='want' in:want|listened", listened_on: 'date', rating: 'int range:1-5', note: 'text len:0-200',
  }),
  calendar_events: own(5000, 'calendar events', {
    title: 'text! len:1-200', starts_on: 'date!', ends_on: 'date', start_time: 'time', end_time: 'time',
    repeat: `text in:${REPEAT}`, note: 'text len:0-500',
  }, { check: (r) => (r.ends_on && r.ends_on < r.starts_on ? 'The end date is before the start date.'
    : r.end_time && !r.start_time ? 'Add a start time first.' : null) }),
  chess_games: own(5000, 'chess games', {
    level: 'int! range:1-5', color: 'text! in:w|b', result: 'text in:win|loss|draw',
    ending: 'text in:checkmate|resigned|stalemate|repetition|insufficient|fifty|abandoned',
    pgn: "text! ='' len:0-20000", moves: 'int! =0 range:0-2000', ended_on: 'date',
  }),
  chess_puzzles: own(5000, 'puzzles', {
    day: 'date!', puzzle_id: 'text! len:0-12', rating: 'int range:0-4000', solved: 'bool! =0',
  }, { unique: [['user_id', 'day']] }),
  word_games: own(5000, 'daily words', {
    day: 'date!', guesses: 'json! =[] items:6 each:^[a-z]*$', solved: 'bool! =0', finished: 'bool! =0',
  }, { unique: [['user_id', 'day']] }),
  sudoku_games: own(10000, 'sudoku puzzles', {
    day: 'date!', level: 'text! in:easy|medium|hard', cells: 'text! re:^[0-9]{81}$',
    notes: 'json! =[] count:0|81', mistakes: 'int! =0 range:0-10000', seconds: 'int! =0 range:0-864000', solved: 'bool! =0',
  }, { unique: [['user_id', 'day', 'level']] }),
  hive_games: own(5000, 'word hives', {
    day: 'date!', words: 'json! =[] items:400 each:^[a-z]*$', score: 'int! =0 range:0-10000',
  }, { unique: [['user_id', 'day']] }),

  // ---------- shared projects & couple space (rules live in api/projects.js) ----------
  projects: {
    shared: true,
    cols: {
      id: 'uuid! =uuid sys', owner_id: 'uuid! sys', name: 'text! len:1-80', description: 'text len:0-300',
      currency: "text! ='SGD' re:^[A-Z]{3}$", created_at: 'ts! =now sys',
      kind: "text! ='project' in:project|couple", together_since: 'date',
    },
  },
  project_members: {
    shared: true, pk: ['project_id', 'user_id'],
    cols: {
      project_id: 'uuid! sys', user_id: 'uuid! sys', role: "text! ='editor' in:owner|editor|viewer",
      display_name: "text! ='Member' len:1-24 sys", joined_at: 'ts! =now sys',
    },
  },
  project_invites: {
    shared: true, pk: 'token',
    cols: {
      token: 'text! sys', project_id: 'uuid!', role: "text! ='editor' in:editor|viewer",
      created_by: 'uuid! sys', expires_at: 'ts!', created_at: 'ts! =now sys',
    },
  },
  project_entries: {
    shared: true,
    cols: {
      id: 'uuid! =uuid sys', project_id: 'uuid!', author_id: 'uuid sys', author_name: "text! ='Member' sys",
      kind: 'text! in:task|note|expense|photo|idea|memory|countdown|love|answer|event',
      title: 'text! len:1-200', body: 'text len:0-5000', amount: 'num gt:0', paid_by: 'uuid', assignee_id: 'uuid',
      due_on: 'date', done: 'bool! =0', done_by: 'uuid sys', done_on: 'date sys',
      created_at: 'ts! =now sys', updated_at: 'ts! =now sys',
      photo_path: 'text re:^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|webp|png)$', yearly: 'bool! =0',
      start_time: 'time', end_time: 'time',
    },
  },
  project_comments: {
    shared: true,
    cols: {
      id: 'uuid! =uuid sys', project_id: 'uuid!', entry_id: 'uuid!', author_id: 'uuid sys',
      author_name: "text! ='Member' sys", body: 'text! len:0-1000', removed: 'bool! =0', created_at: 'ts! =now sys',
    },
  },
  project_reactions: {
    shared: true, unique: [['entry_id', 'user_id', 'emoji']],
    cols: {
      id: 'uuid! =uuid sys', project_id: 'uuid!', entry_id: 'uuid!', user_id: 'uuid! sys',
      emoji: 'text! in:👍|❤️|😂|🎉|🙏|👀', active: 'bool! =1', created_at: 'ts! =now sys',
    },
  },
  feedback: {
    special: true,
    cols: {
      id: 'uuid! =uuid sys', user_id: 'uuid sys', kind: "text! ='idea' in:bug|idea|other", message: 'text! len:3-2000',
      reply_to: 'text len:0-254', sender_name: 'text sys', app_version: 'text len:0-12', device: 'text len:0-120',
      page: 'text len:0-40', status: "text! ='new' in:new|read|done", created_at: 'ts! =now sys',
    },
  },
};

// ---------- parsed column info ----------
function parse(spec) {
  const [head, ...rest] = spec.split(' ');
  const c = { type: head.replace('!', ''), required: head.endsWith('!'), rules: {} };
  for (const part of rest) {
    if (part === 'sys') c.sys = true;
    else if (part.startsWith('=')) c.def = part.slice(1);
    else { const i = part.indexOf(':'); c.rules[part.slice(0, i)] = part.slice(i + 1); }
  }
  return c;
}
export const COLS = Object.fromEntries(Object.entries(TABLES).map(([t, d]) => [t, Object.fromEntries(Object.entries(d.cols).map(([k, s]) => [k, parse(s)]))]));
export const pkOf = (t) => TABLES[t].pk || 'id';

// Convert a stored D1 row to what the app expects (booleans, lists, numbers).
export function out(table, row) {
  if (!row) return row;
  const cols = COLS[table];
  const r = { ...row };
  for (const [k, c] of Object.entries(cols)) {
    if (!(k in r) || r[k] == null) continue;
    if (c.type === 'bool') r[k] = !!r[k];
    else if (c.type === 'json') { try { r[k] = JSON.parse(r[k]); } catch { r[k] = null; } }
  }
  return r;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class Invalid extends Error { constructor(m) { super(m); this.status = 400; } }

// Check and convert one value for storage. Returns the stored form.
export function value(table, key, v) {
  const c = COLS[table][key];
  if (!c) throw new Invalid(`Unknown field: ${key}`);
  if (v === undefined || v === null || v === '') {
    if (v === '' && c.type === 'text') { /* empty text is a value */ } else {
      if (c.required && c.def === undefined) throw new Invalid(`Missing ${key.replace(/_/g, ' ')}.`);
      return null;
    }
  }
  const bad = (why) => new Invalid(why || `That ${key.replace(/_/g, ' ')} isn't valid.`);
  const R = c.rules;
  switch (c.type) {
    case 'text': {
      if (typeof v !== 'string') v = String(v);
      const n = [...v].length;
      if (R.len) { const [a, b] = R.len.split('-').map(Number); if (n < a) throw bad(a === 1 ? `Add a ${key.replace(/_/g, ' ')}.` : null); if (n > b) throw bad(`Too long (${b} characters at most).`); }
      if (R.in && !R.in.split('|').includes(v)) throw bad();
      if (R.re && v !== '' && !new RegExp(R.re).test(v)) throw bad();
      if (R.re && v === '' && !new RegExp(R.re).test(v)) throw bad();
      return v;
    }
    case 'int': case 'num': {
      const x = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(x) || (c.type === 'int' && !Number.isInteger(x))) throw bad();
      if (R.range) { const [a, b] = R.range.split('-').map(Number); if (x < a || x > b) throw bad(); }
      if (R.min !== undefined && x < Number(R.min)) throw bad();
      if (R.gt !== undefined && !(x > Number(R.gt))) throw bad();
      if (R.ne !== undefined && x === Number(R.ne)) throw bad();
      return c.type === 'num' ? Math.round(x * 100) / 100 : x;
    }
    case 'bool': return v === true || v === 1 || v === 'true' ? 1 : 0;
    case 'date': if (!DATE.test(String(v))) throw bad(); return String(v).slice(0, 10);
    case 'time': {
      const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(v));
      if (!m || +m[1] > 23 || +m[2] > 59) throw bad();
      return `${m[1]}:${m[2]}:${m[3] || '00'}`;
    }
    case 'ts': { const d = new Date(v); if (Number.isNaN(+d)) throw bad(); return d.toISOString(); }
    case 'uuid': if (!UUID.test(String(v))) throw bad(); return String(v).toLowerCase();
    case 'json': {
      const x = typeof v === 'string' ? JSON.parse(v) : v;
      if (R.items || R.of || R.each || R.count) {
        if (!Array.isArray(x)) throw bad();
        if (R.items && x.length > Number(R.items)) throw bad();
        if (R.count && !R.count.split('|').map(Number).includes(x.length)) throw bad();
        if (R.of && !x.every((s) => R.of.split('|').includes(s))) throw bad();
        if (R.each && !x.every((s) => typeof s === 'string' && new RegExp(R.each).test(s))) throw bad();
      }
      const s = JSON.stringify(x);
      if (R.maxbytes && s.length >= Number(R.maxbytes)) throw bad('That list is too big.');
      return s;
    }
    default: throw bad();
  }
}

// Prepare a row for insert: only known, writable columns; defaults filled; whole-row checks run.
export function forInsert(table, row, sysValues = {}) {
  const cols = COLS[table];
  const res = {};
  for (const [k, c] of Object.entries(cols)) {
    if (k in sysValues) { res[k] = sysValues[k]; continue; }
    if (c.sys && !(k in sysValues)) { if (c.def !== undefined) res[k] = defaultFor(c); continue; }
    if (row[k] !== undefined) res[k] = value(table, k, row[k]);
    if (res[k] == null && c.def !== undefined) res[k] = defaultFor(c);
    if (res[k] == null && c.required) throw new Invalid(`Missing ${k.replace(/_/g, ' ')}.`);
  }
  for (const k of Object.keys(row)) if (!cols[k]) throw new Invalid(`Unknown field: ${k}`);
  return res;
}
// Prepare a patch: writable columns only (system columns are silently ignored, like the old triggers did).
export function forUpdate(table, patch) {
  const cols = COLS[table];
  const res = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (!cols[k]) throw new Invalid(`Unknown field: ${k}`);
    if (cols[k].sys) continue;
    const x = value(table, k, v);
    if (x == null && cols[k].required) {
      if (cols[k].def === undefined) throw new Invalid(`Missing ${k.replace(/_/g, ' ')}.`);
      res[k] = defaultFor(cols[k]);
    } else res[k] = x;
  }
  return res;
}
export function defaultFor(c) {
  const d = c.def;
  if (d === 'now') return new Date().toISOString();
  if (d === 'today') return new Date().toISOString().slice(0, 10);
  if (d === 'uuid') return crypto.randomUUID();
  if (d === '[]') return '[]';
  if (d.startsWith("'")) return d.slice(1, -1);
  return Number(d);
}
export function checkRow(table, r) {
  const fn = TABLES[table].check;
  const why = fn && fn(r);
  if (why) throw new Invalid(why);
}
