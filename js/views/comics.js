import { html, raw, wire, mount, today, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { cleanIsbn, lookupIsbn } from '../isbn.js';
import { scanBarcode, issueFromAddon } from '../scanner.js';

const FORMATS = [['issue', 'Issue'], ['trade', 'Trade'], ['manga', 'Manga'], ['graphic_novel', 'Graphic novel'], ['omnibus', 'Omnibus']];
const fmtLabel = (f) => (FORMATS.find(([v]) => v === f) || [f, f])[1];
const name = (c) => `${c.title}${c.issue ? ` ${/^\d+$/.test(c.issue) ? '#' : ''}${c.issue}` : ''}`;
const cover = (c, cls = '') => (c.cover_url ? html`<img class="cover ${cls}" src="${c.cover_url}" alt="" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="cover ${cls} cover-blank" aria-hidden="true">${raw(icon('comics', 16))}</span>`);
const stars = (c) => html`<span class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => html`
  <button class="star ${c.rating >= n ? 'on' : ''}" data-act="rate" data-id="${c.id}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`)}</span>`;

let filter = '';
let tab = 'shelf'; // shelf | read | all

export default {
  id: 'comics',
  label: 'Comics',
  async render(el, ctx) {
    const t = today();
    const all = await ctx.store.list('comics', { order: 'created_at' });
    const q = filter.toLowerCase();
    const match = (c) => !q || `${c.title} ${c.issue || ''} ${c.publisher || ''}`.toLowerCase().includes(q);
    const issueNum = (c) => { const n = parseFloat(String(c.issue || '').replace(/[^\d.]+/g, '')); return Number.isFinite(n) ? n : 1e9; };
    const bySeries = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || issueNum(a) - issueNum(b);
    const reading = all.filter((c) => c.status === 'reading' && match(c)).sort(bySeries);
    const queued = all.filter((c) => c.status === 'queued' && match(c)).sort(bySeries);
    const read = all.filter((c) => c.status === 'read' && match(c))
      .sort((a, b) => (b.read_on || '').localeCompare(a.read_on || '') || b.created_at.localeCompare(a.created_at));
    const owned = all.filter((c) => c.owned).length;
    const readThisMonth = all.filter((c) => c.status === 'read' && (c.read_on || '').startsWith(t.slice(0, 7))).length;
    const series = new Set(all.map((c) => c.title.toLowerCase())).size;

    const row = (c) => html`
      <li class="item">
        ${cover(c, 'sm')}
        <div class="body">
          <p class="title">${name(c)}</p>
          <p class="sub">${[fmtLabel(c.format), c.publisher, c.owned ? 'Owned' : 'Not owned', c.status === 'read' && c.read_on ? `read ${fmtDate(c.read_on, { day: 'numeric', month: 'short' })}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        ${c.status === 'read' ? stars(c) : html`
          ${c.status === 'queued' ? html`<button class="btn sm" data-act="start" data-id="${c.id}">Start</button>` : ''}
          <button class="btn sm primary" data-act="markread" data-id="${c.id}">Read</button>`}
        <details class="more"><summary class="icon-btn" aria-label="More for ${name(c)}">⋯</summary>
          <div class="more-menu">
            ${c.status === 'read' ? html`<button class="text-btn" data-act="unread" data-id="${c.id}">Mark unread</button>` : ''}
            <button class="text-btn" data-act="owned" data-id="${c.id}">${c.owned ? 'Mark not owned' : 'Mark owned'}</button>
            <button class="text-btn" data-act="next" data-id="${c.id}">Add next issue</button>
            <button class="text-btn" data-act="delete" data-id="${c.id}">Delete</button>
          </div></details>
      </li>`;

    mount(el, html`
      <header class="page-head">
        <div><h1>Comics</h1><p>${all.length} in collection · ${owned} owned · ${readThisMonth} read this month</p></div>
        <button class="btn primary" data-act="scan">${raw(icon('scan', 18))}Scan</button>
      </header>

      <section class="card">
        <div class="card-head"><h2>Add a comic</h2></div>
        <form data-form="add" class="form">
          <div class="row">
            <input name="barcode" class="grow" placeholder="Barcode or ISBN (optional)" inputmode="numeric" autocomplete="off" aria-label="Barcode or ISBN">
            <button type="button" class="btn" data-act="scan" aria-label="Scan barcode">${raw(icon('scan', 18))}</button>
            <button type="button" class="btn" data-act="lookup">Look up</button>
          </div>
          <div class="isbn-result" id="comic-result" aria-live="polite"></div>
          <input type="hidden" name="cover_url">
          <div class="fields">
            <label class="field" style="grid-column:1/-1">Series or title<input name="title" maxlength="200" required list="series-list" autocomplete="off"></label>
            <label class="field">Issue / volume<input name="issue" maxlength="20" placeholder="e.g. 12 or Vol. 3" autocomplete="off"></label>
            <label class="field">Publisher<input name="publisher" maxlength="120" list="pub-list" autocomplete="off"></label>
            <label class="field">Format<select name="format">${FORMATS.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
          </div>
          <datalist id="series-list">${[...new Map(all.map((c) => [c.title.toLowerCase(), c.title])).values()].map((s) => html`<option value="${s}">`)}</datalist>
          <datalist id="pub-list">${[...new Set(all.map((c) => c.publisher).filter(Boolean))].map((s) => html`<option value="${s}">`)}</datalist>
          <div class="row wrap spread">
            <div class="seg" role="radiogroup" aria-label="Status">
              <label><input type="radio" name="status" value="queued" checked><span>To read</span></label>
              <label><input type="radio" name="status" value="reading"><span>Reading</span></label>
              <label><input type="radio" name="status" value="read"><span>Read</span></label>
            </div>
            <label class="row small muted" style="gap:8px"><span class="switch"><input type="checkbox" name="owned" checked><i aria-hidden="true"></i></span>I own it</label>
            <button class="btn primary">${raw(icon('plus', 18))}Add</button>
          </div>
        </form>
      </section>

      ${all.length > 5 ? html`<input type="search" data-change="search" value="${filter}" placeholder="Search series, issue or publisher" aria-label="Search comics">` : ''}

      ${reading.length ? html`
        <section class="card">
          <div class="card-head"><h2>Reading</h2><span class="meta">${reading.length}</span></div>
          <ul class="list">${reading.map(row)}</ul>
        </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>To read</h2><span class="meta">${queued.length}</span></div>
        ${queued.length ? html`<ul class="list">${queued.map(row)}</ul>` : empty(q ? 'Nothing matches.' : 'Your pile is empty. Scan or add a comic above.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>Read</h2><span class="meta">${read.length}${series ? ` · ${series} series` : ''}</span></div>
        ${read.length ? html`<ul class="list">${read.slice(0, 60).map(row)}</ul>` : empty(q ? 'Nothing matches.' : 'Nothing read yet.')}
        ${read.length > 60 ? html`<p class="small faint" style="margin-top:8px">Showing the latest 60. Search to find older ones.</p>` : ''}
      </section>
    `);

    el.querySelectorAll('img.cover').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
    // Close other "more" menus when one opens
    el.querySelectorAll('details.more').forEach((d) => d.addEventListener('toggle', () => {
      if (d.open) el.querySelectorAll('details.more[open]').forEach((o) => { if (o !== d) o.open = false; });
    }));

    const form = el.querySelector('form[data-form=add]');
    const result = el.querySelector('#comic-result');
    const f = form.elements;
    const show = (tpl) => { result.innerHTML = String(tpl); result.querySelectorAll('img').forEach((i) => i.addEventListener('error', () => i.remove(), { once: true })); };

    async function lookup(code, addon) {
      const digits = String(code || '').replace(/[^0-9X]/gi, '').toUpperCase();
      if (!digits) { show(html`<p class="small muted">Enter or scan a barcode first.</p>`); return; }
      f.barcode.value = digits;
      const dup = all.find((c) => c.barcode && c.barcode === digits && (!addon || !c.issue || c.issue === issueFromAddon(addon)));
      const isbn = cleanIsbn(digits);
      const issueNo = issueFromAddon(addon);
      if (issueNo && !f.issue.value) f.issue.value = issueNo;
      if (!isbn) {
        // Single-issue UPC: no free database covers these, so reuse what we know from your own collection.
        const same = all.find((c) => c.barcode === digits);
        if (same) {
          f.title.value = same.title; f.publisher.value = same.publisher || ''; f.format.value = same.format;
        }
        show(html`<p class="small"><b style="font-weight:600">${dup ? 'Already in your collection: ' : 'Barcode read: '}</b>${dup ? name(dup) : digits}${issueNo ? ` · issue ${issueNo}` : ''}</p>
          <p class="small muted">${same ? 'Series filled in from your collection.' : 'Comic issue barcodes aren’t in the free databases. Type the series once; next time this barcode fills it in.'}</p>`);
        if (!same) f.title.focus();
        return;
      }
      show(html`<p class="small muted">Looking up ${isbn}…</p>`);
      const book = await lookupIsbn(isbn);
      if (!book) { show(html`<p class="small muted">No match for ${isbn}. Fill in the details below.</p>`); return; }
      const m = book.title.match(/^(.*?)(?:,?\s*(?:Vol(?:ume)?\.?|#)\s*(\d+))\b/i);
      f.title.value = m ? m[1].trim() : book.title;
      if (m && !f.issue.value) f.issue.value = `Vol. ${m[2]}`;
      if (f.format.value === 'issue') f.format.value = 'trade';
      f.cover_url.value = book.cover || '';
      show(html`<div class="row" style="align-items:flex-start;gap:12px">
        ${book.cover ? html`<img class="cover" src="${book.cover}" alt="" referrerpolicy="no-referrer">` : ''}
        <div><p class="small"><b style="font-weight:600">${dup ? 'Already in your collection: ' : 'Found: '}</b>${book.title}</p>
        <p class="small muted">${book.author || 'Check the details below'}</p></div></div>`);
    }

    f.barcode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(f.barcode.value); } });

    const find = (id) => all.find((c) => c.id === id);
    wire(el, {
      search: (input) => { filter = input.value.trim(); ctx.rerender(); },
      scan: async () => {
        const r = await scanBarcode({ title: 'Scan a comic', hint: 'Line the barcode up inside the box. For single issues, include the small barcode on the right.' });
        if (!r) return;
        form.scrollIntoView({ block: 'start', behavior: 'smooth' });
        await lookup(r.code, r.addon);
      },
      lookup: () => lookup(f.barcode.value),
      add: async (v, frm) => {
        const status = ['queued', 'reading', 'read'].includes(v.status) ? v.status : 'queued';
        const barcode = (v.barcode || '').replace(/[^0-9X]/gi, '').toUpperCase();
        const row = await ctx.store.insert('comics', {
          title: v.title,
          issue: v.issue || null,
          publisher: v.publisher || null,
          format: FORMATS.some(([k]) => k === v.format) ? v.format : 'issue',
          status,
          owned: frm.elements.owned.checked,
          barcode: /^[0-9X]{8,18}$/.test(barcode) ? barcode : null,
          cover_url: /^https:\/\//.test(v.cover_url) ? v.cover_url : null,
          read_on: status === 'read' ? t : null,
        });
        frm.reset(); result.innerHTML = '';
        if (status === 'read') await ctx.award('INT', XP.comicRead, 'comic', row.id, `Read ${name(row)}`);
        else ctx.say(`Added ${name(row)}`);
        ctx.rerender();
      },
      start: async (b) => { await ctx.store.update('comics', b.dataset.id, { status: 'reading' }); ctx.rerender(); },
      markread: async (b) => {
        const c = find(b.dataset.id);
        await ctx.store.update('comics', c.id, { status: 'read', read_on: t });
        await ctx.award('INT', XP.comicRead, 'comic', c.id, `Read ${name(c)}`);
        ctx.rerender();
      },
      unread: async (b) => {
        await ctx.store.update('comics', b.dataset.id, { status: 'queued', read_on: null, rating: null });
        await ctx.revoke('comic', b.dataset.id);
        ctx.rerender();
      },
      owned: async (b) => { const c = find(b.dataset.id); await ctx.store.update('comics', c.id, { owned: !c.owned }); ctx.rerender(); },
      next: async (b) => {
        const c = find(b.dataset.id);
        const n = parseInt(String(c.issue || '').replace(/\D+/g, ''), 10);
        const nextIssue = Number.isFinite(n) ? String(c.issue).replace(/\d+(?!.*\d)/, String(n + 1)) : null;
        const row = await ctx.store.insert('comics', {
          title: c.title, issue: nextIssue, publisher: c.publisher, format: c.format, status: 'queued', owned: false,
        });
        ctx.say(`Added ${name(row)} to your pile`);
        ctx.rerender();
      },
      rate: async (b) => {
        const c = find(b.dataset.id);
        const n = Number(b.dataset.n);
        await ctx.store.update('comics', c.id, { rating: c.rating === n ? null : n });
        ctx.rerender();
      },
      delete: async (b) => {
        const c = find(b.dataset.id);
        if (!c || !confirm(`Delete ${name(c)}?`)) return;
        await ctx.store.remove('comics', c.id);
        await ctx.revoke('comic', c.id);
        ctx.rerender();
      },
    });
  },
};
