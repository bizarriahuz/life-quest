import { html, raw, wire, mount, today, addDays, relDate, bar, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

const KIND = { course: 'Course', certification: 'Certification', skill: 'Skill', other: 'Other' };
const hrs = (min) => (min >= 60 ? `${(min / 60).toFixed(1).replace(/\.0$/, '')} h` : `${min} min`);

export default {
  id: 'learning',
  label: 'Learning',
  async render(el, ctx) {
    const t = today();
    const [items, sessions] = await Promise.all([
      ctx.store.list('learning_items', { order: 'created_at', asc: true }),
      ctx.store.list('learning_sessions', { order: 'session_on' }),
    ]);
    sessions.sort((a, b) => b.session_on.localeCompare(a.session_on) || b.created_at.localeCompare(a.created_at));
    const minsOf = (id) => sessions.filter((s) => s.item_id === id).reduce((n, s) => n + s.duration_min, 0);
    const nameOf = Object.fromEntries(items.map((i) => [i.id, i.title]));
    const open = items.filter((i) => i.status !== 'done').sort((a, b) => (a.status === 'paused') - (b.status === 'paused'));
    const done = items.filter((i) => i.status === 'done').sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
    const weekMin = sessions.filter((s) => s.session_on > addDays(t, -7)).reduce((n, s) => n + s.duration_min, 0);
    const active = open.filter((i) => i.status === 'active');

    mount(el, html`
      <header class="page-head"><div><h1>Learning</h1><p>${hrs(weekMin)} this week · ${done.length} completed</p></div></header>

      ${active.length ? html`
        <section class="card">
          <div class="card-head"><h2>Log study time</h2></div>
          <form data-form="log" class="form">
            <div class="fields">
              <label class="field">What<select name="item_id">${active.map((i) => html`<option value="${i.id}">${i.title}</option>`)}</select></label>
              <label class="field">Date<input type="date" name="session_on" value="${t}" max="${t}" required></label>
              <label class="field">Minutes<input type="number" name="duration_min" min="1" max="1440" inputmode="numeric" required placeholder="45"></label>
            </div>
            <input name="note" maxlength="200" placeholder="What you covered (optional)" aria-label="Note">
            <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Log time</button></div>
          </form>
        </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>In progress</h2><span class="meta">${open.length}</span></div>
        ${open.length ? html`<div>${open.map((i) => {
          const min = minsOf(i.id);
          const pct = i.target_hours ? Math.min(100, (min / 60 / i.target_hours) * 100) : null;
          return html`
            <div class="goal">
              <div class="row spread" style="align-items:flex-start">
                <div class="grow"><b style="font-weight:600">${i.title}</b>
                  <p class="small muted"><span class="pill">${KIND[i.kind]}</span>${i.provider ? `${i.provider} · ` : ''}${hrs(min)}${i.target_hours ? ` of ${i.target_hours} h` : ' so far'}${i.status === 'paused' ? ' · paused' : ''}</p></div>
                <details class="more"><summary class="icon-btn" aria-label="More for ${i.title}">⋯</summary>
                  <div class="more-menu">
                    <button class="text-btn" data-act="finish" data-id="${i.id}">Mark completed (+${XP.learnDone})</button>
                    <button class="text-btn" data-act="pause" data-id="${i.id}">${i.status === 'paused' ? 'Resume' : 'Pause'}</button>
                    <button class="text-btn" data-act="delitem" data-id="${i.id}">Delete</button>
                  </div></details>
              </div>
              ${pct != null ? bar(pct) : ''}
            </div>`;
        })}</div>` : empty('Add a course, certification or skill you’re working on.')}
        <form data-form="add" class="form" style="margin-top:14px">
          <input name="title" maxlength="120" placeholder="e.g. AWS Solutions Architect" required aria-label="What you're learning">
          <div class="fields">
            <label class="field">Type<select name="kind">${Object.entries(KIND).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
            <label class="field">Provider<input name="provider" maxlength="120" placeholder="Optional"></label>
            <label class="field">Target hours<input type="number" name="target_hours" min="1" max="10000" inputmode="numeric" placeholder="Optional"></label>
          </div>
          <div class="row end"><button class="btn">Add</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Recent sessions</h2></div>
        ${sessions.length ? html`<ul class="list">${sessions.slice(0, 20).map((s) => html`
          <li class="item">
            <div class="body"><p class="title">${nameOf[s.item_id] || 'Learning'} · ${hrs(s.duration_min)}</p>
              <p class="sub">${relDate(s.session_on)}${s.note ? ` · ${s.note}` : ''}</p></div>
            <span class="xp">+${XP.learning(s.duration_min)}</span>
            <button class="icon-btn" data-act="delsession" data-id="${s.id}" aria-label="Delete session">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('No study time logged yet.')}
      </section>

      ${done.length ? html`
        <section class="card">
          <details><summary>Completed <span class="muted small" style="margin-left:auto;margin-right:10px">${done.length}</span></summary>
            <ul class="list">${done.map((i) => html`
              <li class="item">
                <div class="body"><p class="title"><span class="pill solid">${KIND[i.kind]}</span>${i.title}</p>
                  <p class="sub">${i.done_on ? relDate(i.done_on) : ''} · ${hrs(minsOf(i.id))}</p></div>
                <button class="btn sm" data-act="reopen" data-id="${i.id}">Reopen</button>
              </li>`)}</ul>
          </details>
        </section>` : ''}
    `);

    const item = (id) => items.find((i) => i.id === id);
    wire(el, {
      add: async (v, form) => {
        const th = parseInt(v.target_hours, 10);
        await ctx.store.insert('learning_items', {
          title: v.title, kind: KIND[v.kind] ? v.kind : 'course', provider: v.provider || null,
          target_hours: th > 0 ? Math.min(10000, th) : null,
        });
        form.reset();
        ctx.say(`${v.title} added`);
        ctx.rerender();
      },
      log: async (v, form) => {
        const min = Math.max(1, Math.min(1440, parseInt(v.duration_min, 10) || 0));
        const row = await ctx.store.insert('learning_sessions', { item_id: v.item_id, session_on: v.session_on || t, duration_min: min, note: v.note || null });
        form.elements.duration_min.value = ''; form.elements.note.value = '';
        await ctx.award('INT', XP.learning(min), 'learning_session', row.id, nameOf[v.item_id]);
        ctx.rerender();
      },
      delsession: async (b) => {
        if (!confirm('Delete this session? Its XP will be removed.')) return;
        await ctx.store.remove('learning_sessions', b.dataset.id);
        await ctx.revoke('learning_session', b.dataset.id);
        ctx.rerender();
      },
      finish: async (b) => {
        const i = item(b.dataset.id);
        await ctx.store.update('learning_items', i.id, { status: 'done', done_on: t });
        await ctx.award('INT', XP.learnDone, 'learning_done', i.id, `Completed ${i.title}`);
        ctx.rerender();
      },
      pause: async (b) => {
        const i = item(b.dataset.id);
        await ctx.store.update('learning_items', i.id, { status: i.status === 'paused' ? 'active' : 'paused' });
        ctx.rerender();
      },
      reopen: async (b) => {
        await ctx.store.update('learning_items', b.dataset.id, { status: 'active', done_on: null });
        await ctx.revoke('learning_done', b.dataset.id);
        ctx.rerender();
      },
      delitem: async (b) => {
        const i = item(b.dataset.id);
        const own = sessions.filter((s) => s.item_id === i.id);
        if (!confirm(`Delete ${i.title} and its ${own.length} session(s)? Their XP will be removed.`)) return;
        for (const s of own) await ctx.store.revoke('learning_session', s.id);
        await ctx.store.remove('learning_items', i.id);
        await ctx.revoke('learning_done', i.id);
        ctx.rerender();
      },
    });
  },
};
