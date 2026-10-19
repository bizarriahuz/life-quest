import { html, raw, wire, mount, today, addDays, fmtDate, relDate } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { AWRAD_URL } from '../config.js';
import { cachedTimes, loadMonth, nextPrayer, untilText } from '../prayertimes.js';

export const PRAYERS = [
  ['fajr', 'Fajr'], ['dhuhr', 'Dhuhr'], ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha'],
];
const FIVE = new Set(PRAYERS.map(([k]) => k));
const LABEL = { ...Object.fromEntries(PRAYERS), awrad: 'Daily Awrad' };

let day = null; // date being viewed

export default {
  id: 'prayer',
  label: 'Prayer',
  async render(el, ctx) {
    const t = today();
    if (!day || day > t) day = t;
    const logs = await ctx.store.list('prayer_logs', { gte: ['prayed_on', addDays(t, -60)] });
    const byDay = {};
    for (const l of logs) (byDay[l.prayed_on] ??= new Set()).add(l.prayer);
    const has = (d, p) => Boolean(byDay[d]?.has(p));
    const count = (d) => [...(byDay[d] || [])].filter((p) => FIVE.has(p)).length;
    const awrad = (d) => has(d, 'awrad');

    let streak = 0;
    for (let d = count(t) === 5 ? t : addDays(t, -1); count(d) === 5; d = addDays(d, -1)) streak++;
    const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const weekTotal = week.reduce((n, d) => n + count(d), 0);
    let awradStreak = 0;
    for (let d = awrad(t) ? t : addDays(t, -1); awrad(d); d = addDays(d, -1)) awradStreak++;
    const awradWeek = week.filter(awrad).length;
    // Prayer times: show what's cached now, fetch the month in the background if needed.
    const pt = cachedTimes(day);
    for (const d of new Set([day, t, addDays(t, 1)])) {
      if (cachedTimes(d) === undefined) loadMonth(d.slice(0, 7)).then((fresh) => { if (fresh && el.isConnected) ctx.rerender(); });
    }
    const next = day === t ? nextPrayer(t, addDays(t, 1)) : null;
    const PRAYER_NAME = Object.fromEntries(PRAYERS);
    const fullDays30 = Array.from({ length: 30 }, (_, i) => addDays(t, -i)).filter((d) => count(d) === 5).length;

    mount(el, html`
      <header class="page-head"><div><h1>Prayer</h1><p>${count(t)}/5 today${next ? html` · next <b class="next-name">${PRAYER_NAME[next.key]}</b> ${next.label} <span id="pt-until">${untilText(next.when)}</span>` : ''}</p></div></header>

      <section class="card">
        <div class="daynav">
          <button class="icon-btn" data-act="prev" aria-label="Previous day">${raw(icon('left'))}</button>
          <div class="date"><b>${relDate(day)}</b><span>${fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</span>${pt?.hijri ? html`<span class="hijri">${pt.hijri}</span>` : ''}</div>
          <button class="icon-btn" data-act="next" aria-label="Next day" ${day >= t ? 'disabled style="visibility:hidden"' : ''}>${raw(icon('right'))}</button>
        </div>
        <ul class="prayers">
          ${PRAYERS.map(([k, label]) => html`
            <li>
              <button class="prayer ${has(day, k) ? 'on' : ''} ${next && next.date === day && next.key === k ? 'next' : ''}" data-act="toggle" data-p="${k}" aria-pressed="${has(day, k)}">
                <span class="check">${raw(icon('check'))}</span>
                <span class="name">${label}${next && next.date === day && next.key === k ? html` <span class="pill">Next</span>` : ''}</span>
                ${pt?.ampm?.[k] ? html`<span class="ptime">${pt.ampm[k]}</span>` : ''}
                <span class="xp">+${XP.prayer}</span>
              </button>
            </li>`)}
        </ul>
        <p class="fullday">${count(day) === 5 ? `All five prayed · +${XP.prayerFullDay} bonus` : `${5 - count(day)} remaining`}</p>
        <p class="pt-source">${pt?.ampm?.syuruk ? html`Syuruk ${pt.ampm.syuruk} · ` : ''}${pt === null ? 'MUIS times not published for this date yet · ' : ''}Times: MUIS via <a href="https://prayertimes.sg" target="_blank" rel="noopener">prayertimes.sg</a></p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Daily Awrad</h2>
          ${AWRAD_URL ? html`<a class="text-btn" href="${AWRAD_URL}" target="_blank" rel="noopener">Open awrad ↗</a>` : html`<span class="meta">Once every 24 hours</span>`}</div>
        <button class="prayer ${awrad(day) ? 'on' : ''}" data-act="toggle" data-p="awrad" aria-pressed="${awrad(day)}">
          <span class="check">${raw(icon('check'))}</span>
          <span class="name">Daily Awrad${awrad(day) ? ' · done' : ''}</span>
          <span class="xp">+${XP.awrad}</span>
        </button>
        <p class="fullday">${awradStreak ? `${awradStreak}-day streak · ` : ''}${awradWeek}/7 this week</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Last 7 days</h2></div>
        <div class="pgrid" style="--cols:${week.length}">
          <span></span>
          ${week.map((d) => html`<span class="dh ${d === day ? 'sel' : ''}">${fmtDate(d, { weekday: 'narrow' })}</span>`)}
          ${PRAYERS.map(([k, label]) => html`
            <span class="lbl">${label}</span>
            ${week.map((d) => html`<button class="cell ${has(d, k) ? 'on' : ''}" data-act="jump" data-d="${d}" aria-label="${label}, ${fmtDate(d)}: ${has(d, k) ? 'prayed' : 'not logged'}"></button>`)}`)}
          <span class="lbl awrad-lbl">Awrad</span>
          ${week.map((d) => html`<button class="cell awrad-cell ${awrad(d) ? 'on' : ''}" data-act="jump" data-d="${d}" aria-label="Daily Awrad, ${fmtDate(d)}: ${awrad(d) ? 'done' : 'not logged'}"></button>`)}
        </div>
      </section>

      <div class="kpis">
        <div class="kpi"><b>${streak}</b><span>Day streak</span></div>
        <div class="kpi"><b>${weekTotal}<span class="faint" style="font-size:15px">/35</span></b><span>This week</span></div>
        <div class="kpi"><b>${fullDays30}</b><span>Full days, 30d</span></div>
        <div class="kpi"><b>${awradStreak}</b><span>Awrad streak</span></div>
      </div>
    `);

    // Keep the countdown fresh while this page is open.
    if (next) {
      const timer = setInterval(() => {
        if (!el.isConnected) { clearInterval(timer); return; }
        if (new Date() >= next.when) { clearInterval(timer); ctx.rerender(); return; }
        const u = el.querySelector('#pt-until'); if (u) u.textContent = untilText(next.when);
      }, 20000);
    }

    wire(el, {
      prev: () => { day = addDays(day, -1); ctx.rerender(); },
      next: () => { if (day < t) { day = addDays(day, 1); ctx.rerender(); } },
      jump: (b) => { day = b.dataset.d; ctx.rerender(); },
      toggle: async (b) => {
        const p = b.dataset.p;
        const label = LABEL[p];
        const isAwrad = p === 'awrad';
        const existing = logs.find((l) => l.prayed_on === day && l.prayer === p);
        if (existing) {
          await ctx.store.remove('prayer_logs', existing.id);
          await ctx.revoke('prayer', existing.id);
          if (!isAwrad) await ctx.revoke('prayer_day', day);
        } else {
          const row = await ctx.store.insert('prayer_logs', { prayed_on: day, prayer: p });
          await ctx.award('FTH', isAwrad ? XP.awrad : XP.prayer, 'prayer', row.id, label);
          if (!isAwrad && count(day) + 1 === 5) await ctx.award('FTH', XP.prayerFullDay, 'prayer_day', day, 'All five prayers');
        }
        ctx.rerender();
      },
    });
  },
};
