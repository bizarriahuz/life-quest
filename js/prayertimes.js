// Singapore prayer times (official MUIS timetable) from https://api.prayertimes.sg
// Loads a month at a time, keeps it in memory and in this browser for offline use.

const API = 'https://api.prayertimes.sg/api/v1/prayer-times/month';
const KEY = 'lifequest:pt:';               // + YYYY-MM
const mem = new Map();                     // YYYY-MM -> { 'YYYY-MM-DD': day } | null (no data)
const pending = new Map();

// API names -> app names
const MAP = { subuh: 'fajr', syuruk: 'syuruk', zohor: 'dhuhr', asar: 'asr', maghrib: 'maghrib', isyak: 'isha' };

function readLocal(m) {
  try { const v = localStorage.getItem(KEY + m); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
}
function writeLocal(m, v) { try { localStorage.setItem(KEY + m, JSON.stringify(v)); } catch { /* full or blocked */ } }

function cachedMonth(m) {
  if (mem.has(m)) return mem.get(m);
  const v = readLocal(m);
  if (v !== undefined) mem.set(m, v);
  return v;
}

/** Times for a date if already loaded: { hijri, times: {fajr:'05:30',…}, ampm: {fajr:'5:30 AM',…} } or null/undefined. */
export function cachedTimes(date) {
  const month = cachedMonth(date.slice(0, 7));
  return month ? month[date] || null : month;
}

/** Fetch a month (once). Resolves true if new data arrived. */
export function loadMonth(m) {
  if (cachedMonth(m) !== undefined) return Promise.resolve(false);
  if (pending.has(m)) return pending.get(m);
  const [y, mo] = m.split('-').map(Number);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  const p = fetch(`${API}/${y}/${mo}`, { signal: ctl.signal })
    .then(async (res) => {
      if (res.status === 404) { mem.set(m, null); return true; } // not published yet (not saved, so it's re-checked next visit)
      if (!res.ok) return false;                                                    // try again later
      const body = await res.json();
      const days = {};
      for (const d of body.data || []) {
        const times = {}, ampm = {};
        for (const [k, v] of Object.entries(MAP)) { times[v] = d.times?.[k]; ampm[v] = d.times_ampm?.[k]; }
        days[d.date] = { hijri: d.hijri_date || '', times, ampm };
      }
      mem.set(m, days); writeLocal(m, days);
      return true;
    })
    .catch(() => false)
    .finally(() => { clearTimeout(timer); pending.delete(m); });
  pending.set(m, p);
  return p;
}

/** When the given prayer starts, as a real moment in Singapore time. */
export const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+08:00`);

/** Next of the five prayers from `now`, looking into tomorrow after Isha. */
export function nextPrayer(date, tomorrow, now = new Date()) {
  const order = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const t = cachedTimes(date);
  if (t) for (const k of order) if (t.times[k] && at(date, t.times[k]) > now) return { key: k, date, when: at(date, t.times[k]), label: t.ampm[k] };
  const n = cachedTimes(tomorrow);
  if (n?.times.fajr) return { key: 'fajr', date: tomorrow, when: at(tomorrow, n.times.fajr), label: n.ampm.fajr };
  return null;
}

export function untilText(when, now = new Date()) {
  const mins = Math.max(0, Math.round((when - now) / 60000));
  if (mins < 1) return 'now';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}
