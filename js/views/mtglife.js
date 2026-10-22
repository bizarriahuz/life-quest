// MTG life counter (#/mtg/life): 2–6 players, commander damage, poison, a roll for who goes first,
// and a round counter. Runs entirely on the phone; when the game ends it logs the result to your deck.
import { html, raw, wire, mount, today } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

const KEY = 'lifequest:mtglife';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const save = (s) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* private mode */ } };
export const hasLiveGame = () => Boolean(load()?.started);

const isOut = (p, start) => p.life <= 0 || p.poison >= 10 || Object.values(p.cmd || {}).some((d) => d >= 21) || (start === 0 && false);
let panel = null;      // player index whose details panel is open
let lock = null;       // screen wake lock

async function keepAwake() {
  try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch { /* not allowed */ }
}
function release() { try { lock?.release(); } catch { /* ignore */ } lock = null; }

export default async function renderLife(el, ctx) {
  const t = today();
  const decks = (await ctx.store.list('mtg_decks', { order: 'created_at', asc: true })).filter((d) => !d.retired);
  let s = load();
  const me = ctx.profile?.hero_name && ctx.profile.hero_name !== 'HERO' ? ctx.profile.hero_name : 'You';

  // ---------------------------------------------------------------- setup
  if (!s?.started) {
    s = s || { n: 4, life: 40, deckId: decks[0]?.id || null, names: [me, 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'], cmdrs: ['', '', '', '', '', ''], first: null };
    const deck = decks.find((d) => d.id === s.deckId);
    if (deck && !s.touchedLife) s.life = deck.format === 'commander' ? 40 : 20;
    if (deck?.commander) s.cmdrs[0] = deck.commander;
    document.body.classList.remove('lc-on');
    release();
    mount(el, html`
      <a class="text-btn back" href="#/mtg">${raw(icon('left', 16))}MTG</a>
      <header class="page-head"><div><h1>Life counter</h1><p>Life, commander damage and poison for the table</p></div></header>
      <section class="card">
        <form data-form="start" class="form">
          <div class="fields">
            <label class="field">Players<select name="n" data-change="setn">${[2, 3, 4, 5, 6].map((n) => html`<option value="${n}" ${n === s.n ? 'selected' : ''}>${n}</option>`)}</select></label>
            <label class="field">Starting life<select name="life" data-change="setlife">${[40, 30, 25, 20].map((n) => html`<option value="${n}" ${n === s.life ? 'selected' : ''}>${n}</option>`)}</select></label>
            <label class="field">Your deck<select name="deckId" data-change="setdeck"><option value="">Don’t log this game</option>${decks.map((d) => html`<option value="${d.id}" ${d.id === s.deckId ? 'selected' : ''}>${d.name}</option>`)}</select></label>
          </div>
          <p class="small muted">Players and their commanders (optional). You’re player 1.</p>
          <ol class="lc-names">${Array.from({ length: s.n }, (_, i) => html`<li>
            <input name="name${i}" maxlength="24" value="${s.names[i]}" aria-label="Player ${i + 1} name" ${i === 0 ? '' : ''}>
            <input name="cmdr${i}" maxlength="80" value="${s.cmdrs[i] || ''}" placeholder="Commander" aria-label="Player ${i + 1} commander">
            ${s.first === i ? html`<span class="pill lc-firstpill">Goes first</span>` : ''}
          </li>`)}</ol>
          <div class="row wrap spread">
            <button type="button" class="btn sm" data-act="roll">🎲 Who goes first?</button>
            <button class="btn primary">${raw(icon('play', 16))}Start game</button>
          </div>
        </form>
      </section>
      <p class="small faint" style="text-align:center">Tip: lay the phone flat in the middle. The top half faces the players across the table.</p>`);
    const grab = () => {
      const f = el.querySelector('form[data-form=start]');
      for (let i = 0; i < s.n; i += 1) { s.names[i] = (f[`name${i}`]?.value || '').trim().slice(0, 24) || (i ? `Player ${i + 1}` : me); s.cmdrs[i] = (f[`cmdr${i}`]?.value || '').trim().slice(0, 80); }
    };
    wire(el, {
      setn: (x) => { grab(); s.n = Number(x.value); if (s.first != null && s.first >= s.n) s.first = null; save(s); ctx.rerender(); },
      setlife: (x) => { grab(); s.life = Number(x.value); s.touchedLife = true; save(s); },
      setdeck: (x) => { grab(); s.deckId = x.value || null; s.touchedLife = false; const d = decks.find((q) => q.id === s.deckId); s.cmdrs[0] = d?.commander || ''; save(s); ctx.rerender(); },
      roll: () => { grab(); s.first = Math.floor(Math.random() * s.n); save(s); ctx.say(`${s.names[s.first]} goes first`); ctx.rerender(); },
      start: () => {
        grab();
        s.players = Array.from({ length: s.n }, (_, i) => ({ name: s.names[i], cmdr: s.cmdrs[i], life: s.life, poison: 0, cmd: {} }));
        s.round = 1; s.started = true; s.startedAt = Date.now(); s.day = t;
        save(s); panel = null; ctx.rerender();
      },
    });
    return;
  }

  // ---------------------------------------------------------------- the game
  keepAwake();
  document.body.classList.add('lc-on');
  const n = s.players.length;
  const top = Math.floor(n / 2);                  // top row faces the other side of the table
  const tile = (p, i) => {
    const out = isOut(p);
    const cmdMax = Math.max(0, ...Object.values(p.cmd || {}));
    return html`<div class="lc-tile ${i < top ? 'flip' : ''} ${out ? 'out' : ''} ${s.first === i ? 'first' : ''}" style="--lc:${['#c45a5a', '#4a8fd6', '#4fa36b', '#c99a2e', '#9b6ad6', '#d0729e'][i]}">
      <button class="lc-btn minus" data-act="life" data-i="${i}" data-d="-1" aria-label="${p.name} minus 1">−</button>
      <div class="lc-mid">
        <button class="lc-name" data-act="panel" data-i="${i}">${p.name}${i === 0 ? ' (you)' : ''}</button>
        <b class="lc-life" aria-live="polite">${p.life}</b>
        <span class="lc-sub">${[p.poison ? `☠ ${p.poison}` : '', cmdMax ? `⚔ ${cmdMax}` : '', out ? 'Out' : ''].filter(Boolean).join(' · ')}</span>
        <span class="lc-five"><button data-act="life" data-i="${i}" data-d="-5" aria-label="${p.name} minus 5">−5</button><button data-act="life" data-i="${i}" data-d="5" aria-label="${p.name} plus 5">+5</button></span>
      </div>
      <button class="lc-btn plus" data-act="life" data-i="${i}" data-d="1" aria-label="${p.name} plus 1">+</button>
    </div>`;
  };
  const panelHtml = () => {
    if (panel == null) return '';
    const p = s.players[panel];
    return html`<div class="lc-panel ${panel < top ? 'flip' : ''}" role="dialog" aria-label="${p.name}">
      <div class="row spread"><b>${p.name}${p.cmdr ? html` <span class="muted small">${p.cmdr}</span>` : ''}</b><button class="icon-btn" data-act="closepanel" aria-label="Close">${raw(icon('close'))}</button></div>
      <div class="lc-row"><span>☠ Poison</span><span class="lc-step"><button data-act="poison" data-d="-1">−</button><b>${p.poison}</b><button data-act="poison" data-d="1">+</button></span></div>
      <p class="small muted">Commander damage taken (also comes off life)</p>
      ${s.players.map((q, j) => (j === panel ? '' : html`<div class="lc-row"><span>⚔ From ${q.name}${q.cmdr ? html` <span class="faint small">(${q.cmdr})</span>` : ''}</span>
        <span class="lc-step"><button data-act="cmd" data-j="${j}" data-d="-1">−</button><b>${p.cmd?.[j] || 0}</b><button data-act="cmd" data-j="${j}" data-d="1">+</button></span></div>`))}
    </div>`;
  };
  const alive = s.players.filter((p) => !isOut(p)).length;
  mount(el, html`<div class="lc-wrap" data-n="${n}">
    <div class="lc-grid" style="grid-template-rows: ${top ? '1fr 1fr' : '1fr'}">
      ${top ? html`<div class="lc-rowtiles" style="grid-template-columns: repeat(${top}, 1fr)">${s.players.slice(0, top).map((p, i) => tile(p, i))}</div>` : ''}
      <div class="lc-rowtiles" style="grid-template-columns: repeat(${n - top}, 1fr)">${s.players.slice(top).map((p, i) => tile(p, i + top))}</div>
    </div>
    <div class="lc-bar">
      <button class="lc-chip" data-act="round" aria-label="Next round">Round <b>${s.round}</b> ＋</button>
      <button class="lc-chip" data-act="roll">🎲 ${s.first != null ? `${s.players[s.first].name} first` : 'Who’s first?'}</button>
      <button class="lc-chip" data-act="d20">d20</button>
      <button class="lc-chip end ${alive <= 1 ? 'hot' : ''}" data-act="end">End game</button>
      <button class="lc-chip" data-act="exit" aria-label="Leave the counter (the game is kept)">${raw(icon('close', 16))}</button>
    </div>
    ${panelHtml()}
    <div class="lc-end" id="lc-end" hidden></div>
  </div>`);

  const commit = () => { save(s); ctx.rerender(); };
  wire(el, {
    life: (b) => { const p = s.players[b.dataset.i]; p.life = Math.max(-99, Math.min(999, p.life + Number(b.dataset.d))); commit(); },
    panel: (b) => { panel = Number(b.dataset.i); ctx.rerender(); },
    closepanel: () => { panel = null; ctx.rerender(); },
    poison: (b) => { const p = s.players[panel]; p.poison = Math.max(0, Math.min(99, p.poison + Number(b.dataset.d))); commit(); },
    cmd: (b) => {
      const p = s.players[panel]; const j = b.dataset.j; const d = Number(b.dataset.d);
      const now = p.cmd[j] || 0; const next = Math.max(0, Math.min(99, now + d));
      if (next !== now) { p.cmd[j] = next; p.life -= next - now; }
      commit();
    },
    round: () => { s.round = Math.min(99, s.round + 1); commit(); },
    roll: () => { s.first = Math.floor(Math.random() * n); ctx.say(`${s.players[s.first].name} goes first`); commit(); },
    d20: () => ctx.say(`d20: ${1 + Math.floor(Math.random() * 20)}`),
    exit: () => { release(); document.body.classList.remove('lc-on'); location.hash = '#/mtg'; },
    end: () => {
      const box = el.querySelector('#lc-end');
      box.hidden = false;
      box.innerHTML = String(html`<div class="lc-endcard card">
        <h2>Who won?</h2>
        <div class="lc-winners">${s.players.map((p, i) => html`<button class="btn ${isOut(p) ? '' : 'primary'}" data-act="winner" data-w="${i}">${p.name}</button>`)}
          <button class="btn" data-act="winner" data-w="draw">Draw</button></div>
        <p class="small muted">${s.deckId ? `It’s logged to ${decks.find((d) => d.id === s.deckId)?.name || 'your deck'}: ${s.round} round${s.round === 1 ? '' : 's'}${s.first != null ? `, ${s.first === 0 ? 'you went first' : `${s.players[s.first].name} went first`}` : ''}.` : 'This game isn’t linked to a deck, so it won’t be logged.'}</p>
        <div class="row wrap spread"><button class="text-btn" data-act="discard">Discard game</button><button class="btn sm" data-act="cancelend">Keep playing</button></div>
      </div>`);
    },
    cancelend: () => { el.querySelector('#lc-end').hidden = true; },
    discard: () => {
      if (!confirm('Throw this game away without logging it?')) return;
      save(null); panel = null; release(); document.body.classList.remove('lc-on'); location.hash = '#/mtg';
    },
    winner: async (b) => {
      const w = b.dataset.w;
      const result = w === 'draw' ? 'draw' : Number(w) === 0 ? 'win' : 'loss';
      if (s.deckId && decks.some((d) => d.id === s.deckId)) {
        const opponents = s.players.slice(1).map((p) => (p.cmdr ? `${p.name} (${p.cmdr})` : p.name)).join(', ').slice(0, 300);
        const row = await ctx.store.insert('mtg_matches', { deck_id: s.deckId, result, players: n, played_on: s.day || t,
          opponents, went_first: s.first == null ? null : s.first === 0, turns: Math.max(1, Math.min(99, s.round)),
          note: w === 'draw' || Number(w) === 0 ? null : `${s.players[Number(w)].name} won`.slice(0, 200) });
        const dname = decks.find((d) => d.id === s.deckId)?.name || 'your deck';
        await ctx.award('CHA', XP.mtgMatch + (result === 'win' ? XP.mtgWin : 0), 'mtg_match', row.id, `${result === 'win' ? 'Win' : result === 'draw' ? 'Draw' : 'Loss'} with ${dname}`);
      }
      const keep = { n: s.n, life: s.life, deckId: s.deckId, names: s.players.map((p) => p.name).concat(s.names.slice(n)), cmdrs: s.players.map((p) => p.cmdr).concat(s.cmdrs.slice(n)), first: null, touchedLife: s.touchedLife };
      save(keep); panel = null; release(); document.body.classList.remove('lc-on');
      location.hash = '#/mtg';
    },
  });
}
