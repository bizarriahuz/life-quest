import { html, raw, wire, mount, today, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { searchAlbums, lastfmEnabled, listening, cachedListening, checkUser } from '../music.js';

let tab = 'want';        // 'want' | 'listened'
let picked = null;       // album chosen from search

const stars = (a) => html`<span class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => html`
  <button class="star ${a.rating >= n ? 'on' : ''}" data-act="rate" data-id="${a.id}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`)}</span>`;
// Apple covers are stored large; thumbnails ask Apple for a 200px version (much faster).
const small = (url) => (url && url.includes('mzstatic.com') ? url.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, '/200x200bb.jpg') : url);
const art = (url, cls = '', eager = false) => (url ? html`<img class="album-art ${cls}" src="${small(url)}" alt="" ${eager ? '' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">` : html`<span class="album-art blank ${cls}">${raw(icon('music', 18))}</span>`);
const meta = (a) => [a.artist, a.year, a.tracks ? `${a.tracks} track${a.tracks === 1 ? '' : 's'}` : '', a.genre].filter(Boolean).join(' · ');
const pickCard = (p) => html`
  <div class="tmdb-pick">${art(p.art_url, 'sm')}
    <div class="grow"><p class="title">${p.title}</p><p class="sub">${meta(p)}</p></div>
    <button type="button" class="icon-btn" data-act="unpick" aria-label="Clear">${raw(icon('close', 18))}</button>
  </div>`;
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return fmtDate(new Date(ms).toLocaleDateString('en-CA'), { day: 'numeric', month: 'short' });
};
const spotify = (a) => `https://open.spotify.com/search/${encodeURIComponent(`${a.artist || ''} ${a.title}`.trim())}`;

