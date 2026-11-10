import { html, raw, wire, mount, today, addDays } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { weekStart } from './review.js';

// A focus timer. The running timer is kept in localStorage (start, length, phase), so it
// survives a page change or a reload. A finished focus session earns Discipline XP once:
// its id is the start time, plus the minutes ("2026-11-11T02:00:00.000Z|25").
const KEY = 'lifequest:focus';
const PLANS = { 25: 5, 50: 10 };
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const write = (s) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* private mode: timer still runs this visit */ } };
let mem = null;       // fallback when storage is blocked
let tick = null;
let done = null;      // timeout for the end of the current phase
const state = () => read() || mem;
const save = (s) => { mem = s; write(s); };
export const minutesOf = (e) => Number(String(e.source_id).split('|')[1]) || 25;

// Called when a phase ends (here or on the next visit). Awards focus, starts the break.
async function finish(ctx, s) {
  if (s.phase === 'focus') {
    await ctx.award('DEX', XP.focus25 * (s.min / 25), 'focus', `${s.start}|${s.min}`, `${s.min} minutes of focus`).catch(() => {});
    try { navigator.vibrate?.(200); } catch { /* not on desktop */ }
    save({ phase: 'break', min: PLANS[s.min] || 5, work: s.min, start: new Date().toISOString() });
  } else save(null);
}
const endsAt = (s) => new Date(s.start).getTime() + s.min * 60000;
function schedule(ctx) {
  clearTimeout(done);
  const s = state();
  if (!s) return;
  done = setTimeout(async () => { const cur = state(); if (cur && cur.start === s.start) { await finish(ctx, cur); schedule(ctx); if (location.hash.startsWith('#/focus')) ctx.rerender(); } }, Math.max(0, endsAt(s) - Date.now()));
}

export default {
  id: 'focus',
  label: 'Focus',
  async render(el, ctx) {
    clearInterval(tick);
    let s = state();
    while (s && Date.now() >= endsAt(s)) { await finish(ctx, s); s = state(); }    // caught up after a reload
    schedule(ctx);
    const t = today();
    const wk = weekStart(t);
    const isoOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };
    const sessions = await ctx.store.list('xp_events', { match: { source: 'focus' }, gte: ['created_at', isoOf(addDays(t, -30))] }).catch(() => []);
    const localDay = (ts) => new Date(ts).toLocaleDateString('en-CA');
    const sum = (list) => list.reduce((n, e) => n + minutesOf(e), 0);
    const todayMin = sum(sessions.filter((e) => localDay(e.created_at) === t));
    const weekMin = sum(sessions.filter((e) => localDay(e.created_at) >= wk));
    const hm = (n) => (n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m` : `${n}m`);
    const left = () => { const cur = state(); return cur ? Math.max(0, endsAt(cur) - Date.now()) : 0; };
    const mmss = (ms) => { const sec = Math.ceil(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
    const pct = () => { const cur = state(); return cur ? 100 - (left() / (cur.min * 60000)) * 100 : 0; };

    mount(el, html`
      <header class="page-head"><div><h1>Focus</h1><p>${hm(todayMin)} today · ${hm(weekMin)} this week</p></div></header>
      <section class="card fc-card">
        <p class="fc-phase">${!s ? 'Ready when you are' : s.phase === 'focus' ? `Focus · ${s.min} minutes` : `Break · then back to it`}</p>
        <p class="fc-time" role="timer" aria-live="off">${s ? mmss(left()) : '25:00'}</p>
        <div class="fc-bar" aria-hidden="true"><i style="width:${pct()}%"></i></div>
        <div class="row wrap" style="gap:8px;justify-content:center">
          ${!s ? Object.keys(PLANS).map((m) => html`<button class="btn ${m === '25' ? 'primary' : ''}" data-act="start" data-min="${m}">${raw(icon('play', 16))}${m} minutes</button>`)
            : html`<button class="btn" data-act="stop">${s.phase === 'focus' ? 'Stop (no XP)' : 'Skip the break'}</button>`}
        </div>
        <p class="small faint">${s?.phase === 'break' ? 'Stand up, get some water, look out a window.' : `+${XP.focus25} Discipline XP for every 25 minutes you finish. Keeps running if you switch pages.`}</p>
      </section>
    `);

    if (s) {
      tick = setInterval(() => {
        if (!el.isConnected) { clearInterval(tick); return; }
        el.querySelector('.fc-time').textContent = mmss(left());
        el.querySelector('.fc-bar i').style.width = `${pct()}%`;
      }, 1000);
    }
    wire(el, {
      start: (b) => { const min = Number(b.dataset.min); save({ phase: 'focus', min, start: new Date().toISOString() }); schedule(ctx); ctx.rerender(); },
      stop: () => { save(null); clearTimeout(done); ctx.rerender(); },
    });
  },
};
