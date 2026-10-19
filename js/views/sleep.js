import { html, raw, wire, mount, today, addDays, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

const toMin = (t) => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + m; };
const dur = (bed, wake) => { const d = (toMin(wake) - toMin(bed) + 1440) % 1440; return d || 1440; };
const hm = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;
const clock = (t) => String(t || '').slice(0, 5);
const QUALITY = ['Awful', 'Poor', 'Okay', 'Good', 'Great'];
// Bedtimes are compared on a scale that starts at 18:00, so 23:30 and 00:30 sit close together.
const bedScale = (t) => (toMin(t) - 18 * 60 + 1440) % 1440;
const GOALS = [360, 390, 420, 450, 480, 510, 540, 570, 600];

export default {
  id: 'sleep',
  label: 'Sleep',
  async render(el, ctx) {
    const t = today();
    const goal = ctx.profile?.sleep_goal_min || 480;
    const logs = await ctx.store.list('sleep_logs', { gte: ['slept_on', addDays(t, -60)], order: 'slept_on' });
    logs.sort((a, b) => b.slept_on.localeCompare(a.slept_on));
    const byDay = Object.fromEntries(logs.map((l) => [l.slept_on, l]));
    const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const inWeek = week.map((d) => byDay[d]).filter(Boolean);
    const avg = inWeek.length ? inWeek.reduce((n, l) => n + l.duration_min, 0) / inWeek.length : 0;
    const hits = inWeek.filter((l) => l.duration_min >= goal).length;
    const beds = inWeek.map((l) => bedScale(l.bed_time));
    const spread = beds.length > 1 ? Math.sqrt(beds.reduce((n, b) => n + (b - beds.reduce((x, y) => x + y, 0) / beds.length) ** 2, 0) / beds.length) : null;
    const last = logs[0];
    const editing = byDay[t];
    const prev = last || { bed_time: '23:00', wake_time: '07:00' };
    const maxMin = Math.max(goal * 1.25, ...inWeek.map((l) => l.duration_min));

    mount(el, html`
      <header class="page-head"><div><h1>Sleep</h1><p>${last ? `${hm(last.duration_min)} ${relDate(last.slept_on) === 'Today' ? 'last night' : `on ${relDate(last.slept_on)}`}` : 'Log your first night'}</p></div></header>

      <div class="kpis">
        <div class="kpi"><b>${inWeek.length ? hm(avg) : '–'}</b><span>Average, 7 nights</span></div>
        <div class="kpi"><b>${hits}<span class="faint" style="font-size:15px">/${inWeek.length || 7}</span></b><span>Nights at goal</span></div>
        <div class="kpi"><b>${spread == null ? '–' : `±${Math.round(spread)}m`}</b><span>Bedtime consistency</span></div>
      </div>

      <section class="card">
        <div class="card-head"><h2>${editing ? 'Update last night' : 'Log a night'}</h2>
          <form data-form="goal" class="row" style="gap:8px">
            <label class="small muted" for="sleep-goal">Goal</label>
            <select id="sleep-goal" name="goal" data-change="goal" style="width:auto;min-height:34px;padding:4px 30px 4px 10px;font-size:14px">
              ${GOALS.map((g) => html`<option value="${g}" ${g === goal ? 'selected' : ''}>${hm(g)}</option>`)}
            </select>
          </form>
        </div>
        <form data-form="log" class="form">
          <div class="fields">
            <label class="field">Woke up on<input type="date" name="slept_on" value="${t}" max="${t}" required></label>
            <label class="field">Went to bed<input type="time" name="bed_time" value="${clock(editing?.bed_time || prev.bed_time)}" required></label>
            <label class="field">Woke up<input type="time" name="wake_time" value="${clock(editing?.wake_time || prev.wake_time)}" required></label>
          </div>
          <div class="row wrap spread">
            <div class="seg" role="radiogroup" aria-label="How did you sleep?">
              ${QUALITY.map((q, i) => html`<label><input type="radio" name="quality" value="${i + 1}" ${(editing?.quality || 4) === i + 1 ? 'checked' : ''}><span>${q}</span></label>`)}
            </div>
          </div>
          <input name="note" maxlength="200" placeholder="Note (optional), e.g. coffee late, woke at 3am" aria-label="Note" value="${editing?.note || ''}">
          <div class="row spread wrap">
            <span class="small muted" id="sleep-preview"></span>
            <button class="btn primary">${raw(icon(editing ? 'check' : 'plus', 18))}${editing ? 'Update' : 'Log night'}</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Last 7 nights</h2><span class="meta">goal ${hm(goal)}</span></div>
        <div class="chart sleep-chart" role="img" aria-label="Hours slept over the last 7 nights, against a goal of ${hm(goal)}">
          <span class="goal-line" style="bottom: calc(24px + (100% - 48px) * ${goal / maxMin})"><span>${Math.round(goal / 6) / 10}h</span></span>
          ${week.map((d) => { const l = byDay[d]; return html`
            <div class="col">
              <span class="v">${l ? (Math.round(l.duration_min / 6) / 10).toFixed(1) : ''}</span>
              <div class="b"><i class="${l && l.duration_min >= goal ? '' : 'under'}" style="height:${l ? (l.duration_min / maxMin) * 100 : 0}%"></i></div>
              <span class="d ${d === t ? 'sel' : ''}">${fmtDate(d, { weekday: 'narrow' })}</span>
            </div>`; })}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>History</h2></div>
        ${logs.length ? html`<ul class="list">${logs.slice(0, 21).map((l) => html`
          <li class="item">
            <div class="body">
              <p class="title">${hm(l.duration_min)} <span class="muted">· ${clock(l.bed_time)} → ${clock(l.wake_time)}</span></p>
              <p class="sub">${relDate(l.slept_on)}${l.quality ? ` · ${QUALITY[l.quality - 1]}` : ''}${l.note ? ` · ${l.note}` : ''}</p>
            </div>
            <span class="xp">+${XP.sleepLog + (l.duration_min >= goal ? XP.sleepGoal : 0)}</span>
            <button class="icon-btn" data-act="delete" data-id="${l.id}" aria-label="Delete night">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('No nights logged yet.')}
      </section>
    `);

    // Live duration preview and switch to "update" when picking a date already logged.
    const form = el.querySelector('form[data-form=log]');
    const preview = el.querySelector('#sleep-preview');
    const refresh = () => {
      const f = form.elements;
      if (f.bed_time.value && f.wake_time.value) {
        const d = dur(f.bed_time.value, f.wake_time.value);
        preview.textContent = `${hm(d)} of sleep${d >= goal ? ' · goal met' : ` · ${hm(goal - d)} short of goal`}`;
      }
    };
    form.addEventListener('input', refresh);
    refresh();

    wire(el, {
      goal: async (sel) => {
        const g = parseInt(sel.value, 10);
        if (!GOALS.includes(g)) return;
        await ctx.setProfile({ sleep_goal_min: g });
        ctx.say(`Sleep goal set to ${hm(g)}`);
        ctx.rerender();
      },
      log: async (v) => {
        const day = v.slept_on || t;
        if (day > t) { ctx.say('That date is in the future'); return; }
        const d = dur(v.bed_time, v.wake_time);
        if (d > 16 * 60) { ctx.say('That’s over 16 hours. Check the times'); return; }
        const row = { slept_on: day, bed_time: v.bed_time, wake_time: v.wake_time, duration_min: d,
          quality: Math.min(5, Math.max(1, parseInt(v.quality, 10) || 3)), note: v.note || null };
        const existing = logs.find((l) => l.slept_on === day);
        let saved;
        if (existing) {
          saved = await ctx.store.update('sleep_logs', existing.id, row);
          await ctx.store.revoke('sleep', existing.id);
          await ctx.revoke('sleep_goal', existing.id);
        } else {
          saved = await ctx.store.insert('sleep_logs', row);
        }
        await ctx.award('RST', XP.sleepLog + (d >= goal ? XP.sleepGoal : 0), 'sleep', saved.id, `${hm(d)} of sleep${d >= goal ? ' · goal met' : ''}`);
        ctx.rerender();
      },
      delete: async (b) => {
        if (!confirm('Delete this night? Its XP will be removed.')) return;
        await ctx.store.remove('sleep_logs', b.dataset.id);
        await ctx.store.revoke('sleep_goal', b.dataset.id);
        await ctx.revoke('sleep', b.dataset.id);
        ctx.rerender();
      },
    });
  },
};
