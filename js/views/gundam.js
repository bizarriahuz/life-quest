// Gundam: a Gunpla collection. Official (Bandai) kits and third-party kits live on separate tabs,
// and third-party kits keep apart unlicensed copies from original designs. Never merge the two.
// Photos sit in the private kit-photos bucket as <kit id>/<uuid>.jpg, up to 8 per kit.
// Routes: #/gundam (grid), #/gundam/new, #/gundam/<id>, #/gundam/<id>/edit.
import { html, raw, wire, mount, today, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { CURRENCIES, money, cents } from '../game.js';
import { shrink } from '../photo.js';

const BUCKET = 'kit-photos';
const MAX_PHOTOS = 8;
export const GRADES = ['HG', 'RG', 'MG', 'PG', 'EG', 'SD', 'Mega Size', 'Full Mechanics', 'Other'];
export const ORIGIN = {
  official: { label: 'Official', long: 'Official (Bandai)' },
  third_party_copy: { label: 'Copy', long: 'Third-party copy' },
  third_party_original: { label: 'Original', long: 'Third-party original design' },
};
export const STATUS = { wishlist: 'Wishlist', unbuilt: 'Unbuilt', built: 'Built', painted: 'Painted', sold: 'Sold' };
const TABS = { official: 'Official', third: 'Third-party' };
const inTab = (k, tab) => (tab === 'official' ? k.origin === 'official' : k.origin === 'third_party_copy' || k.origin === 'third_party_original');

const PREF = 'lifequest:gundam';
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } })();
let tab = TABS[pref.tab] ? pref.tab : 'official';
const filters = { grade: '', status: '', brand: '' };
const remember = () => { try { localStorage.setItem(PREF, JSON.stringify({ tab })); } catch { /* private mode */ } };

// Signed photo links last an hour; reuse them for 50 minutes so images don't reload on every redraw.
const photoUrl = new Map();   // path → { url, at }
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
const boxArt = (k) => (k.photos?.length
  ? html`<img alt="" loading="lazy" decoding="async" data-path="${k.photos[0]}" ${known(k.photos[0]) ? html`src="${known(k.photos[0])}"` : ''}>`
  : html`<span class="gk-blank" aria-hidden="true">${raw(icon('gundam', 28))}</span>`);

const sortByName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

