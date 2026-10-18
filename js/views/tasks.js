import { html, raw, wire, mount, today, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

const KIND = { main: 'Main', side: 'Side', daily: 'Daily' };

export default {
  id: 'tasks',
  label: 'Tasks',
  async render(el, ctx) {
    const t = today();
    const all = await ctx.store.list('tasks', { order: 'created_at' });
    const daily = all.filter((q) => q.kind === 'daily');
    const active = all.filter((q) => q.kind !== 'daily' && !q.done).sort((a, b) =>
      (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1) ||
      (a.due_on || '9999').localeCompare(b.due_on || '9999'));
    const done = all.filter((q) => q.kind !== 'daily' && q.done)
      .sort((a, b) => (b.done_on || '').localeCompare(a.done_on || '')).slice(0, 25);
    const dailyDone = daily.filter((q) => q.done_on === t).length;

    const item = (q, isDone) => html`
      <li class="item ${isDone ? 'done' : ''}">
        <button class="check ${isDone ? 'on' : ''}" data-act="toggle" data-id="${q.id}" aria-pressed="${isDone}"
          aria-label="${isDone ? 'Mark not done' : 'Complete'}: ${q.title}">${raw(icon('check'))}</button>
        <div class="body">
          <p class="title">${q.kind === 'main' ? html`<span class="pill solid">Main</span>` : ''}${q.title}</p>
          ${q.due_on && !isDone ? html`<p class="sub ${q.due_on < t ? 'due-late' : ''}">${q.due_on < t ? 'Overdue · ' : 'Due '}${relDate(q.due_on)}</p>` : ''}
        </div>
        <span class="xp">+${XP.task[q.kind]}</span>
        ${!isDone || q.kind === 'daily'
          ? html`<button class="icon-btn" data-act="delete" data-id="${q.id}" aria-label="Delete ${q.title}">${raw(icon('trash'))}</button>` : ''}
      </li>`;

    mount(el, html`
      <header class="page-head"><div><h1>Tasks</h1><p>${active.length} open · ${dailyDone}/${daily.length} dailies done</p></div></header>

      <section class="card">
        <form data-form="add" class="form">
          <input name="title" placeholder="Add a task…" maxlength="200" required aria-label="New task">
          <div class="row wrap spread">
            <div class="seg" role="radiogroup" aria-label="Type">
              ${['side', 'main', 'daily'].map((k, i) => html`<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}><span>${KIND[k]}</span></label>`)}
            </div>
            <div class="row">
              <input type="date" name="due_on" aria-label="Due date" style="width:auto">
              <button class="btn primary">${raw(icon('plus', 18))}Add</button>
            </div>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Daily</h2><span class="meta">Resets every day</span></div>
        ${daily.length ? html`<ul class="list">${daily.map((q) => item(q, q.done_on === t))}</ul>`
          : empty('Add habits you want to repeat every day.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>To do</h2><span class="meta">${active.length}</span></div>
        ${active.length ? html`<ul class="list">${active.map((q) => item(q, false))}</ul>`
          : empty('All clear.')}
      </section>

      ${done.length ? html`
        <section class="card">
          <details>
            <summary>Completed <span class="muted small" style="margin-left:auto;margin-right:10px">${done.length}</span></summary>
            <ul class="list">${done.map((q) => item(q, true))}</ul>
          </details>
        </section>` : ''}
    `);

    wire(el, {
      add: async (v, form) => {
        if (!v.title) return;
        await ctx.store.insert('tasks', { title: v.title, kind: v.kind || 'side', due_on: v.kind === 'daily' ? null : v.due_on || null });
        form.reset();
        ctx.say('Task added');
        ctx.rerender();
      },
      toggle: async (btn) => {
        const q = all.find((x) => x.id === btn.dataset.id);
        if (!q) return;
        if (q.kind === 'daily') {
          const sid = `${q.id}:${t}`;
          if (q.done_on === t) {
            await ctx.store.update('tasks', q.id, { done_on: null });
            await ctx.revoke('task', sid);
          } else {
            await ctx.store.update('tasks', q.id, { done_on: t });
            await ctx.award('DEX', XP.task.daily, 'task', sid, q.title);
          }
        } else if (q.done) {
          await ctx.store.update('tasks', q.id, { done: false, done_on: null });
          await ctx.revoke('task', q.id);
        } else {
          await ctx.store.update('tasks', q.id, { done: true, done_on: t });
          await ctx.award('DEX', XP.task[q.kind], 'task', q.id, q.title);
        }
        ctx.rerender();
      },
      delete: async (btn) => {
        const q = all.find((x) => x.id === btn.dataset.id);
        if (!q || !confirm(`Delete "${q.title}"?`)) return;
        await ctx.store.remove('tasks', q.id);
        await ctx.revoke('task', q.kind === 'daily' ? `${q.id}:${t}` : q.id);
        ctx.rerender();
      },
    });
  },
};
