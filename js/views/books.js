import { html, raw, wire, mount, today, fmtDate, bar, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { cleanIsbn, lookupIsbn } from '../isbn.js';

const stars = (b) => html`<span class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => html`
  <button class="star ${b.rating >= n ? 'on' : ''}" data-act="rate" data-id="${b.id}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`)}</span>`;
const cover = (b, cls = '') => (b.cover_url ? html`<img class="cover ${cls}" src="${b.cover_url}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '');
const by = (b) => (b.author ? html` <span class="muted">· ${b.author}</span>` : '');

function hideBrokenCovers(root) {
  root.querySelectorAll('img.cover').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
}

export default {
  id: 'books',
  label: 'Books',
  async render(el, ctx) {
    const t = today();
    const books = await ctx.store.list('books', { order: 'created_at' });
    const reading = books.filter((b) => b.status === 'reading');
    const queued = books.filter((b) => b.status === 'queued');
    const finished = books.filter((b) => b.status === 'finished')
      .sort((a, b) => (b.finished_on || '').localeCompare(a.finished_on || ''));
    const thisYear = finished.filter((b) => (b.finished_on || '').startsWith(t.slice(0, 4))).length;

    mount(el, html`
      <header class="page-head"><div><h1>Books</h1><p>${thisYear} finished in ${t.slice(0, 4)}</p></div></header>

      <section class="card">
        <div class="card-head"><h2>Add a book</h2></div>
        <form data-form="add" class="form">
          <div class="row">
            <input name="isbn" class="grow" placeholder="ISBN (fills in the rest)" inputmode="numeric" autocomplete="off" aria-label="ISBN">
            <button type="button" class="btn" data-act="lookup">Look up</button>
          </div>
          <div class="isbn-result" id="isbn-result" aria-live="polite"></div>
          <input type="hidden" name="cover_url">
          <div class="fields">
            <label class="field" style="grid-column:1/-1">Title<input name="title" maxlength="200" required></label>
            <label class="field">Author<input name="author" maxlength="120"></label>
            <label class="field">Pages<input type="number" name="pages_total" min="1" inputmode="numeric"></label>
          </div>
          <div class="row wrap spread">
            <div class="seg" role="radiogroup" aria-label="Shelf">
              <label><input type="radio" name="status" value="reading" checked><span>Reading now</span></label>
              <label><input type="radio" name="status" value="queued"><span>Want to read</span></label>
            </div>
            <button class="btn primary">${raw(icon('plus', 18))}Add</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Reading</h2><span class="meta">${reading.length}</span></div>
        ${reading.length ? html`<div>${reading.map((b) => {
          const pct = b.pages_total ? (b.pages_read / b.pages_total) * 100 : 0;
          return html`
            <div class="book">
              <div class="row" style="align-items:flex-start;gap:14px">${cover(b)}<div class="grow">
              <p class="book-title">${b.title}${by(b)}</p>
              ${b.pages_total ? html`${bar(pct, 'thick')}<p class="small muted">Page ${b.pages_read} of ${b.pages_total} · ${Math.floor(pct)}%</p>`
                : html`<p class="small muted">Page ${b.pages_read}</p>`}
              </div></div>
              <form data-form="pages" data-id="${b.id}" class="row wrap">
                <input type="number" name="page" min="0" ${b.pages_total ? html`max="${b.pages_total}"` : ''} inputmode="numeric" required placeholder="Now on page…" aria-label="Current page" style="width:160px">
                <button class="btn sm">Update</button>
                <span class="grow"></span>
                <button type="button" class="btn sm primary" data-act="finish" data-id="${b.id}">Finish</button>
                <button type="button" class="text-btn" data-act="shelve" data-id="${b.id}">Pause</button>
                <button type="button" class="icon-btn" data-act="delete" data-id="${b.id}" aria-label="Delete ${b.title}">${raw(icon('trash'))}</button>
              </form>
            </div>`;
        })}</div>` : empty('Nothing in progress.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>Want to read</h2><span class="meta">${queued.length}</span></div>
        ${queued.length ? html`<ul class="list">${queued.map((b) => html`
          <li class="item">
            ${cover(b, 'sm')}
            <div class="body"><p class="title">${b.title}${by(b)}</p></div>
            <button class="btn sm" data-act="start" data-id="${b.id}">Start</button>
            <button class="icon-btn" data-act="delete" data-id="${b.id}" aria-label="Delete ${b.title}">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('Your list is empty.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>Finished</h2><span class="meta">${finished.length}</span></div>
        ${finished.length ? html`<ul class="list">${finished.map((b) => html`
          <li class="item">
            ${cover(b, 'sm')}
            <div class="body"><p class="title">${b.title}${by(b)}</p>
              <p class="sub">${b.finished_on ? fmtDate(b.finished_on, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p></div>
            ${stars(b)}
            <button class="icon-btn" data-act="delete" data-id="${b.id}" aria-label="Delete ${b.title}">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('No finished books yet.')}
      </section>
    `);

    const find = (id) => books.find((b) => b.id === id);
    const form = el.querySelector('form[data-form=add]');
    const isbnInput = form.elements.isbn;
    const result = el.querySelector('#isbn-result');
    let lastLookup = '';

    async function lookup(manual) {
      const isbn = cleanIsbn(isbnInput.value);
      if (!isbn) {
        if (manual) result.innerHTML = html`<p class="small muted">That doesn't look like a valid ISBN. Check the 10 or 13 digits.</p>`.s;
        return;
      }
      if (isbn === lastLookup && !manual) return;
      lastLookup = isbn;
      result.innerHTML = html`<p class="small muted">Looking up ${isbn}…</p>`.s;
      const book = await lookupIsbn(isbn);
      if (cleanIsbn(isbnInput.value) !== isbn) return; // input changed meanwhile
      if (!book) {
        result.innerHTML = html`<p class="small muted">No match for ${isbn}. Fill in the details below.</p>`.s;
        return;
      }
      form.elements.title.value = book.title;
      form.elements.author.value = book.author || '';
      form.elements.pages_total.value = book.pages || '';
      form.elements.cover_url.value = book.cover || '';
      result.innerHTML = html`<div class="row" style="align-items:flex-start;gap:12px">
        ${book.cover ? html`<img class="cover" src="${book.cover}" alt="" referrerpolicy="no-referrer">` : ''}
        <div><p class="small"><b style="font-weight:600">Found:</b> ${book.title}</p>
        <p class="small muted">${[book.author, book.pages && `${book.pages} pages`].filter(Boolean).join(' · ') || 'Check the details below'}</p></div></div>`.s;
      hideBrokenCovers(result);
    }
    isbnInput.addEventListener('input', () => { if (cleanIsbn(isbnInput.value)) lookup(false); });
    isbnInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(true); } });
    hideBrokenCovers(el);

    wire(el, {
      lookup: () => lookup(true),
      add: async (v, form) => {
        await ctx.store.insert('books', {
          title: v.title,
          author: v.author || null,
          pages_total: parseInt(v.pages_total, 10) || null,
          status: v.status || 'reading',
          isbn: cleanIsbn(v.isbn),
          cover_url: /^https:\/\//.test(v.cover_url) ? v.cover_url : null,
          started_on: v.status === 'reading' ? t : null,
        });
        form.reset();
        lastLookup = '';
        ctx.say('Book added');
        ctx.rerender();
      },
      pages: async (v, form) => {
        const b = find(form.dataset.id);
        let page = Math.max(0, parseInt(v.page, 10) || 0);
        if (b.pages_total) page = Math.min(page, b.pages_total);
        const delta = page - b.pages_read;
        await ctx.store.update('books', b.id, { pages_read: page });
        if (XP.pages(delta) > 0) await ctx.award('INT', XP.pages(delta), 'pages', crypto.randomUUID(), `${delta} pages read`);
        ctx.rerender();
      },
      start: async (btn) => { await ctx.store.update('books', btn.dataset.id, { status: 'reading', started_on: t }); ctx.rerender(); },
      shelve: async (btn) => { await ctx.store.update('books', btn.dataset.id, { status: 'queued' }); ctx.rerender(); },
      finish: async (btn) => {
        const b = find(btn.dataset.id);
        await ctx.store.update('books', b.id, { status: 'finished', finished_on: t, pages_read: b.pages_total || b.pages_read });
        await ctx.award('INT', XP.bookFinished, 'book', b.id, `Finished ${b.title}`);
        ctx.rerender();
      },
      rate: async (btn) => {
        const b = find(btn.dataset.id);
        const n = Number(btn.dataset.n);
        await ctx.store.update('books', b.id, { rating: b.rating === n ? null : n });
        ctx.rerender();
      },
      delete: async (btn) => {
        const b = find(btn.dataset.id);
        if (!confirm(`Delete "${b.title}"?`)) return;
        await ctx.store.remove('books', b.id);
        await ctx.revoke('book', b.id);
        ctx.rerender();
      },
    });
  },
};
