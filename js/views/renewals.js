import { html, raw, wire, mount, today, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';

// Things that expire: passport, insurance, warranties, road tax. Each gets a heads-up some days before.
export const daysUntil = (from, to) => Math.round((new Date(`${to}T00:00`) - new Date(`${from}T00:00`)) / 864e5);
export const dueSoon = (r, t) => daysUntil(t, r.expires_on) <= r.remind_days;
const WHEN = [[7, '1 week before'], [14, '2 weeks before'], [30, '1 month before'], [60, '2 months before'], [90, '3 months before'], [180, '6 months before']];
const EXAMPLES = ['Passport', 'Car insurance', 'Road tax', 'Laptop warranty', 'Driving licence', 'Home insurance'];
let editing = null;

export const whenText = (n) => (n < 0 ? `expired ${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'expires today' : n === 1 ? 'expires tomorrow'
  : n < 60 ? `in ${n} days` : n < 730 ? `in ${Math.round(n / 30.4)} months` : `in ${Math.round(n / 365)} years`);

export default {
  id: 'renewals',
  label: 'Renewals',
  async render(el, ctx) {
    const t = today();
    const all = (await ctx.store.list('renewals', {})).sort((a, b) => a.expires_on.localeCompare(b.expires_on));
    const soon = all.filter((r) => dueSoon(r, t));
    const later = all.filter((r) => !dueSoon(r, t));
    const form = (r) => html`
      <form data-form="${r ? 'edit' : 'add'}" class="form" ${r ? html`data-id="${r.id}"` : ''}>
        <div class="row wrap" style="gap:8px">
          <input name="title" maxlength="80" required placeholder="e.g. Passport" aria-label="What expires" value="${r?.title || ''}" class="grow" list="rn-ex">
          <label class="field" style="min-width:150px">Expires<input type="date" name="expires_on" required value="${r?.expires_on || ''}"></label>
          <label class="field">Remind me<select name="remind_days">${WHEN.map(([d, l]) => html`<option value="${d}" ${(r?.remind_days || 30) === d ? 'selected' : ''}>${l}</option>`)}</select></label>
        </div>
        <input name="note" maxlength="200" placeholder="Note, like a policy number reminder (optional)" aria-label="Note" value="${r?.note || ''}">
        <div class="row end">${r ? html`<button type="button" class="btn" data-act="cancel">Cancel</button>` : ''}<button class="btn primary">${raw(icon(r ? 'check' : 'plus', 18))}${r ? 'Save' : 'Add'}</button></div>
      </form>`;
    const row = (r) => {
      if (r.id === editing) return html`<li class="item">${form(r)}</li>`;
      const n = daysUntil(t, r.expires_on);
      return html`<li class="item">
        <div class="body"><p class="title">${r.title}</p>
          <p class="sub ${n < 0 ? 'due-late' : ''}">${fmtDate(r.expires_on, { day: 'numeric', month: 'short', year: 'numeric' })} · ${whenText(n)}${r.note ? ` · ${r.note}` : ''}</p></div>
        <details class="more"><summary class="icon-btn" aria-label="More for ${r.title}">⋯</summary>
          <div class="more-menu">
            <button class="text-btn" data-act="renewed" data-id="${r.id}">Renewed: push it a year</button>
            <button class="text-btn" data-act="edit-open" data-id="${r.id}">Edit</button>
            <button class="text-btn" data-act="delete" data-id="${r.id}">Delete</button>
          </div></details>
      </li>`;
    };

    mount(el, html`
      <header class="page-head"><div><h1>Renewals</h1><p>${soon.length ? `${soon.length} coming up` : all.length ? 'Nothing due soon' : 'Know before things expire'}</p></div></header>
      <datalist id="rn-ex">${EXAMPLES.map((x) => html`<option value="${x}"></option>`)}</datalist>
      ${soon.length ? html`<section class="card"><div class="card-head"><h2>Coming up</h2></div><ul class="list">${soon.map(row)}</ul></section>` : ''}
      <section class="card">
        <div class="card-head"><h2>${soon.length ? 'Later' : 'Everything'}</h2><span class="meta">${later.length}</span></div>
        ${later.length ? html`<ul class="list">${later.map(row)}</ul>` : empty(all.length ? 'Nothing else on the list.' : 'Add your passport, insurance or a warranty. You’ll get a heads-up on Home before it runs out.')}
      </section>
      <section class="card"><div class="card-head"><h2>Add one</h2></div>${form(null)}</section>
    `);

    const val = (v) => ({ title: v.title.trim(), expires_on: v.expires_on, remind_days: Number(v.remind_days) || 30, note: v.note?.trim() || null });
    wire(el, {
      add: async (v) => { await ctx.store.insert('renewals', val(v)); ctx.say(`Added ${v.title.trim()}`); ctx.rerender(); },
      edit: async (v, f) => { await ctx.store.update('renewals', f.dataset.id, val(v)); editing = null; ctx.rerender(); },
      'edit-open': (b) => { editing = b.dataset.id; ctx.rerender(); },
      cancel: () => { editing = null; ctx.rerender(); },
      renewed: async (b) => {
        const r = all.find((x) => x.id === b.dataset.id);
        const [y, m, d] = r.expires_on.split('-').map(Number);
        const next = `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, new Date(y + 1, m, 0).getDate())).padStart(2, '0')}`;
        await ctx.store.update('renewals', r.id, { expires_on: next });
        ctx.say(`${r.title} now expires ${fmtDate(next, { day: 'numeric', month: 'short', year: 'numeric' })}`);
        ctx.rerender();
      },
      delete: async (b) => {
        const r = all.find((x) => x.id === b.dataset.id);
        if (!confirm(`Delete ${r.title}?`)) return;
        await ctx.store.remove('renewals', r.id); ctx.rerender();
      },
    });
  },
};

