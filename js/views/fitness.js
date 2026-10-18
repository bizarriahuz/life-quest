import { html, raw, wire, mount, today, addDays, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

const KINDS = [['run', 'Run'], ['strength', 'Strength'], ['cardio', 'Cardio'], ['sport', 'Sport'], ['other', 'Other']];
const kindLabel = (k) => (KINDS.find(([v]) => v === k) || [k, k])[1];
const km = (n) => (Number(n) || 0).toFixed(1).replace(/\.0$/, '');

export default {
  id: 'fitness',
  label: 'Fitness',
  async render(el, ctx) {
    const t = today();
    const rows = await ctx.store.list('workouts', { gte: ['performed_on', addDays(t, -60)], order: 'performed_on' });
    rows.sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at));

    const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const inWeek = rows.filter((w) => w.performed_on >= week[0]);
    const minsBy = Object.fromEntries(week.map((d) => [d, 0]));
    for (const w of inWeek) minsBy[w.performed_on] += w.duration_min || 0;
    const maxMin = Math.max(30, ...Object.values(minsBy));
    const monthKm = rows.filter((w) => w.performed_on.startsWith(t.slice(0, 7))).reduce((n, w) => n + (Number(w.distance_km) || 0), 0);
    const weekMin = inWeek.reduce((n, w) => n + (w.duration_min || 0), 0);

    mount(el, html`
      <header class="page-head"><div><h1>Fitness</h1><p>${inWeek.length} session${inWeek.length === 1 ? '' : 's'} this week</p></div></header>

      <div class="kpis">
        <div class="kpi"><b>${inWeek.length}</b><span>Sessions, 7d</span></div>
        <div class="kpi"><b>${weekMin}</b><span>Minutes, 7d</span></div>
        <div class="kpi"><b>${km(monthKm)}</b><span>km this month</span></div>
      </div>

      <section class="card">
        <div class="card-head"><h2>Log a session</h2></div>
        <form data-form="add" class="form">
          <div class="seg" role="radiogroup" aria-label="Type">
            ${KINDS.map(([v, l], i) => html`<label><input type="radio" name="kind" value="${v}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`)}
          </div>
          <div class="fields">
            <label class="field">Date<input type="date" name="performed_on" value="${t}" max="${t}" required></label>
            <label class="field">Minutes<input type="number" name="duration_min" min="1" max="1440" inputmode="numeric" required placeholder="45"></label>
            <label class="field">Distance (km)<input type="number" name="distance_km" min="0" step="0.01" inputmode="decimal" placeholder="Optional"></label>
          </div>
          <input name="notes" maxlength="200" placeholder="Notes (optional)" aria-label="Notes">
          <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Log session</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Last 7 days</h2><span class="meta">minutes</span></div>
        <div class="chart" role="img" aria-label="Minutes trained over the last 7 days">
          ${week.map((d) => html`
            <div class="col">
              <span class="v">${minsBy[d] || ''}</span>
              <div class="b"><i style="height:${(minsBy[d] / maxMin) * 100}%"></i></div>
              <span class="d ${d === t ? 'sel' : ''}">${fmtDate(d, { weekday: 'narrow' })}</span>
            </div>`)}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>History</h2></div>
        ${rows.length ? html`<ul class="list">${rows.slice(0, 30).map((w) => html`
          <li class="item">
            <div class="body">
              <p class="title">${kindLabel(w.kind)} · ${w.duration_min} min${Number(w.distance_km) ? ` · ${km(w.distance_km)} km` : ''}</p>
              <p class="sub">${relDate(w.performed_on)}${w.notes ? ` · ${w.notes}` : ''}</p>
            </div>
            <span class="xp">+${XP.workout(w)}</span>
            <button class="icon-btn" data-act="delete" data-id="${w.id}" aria-label="Delete session">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('No sessions yet.')}
      </section>
    `);

    wire(el, {
      add: async (v, form) => {
        const row = await ctx.store.insert('workouts', {
          kind: v.kind || 'run',
          performed_on: v.performed_on || t,
          duration_min: Math.max(1, Math.min(1440, parseInt(v.duration_min, 10) || 0)),
          distance_km: v.distance_km === '' ? null : Math.max(0, Number(v.distance_km) || 0),
          notes: v.notes || null,
        });
        form.reset();
        await ctx.award('STR', XP.workout(row), 'workout', row.id, `${kindLabel(row.kind)} logged`);
        ctx.rerender();
      },
      delete: async (b) => {
        if (!confirm('Delete this session? Its XP will be removed.')) return;
        await ctx.store.remove('workouts', b.dataset.id);
        await ctx.revoke('workout', b.dataset.id);
        ctx.rerender();
      },
    });
  },
};
