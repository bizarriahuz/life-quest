import { html, raw, wire, mount, today, addDays, fmtDate, relDate } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

export const PRAYERS = [
  ['fajr', 'Fajr'], ['dhuhr', 'Dhuhr'], ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha'],
];

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
    const count = (d) => byDay[d]?.size || 0;

    let streak = 0;
    for (let d = count(t) === 5 ? t : addDays(t, -1); count(d) === 5; d = addDays(d, -1)) streak++;
    const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const weekTotal = week.reduce((n, d) => n + count(d), 0);
    const fullDays30 = Array.from({ length: 30 }, (_, i) => addDays(t, -i)).filter((d) => count(d) === 5).length;

    mount(el, html`
      <header class="page-head"><div><h1>Prayer</h1><p>${count(t)}/5 today</p></div></header>

      <section class="card">
        <div class="daynav">
          <button class="icon-btn" data-act="prev" aria-label="Previous day">${raw(icon('left'))}</button>
          <div class="date"><b>${relDate(day)}</b><span>${fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
          <button class="icon-btn" data-act="next" aria-label="Next day" ${day >= t ? 'disabled style="visibility:hidden"' : ''}>${raw(icon('right'))}</button>
        </div>
        <ul class="prayers">
          ${PRAYERS.map(([k, label]) => html`
            <li>
              <button class="prayer ${has(day, k) ? 'on' : ''}" data-act="toggle" data-p="${k}" aria-pressed="${has(day, k)}">
                <span class="check">${raw(icon('check'))}</span>
                <span class="name">${label}</span>
                <span class="xp">+${XP.prayer}</span>
              </button>
            </li>`)}
        </ul>
        <p class="fullday">${count(day) === 5 ? `All five prayed · +${XP.prayerFullDay} bonus` : `${5 - count(day)} remaining`}</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Last 7 days</h2></div>
        <div class="pgrid" style="--cols:${week.length}">
          <span></span>
          ${week.map((d) => html`<span class="dh ${d === day ? 'sel' : ''}">${fmtDate(d, { weekday: 'narrow' })}</span>`)}
          ${PRAYERS.map(([k, label]) => html`
            <span class="lbl">${label}</span>
            ${week.map((d) => html`<button class="cell ${has(d, k) ? 'on' : ''}" data-act="jump" data-d="${d}" aria-label="${label}, ${fmtDate(d)}: ${has(d, k) ? 'prayed' : 'not logged'}"></button>`)}`)}
        </div>
      </section>

      <div class="kpis">
        <div class="kpi"><b>${streak}</b><span>Day streak</span></div>
        <div class="kpi"><b>${weekTotal}<span class="faint" style="font-size:15px">/35</span></b><span>This week</span></div>
        <div class="kpi"><b>${fullDays30}</b><span>Full days, 30d</span></div>
      </div>
    `);

    wire(el, {
      prev: () => { day = addDays(day, -1); ctx.rerender(); },
      next: () => { if (day < t) { day = addDays(day, 1); ctx.rerender(); } },
      jump: (b) => { day = b.dataset.d; ctx.rerender(); },
      toggle: async (b) => {
        const p = b.dataset.p;
        const label = PRAYERS.find(([k]) => k === p)[1];
        const existing = logs.find((l) => l.prayed_on === day && l.prayer === p);
        if (existing) {
          await ctx.store.remove('prayer_logs', existing.id);
          await ctx.revoke('prayer', existing.id);
          await ctx.revoke('prayer_day', day);
        } else {
          const row = await ctx.store.insert('prayer_logs', { prayed_on: day, prayer: p });
          await ctx.award('FTH', XP.prayer, 'prayer', row.id, label);
          if (count(day) + 1 === 5) await ctx.award('FTH', XP.prayerFullDay, 'prayer_day', day, 'All five prayers');
        }
        ctx.rerender();
      },
    });
  },
};
