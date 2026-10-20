// Reads iCalendar (.ics) feeds: Google "secret address in iCal format", iCloud
// public calendars, Outlook published calendars. Handles all-day and timed events,
// time zones, repeats (RRULE with INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY), EXDATE
// and moved occurrences (RECURRENCE-ID).

const unescape = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

// Offset (ms) of a time zone at a given instant.
function tzOffset(ts, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
  } catch { return null; }
}
// Outlook uses Windows zone names; map the common ones.
const WIN = {
  'Singapore Standard Time': 'Asia/Singapore', 'Malay Peninsula Standard Time': 'Asia/Kuala_Lumpur', 'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo', 'India Standard Time': 'Asia/Kolkata', 'Arabian Standard Time': 'Asia/Dubai', 'Arab Standard Time': 'Asia/Riyadh',
  'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Pacific Standard Time': 'America/Los_Angeles',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'SE Asia Standard Time': 'Asia/Bangkok', 'UTC': 'UTC',
};
function zoned(y, mo, d, h, mi, s, tz) {
  const zone = WIN[tz] || tz;
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const o1 = tzOffset(guess, zone);
  if (o1 == null) return new Date(y, mo - 1, d, h, mi, s);          // unknown zone: treat as local time
  const o2 = tzOffset(guess - o1, zone);
  return new Date(guess - (o2 ?? o1));
}

// "20261020" or "20261020T090000Z" (+ params) → { date, allDay }
function parseWhen(value, params = {}) {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === 'DATE') return { date: new Date(+y, +mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))), allDay: false };
  if (params.TZID) return { date: zoned(+y, +mo, +d, +h, +mi, +(s || 0), params.TZID.replace(/^"|"$/g, '')), allDay: false };
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)), allDay: false };
}

function parseDuration(v) {
  const m = String(v).match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * ((+(m[2] || 0) * 7 + +(m[3] || 0)) * 864e5 + +(m[4] || 0) * 36e5 + +(m[5] || 0) * 6e4 + +(m[6] || 0) * 1e3);
}

export function parseICS(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = []; let cur = null; let depth = 0; let calName = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; depth = 0; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) { const n = line.match(/^X-WR-CALNAME:(.*)$/); if (n) calName = unescape(n[1]); continue; }
    if (line.startsWith('BEGIN:')) { depth += 1; continue; }      // VALARM etc.
    if (line.startsWith('END:')) { depth -= 1; continue; }
    if (depth > 0) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const [name, ...ps] = line.slice(0, i).split(';');
    const params = Object.fromEntries(ps.map((p) => { const j = p.indexOf('='); return [p.slice(0, j).toUpperCase(), p.slice(j + 1)]; }));
    const value = line.slice(i + 1);
    switch (name.toUpperCase()) {
      case 'SUMMARY': cur.title = unescape(value); break;
      case 'LOCATION': cur.location = unescape(value); break;
      case 'UID': cur.uid = value; break;
      case 'STATUS': cur.status = value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseWhen(value, params); break;
      case 'DTEND': cur.end = parseWhen(value, params); break;
      case 'DURATION': cur.duration = parseDuration(value); break;
      case 'RRULE': cur.rrule = Object.fromEntries(value.split(';').map((kv) => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v])); break;
      case 'EXDATE': for (const v of value.split(',')) { const w = parseWhen(v, params); if (w) cur.exdates.push(w.date.getTime()); } break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseWhen(value, params)?.date.getTime(); break;
      default:
    }
  }
  return { name: calName, events: events.filter((e) => e.start && e.status !== 'CANCELLED') };
}

