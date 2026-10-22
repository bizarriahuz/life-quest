import { html, raw, wire, mount, today, relDate, relDateInline, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP, money, cents } from '../game.js';

const STAGES = [
  ['lead', 'Lead'], ['quoted', 'Quoted'], ['active', 'In progress'], ['done', 'Delivered'], ['paid', 'Paid'],
];
const LABEL = { ...Object.fromEntries(STAGES), lost: 'Lost' };
const ORDER = STAGES.map(([k]) => k);
const rank = (s) => ORDER.indexOf(s);
let editing = null;   // project being edited

export default {
  id: 'clients',
  label: 'Clients',
  async render(el, ctx) {
    const t = today();
    const yr = t.slice(0, 4);
    const $ = (n) => money(n, ctx.currency, { maximumFractionDigits: 0 });
    const all = await ctx.store.list('client_projects', { order: 'created_at' });
    const by = (s) => all.filter((p) => p.stage === s).sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'));
    const val = (rows) => rows.reduce((n, p) => n + (Number(p.value) || 0), 0);
    const pipeline = [...by('lead'), ...by('quoted')];
    const working = [...by('active'), ...by('done')];
    const paidYear = all.filter((p) => p.stage === 'paid' && (p.paid_on || '').startsWith(yr));
    const closed = all.filter((p) => p.stage === 'paid' || p.stage === 'lost')
      .sort((a, b) => (b.paid_on || b.updated_at || '').localeCompare(a.paid_on || a.updated_at || ''));
    const clients = [...new Set(all.map((p) => p.client))].sort();

    const row = (p) => {
      if (p.id === editing) return html`<li class="item"><form data-form="save" data-id="${p.id}" class="form grow">
        <div class="fields">
          <label class="field">Client<input name="client" maxlength="120" required value="${p.client}" list="client-names" autocomplete="off"></label>
          <label class="field">Project<input name="title" maxlength="160" required value="${p.title}"></label>
        </div>
        <div class="fields">
          <label class="field">Value (${ctx.currency})<input name="value" inputmode="decimal" value="${p.value ?? ''}" placeholder="Optional" autocomplete="off"></label>
          <label class="field">Due<input type="date" name="due_on" value="${p.due_on || ''}"></label>
        </div>
        <input name="note" maxlength="500" value="${p.note || ''}" placeholder="Note (optional)" aria-label="Note">
        <div class="row end"><button type="button" class="btn sm" data-act="cancel">Cancel</button><button class="btn primary sm">Save</button></div>
      </form></li>`;
      const next = p.stage === 'lost' ? null : ORDER[rank(p.stage) + 1];
      const late = p.due_on && p.due_on < t && rank(p.stage) < rank('done');
      return html`
        <li class="item">
          <div class="body">
            <p class="title"><span class="pill ${p.stage === 'active' ? 'solid' : ''}">${LABEL[p.stage]}</span>${p.title}</p>
            <p class="sub ${late ? 'due-late' : ''}">${p.client}${p.value ? ` · ${$(p.value)}` : ''}${p.due_on ? ` · ${late ? 'was due ' : 'due '}${relDateInline(p.due_on)}` : ''}${p.note ? ` · ${p.note}` : ''}</p>
          </div>
          ${next ? html`<button class="btn sm" data-act="advance" data-id="${p.id}">${next === 'paid' ? 'Paid' : LABEL[next]} ${raw(icon('right', 14))}</button>` : ''}
          <details class="more"><summary class="icon-btn" aria-label="More for ${p.title}">⋯</summary>
            <div class="more-menu">
              ${STAGES.filter(([k]) => k !== p.stage).map(([k, l]) => html`<button class="text-btn" data-act="stage" data-id="${p.id}" data-stage="${k}">Move to ${l}</button>`)}
              ${p.stage !== 'lost' ? html`<button class="text-btn" data-act="stage" data-id="${p.id}" data-stage="lost">Mark lost</button>` : ''}
              <button class="text-btn" data-act="edit" data-id="${p.id}">Edit</button>
              <button class="text-btn" data-act="delete" data-id="${p.id}">Delete</button>
            </div></details>
        </li>`;
    };

    mount(el, html`
      <header class="page-head"><div><h1>Clients</h1><p>${working.length} in progress · ${pipeline.length} in the pipeline</p></div></header>

      <div class="kpis">
        <div class="kpi"><b>${$(val(pipeline))}</b><span>Pipeline</span></div>
        <div class="kpi"><b>${$(val(working))}</b><span>In progress</span></div>
        <div class="kpi"><b>${$(val(paidYear))}</b><span>Paid in ${yr}</span></div>
      </div>

      <section class="card">
        <form data-form="add" class="form">
          <div class="fields">
            <label class="field">Client<input name="client" maxlength="120" required list="client-names" placeholder="Name or company" autocomplete="off"></label>
            <label class="field">Project<input name="title" maxlength="160" required placeholder="e.g. Logo refresh"></label>
          </div>
          <datalist id="client-names">${clients.map((c) => html`<option value="${c}">`)}</datalist>
          <div class="fields">
            <label class="field">Value (${ctx.currency})<input name="value" inputmode="decimal" placeholder="Optional" autocomplete="off"></label>
            <label class="field">Due<input type="date" name="due_on"></label>
            <label class="field">Stage<select name="stage">${STAGES.slice(0, 3).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
          </div>
          <input name="note" maxlength="500" placeholder="Note (optional)" aria-label="Note">
          <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Add project</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>In progress</h2><span class="meta">${$(val(working))}</span></div>
        ${working.length ? html`<ul class="list">${working.map(row)}</ul>` : empty('Nothing on the go.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>Pipeline</h2><span class="meta">${$(val(pipeline))}</span></div>
        ${pipeline.length ? html`<ul class="list">${pipeline.map(row)}</ul>` : empty('No leads or quotes out.')}
      </section>

      ${closed.length ? html`
        <section class="card">
          <details><summary>Paid &amp; lost <span class="muted small" style="margin-left:auto;margin-right:10px">${closed.length}</span></summary>
            <ul class="list">${closed.slice(0, 50).map(row)}</ul></details>
        </section>` : ''}
    `);

    const setStage = async (p, stage) => {
      const patch = { stage, updated_at: new Date().toISOString(), paid_on: stage === 'paid' ? (p.paid_on || t) : null };
      await ctx.store.update('client_projects', p.id, patch);
      const reached = (s) => rank(stage) >= rank(s) && stage !== 'lost';
      if (!reached('active')) await ctx.store.revoke('client_active', p.id);
      if (!reached('paid')) await ctx.store.revoke('client_paid', p.id);
      if (reached('paid')) {
        await ctx.award('WLT', XP.clientActive, 'client_active', p.id);
        await ctx.award('WLT', XP.clientPaid, 'client_paid', p.id, `${p.client} paid`);
        if (ctx.sections.has('finance') && Number(p.value) > 0 && p.stage !== 'paid'
          && confirm(`Add ${$(p.value)} from ${p.client} to Finance as income?`)) await addIncome(p);
      } else if (reached('active')) {
        await ctx.award('WLT', XP.clientActive, 'client_active', p.id, `${p.title} started`);
      } else {
        await ctx.revoke('client_active', '-'); // refresh totals
        ctx.say(`${p.title} · ${LABEL[stage]}`);
      }
      ctx.rerender();
    };

    const addIncome = async (p) => {
      const cats = await ctx.store.list('finance_categories', { order: 'name', asc: true });
      let cat = cats.find((c) => c.kind === 'income' && c.name.toLowerCase() === 'freelance');
      if (!cat) cat = await ctx.store.insert('finance_categories', { kind: 'income', name: 'Freelance' });
      await ctx.store.insert('transactions', { kind: 'income', amount: Number(p.value), category_id: cat.id, occurred_on: t, note: `${p.client}: ${p.title}`.slice(0, 200) });
      ctx.say(`${$(p.value)} added to Finance under Freelance`);
    };

    const proj = (id) => all.find((p) => p.id === id);
    wire(el, {
      add: async (v, form) => {
        const value = v.value ? cents(v.value.replace(',', '.')) : null;
        const stage = ['lead', 'quoted', 'active'].includes(v.stage) ? v.stage : 'lead';
        const row = await ctx.store.insert('client_projects', {
          client: v.client.replace(/\s+/g, ' '), title: v.title, value: value > 0 ? value : null,
          due_on: v.due_on || null, note: v.note || null, stage,
        });
        form.reset();
        if (stage === 'active') await ctx.award('WLT', XP.clientActive, 'client_active', row.id, `${row.title} started`);
        else ctx.say('Project added');
        ctx.rerender();
      },
      edit: (b) => { editing = b.dataset.id; ctx.rerender(); },
      cancel: () => { editing = null; ctx.rerender(); },
      save: async (v, f) => {
        const value = v.value ? cents(String(v.value).replace(',', '.')) : null;
        await ctx.store.update('client_projects', f.dataset.id, { client: v.client.replace(/\s+/g, ' '), title: v.title, value: value > 0 ? value : null,
          due_on: v.due_on || null, note: v.note || null, updated_at: new Date().toISOString() });
        editing = null; ctx.say('Saved'); ctx.rerender();
      },
      advance: (b) => { const p = proj(b.dataset.id); return setStage(p, ORDER[rank(p.stage) + 1]); },
      stage: (b) => setStage(proj(b.dataset.id), b.dataset.stage),
      delete: async (b) => {
        const p = proj(b.dataset.id);
        if (!confirm(`Delete "${p.title}"? Its XP will be removed. Finance entries stay.`)) return;
        await ctx.store.remove('client_projects', p.id);
        await ctx.store.revoke('client_active', p.id);
        await ctx.revoke('client_paid', p.id);
        ctx.rerender();
      },
    });
  },
};
