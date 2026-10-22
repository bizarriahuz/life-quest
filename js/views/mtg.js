import { html, raw, wire, mount, today, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { parseDecklist, lookupCard, analyse, cardKey, bracketOf } from '../mtg.js';
import renderLife, { hasLiveGame } from './mtglife.js';

const FORMATS = { commander: 'Commander', standard: 'Standard', modern: 'Modern', pioneer: 'Pioneer', pauper: 'Pauper', limited: 'Limited', other: 'Other' };
const RESULT = { win: 'Win', loss: 'Loss', draw: 'Draw' };
const pips = (colors) => html`<span class="pips" aria-label="Colours: ${colors || 'colourless'}">${(colors || 'C').split('').map((c) => html`<i class="pip pip-${c}">${c}</i>`)}</span>`;

let openId = null;       // deck being viewed
let editing = false;     // decklist editor open
const analysis = new Map(); // deck id -> result (this session)
const tried = new Set();      // decks we've already fetched prices for (this session)
let hand = null;              // sample hand: { deckId, library, hand, mull }
let upEditing = false;        // upgrades list editor open
const upAnalysis = new Map(); // deck id -> priced upgrades
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const upParse = (t) => parseDecklist(String(t || '').split('\n').map((l) => (!l.trim() || /^\s*\d/.test(l) ? l : `1 ${l.trim()}`)).join('\n'), '');
const pct = (w, n) => (n ? `${Math.round((w / n) * 100)}%` : '–');
const oppNames = (s) => String(s || '').split(',').map((x) => x.replace(/\(.*\)/, '').trim()).filter(Boolean);
const usd = (n) => (n == null ? '–' : `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()}`);

export default {
  id: 'mtg',
  label: 'MTG',
  async render(el, ctx) {
    if (/^#\/mtg\/life/.test(location.hash)) return renderLife(el, ctx);
    document.body.classList.remove('lc-on');
    const t = today();
    const [decks, matches] = await Promise.all([
      ctx.store.list('mtg_decks', { order: 'created_at', asc: true }),
      ctx.store.list('mtg_matches', { order: 'played_on' }),
    ]);
    matches.sort((a, b) => b.played_on.localeCompare(a.played_on) || b.created_at.localeCompare(a.created_at));
    const rec = (id) => {
      const m = id ? matches.filter((x) => x.deck_id === id) : matches;
      const w = m.filter((x) => x.result === 'win').length;
      return { n: m.length, w, l: m.filter((x) => x.result === 'loss').length, d: m.filter((x) => x.result === 'draw').length, pct: m.length ? Math.round((w / m.length) * 100) : null };
    };
    const live = decks.filter((d) => !d.retired);
    const retired = decks.filter((d) => d.retired);
    const deck = decks.find((d) => d.id === openId) || null;
    if (!deck) { openId = null; editing = false; }
    const nameOf = Object.fromEntries(decks.map((d) => [d.id, d.name]));
    const all = rec();
    const parsed = deck?.decklist ? parseDecklist(deck.decklist, deck.format) : null;
    const an = deck ? analysis.get(deck.id) : null;

    const deckTile = (d) => {
      const r = rec(d.id);
      return html`
        <button class="deck ${d.id === openId ? 'sel' : ''}" data-act="open" data-id="${d.id}">
          ${d.art_url ? html`<img src="${d.art_url}" alt="" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="deck-blank">${raw(icon('mtg', 28))}</span>`}
          <span class="deck-body">
            <span class="deck-name">${d.name}</span>
            <span class="deck-sub">${pips(d.colors)}<span>${r.n ? `${r.w}–${r.l}${r.d ? `–${r.d}` : ''} · ${r.pct}%` : FORMATS[d.format]}</span></span>
          </span>
        </button>`;
    };

    const gameSub = (m) => [relDate(m.played_on), m.opponents ? `vs ${oppNames(m.opponents).join(', ')}` : '', m.went_first === true ? 'went first' : '',
      m.turns ? `${m.turns} turns` : '', m.note || ''].filter(Boolean).join(' · ');
    // Insights: win rate by table size, going first, and against each opponent.
    const insights = (list) => {
      if (list.length < 2) return '';
      const wins = (a) => a.filter((m) => m.result === 'win').length;
      const sizes = [...new Set(list.map((m) => m.players))].sort();
      const first = list.filter((m) => m.went_first === true); const later = list.filter((m) => m.went_first === false);
      const opp = {};
      for (const m of list) for (const o of oppNames(m.opponents)) { const k = o.toLowerCase(); (opp[k] ||= { name: o, n: 0, w: 0 }); opp[k].n += 1; if (m.result === 'win') opp[k].w += 1; }
      const opps = Object.values(opp).sort((a, b) => b.n - a.n).slice(0, 6);
      const tl = list.filter((m) => m.turns);
      return html`<div class="mtg-insights">
        <div class="ins-row"><span class="small muted">By table size</span>${sizes.map((n) => { const a = list.filter((m) => m.players === n); return html`<span class="ins-chip">${n}p <b>${pct(wins(a), a.length)}</b> <i>${a.length}</i></span>`; })}</div>
        ${first.length || later.length ? html`<div class="ins-row"><span class="small muted">Turn order</span><span class="ins-chip">Going first <b>${pct(wins(first), first.length)}</b> <i>${first.length}</i></span><span class="ins-chip">Later <b>${pct(wins(later), later.length)}</b> <i>${later.length}</i></span></div>` : ''}
        ${opps.length ? html`<div class="ins-row"><span class="small muted">Against</span>${opps.map((o) => html`<span class="ins-chip">${o.name} <b>${o.w}–${o.n - o.w}</b></span>`)}</div>` : ''}
        ${tl.length ? html`<p class="small muted">Games last ${Math.round(tl.reduce((n, m) => n + m.turns, 0) / tl.length)} turns on average</p>` : ''}
      </div>`;
    };
    const curve = (a) => {
      const max = Math.max(1, ...a.curve);
      return html`<div class="chart curve" role="img" aria-label="Mana curve">
        ${a.curve.map((n, i) => html`<div class="col"><span class="v">${n || ''}</span><div class="b"><i style="height:${(n / max) * 100}%"></i></div><span class="d">${i === 7 ? '7+' : i}</span></div>`)}
      </div>`;
    };

    mount(el, html`
      <header class="page-head"><div><h1>MTG</h1><p>${live.length} deck${live.length === 1 ? '' : 's'}${all.n ? ` · ${all.n} games · ${all.pct}% wins` : ''}</p></div>
        <a class="btn ${hasLiveGame() ? 'primary' : ''} sm" href="#/mtg/life">${raw(icon('heart', 16))}${hasLiveGame() ? 'Back to the game' : 'Life counter'}</a></header>

      ${live.length ? html`
        <section class="card">
          <div class="card-head"><h2>Log a game</h2></div>
          <form data-form="log" class="form">
            <div class="fields">
              <label class="field">Deck<select name="deck_id">${live.map((d) => html`<option value="${d.id}" ${d.id === openId ? 'selected' : ''}>${d.name}</option>`)}</select></label>
              <label class="field">Players<select name="players">${[2, 3, 4, 5, 6].map((n) => html`<option value="${n}" ${n === (deck?.format === 'commander' || !deck ? 4 : 2) ? 'selected' : ''}>${n}</option>`)}</select></label>
              <label class="field">Date<input type="date" name="played_on" value="${t}" max="${t}" required></label>
            </div>
            <div class="row wrap spread">
              <div class="seg" role="radiogroup" aria-label="Result">
                ${Object.entries(RESULT).map(([k, l], i) => html`<label><input type="radio" name="result" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`)}
              </div>
              <button class="btn primary">${raw(icon('plus', 18))}Log game</button>
            </div>
            <details class="mtg-more"><summary>More details (optional)</summary>
              <div class="form" style="margin-top:10px">
                <input name="opponents" maxlength="300" placeholder="Opponents, e.g. Hafiz (Edgar Markov), Daniel (Krenko)" aria-label="Opponents">
                <div class="fields">
                  <label class="field">You went first?<select name="went_first"><option value="">Not sure</option><option value="1">Yes</option><option value="0">No</option></select></label>
                  <label class="field">Turns<input name="turns" type="number" min="1" max="99" inputmode="numeric" placeholder="e.g. 9"></label>
                </div>
              </div></details>
            <input name="note" maxlength="200" placeholder="Note (optional), e.g. who won, key play" aria-label="Note">
          </form>
        </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>Decks</h2></div>
        ${live.length ? html`<div class="decks">${live.map(deckTile)}</div>` : empty('Add your first deck below. Paste a decklist from Moxfield, Archidekt or MTGA if you have one.')}
        <details class="add-deck" ${decks.length ? '' : 'open'}>
          <summary>Add a deck</summary>
          <form data-form="add" class="form">
            <div class="fields">
              <label class="field">Deck name<input name="name" maxlength="80" required placeholder="e.g. Atraxa Superfriends"></label>
              <label class="field">Format<select name="format">${Object.entries(FORMATS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
            </div>
            <label class="field">Commander or key card<input name="commander" maxlength="160" placeholder="Optional. Fills in the art and colours"></label>
            <label class="field">Decklist<textarea name="decklist" rows="6" maxlength="20000" placeholder="Paste a list (optional)&#10;1 Sol Ring&#10;1 Command Tower&#10;…"></textarea></label>
            <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Add deck</button></div>
          </form>
        </details>
      </section>

      ${deck ? html`
        <section class="card deck-detail" id="deck-detail">
          ${deck.art_url ? html`<img class="deck-art" src="${deck.art_url}" alt="" referrerpolicy="no-referrer">` : ''}
          <div class="row spread" style="align-items:flex-start">
            <div class="grow"><h2 class="goal-title">${deck.name}</h2>
              <p class="small muted">${pips(deck.colors)} ${FORMATS[deck.format]}${deck.commander ? ` · ${deck.commander}` : ''}${deck.retired ? ' · retired' : ''}</p></div>
            <details class="more"><summary class="icon-btn" aria-label="More for ${deck.name}">⋯</summary>
              <div class="more-menu">
                <button class="text-btn" data-act="editlist">${deck.decklist ? 'Edit decklist' : 'Paste decklist'}</button>
                <button class="text-btn" data-act="recommander">Change commander</button>
                <button class="text-btn" data-act="retire">${deck.retired ? 'Bring back' : 'Retire deck'}</button>
                <button class="text-btn" data-act="deldeck">Delete deck</button>
              </div></details>
          </div>
          ${(() => { const r = rec(deck.id); return html`
            <div class="kpis">
              <div class="kpi"><b>${r.n}</b><span>Games</span></div>
              <div class="kpi"><b>${r.w}–${r.l}${r.d ? `–${r.d}` : ''}</b><span>Record</span></div>
              <div class="kpi"><b>${r.pct == null ? '–' : `${r.pct}%`}</b><span>Win rate</span></div>
            </div>`; })()}

          ${editing || !deck.decklist ? html`
            <form data-form="savelist" class="form">
              <label class="field">Decklist<textarea name="decklist" rows="10" maxlength="20000" placeholder="Paste from Moxfield, Archidekt, MTGA or MTGO&#10;1 Sol Ring&#10;1 Command Tower&#10;…">${deck.decklist || ''}</textarea></label>
              <div class="row end">${editing ? html`<button type="button" class="btn" data-act="canceledit">Cancel</button>` : ''}<button class="btn primary">Save decklist</button></div>
            </form>` : html`
            <div class="row wrap spread">
              <p class="small"><b>${parsed.main + parsed.commander}</b> cards${parsed.commander ? ` · ${parsed.commander} commander` : ''}${parsed.side ? ` · ${parsed.side} sideboard` : ''}${parsed.maybe ? ` · ${parsed.maybe} maybe` : ''}
                ${deck.format === 'commander' && parsed.main + parsed.commander !== 100 ? html`<span class="due-late"> · ${parsed.main + parsed.commander < 100 ? `${100 - parsed.main - parsed.commander} short of 100` : `${parsed.main + parsed.commander - 100} over 100`}</span>` : ''}
                ${['standard', 'modern', 'pioneer', 'pauper'].includes(deck.format) && parsed.main < 60 ? html`<span class="due-late"> · ${60 - parsed.main} short of 60</span>` : ''}</p>
              <div class="row">
                <button class="btn sm" data-act="copylist">Copy</button>
                ${an ? '' : html`<button class="btn sm primary" data-act="analyse">Curve &amp; stats</button>`}
              </div>
            </div>
            ${an ? html`
              <div class="deck-stats">
                <div><p class="small muted">Mana curve · avg ${an.avg.toFixed(2)} · ${an.lands} lands</p>${curve(an)}</div>
                <p class="small muted">${Object.entries(an.types).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? k : k === 'Sorcery' ? 'Sorceries' : `${k}s`}`).join(' · ')}</p>
                <p class="small muted">${pips(an.colors)} Colour identity</p>
                ${an.missing.length ? html`<p class="small due-late">Not found: ${an.missing.slice(0, 8).join(', ')}${an.missing.length > 8 ? '…' : ''}</p>` : ''}
              </div>` : ''}
            ${an ? html`<div class="deck-value"><span><b>US${usd(an.totals.commander + an.totals.main)}</b> deck value</span>
              <span class="small faint">${an.totals.side ? `+ US${usd(an.totals.side)} sideboard · ` : ''}TCGplayer prices via Scryfall, updated daily${an.unpriced ? ` · ${an.unpriced} without a price` : ''}</span></div>`
              : tried.has(deck.id) ? '' : html`<p class="small faint deck-value">Getting prices…</p>`}
            <details class="cardlist-box"><summary>Card list${an ? ', priciest first' : ''}</summary>
              ${['commander', 'main', 'side', 'maybe'].filter((s) => parsed.cards.some((c) => c.section === s)).map((s) => {
                const list = parsed.cards.filter((c) => c.section === s);
                const line = (c) => (an?.prices[cardKey(c)] ?? null) == null ? null : an.prices[cardKey(c)] * c.qty;
                if (an) list.sort((a, b) => (line(b) ?? -1) - (line(a) ?? -1) || a.name.localeCompare(b.name));
                return html`
                <p class="small muted list-head cl-head"><span>${{ commander: 'Commander', main: 'Main deck', side: 'Sideboard', maybe: 'Maybeboard' }[s]}</span>${an ? html`<span>US${usd(an.totals[s])}</span>` : ''}</p>
                <ul class="cardlist priced">${list.map((c) => html`<li><span class="num">${c.qty}</span><span class="cl-name">${c.name}${c.foil ? html` <span class="cl-foil">foil</span>` : ''}</span>${an ? html`<span class="cl-price" title="${c.qty > 1 && an.prices[cardKey(c)] != null ? `${c.qty} × ${usd(an.prices[cardKey(c)])}` : ''}">${usd(line(c))}</span>` : ''}</li>`)}</ul>`;
              })}
            </details>`}

          ${deck.decklist && !editing ? html`
            ${an && deck.format === 'commander' ? (() => { const br = bracketOf(parsed, an); return html`
              <div class="mtg-tool mtg-bracket b${br.level}">
                <p class="small muted list-head">Bracket estimate</p>
                <p><b>${br.label}</b></p>
                <p class="small muted">${br.why}</p>
                ${br.gc.length ? html`<p class="small">Game Changers: ${br.gc.join(', ')}</p>` : ''}
                ${br.mld.length ? html`<p class="small">Mass land denial: ${br.mld.join(', ')}</p>` : ''}
                ${br.turns.length ? html`<p class="small">Extra turns: ${br.turns.join(', ')}</p>` : ''}
                <p class="small faint">An estimate to start the pre-game chat. It can’t spot two-card combos.</p>
              </div>`; })() : ''}

            <div class="mtg-tool">
              <div class="row spread"><p class="small muted list-head">Sample hand</p>
                ${hand?.deckId === deck.id ? html`<span class="small muted">${hand.hand.length} cards · ${hand.hand.filter((c) => /\bLand\b/.test(an?.info[cardKey(c)]?.type || '')).length} lands${hand.mull ? ` · mulligan ${hand.mull}: put ${hand.mull} on the bottom` : ''}</span>` : ''}</div>
              ${hand?.deckId === deck.id ? html`<div class="mtg-hand">${hand.hand.map((c) => { const inf = an?.info[cardKey(c)]; return inf?.img
                ? html`<img src="${inf.img}" alt="${c.name}" title="${c.name}" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="mtg-handcard">${c.name}</span>`; })}</div>
                <div class="row wrap" style="gap:8px"><button class="btn sm" data-act="draw" ${hand.library.length ? '' : 'disabled'}>Draw</button>
                  <button class="btn sm" data-act="mull">Mulligan</button><button class="btn sm" data-act="newhand">New hand</button>
                  <button class="text-btn" data-act="closehand">Close</button></div>`
                : html`<button class="btn sm" data-act="newhand">Draw an opening 7</button>`}
            </div>` : ''}

          <div class="mtg-tool">
            <div class="row spread"><p class="small muted list-head">Upgrades to buy</p>
              ${deck.upgrades && !upEditing ? html`<button class="text-btn" data-act="upedit">Edit</button>` : ''}</div>
            ${upEditing || !deck.upgrades ? html`<form data-form="upsave" class="form">
                <textarea name="upgrades" rows="4" maxlength="5000" placeholder="Cards you want for this deck, one per line&#10;1 Smothering Tithe&#10;1 Cyclonic Rift" aria-label="Upgrades">${deck.upgrades || ''}</textarea>
                <div class="row end">${upEditing ? html`<button type="button" class="btn sm" data-act="upcancel">Cancel</button>` : ''}<button class="btn sm primary">Save list</button></div></form>`
              : (() => { const up = upParse(deck.upgrades); const ua = upAnalysis.get(deck.id); return html`
                ${ua ? html`<p><b>US${usd(up.cards.reduce((n, c) => n + (ua.prices[cardKey(c)] || 0) * c.qty, 0))}</b> <span class="small muted">to buy all ${up.cards.length}</span></p>` : html`<p class="small faint">Getting prices…</p>`}
                <ul class="cardlist priced">${up.cards.map((c) => html`<li><span class="num">${c.qty}</span><span class="cl-name">${c.name}${ua?.info[cardKey(c)]?.gc ? html` <span class="cl-foil">Game Changer</span>` : ''}</span>${ua ? html`<span class="cl-price">${usd(ua.prices[cardKey(c)] == null ? null : ua.prices[cardKey(c)] * c.qty)}</span>` : ''}</li>`)}</ul>`; })()}
          </div>

          <div>
            <p class="small muted list-head">Recent games</p>
            ${insights(matches.filter((m) => m.deck_id === deck.id))}
            ${matches.some((m) => m.deck_id === deck.id) ? html`<ul class="list">${matches.filter((m) => m.deck_id === deck.id).slice(0, 15).map((m) => html`
              <li class="item">
                <div class="body"><p class="title">${RESULT[m.result]} <span class="muted">· ${m.players}-player</span></p>
                  <p class="sub">${gameSub(m)}</p></div>
                <span class="xp">+${XP.mtgMatch + (m.result === 'win' ? XP.mtgWin : 0)}</span>
                <button class="icon-btn" data-act="delmatch" data-id="${m.id}" aria-label="Delete game">${raw(icon('trash'))}</button>
              </li>`)}</ul>` : empty('No games with this deck yet.')}
          </div>
        </section>` : ''}

      ${!deck && matches.length ? html`
        <section class="card">
          <div class="card-head"><h2>Recent games</h2></div>
          ${insights(matches)}
          <ul class="list">${matches.slice(0, 15).map((m) => html`
            <li class="item">
              <div class="body"><p class="title">${RESULT[m.result]} · ${nameOf[m.deck_id] || 'Deck'}</p>
                <p class="sub">${gameSub(m)}</p></div>
              <span class="xp">+${XP.mtgMatch + (m.result === 'win' ? XP.mtgWin : 0)}</span>
              <button class="icon-btn" data-act="delmatch" data-id="${m.id}" aria-label="Delete game">${raw(icon('trash'))}</button>
            </li>`)}</ul>
        </section>` : ''}

      ${retired.length ? html`
        <section class="card">
          <details><summary>Retired decks <span class="muted small" style="margin-left:auto;margin-right:10px">${retired.length}</span></summary>
            <div class="decks" style="margin-top:12px">${retired.map(deckTile)}</div></details>
        </section>` : ''}
    `);
    el.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
    if (deck?.upgrades && !upEditing && !upAnalysis.has(deck.id)) {
      const id = deck.id; upAnalysis.set(id, null);
      analyse(upParse(deck.upgrades)).then((r) => { upAnalysis.set(id, r); if (openId === id && el.isConnected) ctx.rerender(); }).catch(() => upAnalysis.delete(id));
    }
    // Prices (and the curve) load by themselves the first time a deck with a list is opened.
    if (deck && parsed && !an && !editing && !tried.has(deck.id)) {
      tried.add(deck.id);
      const id = deck.id;
      analyse(parsed).then((r) => { analysis.set(id, r); if (openId === id && el.isConnected) ctx.rerender(); })
        .catch(() => { if (openId === id && el.isConnected) ctx.rerender(); });
    }

    // Commander lookup → art + colour identity. Falls back to what the decklist says.
    const enrich = async (name, list, format) => {
      let pick = name;
      if (!pick && list) {
        const p = parseDecklist(list, format);
        pick = p.cards.find((c) => c.section === 'commander')?.name || '';
      }
      if (!pick) return {};
      try {
        const c = await lookupCard(pick);
        if (!c) { ctx.say(`Couldn’t find “${pick}” on Scryfall`); return { commander: pick }; }
        return { commander: c.name, colors: c.colors, art_url: c.art && /^https:\/\//.test(c.art) ? c.art : null };
      } catch { return { commander: pick }; }
    };

    wire(el, {
      open: (b) => {
        openId = openId === b.dataset.id ? null : b.dataset.id;
        editing = false;
        ctx.rerender();
        if (openId) requestAnimationFrame(() => document.getElementById('deck-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      },
      add: async (v, form) => {
        const format = FORMATS[v.format] ? v.format : 'other';
        const extra = await enrich(v.commander, v.decklist, format);
        const row = await ctx.store.insert('mtg_decks', { name: v.name, format, decklist: v.decklist || null, ...extra });
        form.reset();
        openId = row.id;
        ctx.say(`${row.name} added`);
        ctx.rerender();
      },
      log: async (v, form) => {
        const result = RESULT[v.result] ? v.result : 'loss';
        const players = Math.min(8, Math.max(2, parseInt(v.players, 10) || 4));
        const turns = parseInt(v.turns, 10);
        const row = await ctx.store.insert('mtg_matches', { deck_id: v.deck_id, result, players, played_on: v.played_on || t, note: v.note || null,
          opponents: v.opponents ? v.opponents.slice(0, 300) : null, went_first: v.went_first === '1' ? true : v.went_first === '0' ? false : null,
          turns: turns >= 1 && turns <= 99 ? turns : null });
        form.reset(); form.elements.played_on.value = t;
        await ctx.award('CHA', XP.mtgMatch + (result === 'win' ? XP.mtgWin : 0), 'mtg_match', row.id, `${RESULT[result]} with ${nameOf[v.deck_id]}`);
        ctx.rerender();
      },
      delmatch: async (b) => {
        if (!confirm('Delete this game? Its XP will be removed.')) return;
        await ctx.store.remove('mtg_matches', b.dataset.id);
        await ctx.revoke('mtg_match', b.dataset.id);
        ctx.rerender();
      },
      editlist: () => { editing = true; ctx.rerender(); },
      newhand: () => {
        const library = shuffle(parsed.cards.filter((c) => c.section === 'main').flatMap((c) => Array.from({ length: c.qty }, () => c)));
        hand = { deckId: deck.id, library, hand: library.splice(0, 7), mull: 0 }; ctx.rerender();
      },
      mull: () => {
        const library = shuffle(parsed.cards.filter((c) => c.section === 'main').flatMap((c) => Array.from({ length: c.qty }, () => c)));
        hand = { deckId: deck.id, library, hand: library.splice(0, 7), mull: Math.min(6, (hand?.mull || 0) + 1) }; ctx.rerender();
      },
      draw: () => { if (hand?.library.length) { hand.hand.push(hand.library.shift()); ctx.rerender(); } },
      closehand: () => { hand = null; ctx.rerender(); },
      upedit: () => { upEditing = true; ctx.rerender(); },
      upcancel: () => { upEditing = false; ctx.rerender(); },
      upsave: async (v) => {
        const list = (v.upgrades || '').trim() || null;
        if (list && !upParse(list).cards.length) { ctx.say('Couldn’t read any cards. Lines should look like “1 Sol Ring”'); return; }
        await ctx.store.update('mtg_decks', deck.id, { upgrades: list });
        upAnalysis.delete(deck.id); upEditing = false; ctx.rerender();
      },
      canceledit: () => { editing = false; ctx.rerender(); },
      savelist: async (v) => {
        const list = v.decklist || null;
        const p = list ? parseDecklist(list, deck.format) : null;
        if (list && !p.cards.length) { ctx.say('Couldn’t read any cards. Lines should look like “1 Sol Ring”'); return; }
        const patch = { decklist: list };
        if (list && !deck.commander) Object.assign(patch, await enrich('', list, deck.format));
        await ctx.store.update('mtg_decks', deck.id, patch);
        analysis.delete(deck.id); tried.delete(deck.id);
        editing = false;
        ctx.say(p ? `${p.main + p.commander} cards saved` : 'Decklist removed');
        ctx.rerender();
      },
      copylist: async () => {
        try { await navigator.clipboard.writeText(deck.decklist); ctx.say('Decklist copied'); } catch { ctx.say('Couldn’t copy. Select and copy from Edit decklist'); }
      },
      analyse: async (b) => {
        b.disabled = true; b.textContent = 'Asking Scryfall…';
        try { analysis.set(deck.id, await analyse(parsed)); } catch (e) { ctx.say(e.message || 'Scryfall didn’t answer'); }
        ctx.rerender();
      },
      recommander: async () => {
        const name = prompt('Commander or key card (used for art and colours):', deck.commander || '');
        if (name == null) return;
        const extra = name.trim() ? await enrich(name.trim().slice(0, 160)) : { commander: null, art_url: null };
        await ctx.store.update('mtg_decks', deck.id, extra);
        ctx.rerender();
      },
      retire: async () => {
        await ctx.store.update('mtg_decks', deck.id, { retired: !deck.retired });
        ctx.say(deck.retired ? `${deck.name} is back` : `${deck.name} retired`);
        ctx.rerender();
      },
      deldeck: async () => {
        const own = matches.filter((m) => m.deck_id === deck.id);
        if (!confirm(`Delete ${deck.name} and its ${own.length} game(s)? Their XP will be removed.`)) return;
        for (const m of own) await ctx.store.revoke('mtg_match', m.id);
        await ctx.store.remove('mtg_decks', deck.id);
        await ctx.revoke('mtg_match', '-');
        openId = null;
        ctx.rerender();
      },
    });
  },
};