export default {
  id: 'gundam',
  label: 'Gundam',
  async render(el, ctx) {
    const sub = (location.hash.match(/^#\/gundam\/([\w-]+)(\/edit)?/) || []);
    const kits = await ctx.store.list('gundam_kits', { order: 'created_at' });
    if (sub[1] === 'new') return renderForm(el, ctx, kits, null);
    if (sub[1]) {
      const kit = kits.find((k) => k.id === sub[1]);
      if (!kit) { location.replace('#/gundam'); return undefined; }
      return sub[2] ? renderForm(el, ctx, kits, kit) : renderDetail(el, ctx, kit);
    }
    return renderGrid(el, ctx, kits);
  },
};

// ---------- the collection ----------
function renderGrid(el, ctx, kits) {
  const year = today().slice(0, 4);
  const owned = kits.filter((k) => ['unbuilt', 'built', 'painted'].includes(k.status));
  const built = owned.filter((k) => k.status !== 'unbuilt').length;
  const backlog = owned.length - built;
  // Spend this year: what you paid for kits bought this year (not wishlist prices), per currency.
  const spend = {};
  for (const k of kits) {
    if (k.status !== 'wishlist' && k.price != null && (k.bought_at || '').startsWith(year)) spend[k.currency] = (spend[k.currency] || 0) + Number(k.price);
  }
  const spendText = Object.keys(spend).length
    ? Object.entries(spend).sort(([a], [b]) => (a === ctx.currency ? -1 : b === ctx.currency ? 1 : a.localeCompare(b))).map(([c, n]) => money(n, c)).join(' + ')
    : money(0, ctx.currency);

  const tabKits = kits.filter((k) => inTab(k, tab));
  const brands = [...new Set(tabKits.map((k) => k.brand).filter(Boolean))].sort(sortByName);
  if (filters.brand && !brands.includes(filters.brand)) filters.brand = '';
  const shown = tabKits
    .filter((k) => (!filters.grade || k.grade === filters.grade) && (!filters.status || k.status === filters.status) && (!filters.brand || k.brand === filters.brand))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const counts = { official: kits.filter((k) => inTab(k, 'official')).length, third: kits.filter((k) => inTab(k, 'third')).length };
  const filtering = filters.grade || filters.status || filters.brand;

  mount(el, html`
    <header class="page-head">
      <div><h1>Gundam</h1><p>${owned.length} kit${owned.length === 1 ? '' : 's'} · ${built} built · ${backlog} in the backlog · ${spendText} this year</p></div>
      <a class="btn primary" href="#/gundam/new">${raw(icon('plus', 18))}Add</a>
    </header>

    <div class="seg gk-tabs" role="radiogroup" aria-label="Which kits">
      ${Object.entries(TABS).map(([k, label]) => html`<label><input type="radio" name="gkt" value="${k}" data-change="tab" ${tab === k ? 'checked' : ''}><span>${label} · ${counts[k]}</span></label>`)}
    </div>

    <div class="gk-filters">
      <label class="field">Grade<select data-change="filter" data-key="grade"><option value="">All</option>${GRADES.map((g) => html`<option value="${g}" ${filters.grade === g ? 'selected' : ''}>${g}</option>`)}</select></label>
      <label class="field">Status<select data-change="filter" data-key="status"><option value="">All</option>${Object.entries(STATUS).map(([k, v]) => html`<option value="${k}" ${filters.status === k ? 'selected' : ''}>${v}</option>`)}</select></label>
      <label class="field">Brand<select data-change="filter" data-key="brand" ${brands.length ? '' : 'disabled'}><option value="">All</option>${brands.map((b) => html`<option value="${b}" ${filters.brand === b ? 'selected' : ''}>${b}</option>`)}</select></label>
    </div>

    ${shown.length ? html`<section class="card ph-card"><div class="gk-grid">${shown.map((k) => html`
      <a class="gk-kit" href="#/gundam/${k.id}">
        <span class="gk-art">${boxArt(k)}</span>
        <span class="gk-name">${k.name}</span>
        <span class="gk-sub">${k.grade}${tab === 'third' ? html` · <span class="gk-origin ${k.origin}">${ORIGIN[k.origin].label}</span>` : ''}${k.status === 'wishlist' || k.status === 'sold' ? ` · ${STATUS[k.status]}` : ''}</span>
      </a>`)}</div></section>`
      : html`<section class="card">${empty(filtering ? 'No kits match these filters.' : tab === 'official' ? 'No Bandai kits yet. Add your first one.' : 'No third-party kits yet. Copies and original designs both go here.')}
        ${filtering ? html`<p style="margin-top:8px"><button class="btn sm" data-act="clear">Clear filters</button></p>` : ''}</section>`}
  `);
  fillImages(el, ctx);

  wire(el, {
    tab: (input) => { tab = input.value; remember(); ctx.rerender(); },
    filter: (s) => { filters[s.dataset.key] = s.value; ctx.rerender(); },
    clear: () => { filters.grade = ''; filters.status = ''; filters.brand = ''; ctx.rerender(); },
  });
  return undefined;
}

// ---------- one kit ----------
function renderDetail(el, ctx, kit) {
  const room = MAX_PHOTOS - kit.photos.length;
  const row = (label, value) => (value == null || value === '' ? '' : html`<div class="gk-row"><dt>${label}</dt><dd>${value}</dd></div>`);

  mount(el, html`
    <header class="page-head">
      <div><p><a href="#/gundam" class="text-btn">‹ Gundam</a></p><h1>${kit.name}</h1><p>${kit.grade}${kit.scale ? ` · ${kit.scale}` : ''} · ${ORIGIN[kit.origin].long}</p></div>
      <a class="btn" href="#/gundam/${kit.id}/edit">Edit</a>
    </header>

    <section class="card">
      ${kit.photos.length ? html`
        <div class="gk-carousel" tabindex="0" aria-label="Photos of ${kit.name}">
          ${kit.photos.map((p, i) => html`<figure class="gk-slide">
            <img alt="Photo ${i + 1} of ${kit.photos.length}" data-path="${p}" ${known(p) ? html`src="${known(p)}"` : ''}>
            <button type="button" class="icon-btn sm gk-unphoto" data-act="unphoto" data-path="${p}" aria-label="Remove photo ${i + 1}">${raw(icon('close', 14))}</button>
            <figcaption class="small faint">${i + 1} / ${kit.photos.length}</figcaption>
          </figure>`)}
        </div>` : html`<div class="gk-noart">${raw(icon('gundam', 40))}<p class="small faint">No photos yet</p></div>`}
      <div class="row spread wrap" style="margin-top:10px;gap:8px">
        <span class="small faint" id="gk-status" role="status">${kit.photos.length} of ${MAX_PHOTOS} photos · only you can see them</span>
        ${room > 0 ? html`<label class="btn sm">${raw(icon('plus', 15))}Add photos<input type="file" accept="image/*" multiple hidden data-change="photos"></label>` : ''}
      </div>
    </section>

    <section class="card">
      <dl class="gk-fields">
        ${row('Name', kit.name)}
        ${row('Series', kit.series)}
        ${row('Grade', kit.grade)}
        ${row('Scale', kit.scale)}
        ${row('Brand', kit.brand)}
        ${row('Origin', ORIGIN[kit.origin].long)}
        ${row('Status', STATUS[kit.status])}
        ${row('Rating', kit.rating ? `${'★'.repeat(kit.rating)}${'☆'.repeat(5 - kit.rating)}` : null)}
        ${row('Price', kit.price != null ? money(kit.price, kit.currency) : null)}
        ${row('Bought', kit.bought_at ? fmtDate(kit.bought_at, { day: 'numeric', month: 'long', year: 'numeric' }) : null)}
        ${row('Store', kit.store)}
        ${row('Added', fmtDate(kit.created_at.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }))}
      </dl>
      ${kit.notes ? html`<p class="gk-notes">${kit.notes}</p>` : ''}
    </section>

    <p style="text-align:center"><button class="btn" data-act="delete">${raw(icon('trash', 16))}Delete kit</button></p>
  `);
  fillImages(el, ctx);

  const status = (t) => { const s = el.querySelector('#gk-status'); if (s) s.textContent = t; };
  wire(el, {
    photos: async (input) => {
      const files = [...input.files].slice(0, room);
      input.value = '';
      if (!files.length) return;
      let photos = [...kit.photos]; let done = 0; const errs = [];
      for (const f of files) {
        status(`Adding ${done + 1} of ${files.length}…`);
        let saved = false;
        const path = `${kit.id}/${crypto.randomUUID()}.jpg`;
        try {
          const blob = await shrink(f);
          await ctx.store.update('gundam_kits', kit.id, { photos: [...photos, path] });   // checks limits first
          saved = true;
          await ctx.store.uploadPhoto(path, blob, BUCKET);
          photos = [...photos, path];
          photoUrl.set(path, { url: URL.createObjectURL(blob), at: Date.now() - 40 * 60 * 1000 });   // show it straight away
          done += 1;
        } catch (err) {
          if (saved) await ctx.store.update('gundam_kits', kit.id, { photos }).catch(() => {});
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
      await ctx.store.update('gundam_kits', kit.id, { photos: kit.photos.filter((p) => p !== path) });
      await ctx.store.removePhotos([path], BUCKET).catch((err) => console.warn('photo file', err));
      ctx.rerender();
    },
    delete: async () => {
      if (!confirm(`Delete ${kit.name}${kit.photos.length ? ' and its photos' : ''}? This can’t be undone.`)) return;
      await ctx.store.removePhotos(kit.photos, BUCKET).catch((err) => console.warn('photo cleanup', err));
      await ctx.store.remove('gundam_kits', kit.id);
      ctx.say(`Deleted ${kit.name}`);
      location.hash = '#/gundam';
    },
  });
  return undefined;
}

// ---------- add / edit ----------
function renderForm(el, ctx, kits, kit) {
  const k = kit || { origin: tab === 'third' ? 'third_party_copy' : 'official', grade: 'HG', status: 'unbuilt', currency: ctx.currency };
  const opt = (list, cur) => list.map(([v, l]) => html`<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`);
  const uniq = (key) => [...new Set(kits.map((x) => x[key]).filter(Boolean))].sort(sortByName);
  const currencies = CURRENCIES.includes(k.currency) ? CURRENCIES : [k.currency, ...CURRENCIES];
  const back = kit ? `#/gundam/${kit.id}` : '#/gundam';

  mount(el, html`
    <header class="page-head"><div><p><a href="${back}" class="text-btn">‹ ${kit ? kit.name : 'Gundam'}</a></p><h1>${kit ? 'Edit kit' : 'Add a kit'}</h1></div></header>
    <section class="card">
      <form data-form="save" class="form">
        <fieldset class="gk-origin-pick">
          <legend class="field">Who made it</legend>
          <div class="seg gk-origins" role="radiogroup">
            ${Object.entries(ORIGIN).map(([v, o]) => html`<label><input type="radio" name="origin" value="${v}" ${k.origin === v ? 'checked' : ''}><span>${o.long}</span></label>`)}
          </div>
          <p class="small faint">Copies are unlicensed reproductions of Bandai kits. Originals are third-party designs of their own.</p>
        </fieldset>
        <div class="fields">
          <label class="field" style="grid-column:1/-1">Name<input name="name" maxlength="200" required value="${k.name || ''}" placeholder="e.g. RX-78-2 Gundam Ver. 3.0" autocomplete="off"></label>
          <label class="field">Series<input name="series" maxlength="120" value="${k.series || ''}" list="gk-series" autocomplete="off"></label>
          <label class="field">Grade<select name="grade">${opt(GRADES.map((g) => [g, g]), k.grade)}</select></label>
          <label class="field">Scale<input name="scale" maxlength="20" value="${k.scale || ''}" placeholder="e.g. 1/100" autocomplete="off"></label>
          <label class="field">Brand<input name="brand" maxlength="120" value="${k.brand || ''}" list="gk-brands" placeholder="${k.origin === 'official' ? 'Bandai' : 'e.g. Motor Nuclear'}" autocomplete="off"></label>
          <label class="field">Status<select name="status">${opt(Object.entries(STATUS), k.status)}</select></label>
          <label class="field">Rating<select name="rating"><option value="">None</option>${opt([1, 2, 3, 4, 5].map((n) => [String(n), '★'.repeat(n)]), k.rating ? String(k.rating) : '')}</select></label>
          <label class="field">Price<input name="price" inputmode="decimal" value="${k.price ?? ''}" autocomplete="off"></label>
          <label class="field">Currency<select name="currency">${opt(currencies.map((c) => [c, c]), k.currency)}</select></label>
          <label class="field">Bought on<input name="bought_at" type="date" value="${k.bought_at || ''}" max="${today()}"></label>
          <label class="field">Store<input name="store" maxlength="120" value="${k.store || ''}" list="gk-stores" autocomplete="off"></label>
          <label class="field" style="grid-column:1/-1">Notes<textarea name="notes" maxlength="5000" rows="4">${k.notes || ''}</textarea></label>
        </div>
        <datalist id="gk-series">${uniq('series').map((s) => html`<option value="${s}">`)}</datalist>
        <datalist id="gk-brands">${uniq('brand').map((s) => html`<option value="${s}">`)}</datalist>
        <datalist id="gk-stores">${uniq('store').map((s) => html`<option value="${s}">`)}</datalist>
        <div class="row spread wrap">
          <a class="btn" href="${back}">Cancel</a>
          <button class="btn primary">${raw(icon('check', 18))}${kit ? 'Save' : 'Add kit'}</button>
        </div>
        ${kit ? '' : html`<p class="small faint">You can add photos once the kit is saved.</p>`}
      </form>
    </section>
  `);
  const f = el.querySelector('form').elements;
  el.querySelectorAll('input[name=origin]').forEach((r) => r.addEventListener('change', () => { f.brand.placeholder = r.value === 'official' ? 'Bandai' : 'e.g. Motor Nuclear'; }));

  wire(el, {
    save: async (v) => {
      const origin = ORIGIN[v.origin] ? v.origin : 'official';
      const price = v.price === '' ? null : cents(v.price);
      const row = {
        name: v.name.slice(0, 200),
        series: v.series || null,
        grade: GRADES.includes(v.grade) ? v.grade : 'HG',
        scale: v.scale || null,
        brand: v.brand || (origin === 'official' ? 'Bandai' : null),
        origin,
        status: STATUS[v.status] ? v.status : 'unbuilt',
        rating: v.rating ? Number(v.rating) : null,
        price,
        currency: /^[A-Z]{3}$/.test(v.currency) ? v.currency : ctx.currency,
        bought_at: v.bought_at || null,
        store: v.store || null,
        notes: v.notes || null,
      };
      if (kit) {
        await ctx.store.update('gundam_kits', kit.id, row);
        ctx.say('Saved');
        location.hash = `#/gundam/${kit.id}`;
      } else {
        const saved = await ctx.store.insert('gundam_kits', row);
        tab = origin === 'official' ? 'official' : 'third'; remember();
        ctx.say(`Added ${saved.name}`);
        location.hash = `#/gundam/${saved.id}`;
      }
    },
  });
  return undefined;
}
