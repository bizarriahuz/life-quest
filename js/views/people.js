import { html, raw, wire, mount, today, addDays, relDate, relDateInline, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

const HOW = { call: 'Call', visit: 'Visit', message: 'Message', other: 'Other' };
const EVERY = [[7, 'Every week'], [14, 'Every 2 weeks'], [30, 'Every month'], [60, 'Every 2 months'], [90, 'Every 3 months'], [180, 'Twice a year'], [365, 'Once a year']];
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00`) - new Date(`${a}T00:00`)) / 864e5);
const everyLabel = (n) => (EVERY.find(([d]) => d === n)?.[1] || `Every ${n} days`).toLowerCase();

export default {
  id: 'people',
  label: 'People',
  async render(el, ctx) {
    const t = today();
    const [people, logs] = await Promise.all([
      ctx.store.list('contacts', { order: 'name', asc: true }),
      ctx.store.list('contact_logs', { order: 'contacted_on' }),
    ]);
    logs.sort((a, b) => b.contacted_on.localeCompare(a.contacted_on) || b.created_at.localeCompare(a.created_at));
    const lastOf = (id) => logs.find((l) => l.contact_id === id);
    const rows = people.map((p) => {
      const last = lastOf(p.id);
      const due = last ? addDays(last.contacted_on, p.every_days) : t;
      return { p, last, due, left: daysBetween(t, due) };
    }).sort((a, b) => a.left - b.left || a.p.name.localeCompare(b.p.name));
    const overdue = rows.filter((r) => r.left <= 0);
    const later = rows.filter((r) => r.left > 0);
    const nameOf = Object.fromEntries(people.map((p) => [p.id, p.name]));
    const month = logs.filter((l) => l.contacted_on > addDays(t, -30)).length;

    const row = ({ p, last, left }) => html`
      <li class="item person">
        <div class="body">
          <p class="title">${p.name}${p.relation ? html` <span class="muted">· ${p.relation}</span>` : ''}</p>
          <p class="sub ${left < 0 ? 'due-late' : ''}">${last ? `${HOW[last.how]} ${relDateInline(last.contacted_on)}` : 'Not logged yet'} · ${left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : left === 0 ? 'due today' : `in ${left} day${left === 1 ? '' : 's'}`}</p>
        </div>
        <div class="row quick">
          ${['message', 'call', 'visit'].map((h) => html`<button class="btn sm" data-act="log" data-id="${p.id}" data-how="${h}" aria-label="Log a ${h} with ${p.name}">${HOW[h]}</button>`)}
        </div>
        <details class="more"><summary class="icon-btn" aria-label="More for ${p.name}">⋯</summary>
          <div class="more-menu">
            ${EVERY.filter(([d]) => d !== p.every_days).map(([d, l]) => html`<button class="text-btn" data-act="every" data-id="${p.id}" data-days="${d}">${l}</button>`)}
            <button class="text-btn" data-act="delperson" data-id="${p.id}">Remove ${p.name}</button>
          </div></details>
      </li>`;

    mount(el, html`
      <header class="page-head"><div><h1>People</h1><p>${overdue.length ? `${overdue.length} to catch up with` : people.length ? 'All caught up' : 'Stay in touch with the people who matter'} · ${month} catch-up${month === 1 ? '' : 's'} this month</p></div></header>

      <section class="card">
        <div class="card-head"><h2>Catch up</h2><span class="meta">${overdue.length}</span></div>
        ${overdue.length ? html`<ul class="list">${overdue.map(row)}</ul>` : empty(people.length ? 'Nobody’s overdue. Nice.' : 'Add someone below.')}
      </section>

      ${later.length ? html`
        <section class="card">
          <div class="card-head"><h2>Coming up</h2><span class="meta">${later.length}</span></div>
          <ul class="list">${later.map(row)}</ul>
        </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>Add someone</h2></div>
        <form data-form="add" class="form">
          <div class="fields">
            <label class="field">Name<input name="name" maxlength="80" required placeholder="e.g. Mak"></label>
            <label class="field">Who<input name="relation" maxlength="60" placeholder="Family, friend, mentor…"></label>
            <label class="field">Keep in touch<select name="every_days">${EVERY.map(([d, l]) => html`<option value="${d}" ${d === 30 ? 'selected' : ''}>${l}</option>`)}</select></label>
          </div>
          <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Add</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Recent</h2></div>
        ${logs.length ? html`<ul class="list">${logs.slice(0, 20).map((l) => html`
          <li class="item">
            <div class="body"><p class="title">${HOW[l.how]} · ${nameOf[l.contact_id] || 'Someone'}</p><p class="sub">${relDate(l.contacted_on)}${l.note ? ` · ${l.note}` : ''}</p></div>
            <button class="icon-btn" data-act="dellog" data-id="${l.id}" aria-label="Delete">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('Tap Message, Call or Visit after you catch up with someone.')}
      </section>
    `);

    const xpId = (contactId, day) => `${contactId}:${day}`;
    wire(el, {
      add: async (v, form) => {
        const every = EVERY.some(([d]) => d === +v.every_days) ? +v.every_days : 30;
        await ctx.store.insert('contacts', { name: v.name.replace(/\s+/g, ' '), relation: v.relation || null, every_days: every });
        form.reset();
        ctx.say(`${v.name} added · ${everyLabel(every)}`);
        ctx.rerender();
      },
      log: async (b) => {
        const p = people.find((x) => x.id === b.dataset.id);
        const how = HOW[b.dataset.how] ? b.dataset.how : 'other';
        await ctx.store.insert('contact_logs', { contact_id: p.id, how, contacted_on: t });
        await ctx.award('CON', XP.contact, 'contact', xpId(p.id, t), `${HOW[how]} with ${p.name}`);
        ctx.rerender();
      },
      every: async (b) => {
        await ctx.store.update('contacts', b.dataset.id, { every_days: +b.dataset.days });
        ctx.say(everyLabel(+b.dataset.days).replace(/^./, (c) => c.toUpperCase()));
        ctx.rerender();
      },
      dellog: async (b) => {
        const l = logs.find((x) => x.id === b.dataset.id);
        if (!confirm('Delete this catch-up?')) return;
        await ctx.store.remove('contact_logs', l.id);
        if (!logs.some((x) => x.id !== l.id && x.contact_id === l.contact_id && x.contacted_on === l.contacted_on)) await ctx.revoke('contact', xpId(l.contact_id, l.contacted_on));
        ctx.rerender();
      },
      delperson: async (b) => {
        const p = people.find((x) => x.id === b.dataset.id);
        const own = logs.filter((l) => l.contact_id === p.id);
        if (!confirm(`Remove ${p.name} and ${own.length} catch-up(s)? Their XP will be removed.`)) return;
        for (const d of new Set(own.map((l) => l.contacted_on))) await ctx.store.revoke('contact', xpId(p.id, d));
        await ctx.store.remove('contacts', p.id);
        await ctx.revoke('contact', '-');
        ctx.rerender();
      },
    });
  },
};
