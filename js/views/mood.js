import { html, raw, wire, mount, today, addDays, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

export const MOODS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];
const FACE = ['😞', '😕', '😐', '🙂', '😄'];

export default {
  id: 'mood',
  label: 'Mood',
  async render(el, ctx) {
    const t = today();
    const logs = await ctx.store.list('moods', { gte: ['logged_on', addDays(t, -90)], order: 'logged_on' });
    const byDay = Object.fromEntries(logs.map((l) => [l.logged_on, l]));
    const todays = byDay[t];
    let streak = 0;
    for (let d = todays ? t : addDays(t, -1); byDay[d]; d = addDays(d, -1)) streak += 1;
    // Five weeks, Monday first, ending this week.
    const dow = (new Date().getDay() + 6) % 7;
    const start = addDays(t, -dow - 28);
    const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
    const last30 = logs.filter((l) => l.logged_on > addDays(t, -30));
    const avg = last30.length ? last30.reduce((n, l) => n + l.mood, 0) / last30.length : null;
    const grateful = [...logs].filter((l) => l.gratitude).sort((a, b) => b.logged_on.localeCompare(a.logged_on));

    mount(el, html`
      <header class="page-head"><div><h1>Mood</h1><p>${streak ? `${streak}-day streak` : 'Check in once a day'}</p></div></header>

      <section class="card">
        <div class="card-head"><h2>${todays ? 'Today' : 'How are you today?'}</h2>${todays ? html`<span class="meta">${MOODS[todays.mood - 1]}</span>` : ''}</div>
        <form data-form="save" class="form">
          <div class="moods" role="radiogroup" aria-label="Mood">
            ${MOODS.map((m, i) => html`<label><input type="radio" name="mood" value="${i + 1}" ${todays?.mood === i + 1 ? 'checked' : ''} required><span><b aria-hidden="true">${FACE[i]}</b>${m}</span></label>`)}
          </div>
          <label class="field">One thing you’re grateful for<input name="gratitude" maxlength="300" placeholder="Optional" value="${todays?.gratitude || ''}"></label>
          <div class="row end"><button class="btn primary">${raw(icon(todays ? 'check' : 'plus', 18))}${todays ? 'Update' : `Check in · +${XP.mood}`}</button></div>
        </form>
      </section>

      <div class="kpis">
        <div class="kpi"><b>${avg == null ? '–' : MOODS[Math.round(avg) - 1]}</b><span>Average, 30 days</span></div>
        <div class="kpi"><b>${last30.length}</b><span>Check-ins, 30 days</span></div>
        <div class="kpi"><b>${streak}</b><span>Day streak</span></div>
      </div>

      <section class="card">
        <div class="card-head"><h2>Last five weeks</h2></div>
        <div class="mood-cal" role="img" aria-label="Mood calendar, last five weeks">
          ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => html`<span class="mc-h">${d}</span>`)}
          ${days.map((d) => { const l = byDay[d]; return html`<span class="mc ${l ? `m${l.mood}` : ''} ${d === t ? 'sel' : ''} ${d > t ? 'future' : ''}" title="${fmtDate(d)}${l ? ` · ${MOODS[l.mood - 1]}` : ''}"></span>`; })}
        </div>
        <p class="small muted mc-key">${MOODS.map((m, i) => html`<span><i class="mc m${i + 1}"></i>${m}</span>`)}</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Grateful for</h2></div>
        ${grateful.length ? html`<ul class="list">${grateful.slice(0, 20).map((l) => html`
          <li class="item">
            <span class="face" aria-label="${MOODS[l.mood - 1]}">${FACE[l.mood - 1]}</span>
            <div class="body"><p class="title" style="white-space:normal">${l.gratitude}</p><p class="sub">${relDate(l.logged_on)}</p></div>
            <button class="icon-btn" data-act="delete" data-id="${l.id}" aria-label="Delete check-in">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('Small things count: a good coffee, a kind word.')}
      </section>
    `);

    wire(el, {
      save: async (v) => {
        const mood = Math.min(5, Math.max(1, parseInt(v.mood, 10) || 3));
        const row = { mood, gratitude: v.gratitude || null };
        if (todays) {
          await ctx.store.update('moods', todays.id, row);
          ctx.say('Updated');
        } else {
          const saved = await ctx.store.insert('moods', { ...row, logged_on: t });
          await ctx.award('WIS', XP.mood, 'mood', saved.logged_on, `Feeling ${MOODS[mood - 1].toLowerCase()}`);
        }
        ctx.rerender();
      },
      delete: async (b) => {
        const l = logs.find((x) => x.id === b.dataset.id);
        if (!confirm('Delete this check-in? Its XP will be removed.')) return;
        await ctx.store.remove('moods', l.id);
        await ctx.revoke('mood', l.logged_on);
        ctx.rerender();
      },
    });
  },
};