export default {
  id: 'music',
  label: 'Music',
  async render(el, ctx) {
    const t = today();
    const lfmUser = ctx.profile?.lastfm_user || '';
    const all = await ctx.store.list('albums', { order: 'created_at', asc: true });
    const want = all.filter((a) => a.status === 'want');
    const done = all.filter((a) => a.status === 'listened')
      .sort((a, b) => (b.listened_on || '').localeCompare(a.listened_on || '') || b.created_at.localeCompare(a.created_at));
    const yearDone = done.filter((a) => (a.listened_on || '').startsWith(t.slice(0, 4))).length;
    const months = [];
    for (const a of done) {
      const m = (a.listened_on || '').slice(0, 7) || 'undated';
      if (months.at(-1)?.m !== m) months.push({ m, items: [] });
      months.at(-1).items.push(a);
    }
    const links = (a) => html`
      ${a.apple_url ? html`<a class="text-btn" href="${a.apple_url}" target="_blank" rel="noopener noreferrer">Open in Apple Music</a>` : ''}
      <a class="text-btn" href="${spotify(a)}" target="_blank" rel="noopener noreferrer">Find on Spotify</a>`;

    const wantRow = (a) => html`
      <li class="item wl-item">${art(a.art_url)}
        <div class="body"><p class="title">${a.title}</p><p class="sub">${meta(a)}</p>${a.note ? html`<p class="sub">${a.note}</p>` : ''}</div>
        <div class="wl-acts">
          <button class="btn sm" data-act="listened" data-id="${a.id}">${raw(icon('check', 14))}Listened</button>
          <details class="more"><summary class="icon-btn" aria-label="More for ${a.title}">⋯</summary>
            <div class="more-menu">${links(a)}<button class="text-btn" data-act="delete" data-id="${a.id}">Delete</button></div></details>
        </div>
      </li>`;
    const doneRow = (a) => html`
      <li class="item wl-item">${art(a.art_url)}
        <div class="body"><p class="title">${a.title}</p><p class="sub">${meta(a)}</p>
          <label class="wl-date"><span>Listened</span><input type="date" value="${a.listened_on || ''}" max="${t}" data-change="setdate" data-id="${a.id}" aria-label="Date you listened to ${a.title}"></label>
          ${a.note ? html`<p class="sub">${a.note}</p>` : ''}</div>
        <div class="wl-acts">${stars(a)}
          <details class="more"><summary class="icon-btn" aria-label="More for ${a.title}">⋯</summary>
            <div class="more-menu"><button class="text-btn" data-act="requeue" data-id="${a.id}">Move to Want to listen</button>${links(a)}<button class="text-btn" data-act="delete" data-id="${a.id}">Delete</button></div></details>
        </div>
      </li>`;

    mount(el, html`
      <header class="page-head"><div><h1>Music</h1><p>${want.length} to listen · ${yearDone} album${yearDone === 1 ? '' : 's'} this year</p></div></header>

      ${lastfmEnabled ? html`
        <section class="card lfm" id="lfm">
          ${lfmUser ? html`<div class="card-head"><h2>Listening</h2><span class="meta">Last.fm · ${lfmUser}</span></div><p class="small muted">Loading your plays…</p>` : html`
            <div class="card-head"><h2>Connect Last.fm</h2></div>
            <p class="small muted" style="margin-bottom:10px">See what you’ve been playing, your top albums this week and top artists this month. Connect Spotify or Apple Music to Last.fm so it records your plays.</p>
            <form data-form="lfmuser" class="row">
              <input name="user" maxlength="15" placeholder="Last.fm username" required aria-label="Last.fm username" class="grow" autocomplete="off" autocapitalize="none" spellcheck="false">
              <button class="btn">Connect</button>
            </form>`}
        </section>` : ''}

      <div class="seg wl-tabs" role="radiogroup" aria-label="List">
        <label><input type="radio" name="mtab" value="want" data-change="tab" ${tab === 'want' ? 'checked' : ''}><span>Want to listen <b>${want.length}</b></span></label>
        <label><input type="radio" name="mtab" value="listened" data-change="tab" ${tab === 'listened' ? 'checked' : ''}><span>Listened <b>${done.length}</b></span></label>
      </div>

      <section class="card">
        <form data-form="add" class="form">
          <div class="tmdb-search">
            <input name="title" maxlength="200" placeholder="Search albums or artists" required aria-label="Album" autocomplete="off" value="${picked?.title || ''}">
            <div class="tmdb-results" id="album-results" role="listbox" aria-label="Search results" hidden></div>
          </div>
          <div id="album-picked">${picked ? pickCard(picked) : ''}</div>
          <input name="artist" maxlength="200" placeholder="Artist" aria-label="Artist" value="${picked?.artist || ''}" ${picked ? 'hidden' : ''}>
          <div class="row wrap">
            <div class="seg" role="radiogroup" aria-label="Add to">
              <label><input type="radio" name="list" value="want" data-change="listmode" ${tab === 'want' ? 'checked' : ''}><span>Want to listen</span></label>
              <label><input type="radio" name="list" value="listened" data-change="listmode" ${tab === 'listened' ? 'checked' : ''}><span>Already listened</span></label>
            </div>
            <label class="row wl-when" ${tab === 'listened' ? '' : 'hidden'}><span class="small muted">on</span><input type="date" name="listened_on" value="${t}" max="${t}" aria-label="Date listened" style="width:auto"></label>
          </div>
          <input name="note" maxlength="200" placeholder="Note (optional), e.g. who recommended it" aria-label="Note">
          <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Add</button></div>
        </form>
      </section>

      ${tab === 'want' ? html`
        <section class="card">${want.length ? html`<ul class="list">${want.map(wantRow)}</ul>` : empty('Nothing on your list. Search above to add an album.')}</section>` : html`
        ${months.length ? months.map((g) => html`
          <section class="card">
            <div class="card-head"><h2>${g.m === 'undated' ? 'No date' : fmtDate(`${g.m}-01`, { month: 'long', year: 'numeric' })}</h2><span class="meta">${g.items.length}</span></div>
            <ul class="list">${g.items.map(doneRow)}</ul>
          </section>`) : html`<section class="card">${empty('Nothing here yet. Tap Listened on an album, or add one as Already listened.')}</section>`}`}

      <p class="small faint tmdb-credit">Album search by Apple Music and MusicBrainz${lastfmEnabled ? ', listening data from Last.fm' : ''}.</p>
    `);
    const fixImgs = (root) => root.querySelectorAll('img.album-art').forEach((img) => img.addEventListener('error', () => img.replaceWith(Object.assign(document.createElement('span'), { className: `album-art blank ${img.classList.contains('sm') ? 'sm' : ''}`, innerHTML: icon('music', 18) })), { once: true }));
    fixImgs(el);

    // ---- Last.fm panel, filled in after the page shows ----
    const box = el.querySelector('#lfm');
    if (lastfmEnabled && lfmUser) {
      const paint = (d) => {
        const top = d.artists[0]?.plays || 1;
        const now = d.tracks[0];
        box.innerHTML = html`
          <div class="card-head"><h2>Listening</h2><span class="meta">Last.fm · ${lfmUser}</span></div>
          ${now ? html`<div class="np">${art(now.art, '', true)}<div class="grow"><p class="small muted">${now.now ? 'Now playing' : `Last played ${ago(now.at)}`}</p><p class="title">${now.name}</p><p class="sub">${now.artist}${now.album ? ` · ${now.album}` : ''}</p></div>${now.now ? html`<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>` : ''}</div>` : html`<p class="small muted">No plays yet. Once Spotify or Apple Music is connected to Last.fm, they show up here.</p>`}
          <div class="kpis"><div class="kpi"><b>${d.weekPlays.toLocaleString()}</b><span>Plays, 7 days</span></div><div class="kpi"><b>${d.total.toLocaleString()}</b><span>All-time plays</span></div></div>
          ${d.albums.length ? html`<p class="small muted list-head">Top albums ${d.albumsPeriod}</p>
            <div class="album-grid">${d.albums.map((a) => html`<div class="ag">${art(a.art, '', true)}<p class="ag-t">${a.name}</p><p class="ag-s">${a.artist} · ${a.plays} play${a.plays === 1 ? '' : 's'}</p></div>`)}</div>` : ''}
          ${d.artists.length ? html`<p class="small muted list-head">Top artists ${d.artistsPeriod}</p>
            <ul class="list top-artists">${d.artists.map((a) => html`<li class="item"><div class="body"><p class="title">${a.name}</p><div class="bar"><i style="width:${(a.plays / top) * 100}%"></i></div></div><span class="small muted num">${a.plays}</span></li>`)}</ul>` : ''}
          ${d.tracks.length > 1 ? html`<details><summary class="small muted" style="font-weight:500">Recent plays</summary><ul class="list">${d.tracks.slice(now?.now ? 1 : 0).map((tr) => html`<li class="item"><div class="body"><p class="title">${tr.name}</p><p class="sub">${tr.artist}${tr.at ? ` · ${ago(tr.at)}` : ''}</p></div></li>`)}</ul></details>` : ''}
          <p class="small"><button class="text-btn" data-act="lfmoff">Disconnect Last.fm</button></p>`.s;
        fixImgs(box);
      };
      const snap = cachedListening(lfmUser);
      if (snap) paint(snap);
      listening(lfmUser).then((d) => { if (JSON.stringify(d) !== JSON.stringify(snap)) paint(d); }).catch((e) => {
        if (snap) return; // keep showing the last snapshot
        box.innerHTML = html`<div class="card-head"><h2>Listening</h2><span class="meta">Last.fm · ${lfmUser}</span></div>
          <p class="small muted">${e.message || 'Couldn’t reach Last.fm'}.</p>
          <p class="small" style="margin-top:8px"><button class="text-btn" data-act="lfmoff">Change username</button></p>`.s;
      });
    }

    // ---- album search ----
    const form = el.querySelector('form[data-form=add]');
    const input = form.elements.title;
    const results = el.querySelector('#album-results');
    const pickedBox = el.querySelector('#album-picked');
    let hits = []; let timer; let seq = 0;
    const close = () => { results.hidden = true; results.innerHTML = ''; };
    const choose = (a) => {
      close(); picked = a;
      input.value = a.title;
      form.elements.artist.value = a.artist || ''; form.elements.artist.hidden = true;
      pickedBox.innerHTML = pickCard(a).s; fixImgs(pickedBox);
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      if (picked && input.value.trim() !== picked.title) { picked = null; pickedBox.innerHTML = ''; form.elements.artist.hidden = false; }
      const q = input.value.trim();
      if (q.length < 2) { close(); return; }
      const my = ++seq;
      timer = setTimeout(async () => {
        try {
          hits = await searchAlbums(q);
          if (my !== seq) return;
          results.innerHTML = hits.length ? hits.map((a, i) => html`
            <button type="button" class="tmdb-hit" role="option" data-act="pick" data-i="${i}">
              ${a.art_url ? html`<img src="${a.art_url.replace('600x600', '100x100')}" loading="lazy" alt="" referrerpolicy="no-referrer" class="sq">` : html`<span class="tmdb-noimg sq"></span>`}
              <span class="grow"><span class="t">${a.title}</span><span class="s">${[a.artist, a.year].filter(Boolean).join(' · ')}</span></span>
            </button>`).map(String).join('') : html`<p class="small muted" style="padding:10px 12px">No matches. Add the artist below and press Add.</p>`.s;
          results.hidden = false;
        } catch (e) { if (my === seq) { close(); ctx.say(e.message); } }
      }, 350);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    el.addEventListener('click', (e) => { if (!e.target.closest('.tmdb-search')) close(); });

    const item = (id) => all.find((a) => a.id === id);
    wire(el, {
      pick: (b) => choose(hits[+b.dataset.i]),
      unpick: () => { picked = null; pickedBox.innerHTML = ''; input.value = ''; form.elements.artist.hidden = false; form.elements.artist.value = ''; input.focus(); },
      tab: (r) => { tab = r.value === 'listened' ? 'listened' : 'want'; ctx.rerender(); },
      listmode: (r) => { el.querySelector('.wl-when').hidden = r.value !== 'listened'; },
      add: async (v, f) => {
        const p = picked && v.title === picked.title ? picked : null;
        if (p?.itunes_id && all.some((a) => a.itunes_id === p.itunes_id)) { ctx.say(`${p.title} is already on your list`); return; }
        const seen = v.list === 'listened';
        const row = await ctx.store.insert('albums', {
          ...(p || {}), title: v.title, artist: p?.artist || v.artist || null, note: v.note || null,
          status: seen ? 'listened' : 'want', listened_on: seen ? (v.listened_on && v.listened_on <= t ? v.listened_on : t) : null,
        });
        picked = null; f.reset(); pickedBox.innerHTML = ''; form.elements.artist.hidden = false;
        tab = seen ? 'listened' : 'want';
        if (seen) await ctx.award('CHA', XP.listened, 'listened', row.id, `Listened to ${row.title}`);
        else ctx.say(`${row.title} added to Want to listen`);
        ctx.rerender();
      },
      listened: async (b) => {
        const a = item(b.dataset.id);
        await ctx.store.update('albums', a.id, { status: 'listened', listened_on: t });
        await ctx.award('CHA', XP.listened, 'listened', a.id, `Listened to ${a.title}`);
        ctx.rerender();
      },
      requeue: async (b) => {
        await ctx.store.update('albums', b.dataset.id, { status: 'want', listened_on: null, rating: null });
        await ctx.revoke('listened', b.dataset.id);
        ctx.rerender();
      },
      setdate: async (inp) => {
        const d = inp.value;
        if (!d || d > t) { ctx.say('Pick a date up to today'); inp.value = item(inp.dataset.id).listened_on || t; return; }
        await ctx.store.update('albums', inp.dataset.id, { listened_on: d });
        ctx.say(`Date set to ${fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' })}`);
        ctx.rerender();
      },
      rate: async (b) => {
        const a = item(b.dataset.id); const n = +b.dataset.n;
        await ctx.store.update('albums', a.id, { rating: a.rating === n ? null : n });
        ctx.rerender();
      },
      delete: async (b) => {
        const a = item(b.dataset.id);
        if (!confirm(`Delete "${a.title}"?`)) return;
        await ctx.store.remove('albums', a.id);
        await ctx.revoke('listened', a.id);
        ctx.rerender();
      },
      lfmuser: async (v) => {
        const user = v.user.trim();
        if (!/^[A-Za-z][A-Za-z0-9_-]{1,14}$/.test(user)) { ctx.say('That doesn’t look like a Last.fm username'); return; }
        await checkUser(user);
        await ctx.setProfile({ lastfm_user: user });
        ctx.say(`Connected to ${user}`);
        ctx.rerender();
      },
      lfmoff: async () => {
        await ctx.setProfile({ lastfm_user: null });
        ctx.rerender();
      },
    });
  },
};
