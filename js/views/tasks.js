import { html, raw, wire, mount, today, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { REPEATS, REPEAT_SHORT, toggleTask } from '../tasklogic.js';

const KIND = { side: 'Side', main: 'Main', job: 'Job', daily: 'Daily' };
let editing = null;     // id of the task being edited
const byDue = (a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999');
const soonest = (a, b) => byDue(a, b) || a.created_at.localeCompare(b.created_at);

// One task row. Shared with Goals (linked tasks) so they look the same.
export function taskItem(q, isDone, { goalName = null, canDelete = true, canEdit = false } = {}) {
  const t = today();
  const subs = [];
  if (q.due_on && !isDone) subs.push(html`<span class="${q.due_on < t ? 'due-late' : ''}">${q.due_on < t ? 'Overdue · ' : 'Due '}${relDate(q.due_on)}</span>`);
  if (q.repeat) subs.push(html`<span class="rep">${raw(icon('repeat', 13))}${REPEAT_SHORT[q.repeat]}</span>`);
  if (goalName) subs.push(html`<span class="goal-tag">${raw(icon('goals', 13))}${goalName}</span>`);
  const note = q.note ? html`<p class="sub task-note" data-act="note" title="Tap to show all">${q.note}</p>` : '';
  return html`
    <li class="item ${isDone ? 'done' : ''}">
      <button class="check ${isDone ? 'on' : ''}" data-act="toggle" data-id="${q.id}" aria-pressed="${isDone}"
        aria-label="${isDone ? 'Mark not done' : 'Complete'}: ${q.title}">${raw(icon('check'))}</button>
      <div class="body">
        <p class="title">${q.kind === 'main' ? html`<span class="pill solid">Main</span>` : ''}${q.title}</p>
        ${subs.length ? html`<p class="sub task-sub">${subs}</p>` : ''}
        ${note}
      </div>
      <span class="xp">+${XP.task[q.kind]}</span>
      ${canEdit && !(isDone && q.kind !== 'daily')
        ? html`<button class="icon-btn" data-act="edit" data-id="${q.id}" aria-label="Edit ${q.title}">${raw(icon('edit'))}</button>` : ''}
      ${canDelete && (!isDone || q.kind === 'daily')
        ? html`<button class="icon-btn" data-act="delete" data-id="${q.id}" aria-label="Delete ${q.title}">${raw(icon('trash'))}</button>` : ''}
    </li>`;
}

export default {
  id: 'tasks',
  label: 'Tasks',
  async render(el, ctx) {
    const t = today();
    const [all, goals] = await Promise.all([
      ctx.store.list('tasks', { order: 'created_at', asc: true }),
      ctx.sections.has('goals') ? ctx.store.list('goals', { match: { status: 'active' } }) : Promise.resolve([]),
    ]);
    const goalName = Object.fromEntries(goals.map((g) => [g.id, g.title]));
    const daily = all.filter((q) => q.kind === 'daily');
    const jobs = all.filter((q) => q.kind === 'job' && !q.done).sort(soonest);       // soonest due first
    // To do: soonest due date on top. No due date goes below, in the order added (earliest first).
    const active = all.filter((q) => (q.kind === 'main' || q.kind === 'side') && !q.done).sort(soonest);
    const done = all.filter((q) => q.kind !== 'daily' && q.done)
      .sort((a, b) => (b.done_on || '').localeCompare(a.done_on || '')).slice(0, 25);
    const dailyDone = daily.filter((q) => q.done_on === t).length;
    const goalOpts = (sel) => html`${goals.map((g) => html`<option value="${g.id}" ${sel === g.id ? 'selected' : ''}>${g.title}</option>`)}`;
    const editForm = (q) => html`
      <li class="item editing">
        <form data-form="saveedit" data-id="${q.id}" class="form grow">
          <input name="title" value="${q.title}" maxlength="200" required aria-label="Task name">
          <textarea name="note" rows="2" maxlength="1000" placeholder="Note (optional)" aria-label="Note">${q.note || ''}</textarea>
          <div class="fields">
            <label class="field">Type<select name="kind" data-change="editkind">
              ${Object.entries(KIND).map(([k, v]) => html`<option value="${k}" ${q.kind === k ? 'selected' : ''}>${v}</option>`)}
            </select></label>
            <label class="field ed-notdaily">Due<input type="date" name="due_on" value="${q.due_on || ''}"></label>
            <label class="field ed-notdaily">Repeats<select name="repeat">
              <option value="">Doesn’t repeat</option>
              ${Object.entries(REPEATS).map(([k, v]) => html`<option value="${k}" ${q.repeat === k ? 'selected' : ''}>${v}</option>`)}
            </select></label>
            ${goals.length || q.goal_id ? html`<label class="field">Goal<select name="goal_id">
              <option value="">No goal</option>${goalOpts(q.goal_id)}
            </select></label>` : ''}
          </div>
          <div class="row end">
            <button type="button" class="btn sm" data-act="canceledit">Cancel</button>
            <button class="btn primary sm">Save</button>
          </div>
        </form>
      </li>`;
    const item = (q, isDone) => (q.id === editing && !(isDone && q.kind !== 'daily')
      ? editForm(q)
      : taskItem(q, isDone, { goalName: goalName[q.goal_id] || null, canEdit: true }));

    mount(el, html`
      <header class="page-head"><div><h1>Tasks</h1><p>${jobs.length} job${jobs.length === 1 ? '' : 's'} · ${active.length} to do · ${dailyDone}/${daily.length} dailies done</p></div></header>

      <section class="card">
        <form data-form="add" class="form">
          <input name="title" placeholder="Add a task…" maxlength="200" required aria-label="New task">
          <div class="row wrap spread">
            <div class="seg" role="radiogroup" aria-label="Type">
              ${Object.keys(KIND).map((k, i) => html`<label><input type="radio" name="kind" value="${k}" data-change="kind" ${i === 0 ? 'checked' : ''}><span>${KIND[k]}</span></label>`)}
            </div>
            <div class="row">
              <input type="date" name="due_on" aria-label="Due date" style="width:auto">
              <button class="btn primary">${raw(icon('plus', 18))}Add</button>
            </div>
          </div>
          <div class="fields task-extra">
            <label class="field">Repeats<select name="repeat">
              <option value="">Doesn’t repeat</option>
              ${Object.entries(REPEATS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}
            </select></label>
            ${goals.length ? html`<label class="field">For a goal<select name="goal_id">
              <option value="">No goal</option>
              ${goals.map((g) => html`<option value="${g.id}">${g.title}</option>`)}
            </select></label>` : ''}
          </div>
          <details class="add-note"><summary class="small muted">Add a note</summary>
            <textarea name="note" rows="2" maxlength="1000" placeholder="Details, a link, a phone number…" aria-label="Note"></textarea>
          </details>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Daily</h2><span class="meta">Resets every day</span></div>
        ${daily.length ? html`<ul class="list">${daily.map((q) => item(q, q.done_on === t))}</ul>`
          : empty('Add habits you want to repeat every day.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>Jobs</h2><span class="meta">${jobs.length}</span></div>
        ${jobs.length ? html`<ul class="list">${jobs.map((q) => item(q, false))}</ul>`
          : empty('No open jobs.')}
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

    // Daily tasks don't have due dates or repeats: hide those while Daily is picked.
    const form = el.querySelector('form[data-form=add]');
    const syncKind = () => {
      const daily = form.querySelector('input[name=kind]:checked')?.value === 'daily';
      form.querySelector('input[name=due_on]').hidden = daily;
      form.querySelector('.task-extra label:first-child').hidden = daily;
    };

    // Edit form: Daily has no due date or repeat.
    const syncEdit = () => {
      const f = el.querySelector('form[data-form=saveedit]');
      if (!f) return;
      const daily = f.elements.kind.value === 'daily';
      f.querySelectorAll('.ed-notdaily').forEach((x) => { x.hidden = daily; });
    };
    syncEdit();
    const ef = el.querySelector('form[data-form=saveedit]');
    if (ef) {
      requestAnimationFrame(() => { if (ef.isConnected) { ef.elements.title.focus(); ef.scrollIntoView({ block: 'nearest' }); } });
      ef.addEventListener('keydown', (e) => { if (e.key === 'Escape') { editing = null; ctx.rerender(); } });
    }

    wire(el, {
      kind: syncKind,
      note: (p) => p.classList.toggle('open'),
      editkind: syncEdit,
      edit: (btn) => { editing = btn.dataset.id; ctx.rerender(); },
      canceledit: () => { editing = null; ctx.rerender(); },
      saveedit: async (v, f) => {
        const q = all.find((x) => x.id === f.dataset.id);
        if (!q || !v.title) return;
        const kind = v.kind || q.kind;
        const daily = kind === 'daily';
        const repeat = daily ? null : v.repeat || null;
        const patch = {
          title: v.title.slice(0, 200), kind,
          due_on: daily ? null : v.due_on || (repeat ? t : null),
          repeat, goal_id: v.goal_id || null, note: (v.note || '').slice(0, 1000) || null,
        };
        if (daily !== (q.kind === 'daily')) Object.assign(patch, { done: false, done_on: null });   // switching to/from Daily starts fresh
        await ctx.store.update('tasks', q.id, patch);
        editing = null;
        ctx.say('Task updated');
        ctx.rerender();
      },
      add: async (v, f) => {
        if (!v.title) return;
        const kind = v.kind || 'side';
        const repeat = kind === 'daily' ? null : v.repeat || null;
        const due = kind === 'daily' ? null : v.due_on || (repeat ? t : null);   // a repeat needs a start date
        await ctx.store.insert('tasks', { title: v.title, kind, due_on: due, repeat, goal_id: v.goal_id || null, note: v.note || null });
        f.reset(); syncKind(); f.querySelector('.add-note').open = false;
        ctx.say(repeat ? `Task added · repeats ${REPEAT_SHORT[repeat]}` : 'Task added');
        ctx.rerender();
      },
      toggle: async (btn) => {
        const q = all.find((x) => x.id === btn.dataset.id);
        if (!q) return;
        await toggleTask(ctx, q);
        ctx.rerender();
      },
      delete: async (btn) => {
        const q = all.find((x) => x.id === btn.dataset.id);
        if (!q || !confirm(q.repeat ? `Delete "${q.title}"? It will stop repeating.` : `Delete "${q.title}"?`)) return;
        await ctx.store.remove('tasks', q.id);
        await ctx.revoke('task', q.kind === 'daily' ? `${q.id}:${t}` : q.id);
        ctx.rerender();
      },
    });
  },
};
