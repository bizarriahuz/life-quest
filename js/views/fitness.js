import { html, raw, wire, mount, today, addDays, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { api } from '../api.js';

// Food: type what you ate and get an estimate of the calories (Workers AI, see functions/api/calories.js).
// It is always shown as an estimate, and you can change the number before or after saving.
let tab = 'training';
let guess = null;      // { text, items, total, note } waiting to be saved
let busy = false;
const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];
const mealNow = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack'; };

const KINDS = [['run', 'Run'], ['strength', 'Strength'], ['cardio', 'Cardio'], ['sport', 'Sport'], ['other', 'Other']];
const kindLabel = (k) => (KINDS.find(([v]) => v === k) || [k, k])[1];
const km = (n) => (Number(n) || 0).toFixed(1).replace(/\.0$/, '');

export default {
  id: 'fitness',
  label: 'Fitness',
  async render(el, ctx) {
    const t = today();
    const [rows, food] = await Promise.all([
      ctx.store.list('workouts', { gte: ['performed_on', addDays(t, -60)], order: 'performed_on' }),
      ctx.store.list('food_logs', { gte: ['eaten_on', addDays(t, -6)] }).catch(() => []),
    ]);
    food.sort((a, b) => b.eaten_on.localeCompare(a.eaten_on) || b.created_at.localeCompare(a.created_at));
    const kcalBy = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [addDays(t, i - 6), 0]));
    for (const f of food) if (f.eaten_on in kcalBy) kcalBy[f.eaten_on] += f.kcal;
    const todayFood = food.filter((f) => f.eaten_on === t);
    const signedIn = ctx.store.mode === 'cloud';
    rows.sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at));

    const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const inWeek = rows.filter((w) => w.performed_on >= week[0]);
    const minsBy = Object.fromEntries(week.map((d) => [d, 0]));
    for (const w of inWeek) minsBy[w.performed_on] += w.duration_min || 0;
    const maxMin = Math.max(30, ...Object.values(minsBy));
    const monthKm = rows.filter((w) => w.performed_on.startsWith(t.slice(0, 7))).reduce((n, w) => n + (Number(w.distance_km) || 0), 0);
    const weekMin = inWeek.reduce((n, w) => n + (w.duration_min || 0), 0);

    mount(el, html`
      <header class="page-head"><div><h1>Fitness</h1><p>${tab === 'food' ? `About ${kcalBy[t].toLocaleString()} kcal today` : `${inWeek.length} session${inWeek.length === 1 ? '' : 's'} this week`}</p></div></header>
      <div class="seg ptabs" role="tablist" aria-label="Fitness">
        ${[['training', 'Training'], ['food', 'Food']].map(([k, v]) => html`<label><input type="radio" name="ftab" value="${k}" data-change="tab" ${tab === k ? 'checked' : ''}><span>${v}</span></label>`)}
      </div>
      ${tab === 'food' ? html`
      <section class="card">
        <div class="card-head"><h2>What did you eat?</h2></div>
        <form data-form="guess" class="form">
          <input name="text" maxlength="200" required placeholder="e.g. nasi lemak with fried chicken, teh tarik" aria-label="What you ate" value="${guess?.text || ''}">
          <div class="row spread" style="gap:8px">
            <select name="meal" aria-label="Meal" style="width:auto">${MEALS.map(([k, v]) => html`<option value="${k}" ${(guess?.meal || mealNow()) === k ? 'selected' : ''}>${v}</option>`)}</select>
            <button class="btn primary" ${busy ? 'disabled' : ''}>${busy ? 'Estimating…' : signedIn ? 'Estimate' : 'Add'}</button>
          </div>
        </form>
        ${guess ? html`<div class="fd-guess">
          ${guess.items.length ? html`<ul class="fd-items">${guess.items.map((x) => html`<li><span>${x.name}${x.portion ? html` <span class="faint">· ${x.portion}</span>` : ''}</span><b>${x.kcal}</b></li>`)}</ul>` : ''}
          ${guess.note ? html`<p class="small muted">${guess.note}</p>` : ''}
          <form data-form="savefood" class="row" style="gap:8px;align-items:end">
            <label class="field" style="max-width:150px">Calories (estimate)<input name="kcal" type="number" inputmode="numeric" min="0" max="5000" required value="${guess.total || ''}"></label>
            <button class="btn primary">${raw(icon('check', 18))}Save</button>
            <button type="button" class="btn" data-act="dropguess">Cancel</button>
          </form>
        </div>` : ''}
        <p class="small faint" style="margin-top:10px">${signedIn ? 'Estimates come from AI and can be off, mostly because of portion size and oil. Change the number if you know better.' : 'Sign in to get AI estimates. You can still type the calories yourself.'}</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Today</h2><span class="meta">${kcalBy[t].toLocaleString()} kcal</span></div>
        ${todayFood.length ? html`<ul class="list">${todayFood.map((f) => html`<li class="item">
          <div class="body"><p class="title">${f.text}</p><p class="sub">${(MEALS.find(([k]) => k === f.meal) || ['', 'Meal'])[1]}${f.detail ? ` · ${f.detail}` : ''}</p></div>
          <span class="xp">${f.kcal}</span>
          <button class="icon-btn" data-act="delfood" data-id="${f.id}" aria-label="Delete ${f.text}">${raw(icon('trash'))}</button>
        </li>`)}</ul>` : empty('Nothing logged today.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>Last 7 days</h2><span class="meta">kcal, estimated</span></div>
        <div class="fd-week">${Object.entries(kcalBy).map(([d, n]) => html`<div class="${d === t ? 'today' : ''}"><b>${n ? n.toLocaleString() : '–'}</b><span>${d === t ? 'Today' : fmtDate(d, { weekday: 'short' })}</span></div>`)}</div>
      </section>` : html`
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
      </section>`}
    `);

    wire(el, {
      tab: (r) => { tab = r.value; ctx.rerender(); },
      guess: async (v) => {
        const text = v.text.trim().slice(0, 200);
        if (!signedIn) { guess = { text, meal: v.meal, items: [], total: null, note: '' }; ctx.rerender(); return; }
        busy = true; guess = { text, meal: v.meal, items: [], total: null, note: '' }; ctx.rerender();
        try {
          const r = await api(ctx, '/api/calories', { method: 'POST', body: { text } });
          guess = { text, meal: v.meal, ...r };
          if (!r.items.length) ctx.say(r.note || 'Couldn’t estimate that. Type the number yourself.');
        } catch (e) { ctx.say(e.message); }
        busy = false; ctx.rerender();
      },
      savefood: async (v) => {
        const kcal = Math.max(0, Math.min(5000, Math.round(Number(v.kcal) || 0)));
        const detail = guess.items.length > 1 ? guess.items.map((x) => `${x.name} ${x.kcal}`).join(', ').slice(0, 600) : null;
        await ctx.store.insert('food_logs', { eaten_on: t, meal: guess.meal || mealNow(), text: guess.text, kcal, detail });
        guess = null; ctx.say(`Logged ${kcal} kcal`); ctx.rerender();
      },
      dropguess: () => { guess = null; ctx.rerender(); },
      delfood: async (b) => { await ctx.store.remove('food_logs', b.dataset.id); ctx.rerender(); },
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
