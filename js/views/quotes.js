import { html, raw, wire, mount, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

let shownId = null;

export default {
  id: 'quotes',
  label: 'Quotes',
  async render(el, ctx) {
    const quotes = await ctx.store.list('quotes', { order: 'created_at' });
    const shown = shownId && quotes.find((x) => x.id === shownId);

    mount(el, html`
      <header class="page-head">
        <div><h1>Quotes</h1><p>Words to live by</p></div>
        <button class="btn" data-act="random" ${quotes.length ? '' : 'disabled'}>${raw(icon('shuffle', 18))}Random</button>
      </header>

      ${shown ? html`
        <section class="card">
          <blockquote class="quote big">“${shown.text}”${shown.source ? html`<cite>${shown.source}</cite>` : ''}</blockquote>
        </section>` : ''}

      <section class="card">
        <form data-form="add" class="form">
          <textarea name="text" rows="3" maxlength="1000" required placeholder="Add a quote…" aria-label="Quote"></textarea>
          <div class="row wrap">
            <input name="source" maxlength="120" placeholder="Source (optional)" aria-label="Source" class="grow" style="flex-basis:12em">
            <button class="btn primary">${raw(icon('plus', 18))}Add</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Collection</h2><span class="meta">${quotes.length}</span></div>
        ${quotes.length ? html`<ul class="list">${[...quotes].reverse().map((x) => html`
          <li class="item">
            <div class="body"><p class="title">“${x.text}”</p>${x.source ? html`<p class="sub">${x.source}</p>` : ''}</div>
            <button class="icon-btn" data-act="delete" data-id="${x.id}" aria-label="Delete quote">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('No quotes yet.')}
      </section>
    `);

    wire(el, {
      add: async (v, form) => {
        const row = await ctx.store.insert('quotes', { text: v.text, source: v.source || null });
        form.reset();
        await ctx.award('WIS', XP.quote, 'quote', row.id, 'Quote added');
        ctx.rerender();
      },
      random: () => {
        if (!quotes.length) return;
        let pick = quotes[Math.floor(Math.random() * quotes.length)];
        if (quotes.length > 1) while (pick.id === shownId) pick = quotes[Math.floor(Math.random() * quotes.length)];
        shownId = pick.id;
        ctx.rerender();
      },
      delete: async (b) => {
        if (!confirm('Delete this quote? Its XP will be removed.')) return;
        await ctx.store.remove('quotes', b.dataset.id);
        await ctx.revoke('quote', b.dataset.id);
        if (shownId === b.dataset.id) shownId = null;
        ctx.rerender();
      },
    });
  },
};
