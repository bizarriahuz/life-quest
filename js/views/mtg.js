import { html, raw, wire, mount, today, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { parseDecklist, lookupCard, analyse } from '../mtg.js';

const FORMATS = { commander: 'Commander', standard: 'Standard', modern: 'Modern', pioneer: 'Pioneer', pauper: 'Pauper', limited: 'Limited', other: 'Other' };
const RESULT = { win: 'Win', loss: 'Loss', draw: 'Draw' };
const pips = (colors) => html`<span class="pips" aria-label="Colours: ${colors || 'colourless'}">${(colors || 'C').split('').map((c) => html`<i class="pip pip-${c}">${c}</i>`)}</span>`;

let openId = null;       // deck being viewed
let editing = false;     // decklist editor open
const analysis = new Map(); // deck id -> result (this session)

export default {
  id: 'mtg',
  label: 'MTG',
  async render(el, ctx) {
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

    const curve = (a) => {
      const max = Math.max(1, ...a.curve);
      return html`<div class="chart curve" role="img" aria-label="Mana curve">
        ${a.curve.map((n, i) => html`<div class="col"><span class="v">${n || ''}</span><div class="b"><i style="height:${(n / max) * 100}%"></i></div><span class="d">${i === 7 ? '7+' : i}</span></div>`)}
      </div>`;
    };

    mount(el, html`
      <header class="page-head"><div><h1>MTG</h1><p>${live.length} deck${live.length === 1 ? '' : 's'}${all.n ? ` · ${all.n} games · ${all.pct}% wins` : ''}</p></div></header>

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
                <p class="small muted">${pips(an.colors)} Colour identity · about US$${Math.round(an.price)} on Scryfall</p>
                ${an.missing.length ? html`<p class="small due-late">Not found: ${an.missing.slice(0, 8).join(', ')}${an.missing.length > 8 ? '…' : ''}</p>` : ''}
              </div>` : ''}
            <details><summary>Card list</summary>
              ${['commander', 'main', 'side', 'maybe'].filter((s) => parsed.cards.some((c) => c.section === s)).map((s) => html`
                <p class="small muted list-head">${{ commander: 'Commander', main: 'Main deck', side: 'Sideboard', maybe: 'Maybeboard' }[s]}</p>
                <ul class="cardlist">${parsed.cards.filter((c) => c.section === s).map((c) => html`<li><span class="num">${c.qty}</span> ${c.name}</li>`)}</ul>`)}
            </details>`}

          <div>
            <p class="small muted list-head">Recent games</p>
            ${matches.some((m) => m.deck_id === deck.id) ? html`<ul class="list">${matches.filter((m) => m.deck_id === deck.id).slice(0, 15).map((m) => html`
              <li class="item">
                <div class="body"><p class="title">${RESULT[m.result]} <span class="muted">· ${m.players}-player</span></p>
                  <p class="sub">${relDate(m.played_on)}${m.note ? ` · ${m.note}` : ''}</p></div>
                <span class="xp">+${XP.mtgMatch + (m.result === 'win' ? XP.mtgWin : 0)}</span>
                <button class="icon-btn" data-act="delmatch" data-id="${m.id}" aria-label="Delete game">${raw(icon('trash'))}</button>
              </li>`)}</ul>` : empty('No games with this deck yet.')}
          </div>
        </section>` : ''}

      ${!deck && matches.length ? html`
        <section class="card">
          <div class="card-head"><h2>Recent games</h2></div>
          <ul class="list">${matches.slice(0, 15).map((m) => html`
            <li class="item">
              <div class="body"><p class="title">${RESULT[m.result]} · ${nameOf[m.deck_id] || 'Deck'}</p>
                <p class="sub">${relDate(m.played_on)} · ${m.players}-player${m.note ? ` · ${m.note}` : ''}</p></div>
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
        const row = await ctx.store.insert('mtg_matches', { deck_id: v.deck_id, result, players, played_on: v.played_on || t, note: v.note || null });
        form.elements.note.value = '';
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
      canceledit: () => { editing = false; ctx.rerender(); },
      savelist: async (v) => {
        const list = v.decklist || null;
        const p = list ? parseDecklist(list, deck.format) : null;
        if (list && !p.cards.length) { ctx.say('Couldn’t read any cards. Lines should look like “1 Sol Ring”'); return; }
        const patch = { decklist: list };
        if (list && !deck.commander) Object.assign(patch, await enrich('', list, deck.format));
        await ctx.store.update('mtg_decks', deck.id, patch);
        analysis.delete(deck.id);
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
