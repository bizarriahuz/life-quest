import { html, raw, wire, mount, today, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { tmdbEnabled, search, findByImdb, imdbIdFrom, details, providers } from '../tmdb.js';

const KIND = { film: 'Film', series: 'Series', anime: 'Anime', documentary: 'Documentary', other: 'Other' };
const EPISODIC = new Set(['series', 'anime', 'documentary']);
export const epLabel = (w) => (w.episode ? `S${w.season || 1} E${w.episode}` : '');
let filter = 'all';
let picked = null;       // TMDB details chosen in the add form
let tab = 'want';        // 'want' | 'watched'

const stars = (w) => html`<span class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => html`
  <button class="star ${w.rating >= n ? 'on' : ''}" data-act="rate" data-id="${w.id}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`)}</span>`;
const thumb = (url) => (url ? html`<img class="cover sm" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '');
const pickCard = (p) => html`
  <div class="tmdb-pick">
    ${thumb(p.poster_url)}
    <div class="grow"><p class="title">${p.title}${p.year ? html` <span class="muted">(${p.year})</span>` : ''}</p>
      <p class="sub">${KIND[p.kind]}${p.details ? ` · ${p.details}` : ''}</p></div>
    <button type="button" class="icon-btn" data-act="unpick" aria-label="Clear">${raw(icon('close', 18))}</button>
  </div>`;

export default {
  id: 'watchlist',
  label: 'Watchlist',
  async render(el, ctx) {
    const t = today();
    const all = await ctx.store.list('watchlist', { order: 'created_at', asc: true });
    const kinds = [...new Set(all.map((w) => w.kind))];
    if (filter !== 'all' && !kinds.includes(filter)) filter = 'all';
    const shown = all.filter((w) => filter === 'all' || w.kind === filter);
    const want = shown.filter((w) => w.status !== 'done')
      .sort((a, b) => (a.status === 'watching' ? 0 : 1) - (b.status === 'watching' ? 0 : 1) || a.created_at.localeCompare(b.created_at));
    const watched = shown.filter((w) => w.status === 'done')
      .sort((a, b) => (b.done_on || '').localeCompare(a.done_on || '') || b.created_at.localeCompare(a.created_at));
    const wantAll = all.filter((w) => w.status !== 'done').length;
    const watchedAll = all.length - wantAll;
    const yearDone = all.filter((w) => w.status === 'done' && (w.done_on || '').startsWith(t.slice(0, 4))).length;
    const months = [];
    for (const w of watched) {
      const m = (w.done_on || '').slice(0, 7) || 'undated';
      if (months.at(-1)?.m !== m) months.push({ m, items: [] });
      months.at(-1).items.push(w);
    }
    const links = (w) => html`
      ${w.imdb_id ? html`<a class="text-btn" href="https://www.imdb.com/title/${w.imdb_id}/" target="_blank" rel="noopener noreferrer">Open on IMDb</a>` : ''}
      ${w.tmdb_id ? html`<a class="text-btn" href="https://www.themoviedb.org/${w.tmdb_type}/${w.tmdb_id}" target="_blank" rel="noopener noreferrer">Open on TMDB</a>` : ''}
      ${tmdbEnabled && !w.tmdb_id ? html`<button class="text-btn" data-act="match" data-id="${w.id}">Find poster &amp; details</button>` : ''}`;
    const title = (w) => html`<p class="title"><span class="pill">${KIND[w.kind]}</span>${w.status === 'watching' ? html`<span class="pill solid">Watching</span>` : ''}${w.title}${w.year ? html` <span class="muted">${w.year}</span>` : ''}</p>`;

    const wantRow = (w) => html`
      <li class="item wl-item">
        ${thumb(w.poster_url)}
        <div class="body">${title(w)}
          ${w.details ? html`<p class="sub">${w.details}</p>` : ''}
          ${EPISODIC.has(w.kind) ? html`<div class="ep-track" role="group" aria-label="Episode you’re up to">
            <label class="ep-s">Season <input type="number" inputmode="numeric" min="1" max="200" value="${w.season || 1}" data-change="season" data-id="${w.id}" aria-label="Season"></label>
            <span class="ep-e">
              <button type="button" class="icon-btn" data-act="epdown" data-id="${w.id}" aria-label="Previous episode" ${w.episode ? '' : 'disabled'}>−</button>
              <span>Episode <b>${w.episode || 0}</b></span>
              <button type="button" class="icon-btn ep-plus" data-act="epup" data-id="${w.id}" aria-label="Watched next episode">+</button>
            </span>
          </div>` : ''}
          ${w.note ? html`<p class="sub">${w.note}</p>` : ''}
          ${tmdbEnabled && w.tmdb_id ? html`<p class="sub wtw" data-wtw="${w.tmdb_type}:${w.tmdb_id}"></p>` : ''}
          ${w.overview ? html`<p class="sub ov">${w.overview}</p>` : ''}
        </div>
        <div class="wl-acts">
          <button class="btn sm ${w.status === 'watching' ? 'primary' : ''}" data-act="finish" data-id="${w.id}">${raw(icon('check', 14))}Watched</button>
          <details class="more"><summary class="icon-btn" aria-label="More for ${w.title}">⋯</summary>
            <div class="more-menu">
              <button class="text-btn" data-act="start" data-id="${w.id}">${w.status === 'watching' ? 'Not watching yet' : 'Watching now'}</button>
              ${links(w)}
              <button class="text-btn" data-act="delete" data-id="${w.id}">Delete</button>
            </div></details>
        </div>
      </li>`;

    const watchedRow = (w) => html`
      <li class="item wl-item">
        ${thumb(w.poster_url)}
        <div class="body">${title(w)}
          ${epLabel(w) ? html`<p class="sub">Up to ${epLabel(w)}</p>` : ''}
          <label class="wl-date"><span>Watched</span><input type="date" value="${w.done_on || ''}" max="${t}" data-change="setdate" data-id="${w.id}" aria-label="Date you watched ${w.title}"></label>
          ${w.note ? html`<p class="sub">${w.note}</p>` : ''}
        </div>
        <div class="wl-acts">
          ${stars(w)}
          <details class="more"><summary class="icon-btn" aria-label="More for ${w.title}">⋯</summary>
            <div class="more-menu">
              <button class="text-btn" data-act="requeue" data-id="${w.id}">Move to Want to watch</button>
              ${links(w)}
              <button class="text-btn" data-act="delete" data-id="${w.id}">Delete</button>
            </div></details>
        </div>
      </li>`;

    mount(el, html`
      <header class="page-head"><div><h1>Watchlist</h1><p>${wantAll} to watch · ${yearDone} watched this year</p></div></header>

      <div class="seg wl-tabs" role="radiogroup" aria-label="List">
        <label><input type="radio" name="wtab" value="want" data-change="tab" ${tab === 'want' ? 'checked' : ''}><span>Want to watch <b>${wantAll}</b></span></label>
        <label><input type="radio" name="wtab" value="watched" data-change="tab" ${tab === 'watched' ? 'checked' : ''}><span>Watched <b>${watchedAll}</b></span></label>
      </div>

      <section class="card">
        <form data-form="add" class="form">
          <div class="tmdb-search">
            <input name="title" maxlength="200" placeholder="${tmdbEnabled ? 'Search, or paste an IMDb link' : 'Add a film or series…'}" required aria-label="Title" autocomplete="off" value="${picked?.title || ''}">
            <div class="tmdb-results" id="tmdb-results" role="listbox" aria-label="Search results" hidden></div>
          </div>
          <div id="tmdb-picked">${picked ? pickCard(picked) : ''}</div>
          <div class="row wrap spread">
            <div class="seg" role="radiogroup" aria-label="Type">
              ${Object.entries(KIND).map(([k, l]) => html`<label><input type="radio" name="kind" value="${k}" ${(picked?.kind || 'film') === k ? 'checked' : ''}><span>${l}</span></label>`)}
            </div>
          </div>
          <div class="row wrap">
            <div class="seg" role="radiogroup" aria-label="Add to">
              <label><input type="radio" name="list" value="want" data-change="listmode" ${tab === 'want' ? 'checked' : ''}><span>Want to watch</span></label>
              <label><input type="radio" name="list" value="watched" data-change="listmode" ${tab === 'watched' ? 'checked' : ''}><span>Already watched</span></label>
            </div>
            <label class="row wl-when" ${tab === 'watched' ? '' : 'hidden'}><span class="small muted">on</span><input type="date" name="done_on" value="${t}" max="${t}" aria-label="Date watched" style="width:auto"></label>
          </div>
          <input name="note" maxlength="200" placeholder="Note (optional), e.g. who recommended it" aria-label="Note">
          <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Add</button></div>
        </form>
      </section>

      ${kinds.length > 1 ? html`
        <div class="seg filter" role="radiogroup" aria-label="Show">
          ${['all', ...kinds].map((k) => html`<label><input type="radio" name="wf" value="${k}" data-change="filter" ${filter === k ? 'checked' : ''}><span>${k === 'all' ? 'All' : KIND[k]}</span></label>`)}
        </div>` : ''}


      ${tab === 'want' ? html`
        <section class="card">
          ${want.length ? html`<ul class="list">${want.map(wantRow)}</ul>` : empty(filter === 'all' ? 'Nothing on your list. Search above to add something.' : 'Nothing of this type on your list.')}
        </section>` : html`
        ${months.length ? months.map((g) => html`
          <section class="card">
            <div class="card-head"><h2>${g.m === 'undated' ? 'No date' : fmtDate(`${g.m}-01`, { month: 'long', year: 'numeric' })}</h2><span class="meta">${g.items.length}</span></div>
            <ul class="list">${g.items.map(watchedRow)}</ul>
          </section>`) : html`<section class="card">${empty('Nothing watched yet. Tap Watched on a title, or add one as Already watched.')}</section>`}`}

      ${tmdbEnabled ? html`<p class="small faint tmdb-credit">Film and TV data from <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer"><u>TMDB</u></a>, where to watch from JustWatch. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>` : ''}
    `);
    el.querySelectorAll('img.cover').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));

    // ---- where to watch (Singapore), filled in after the page shows ----
    if (tmdbEnabled) {
      for (const p of el.querySelectorAll('[data-wtw]')) {
        const [type, id] = p.dataset.wtw.split(':');
        providers(type, id).then((v) => {
          if (v.stream.length) p.innerHTML = html`<span class="wtw-label">Watch on</span> ${v.stream.slice(0, 4).join(', ')}`.s;
          else if (v.rent.length || v.buy.length) p.textContent = `Rent or buy on ${[...new Set([...v.rent, ...v.buy])].slice(0, 3).join(', ')}`;
          else p.textContent = 'Not streaming in Singapore right now';
        }).catch(() => p.remove());
      }
    }

    // ---- live search in the add form ----
    const form = el.querySelector('form[data-form=add]');
    const input = form.elements.title;
    const box = el.querySelector('#tmdb-results');
    const pickedBox = el.querySelector('#tmdb-picked');
    let results = [];
    let timer; let seq = 0;
    const close = () => { box.hidden = true; box.innerHTML = ''; };
    const choose = async (r) => {
      close();
      input.value = r.title;
      pickedBox.innerHTML = html`<p class="small muted">Getting details…</p>`.s;
      try { picked = await details(r.type, r.id); } catch (e) { picked = null; pickedBox.innerHTML = ''; ctx.say(e.message); return; }
      input.value = picked.title;
      pickedBox.innerHTML = pickCard(picked).s;
      const radio = form.querySelector(`input[name=kind][value=${picked.kind}]`);
      if (radio) radio.checked = true;
      el.querySelectorAll('#tmdb-picked img.cover').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
    };
    if (tmdbEnabled) {
      input.addEventListener('input', () => {
        clearTimeout(timer);
        if (picked && input.value.trim() !== picked.title) { picked = null; pickedBox.innerHTML = ''; }
        const q = input.value.trim();
        const tt = imdbIdFrom(q);
        if (q.length < 2) { close(); return; }
        const my = ++seq;
        timer = setTimeout(async () => {
          try {
            if (tt) {
              const r = await findByImdb(tt);
              if (my !== seq) return;
              if (r) await choose(r); else ctx.say('No match for that IMDb code');
              return;
            }
            results = await search(q);
            if (my !== seq) return;
            box.innerHTML = results.length ? results.map((r, i) => html`
              <button type="button" class="tmdb-hit" role="option" data-act="pick" data-i="${i}">
                ${r.poster ? html`<img src="${r.poster}" alt="" referrerpolicy="no-referrer">` : html`<span class="tmdb-noimg"></span>`}
                <span class="grow"><span class="t">${r.title}</span><span class="s">${r.type === 'tv' ? 'Series' : 'Film'}${r.year ? ` · ${r.year}` : ''}</span></span>
              </button>`).map(String).join('') : html`<p class="small muted" style="padding:10px 12px">No matches. Press Add to save it as typed.</p>`.s;
            box.hidden = false;
          } catch (e) { if (my === seq) { close(); ctx.say(e.message); } }
        }, tt ? 50 : 350);
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      el.addEventListener('click', (e) => { if (!e.target.closest('.tmdb-search')) close(); });
    }

    const item = (id) => all.find((w) => w.id === id);
    wire(el, {
      pick: (b) => choose(results[+b.dataset.i]),
      unpick: () => { picked = null; pickedBox.innerHTML = ''; input.value = ''; input.focus(); },
      add: async (v, f) => {
        const kind = KIND[v.kind] ? v.kind : 'film';
        const meta = picked && v.title === picked.title ? picked : null;
        if (meta?.tmdb_id && all.some((w) => w.tmdb_id === meta.tmdb_id && w.tmdb_type === meta.tmdb_type)) {
          ctx.say(`${meta.title} is already on your list`); return;
        }
        const seen = v.list === 'watched';
        const day = seen ? (v.done_on && v.done_on <= t ? v.done_on : t) : null;
        const row = await ctx.store.insert('watchlist', { ...(meta || {}), title: v.title, kind, note: v.note || null,
          status: seen ? 'done' : 'queued', done_on: day });
        picked = null;
        f.reset(); pickedBox.innerHTML = '';
        tab = seen ? 'watched' : 'want';
        if (seen) await ctx.award('CHA', XP.watched, 'watched', row.id, `Watched ${v.title}`);
        else ctx.say(`${v.title} added to Want to watch`);
        ctx.rerender();
      },
      match: async (b) => {
        const w = item(b.dataset.id);
        const hits = await search(w.title);
        const want = w.kind === 'film' ? 'movie' : w.kind === 'other' ? null : 'tv';
        const hit = hits.find((h) => !want || h.type === want) || hits[0];
        if (!hit) { ctx.say(`Couldn’t find “${w.title}” on TMDB`); return; }
        const d = await details(hit.type, hit.id);
        await ctx.store.update('watchlist', w.id, { ...d, title: w.title, kind: w.kind });
        ctx.say(`Matched to ${d.title}${d.year ? ` (${d.year})` : ''}`);
        ctx.rerender();
      },
      filter: (r) => { filter = r.value; ctx.rerender(); },
      tab: (r) => { tab = r.value === 'watched' ? 'watched' : 'want'; ctx.rerender(); },
      listmode: (r) => { el.querySelector('.wl-when').hidden = r.value !== 'watched'; },
      setdate: async (inp) => {
        const d = inp.value;
        if (!d || d > t) { ctx.say('Pick a date up to today'); inp.value = item(inp.dataset.id).done_on || t; return; }
        await ctx.store.update('watchlist', inp.dataset.id, { done_on: d });
        ctx.say(`Date set to ${fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' })}`);
        ctx.rerender();
      },
      epup: async (b) => {
        const w = item(b.dataset.id);
        const patch = { episode: Math.min(5000, (w.episode || 0) + 1), season: w.season || 1 };
        if (w.status === 'queued') patch.status = 'watching';            // ticking an episode means you've started
        await ctx.store.update('watchlist', w.id, patch);
        ctx.say(`${w.title}: up to S${patch.season} E${patch.episode}`);
        ctx.rerender();
      },
      epdown: async (b) => {
        const w = item(b.dataset.id);
        await ctx.store.update('watchlist', w.id, { episode: Math.max(0, (w.episode || 0) - 1) || null });
        ctx.rerender();
      },
      season: async (inp) => {
        const w = item(inp.dataset.id);
        const s = Math.max(1, Math.min(200, Math.round(Number(inp.value)) || 1));
        if (s === (w.season || 1)) { inp.value = s; return; }
        // A new season starts again from episode 0.
        await ctx.store.update('watchlist', w.id, { season: s, episode: null, ...(w.status === 'queued' ? { status: 'watching' } : {}) });
        ctx.say(`${w.title}: season ${s}`);
        ctx.rerender();
      },
      start: async (b) => { const w = item(b.dataset.id); await ctx.store.update('watchlist', w.id, { status: w.status === 'watching' ? 'queued' : 'watching' }); ctx.rerender(); },
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
