import { html, raw, wire, mount, today, relDate, fmtDate, bar, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

let showDone = false;

export default {
  id: 'goals',
  label: 'Goals',
  async render(el, ctx) {
    const t = today();
    const [goals, steps] = await Promise.all([
      ctx.store.list('goals', { order: 'created_at', asc: true }),
      ctx.store.list('goal_milestones', { order: 'position', asc: true }),
    ]);
    const stepsOf = (id) => steps.filter((s) => s.goal_id === id).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    const active = goals.filter((g) => g.status === 'active')
      .sort((a, b) => (a.target_date || '9999').localeCompare(b.target_date || '9999'));
    const finished = goals.filter((g) => g.status !== 'active').sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
    const doneYear = goals.filter((g) => g.status === 'done' && (g.done_on || '').startsWith(t.slice(0, 4))).length;

    const card = (g) => {
      const own = stepsOf(g.id);
      const n = own.filter((s) => s.done).length;
      const pct = own.length ? (n / own.length) * 100 : 0;
      const late = g.target_date && g.target_date < t;
      return html`
        <section class="card goal-card">
          <div class="row spread" style="align-items:flex-start">
            <div class="grow">
              <h2 class="goal-title">${g.title}</h2>
              ${g.why ? html`<p class="small muted">${g.why}</p>` : ''}
              ${g.target_date ? html`<p class="small ${late ? 'due-late' : 'muted'}" style="margin-top:4px">${late ? 'Was due ' : 'By '}${fmtDate(g.target_date, { day: 'numeric', month: 'short', year: 'numeric' })}</p>` : ''}
            </div>
            <details class="more"><summary class="icon-btn" aria-label="More for ${g.title}">⋯</summary>
              <div class="more-menu">
                <button class="text-btn" data-act="finish" data-id="${g.id}">Mark goal achieved</button>
                <button class="text-btn" data-act="drop" data-id="${g.id}">Let it go</button>
                <button class="text-btn" data-act="delgoal" data-id="${g.id}">Delete</button>
              </div></details>
          </div>
          ${own.length ? html`
            <div class="lv-row"><span><b>${n}</b> / ${own.length} milestones</span><span>${Math.round(pct)}%</span></div>
            ${bar(pct, 'thick')}
            <ul class="list">${own.map((s) => html`
              <li class="item ${s.done ? 'done' : ''}">
                <button class="check ${s.done ? 'on' : ''}" data-act="step" data-id="${s.id}" aria-pressed="${s.done}" aria-label="${s.done ? 'Undo' : 'Complete'}: ${s.title}">${raw(icon('check'))}</button>
                <div class="body"><p class="title">${s.title}</p>${s.done && s.done_on ? html`<p class="sub">${relDate(s.done_on)}</p>` : ''}</div>
                <span class="xp">+${XP.milestone}</span>
                <button class="icon-btn" data-act="delstep" data-id="${s.id}" aria-label="Delete ${s.title}">${raw(icon('trash'))}</button>
              </li>`)}</ul>` : html`<p class="small muted">Break it into a few milestones you can tick off.</p>`}
          <form data-form="addstep" data-id="${g.id}" class="row">
            <input name="title" maxlength="120" placeholder="Add a milestone" required aria-label="New milestone for ${g.title}" class="grow">
            <button class="btn sm">Add</button>
          </form>
          ${own.length && n === own.length ? html`<button class="btn primary" data-act="finish" data-id="${g.id}">${raw(icon('goals', 18))}All done. Mark goal achieved (+${XP.goalDone})</button>` : ''}
        </section>`;
    };

    mount(el, html`
      <header class="page-head"><div><h1>Goals</h1><p>${active.length} active · ${doneYear} achieved this year</p></div></header>

      <section class="card">
        <form data-form="add" class="form">
          <input name="title" maxlength="120" placeholder="A goal, e.g. Run a half marathon" required aria-label="New goal">
          <div class="fields">
            <label class="field">Why it matters<input name="why" maxlength="300" placeholder="Optional"></label>
            <label class="field">Target date<input type="date" name="target_date" min="${t}"></label>
          </div>
          <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Add goal</button></div>
        </form>
      </section>

      ${active.length ? active.map(card) : html`<section class="card">${empty('No active goals. Add one above, then break it into milestones.')}</section>`}

      ${finished.length ? html`
        <section class="card">
          <details ${showDone ? 'open' : ''} data-done>
            <summary>Achieved &amp; let go <span class="muted small" style="margin-left:auto;margin-right:10px">${finished.length}</span></summary>
            <ul class="list">${finished.map((g) => html`
              <li class="item ${g.status === 'dropped' ? 'done' : ''}">
                <div class="body"><p class="title">${g.status === 'done' ? html`<span class="pill solid">Achieved</span>` : html`<span class="pill">Let go</span>`}${g.title}</p>
                  ${g.done_on ? html`<p class="sub">${relDate(g.done_on)}</p>` : ''}</div>
                <button class="btn sm" data-act="reopen" data-id="${g.id}">Reopen</button>
                <button class="icon-btn" data-act="delgoal" data-id="${g.id}" aria-label="Delete ${g.title}">${raw(icon('trash'))}</button>
              </li>`)}</ul>
          </details>
        </section>` : ''}
    `);
    el.querySelector('[data-done]')?.addEventListener('toggle', (e) => { showDone = e.target.open; });

    const goal = (id) => goals.find((g) => g.id === id);
    wire(el, {
      add: async (v, form) => {
        await ctx.store.insert('goals', { title: v.title, why: v.why || null, target_date: v.target_date || null });
        form.reset();
        ctx.say('Goal added. Now add a milestone or two');
        ctx.rerender();
      },
      addstep: async (v, form) => {
        const g = goal(form.dataset.id);
        const pos = Math.max(-1, ...stepsOf(g.id).map((s) => s.position)) + 1;
        await ctx.store.insert('goal_milestones', { goal_id: g.id, title: v.title, position: pos });
        ctx.rerender();
      },
      step: async (b) => {
        const s = steps.find((x) => x.id === b.dataset.id);
        if (s.done) {
          await ctx.store.update('goal_milestones', s.id, { done: false, done_on: null });
          await ctx.revoke('milestone', s.id);
        } else {
          await ctx.store.update('goal_milestones', s.id, { done: true, done_on: t });
          await ctx.award('DEX', XP.milestone, 'milestone', s.id, s.title);
        }
        ctx.rerender();
      },
      delstep: async (b) => {
        if (!confirm('Delete this milestone? Its XP will be removed.')) return;
        await ctx.store.remove('goal_milestones', b.dataset.id);
        await ctx.revoke('milestone', b.dataset.id);
        ctx.rerender();
      },
      finish: async (b) => {
        const g = goal(b.dataset.id);
        await ctx.store.update('goals', g.id, { status: 'done', done_on: t });
        await ctx.award('DEX', XP.goalDone, 'goal', g.id, `Goal achieved: ${g.title}`);
        ctx.rerender();
      },
      drop: async (b) => {
        const g = goal(b.dataset.id);
        if (!confirm(`Let go of "${g.title}"? You can reopen it later.`)) return;
        await ctx.store.update('goals', g.id, { status: 'dropped', done_on: t });
        ctx.rerender();
      },
      reopen: async (b) => {
        const g = goal(b.dataset.id);
        await ctx.store.update('goals', g.id, { status: 'active', done_on: null });
        await ctx.revoke('goal', g.id);
        ctx.rerender();
      },
      delgoal: async (b) => {
        const g = goal(b.dataset.id);
        if (!confirm(`Delete "${g.title}" and its milestones? Their XP will be removed.`)) return;
        for (const s of stepsOf(g.id)) await ctx.store.revoke('milestone', s.id);
        await ctx.store.remove('goals', g.id);
        await ctx.revoke('goal', g.id);
        ctx.rerender();
      },
    });
  },
};