const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Starts of each occurrence (Dates) from `from` to `to`.
function occurrences(e, from, to) {
  const start = e.start.date;
  const r = e.rrule;
  if (!r) return [start];
  const freq = r.FREQ; const interval = Math.max(1, +(r.INTERVAL || 1));
  const count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? parseWhen(r.UNTIL)?.date : null;
  const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/); return m ? { n: m[1] ? +m[1] : null, d: DAYS[m[2]] } : null; }).filter(Boolean) : null;
  const bymd = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null;
  const out = []; let n = 0;
  const keep = (d) => {
    if (d < start) return true;
    if (until && d > until) return false;
    n += 1; if (n > count) return false;
    if (d > to) return false;
    if (d >= from || (e.end && d.getTime() + (e.end.date - start) > from.getTime())) out.push(d);
    return true;
  };
  const at = (y, m, day) => new Date(y, m, day, start.getHours(), start.getMinutes(), start.getSeconds());
  for (let i = 0, guard = 0; guard < 4000; i += 1, guard += 1) {
    let batch = [];
    if (freq === 'DAILY') batch = [at(start.getFullYear(), start.getMonth(), start.getDate() + i * interval)];
    else if (freq === 'WEEKLY') {
      const wk = at(start.getFullYear(), start.getMonth(), start.getDate() + i * 7 * interval);
      if (byday) {
        const mon = new Date(wk); mon.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));       // weeks start Monday
        batch = byday.map((b) => at(mon.getFullYear(), mon.getMonth(), mon.getDate() + ((b.d + 6) % 7))).sort((a, b) => a - b);
      } else batch = [wk];
    } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
      const step = freq === 'MONTHLY' ? interval : 12 * interval;
      const y = start.getFullYear(); const m = start.getMonth() + i * step;
      const first = new Date(y, m, 1); const last = new Date(y, m + 1, 0).getDate();
      if (byday && byday.some((b) => b.n != null)) {
        for (const b of byday) {
          const days = [];
          for (let dd = 1; dd <= last; dd += 1) if (new Date(first.getFullYear(), first.getMonth(), dd).getDay() === b.d) days.push(dd);
          const pick = b.n > 0 ? days[b.n - 1] : days[days.length + b.n];
          if (pick) batch.push(at(first.getFullYear(), first.getMonth(), pick));
        }
        batch.sort((a, b) => a - b);
      } else if (bymd) {
        batch = bymd.map((dd) => (dd > 0 ? dd : last + dd + 1)).filter((dd) => dd >= 1 && dd <= last).map((dd) => at(first.getFullYear(), first.getMonth(), dd));
      } else {
        const dd = start.getDate();
        if (dd <= last) batch = [at(first.getFullYear(), first.getMonth(), dd)];          // skip months without that day (like Google)
      }
    } else return [start];
    let go = true;
    for (const d of batch) if (!keep(d)) { go = false; break; }
    if (!go) break;
    if (batch.length && batch[0] > to) break;
  }
  return out;
}

// Flatten feed events into instances within [from, to].
export function expandICS(events, from, to) {
  const moved = new Map();     // uid → Set of original start times replaced by an override
  for (const e of events) if (e.recurrenceId && e.uid) (moved.get(e.uid) ?? moved.set(e.uid, new Set()).get(e.uid)).add(e.recurrenceId);
  const out = [];
  for (const e of events) {
    const len = e.end ? e.end.date - e.start.date : e.duration || (e.start.allDay ? 864e5 : 0);
    const skip = new Set([...(e.exdates || []), ...(!e.recurrenceId && e.uid && moved.get(e.uid) ? moved.get(e.uid) : [])]);
    for (const s of occurrences(e, from, to)) {
      if (skip.has(s.getTime())) continue;
      const end = new Date(s.getTime() + Math.max(0, len));
      if (end < from && s < from) continue;
      if (s > to) continue;
      out.push({ title: e.title || '(No title)', start: s, end, allDay: e.start.allDay, location: e.location || null });
    }
  }
  return out;
}

// ---------- fetching (through /api/ics), cached in this browser ----------
const CACHE = 'lifequest:feeds';
const FRESH = 15 * 60 * 1000;
const mem = new Map();
let store;
try { store = JSON.parse(localStorage.getItem(CACHE)) || {}; } catch { store = {}; }
const persist = () => { try { localStorage.setItem(CACHE, JSON.stringify(store)); } catch { /* full */ } };

export function cachedFeed(url) {
  if (mem.has(url)) return mem.get(url);
  const hit = store[url];
  if (!hit) return null;
  if (!hit.text) return { name: null, events: [], at: hit.at, error: hit.error || null };
  const parsed = { ...parseICS(hit.text), at: hit.at, error: hit.error || null };
  mem.set(url, parsed);
  return parsed;
}

const inflight = new Map();
export function loadFeed(url, { force = false } = {}) {
  const hit = store[url];
  if (!force && hit && Date.now() - hit.at < FRESH) return Promise.resolve(cachedFeed(url));
  if (inflight.has(url)) return inflight.get(url);
  const p = fetch(`/api/ics?url=${encodeURIComponent(url)}`, { cache: 'no-store' }).then(async (r) => {
    const text = await r.text();
    if (!r.ok) { let msg = 'Couldn’t load this calendar.'; try { msg = JSON.parse(text).error || msg; } catch { /* not json */ } throw new Error(msg); }
    store[url] = { text, at: Date.now() }; persist(); mem.delete(url);   // a good load clears any old error
    return cachedFeed(url);
  }).catch((err) => {
    store[url] = { ...(store[url] || { text: '' }), error: err.message, at: Date.now() - FRESH + 60000 };   // retry in a minute
    persist(); mem.delete(url);
    throw err;
  }).finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}
export function forgetFeed(url) { delete store[url]; mem.delete(url); persist(); }
