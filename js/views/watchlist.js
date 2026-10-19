import { html, raw, wire, mount, today, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

const KIND = { film: 'Film', series: 'Series', anime: 'Anime', documentary: 'Documentary', other: 'Other' };
let filter = 'all';

const stars = (w) => html`<span class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => html`
  <button class="star ${w.rating >= n ? 'on' : ''}" data-act="rate" data-id="${w.id}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`)}</span>`;

export default {
  id: 'watchlist',
  label: 'Watchlist',
  async render(el, ctx) {
    const t = today();
    const all = await ctx.store.list('watchlist', { order: 'created_at', asc: true });
    const kinds = [...new Set(all.map((w) => w.kind))];
    if (filter !== 'all' && !kinds.includes(filter)) filter = 'all';
    const shown = all.filter((w) => filter === 'all' || w.kind === filter);
    const watching = shown.filter((w) => w.status === 'watching');
    const queued = shown.filter((w) => w.status === 'queued');
    const done = shown.filter((w) => w.status === 'done').sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
    const yearDone = all.filter((w) => w.status === 'done' && (w.done_on || '').startsWith(t.slice(0, 4))).length;

    const row = (w) => html`
      <li class="item ${w.status === 'done' ? '' : ''}">
        <div class="body"><p class="title"><span class="pill">${KIND[w.kind]}</span>${w.title}</p>
          ${w.note || w.done_on ? html`<p class="sub">${w.done_on ? `Finished ${relDate(w.done_on).toLowerCase()}` : ''}${w.done_on && w.note ? ' · ' : ''}${w.note || ''}</p>` : ''}</div>
        ${w.status === 'queued' ? html`<button class="btn sm" data-act="start" data-id="${w.id}">${raw(icon('play', 14))}Start</button>` : ''}
        ${w.status !== 'done' ? html`<button class="btn sm ${w.status === 'watching' ? 'primary' : ''}" data-act="finish" data-id="${w.id}">${raw(icon('check', 14))}Watched</button>` : stars(w)}
        <details class="more"><summary class="icon-btn" aria-label="More for ${w.title}">⋯</summary>
          <div class="more-menu">
            ${w.status !== 'queued' ? html`<button class="text-btn" data-act="requeue" data-id="${w.id}">Back to the list</button>` : ''}
            <button class="text-btn" data-act="delete" data-id="${w.id}">Delete</button>
          </div></details>
      </li>`;

    mount(el, html`
      <header class="page-head"><div><h1>Watchlist</h1><p>${all.filter((w) => w.status === 'queued').length} to watch · ${yearDone} watched this year</p></div></header>

      <section class="card">
        <form data-form="add" class="form">
          <input name="title" maxlength="200" placeholder="Add a film or series…" required aria-label="Title">
          <div class="row wrap spread">
            <div class="seg" role="radiogroup" aria-label="Type">
              ${Object.entries(KIND).map(([k, l], i) => html`<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`)}
            </div>
            <button class="btn primary">${raw(icon('plus', 18))}Add</button>
          </div>
          <input name="note" maxlength="200" placeholder="Where to watch or who recommended it (optional)" aria-label="Note">
        </form>
      </section>

      ${kinds.length > 1 ? html`
        <div class="seg filter" role="radiogroup" aria-label="Show">
          ${['all', ...kinds].map((k) => html`<label><input type="radio" name="wf" value="${k}" data-change="filter" ${filter === k ? 'checked' : ''}><span>${k === 'all' ? 'All' : KIND[k]}</span></label>`)}
        </div>` : ''}

      ${watching.length ? html`<section class="card">
        <div class="card-head"><h2>Watching</h2><span class="meta">${watching.length}</span></div>
        <ul class="list">${watching.map(row)}</ul></section>` : ''}

      <section class="card">
        <div class="card-head"><h2>Up next</h2><span class="meta">${queued.length}</span></div>
        ${queued.length ? html`<ul class="list">${queued.map(row)}</ul>` : empty('Nothing queued.')}
      </section>

      ${done.length ? html`<section class="card">
        <details><summary>Watched <span class="muted small" style="margin-left:auto;margin-right:10px">${done.length}</span></summary>
          <ul class="list">${done.slice(0, 100).map(row)}</ul></details></section>` : ''}
    `);

    const item = (id) => all.find((w) => w.id === id);
    wire(el, {
      add: async (v, form) => {
        await ctx.store.insert('watchlist', { title: v.title, kind: KIND[v.kind] ? v.kind : 'film', note: v.note || null });
        form.elements.title.value = ''; form.elements.note.value = '';
        ctx.say(`${v.title} added`);
        ctx.rerender();
      },
      filter: (r) => { filter = r.value; ctx.rerender(); },
      start: async (b) => { await ctx.store.update('watchlist', b.dataset.id, { status: 'watching' }); ctx.rerender(); },
      finish: async (b) => {
        const w = item(b.dataset.id);
        await ctx.store.update('watchlist', w.id, { status: 'done', done_on: t });
        await ctx.award('CHA', XP.watched, 'watched', w.id, `Watched ${w.title}`);
        ctx.rerender();
      },
      requeue: async (b) => {
        await ctx.store.update('watchlist', b.dataset.id, { status: 'queued', done_on: null, rating: null });
        await ctx.revoke('watched', b.dataset.id);
        ctx.rerender();
      },
      rate: async (b) => {
        const w = item(b.dataset.id);
        const n = +b.dataset.n;
        await ctx.store.update('watchlist', w.id, { rating: w.rating === n ? null : n });
        ctx.rerender();
      },
      delete: async (b) => {
        const w = item(b.dataset.id);
        if (!confirm(`Delete "${w.title}"?`)) return;
        await ctx.store.remove('watchlist', w.id);
        await ctx.revoke('watched', w.id);
        ctx.rerender();
      },
    });
  },
};
