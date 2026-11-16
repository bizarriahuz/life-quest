// Fragrance: the bottles you own and the ones you want, in two lists like Books.
// Type a name and the lookup fills house, year, concentration, family and the note
// pyramid from Scento's public API; size, price, date, store, rating, notes and the
// photo are always yours. The API is never trusted to invent a field — a miss leaves
// the form usable and the field empty.
// Routes: #/fragrance (lists), #/fragrance/new, #/fragrance/<id>, #/fragrance/<id>/edit.
import { html, raw, wire, mount, today, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { CURRENCIES, money, cents } from '../game.js';
import { shrink } from '../photo.js';
import { searchPerfumes, getPerfume, slugOf } from '../fragrance.js';

const BUCKET = 'fragrance-photos';
const MAX_PHOTOS = 6;
export const STATUS = { own: 'Owned', want: 'Want' };

const filters = { house: '' };

// Signed photo links last an hour; reuse them for 50 minutes so images don't reload on every redraw.
const photoUrl = new Map();
async function urlsFor(ctx, paths) {
  const now = Date.now();
  const need = paths.filter((p) => !(photoUrl.get(p)?.at > now - 50 * 60 * 1000));
  for (let i = 0; i < need.length; i += 100) {
    const got = await ctx.store.photoUrls(need.slice(i, i + 100), BUCKET).catch(() => ({}));
    for (const [p, url] of Object.entries(got)) photoUrl.set(p, { url, at: now });
  }
  return Object.fromEntries(paths.map((p) => [p, photoUrl.get(p)?.url]).filter(([, u]) => u));
}
const fillImages = (el, ctx) => {
  const imgs = [...el.querySelectorAll('img[data-path]:not([src])')];
  if (!imgs.length) return;
  urlsFor(ctx, [...new Set(imgs.map((i) => i.dataset.path))]).then((urls) => {
    for (const img of imgs) if (urls[img.dataset.path]) img.src = urls[img.dataset.path];
  });
};
const known = (p) => photoUrl.get(p)?.url;
const bottleArt = (r) => (r.photos?.length
  ? html`<img alt="" loading="lazy" decoding="async" data-path="${r.photos[0]}" ${known(r.photos[0]) ? html`src="${known(r.photos[0])}"` : ''}>`
  : html`<span class="fr-blank" aria-hidden="true">${raw(icon('fragrance', 28))}</span>`);

const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');
const meters = (ml) => (ml == null ? null : `${Number(ml)} ml`);
const subtitle = (r) => [r.concentration, meters(r.size_ml), r.year].filter(Boolean).join(' · ');
const pyramid = (r) => {
  const rows = [['Top', r.top_notes], ['Heart', r.heart_notes], ['Base', r.base_notes]]
    .filter(([, list]) => list?.length);
  return rows.length
    ? html`<dl class="fr-pyramid">${rows.map(([k, list]) => html`<div class="fr-pyr"><dt>${k}</dt><dd>${list.join(' · ')}</dd></div>`)}</dl>`
    : '';
};

export default {
  id: 'fragrance',
  label: 'Fragrance',
  async render(el, ctx) {
    const sub = (location.hash.match(/^#\/fragrance\/([\w-]+)(\/edit)?/) || []);
    const rows = await ctx.store.list('fragrances', { order: 'created_at' });
    if (sub[1] === 'new') return renderForm(el, ctx, rows, null);
    if (sub[1]) {
      const row = rows.find((r) => r.id === sub[1]);
      if (!row) { location.replace('#/fragrance'); return undefined; }
      return sub[2] ? renderForm(el, ctx, rows, row) : renderDetail(el, ctx, row);
    }
    return renderList(el, ctx, rows);
  },
};

// ---------- the two lists ----------
function renderList(el, ctx, rows) {
  const year = today().slice(0, 4);
  const owned = rows.filter((r) => r.status === 'own');
  const want = rows.filter((r) => r.status === 'want');
  // Spend this year: what you actually paid for bottles marked owned.
  const spend = {};
  for (const r of owned) {
    if (r.price != null && (r.bought_at || '').startsWith(year)) spend[r.currency] = (spend[r.currency] || 0) + Number(r.price);
  }
  const spendText = Object.keys(spend).length
    ? Object.entries(spend).sort(([a], [b]) => (a === ctx.currency ? -1 : b === ctx.currency ? 1 : a.localeCompare(b))).map(([c, n]) => money(n, c)).join(' + ')
    : money(0, ctx.currency);

  const order = (r) => r.created_at || '';
  const houses = [...new Set(rows.map((r) => r.house).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  if (filters.house && !houses.includes(filters.house)) filters.house = '';
  const shown = (status) => rows
    .filter((r) => r.status === status && (!filters.house || r.house === filters.house))
    .sort((a, b) => order(b).localeCompare(order(a)));

  const tile = (r) => html`
    <a class="fr-bottle" href="#/fragrance/${r.id}">
      <span class="fr-art">${bottleArt(r)}</span>
      <span class="fr-name">${r.name}</span>
      <span class="fr-house">${r.house || 'Unknown house'}</span>
      <span class="fr-sub">${subtitle(r) || 'No details yet'}</span>
      ${r.rating ? html`<span class="fr-stars">${stars(r.rating)}</span>` : ''}
    </a>`;

  const section = (title, list, why) => html`
    <section class="card">
      <div class="card-head"><h2>${title}</h2><span class="meta">${list.length}</span></div>
      ${list.length
        ? html`<div class="fr-grid">${list.map(tile)}</div>`
        : empty(why)}
    </section>`;

  const filtering = Boolean(filters.house);

  mount(el, html`
    <header class="page-head">
      <div><h1>Fragrance</h1><p>${owned.length} bottle${owned.length === 1 ? '' : 's'} · ${want.length} wanted · ${spendText} this year</p></div>
      <a class="btn primary" href="#/fragrance/new">${raw(icon('plus', 18))}Add</a>
    </header>

    ${houses.length > 1 ? html`
      <div class="fr-filters">
        <label class="field">House<select data-change="filter" data-key="house">
          <option value="">All</option>
          ${houses.map((h) => html`<option value="${h}" ${filters.house === h ? 'selected' : ''}>${h}</option>`)}
        </select></label>
      </div>` : ''}

    ${filtering && !shown('own').length && !shown('want').length
      ? html`<section class="card">${empty('No bottles from that house.')}
          <p style="margin-top:8px"><button class="btn sm" data-act="clear">Clear filter</button></p></section>`
      : html`
        ${section('Owned', shown('own'), 'Nothing on the shelf yet. Add the first bottle.')}
        ${section('Want', shown('want'), 'Nothing on the list yet.')}`}
  `);
  fillImages(el, ctx);

  wire(el, {
    filter: (s) => { filters[s.dataset.key] = s.value; ctx.rerender(); },
    clear: () => { filters.house = ''; ctx.rerender(); },
  });
  return undefined;
}

// ---------- one bottle ----------
function renderDetail(el, ctx, row) {
  const room = MAX_PHOTOS - row.photos.length;
  const field = (label, value) => (value == null || value === '' ? '' : html`<div class="fr-row"><dt>${label}</dt><dd>${value}</dd></div>`);
  const look = row.name ? `https://www.google.com/search?q=${encodeURIComponent(`${row.house || ''} ${row.name} review`)}` : null;

  mount(el, html`
    <header class="page-head">
      <div><p><a href="#/fragrance" class="text-btn">‹ Fragrance</a></p><h1>${row.name}</h1>
        <p>${[row.house, row.concentration, meters(row.size_ml), row.year].filter(Boolean).join(' · ') || 'No details yet'}</p></div>
      <a class="btn" href="#/fragrance/${row.id}/edit">Edit</a>
    </header>

    <section class="card">
      ${row.photos.length ? html`
        <div class="fr-carousel" tabindex="0" aria-label="Photos of ${row.name}">
          ${row.photos.map((p, i) => html`<figure class="fr-slide">
            <img alt="Photo ${i + 1} of ${row.photos.length}" data-path="${p}" ${known(p) ? html`src="${known(p)}"` : ''}>
            <button type="button" class="icon-btn sm fr-unphoto" data-act="unphoto" data-path="${p}" aria-label="Remove photo ${i + 1}">${raw(icon('close', 14))}</button>
            <figcaption class="small faint">${i + 1} / ${row.photos.length}</figcaption>
          </figure>`)}
        </div>` : html`<div class="fr-noart">${raw(icon('fragrance', 40))}<p class="small faint">No photo yet</p></div>`}
      <div class="row spread wrap" style="margin-top:10px;gap:8px">
        <span class="small faint" id="fr-status" role="status">${row.photos.length} of ${MAX_PHOTOS} photos · only you can see them</span>
        ${room > 0 ? html`<label class="btn sm">${raw(icon('plus', 15))}Add photos<input type="file" accept="image/*" multiple hidden data-change="photos"></label>` : ''}
      </div>
    </section>

    <section class="card">
      <dl class="fr-fields">
        ${field('Name', row.name)}
        ${field('House', row.house)}
        ${field('Concentration', row.concentration)}
        ${field('Size', meters(row.size_ml))}
        ${field('Family', row.family)}
        ${field('Perfumer', row.perfumer)}
        ${field('Year', row.year)}
        ${field('Status', STATUS[row.status])}
        ${field('Rating', row.rating ? stars(row.rating) : null)}
        ${field('Price', row.price != null ? money(row.price, row.currency) : null)}
        ${field('Bought', row.bought_at ? fmtDate(row.bought_at, { day: 'numeric', month: 'long', year: 'numeric' }) : null)}
        ${field('Store', row.store)}
        ${field('Added', fmtDate(row.created_at.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }))}
      </dl>
      ${pyramid(row)}
      ${row.notes ? html`<p class="fr-notes">${row.notes}</p>` : ''}
      ${row.source_url ? html`<p class="small faint" style="margin-top:12px">Details from <a href="${row.source_url}" target="_blank" rel="noopener noreferrer">Scento</a></p>`
        : look ? html`<p class="small faint" style="margin-top:12px"><a href="${look}" target="_blank" rel="noopener noreferrer">Search for reviews</a></p>` : ''}
    </section>

    <p style="text-align:center"><button class="btn" data-act="delete">${raw(icon('trash', 16))}Delete bottle</button></p>
  `);
  fillImages(el, ctx);

  const status = (t) => { const s = el.querySelector('#fr-status'); if (s) s.textContent = t; };
  wire(el, {
    photos: async (input) => {
      const files = [...input.files].slice(0, room);
      input.value = '';
      if (!files.length) return;
      let photos = [...row.photos]; let done = 0; const errs = [];
      for (const f of files) {
        status(`Adding ${done + 1} of ${files.length}…`);
        let saved = false;
        const path = `${row.id}/${crypto.randomUUID()}.jpg`;
        try {
          const blob = await shrink(f);
          await ctx.store.update('fragrances', row.id, { photos: [...photos, path] });   // checks limits first
          saved = true;
          await ctx.store.uploadPhoto(path, blob, BUCKET);
          photos = [...photos, path];
          photoUrl.set(path, { url: URL.createObjectURL(blob), at: Date.now() - 40 * 60 * 1000 });
          done += 1;
        } catch (err) {
          if (saved) await ctx.store.update('fragrances', row.id, { photos }).catch(() => {});
          errs.push(err?.message || String(err));
          if (/limit|most|Too many/i.test(errs.at(-1))) break;
        }
      }
      ctx.say(errs.length ? (done ? `Added ${done}. ${errs[0]}` : errs[0]) : `Added ${done} photo${done === 1 ? '' : 's'}`);
      ctx.rerender();
    },
    unphoto: async (b) => {
      if (!confirm('Remove this photo?')) return;
      const path = b.dataset.path;
      await ctx.store.update('fragrances', row.id, { photos: row.photos.filter((p) => p !== path) });
      await ctx.store.removePhotos([path], BUCKET).catch((err) => console.warn('photo file', err));
      ctx.rerender();
    },
    delete: async () => {
      if (!confirm(`Delete ${row.name}${row.photos.length ? ' and its photos' : ''}? This can’t be undone.`)) return;
      await ctx.store.removePhotos(row.photos, BUCKET).catch((err) => console.warn('photo cleanup', err));
      await ctx.store.remove('fragrances', row.id);
      ctx.say(`Deleted ${row.name}`);
      location.hash = '#/fragrance';
    },
  });
  return undefined;
}

// ---------- add / edit ----------
function renderForm(el, ctx, rows, row) {
  const r = row || { status: 'own', currency: ctx.currency };
  const currencies = CURRENCIES.includes(r.currency) ? CURRENCIES : [r.currency, ...CURRENCIES];
  const knownHouses = [...new Set(rows.map((x) => x.house).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const back = row ? `#/fragrance/${row.id}` : '#/fragrance';

  // Everything the lookup supplied. Never rebuilt from the visible inputs.
  let picked = row
    ? { perfumer: row.perfumer, top_notes: row.top_notes, heart_notes: row.heart_notes, base_notes: row.base_notes, source_url: row.source_url }
    : { perfumer: null, top_notes: [], heart_notes: [], base_notes: [], source_url: null };

  mount(el, html`
    <header class="page-head"><div><p><a href="${back}" class="text-btn">‹ ${row ? row.name : 'Fragrance'}</a></p><h1>${row ? 'Edit bottle' : 'Add a bottle'}</h1></div></header>

    ${row ? '' : html`
      <section class="card">
        <div class="card-head"><h2>Find it</h2></div>
        <input id="fr-search" class="grow" placeholder="Type a perfume name, e.g. Aventus" autocomplete="off" autocapitalize="none" aria-label="Perfume name" style="width:100%">
        <div id="fr-hits" class="fr-hits" aria-live="polite"></div>
        <p class="small faint" style="margin-top:8px">Not there? Just type the details below yourself.</p>
      </section>`}

    <section class="card">
      <form data-form="save" class="form">
        <div id="fr-preview"></div>
        <div class="seg fr-seg" role="radiogroup" aria-label="Owned or wanted">
          ${Object.entries(STATUS).map(([v, label]) => html`<label><input type="radio" name="status" value="${v}" ${r.status === v ? 'checked' : ''}><span>${label}</span></label>`)}
        </div>
        <div class="fields">
          <label class="field" style="grid-column:1/-1">Name<input name="name" maxlength="200" required value="${r.name || ''}" autocomplete="off"></label>
          <label class="field">House<input name="house" maxlength="120" value="${r.house || ''}" list="fr-houses" autocomplete="off"></label>
          <label class="field">Concentration<input name="concentration" maxlength="40" value="${r.concentration || ''}" placeholder="e.g. eau de parfum" autocomplete="off"></label>
          <label class="field">Size (ml)<input name="size_ml" inputmode="decimal" value="${r.size_ml ?? ''}"></label>
          <label class="field">Year<input name="year" inputmode="numeric" maxlength="4" value="${r.year ?? ''}"></label>
          <label class="field">Family<input name="family" maxlength="80" value="${r.family || ''}" autocomplete="off"></label>
          <label class="field">Rating<select name="rating">
            <option value="">None</option>
            ${[1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${String(r.rating) === String(n) ? 'selected' : ''}>${stars(n)}</option>`)}
          </select></label>
          <label class="field">Price<input name="price" inputmode="decimal" value="${r.price ?? ''}" autocomplete="off"></label>
          <label class="field">Currency<select name="currency">${currencies.map((c) => html`<option value="${c}" ${r.currency === c ? 'selected' : ''}>${c}</option>`)}</select></label>
          <label class="field">Bought on<input name="bought_at" type="date" value="${r.bought_at || ''}" max="${today()}"></label>
          <label class="field">Store<input name="store" maxlength="120" value="${r.store || ''}" autocomplete="off"></label>
          <label class="field" style="grid-column:1/-1">Notes<textarea name="notes" maxlength="5000" rows="4">${r.notes || ''}</textarea></label>
        </div>
        <datalist id="fr-houses">${knownHouses.map((h) => html`<option value="${h}">`)}</datalist>
        <div class="row spread wrap">
          <a class="btn" href="${back}">Cancel</a>
          <button class="btn primary">${raw(icon('check', 18))}${row ? 'Save' : 'Add bottle'}</button>
        </div>
      </form>
    </section>
  `);

  const form = el.querySelector('form[data-form=save]');
  const search = el.querySelector('#fr-search');
  const hits = el.querySelector('#fr-hits');
  const preview = el.querySelector('#fr-preview');
  let timer = null;
  let ctl = null;
  let lastQ = '';

  const showPreview = (p) => {
    preview.innerHTML = p ? html`<div class="fr-preview">
      <p class="fr-pv-name">${p.name}</p>
      <p class="small muted">${[p.house, p.concentration, p.year].filter(Boolean).join(' · ')}</p>
      ${pyramid(p)}
    </div>`.s : '';
  };

  async function pick(slug) {
    hits.innerHTML = html`<p class="small faint">Looking up…</p>`.s;
    const p = await getPerfume(slug);
    if (!p) {
      hits.innerHTML = html`<p class="small faint">Couldn’t fetch that one. Fill in the details below.</p>`.s;
      return;
    }
    picked = { perfumer: p.perfumer, top_notes: p.top_notes, heart_notes: p.heart_notes, base_notes: p.base_notes, source_url: p.source_url };
    form.elements.name.value = p.name;
    form.elements.house.value = p.house || '';
    form.elements.concentration.value = p.concentration || '';
    form.elements.year.value = p.year || '';
    form.elements.family.value = p.family || '';
    hits.innerHTML = '';
    if (search) search.value = `${p.name}${p.house ? ` · ${p.house}` : ''}`;
    showPreview(p);
  }

  async function searchNow(q) {
    if (q === lastQ) return;
    lastQ = q;
    if (ctl) ctl.abort();
    ctl = new AbortController();
    const matches = await searchPerfumes(q, ctl.signal);
    if (q !== lastQ) return;
    hits.innerHTML = matches.length
      ? matches.map((m) => html`<button type="button" class="fr-hit" data-act="pick" data-slug="${slugOf(m.page) || ''}">
          <span class="fr-hit-name">${m.name}</span>
          <span class="fr-hit-sub">${[m.house, m.family].filter(Boolean).join(' · ')}</span>
        </button>`).join('')
      : html`<p class="small faint">No match. Fill in the details below.</p>`.s;
  }

  if (search) {
    search.addEventListener('input', () => {
      clearTimeout(timer);
      const q = search.value.trim();
      if (q.length < 2) { hits.innerHTML = ''; lastQ = ''; return; }
      timer = setTimeout(() => searchNow(q), 350);
    });
  }

  wire(el, {
    pick: async (btn) => { const slug = btn.dataset.slug; if (slug) await pick(slug); },
    save: async (v) => {
      const price = v.price === '' ? null : cents(v.price);
      const size = v.size_ml === '' ? null : Number(v.size_ml);
      const year = v.year === '' ? null : parseInt(v.year, 10);
      const payload = {
        name: v.name.slice(0, 200),
        house: v.house || null,
        concentration: v.concentration || null,
        family: v.family || null,
        year: Number.isFinite(year) && year >= 1800 && year <= 2100 ? year : null,
        size_ml: Number.isFinite(size) && size > 0 ? size : null,
        status: STATUS[v.status] ? v.status : (row ? row.status : 'own'),
        rating: v.rating ? Number(v.rating) : null,
        price,
        currency: /^[A-Z]{3}$/.test(v.currency) ? v.currency : ctx.currency,
        bought_at: v.bought_at || null,
        store: v.store || null,
        notes: v.notes || null,
        perfumer: picked.perfumer || null,
        top_notes: picked.top_notes || [],
        heart_notes: picked.heart_notes || [],
        base_notes: picked.base_notes || [],
        source_url: picked.source_url || null,
      };
      if (row) {
        await ctx.store.update('fragrances', row.id, payload);
        ctx.say('Saved');
        location.hash = `#/fragrance/${row.id}`;
      } else {
        const saved = await ctx.store.insert('fragrances', payload);
        ctx.say(`Added ${saved.name}`);
        location.hash = `#/fragrance/${saved.id}`;
      }
    },
  });

  return undefined;
}
