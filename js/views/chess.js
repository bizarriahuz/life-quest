// Chess: play Stockfish at five levels, solve the Lichess daily puzzle, replay past games.
// The board (chessground), rules (chess.js) and engine (Stockfish) load only when this
// section is opened, so nothing else in the app gets heavier.
import { html, raw, wire, mount, today, addDays, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { LEVELS, bestMove, startEngine, engineLoaded } from '../engine.js';

let tab = 'play';
let setup = { level: 3, color: 'w' };
let flipped = false;
let replay = null;          // { id, ply }
let Chess = null; let Chessground = null;

const ENDING = {
  checkmate: 'Checkmate', resigned: 'Resigned', stalemate: 'Stalemate', repetition: 'Repetition',
  insufficient: 'Not enough pieces', fifty: '50-move rule', abandoned: 'Abandoned',
};
const RESULT = { win: 'Won', loss: 'Lost', draw: 'Draw' };
const colorName = (c) => (c === 'w' ? 'White' : 'Black');
const cgColor = (c) => (c === 'w' ? 'white' : 'black');

async function libs() {
  if (!document.querySelector('link[data-cg]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/css/chessground.css'; l.dataset.cg = '1';
    document.head.appendChild(l);
  }
  if (!Chess) {
    const [c, g] = await Promise.all([import('../vendor/chess.min.js'), import('../vendor/chessground.min.js')]);
    Chess = c.Chess; Chessground = g.Chessground;
  }
}

// Legal moves in chessground's format: Map(from -> [to…]).
function dests(chess) {
  const m = new Map();
  for (const mv of chess.moves({ verbose: true })) {
    if (!m.has(mv.from)) m.set(mv.from, []);
    m.get(mv.from).push(mv.to);
  }
  return m;
}
const lastMove = (chess) => { const h = chess.history({ verbose: true }); const l = h[h.length - 1]; return l ? [l.from, l.to] : undefined; };
const inCheck = (chess) => (chess.inCheck() ? cgColor(chess.turn()) : false);

// Material balance in pawns, from White's point of view.
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(chess) {
  let s = 0;
  for (const row of chess.board()) for (const sq of row) if (sq) s += (sq.color === 'w' ? 1 : -1) * VAL[sq.type];
  return s;
}

function ending(chess) {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'repetition';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (chess.isDraw()) return 'fifty';
  return null;
}

// Pick a promotion piece with a small overlay on the board.
function askPromotion(boardEl, color) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'promo';
    box.innerHTML = ['q', 'r', 'b', 'n'].map((p) => `<button type="button" data-p="${p}" aria-label="${{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}"><piece class="${cgColor(color)} ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[p]}"></piece></button>`).join('');
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { box.remove(); resolve(b.dataset.p); } });
    boardEl.appendChild(box);
  });
}

function whenShown(el, fn, tries = 0) {
  if (el.isConnected) { fn(); return; }
  if (tries > 120) return;                     // the page was replaced before it appeared
  requestAnimationFrame(() => whenShown(el, fn, tries + 1));
}

// chess.js adds empty "?" header lines; keep only the ones that mean something (e.g. a set-up position).
const cleanPgn = (pgn) => pgn.replace(/^\[\w+ "(\?|\?{4}\.\?\?\.\?\?|\*)"\]\n/gm, '').replace(/^\n+/, '');

function streakOf(puzzles, t) {
  const solved = new Set(puzzles.filter((p) => p.solved).map((p) => p.day));
  let n = 0;
  if (puzzles.some((p) => p.day === t && !p.solved)) return 0;                // gave up today
  for (let d = solved.has(t) ? t : addDays(t, -1); solved.has(d); d = addDays(d, -1)) n += 1;
  return n;
}

export default {
  id: 'chess',
  label: 'Chess',
  async render(el, ctx) {
    const t = today();
    const onPage = location.hash.startsWith('#/games/chess');
    const [games, puzzles] = await Promise.all([
      ctx.store.list('chess_games', { order: 'created_at', limit: 200 }),
      ctx.store.list('chess_puzzles', { order: 'day', limit: 400 }),
    ]);
    const live = games.find((g) => !g.result);
    const done = games.filter((g) => g.result);
    const rec = { win: 0, loss: 0, draw: 0 };
    for (const g of done) if (g.ending !== 'abandoned') rec[g.result] += 1;
    const streak = streakOf(puzzles, t);
    const todayPuzzle = puzzles.find((p) => p.day === t);
    if (replay && !done.some((g) => g.id === replay.id)) replay = null;

    mount(el, html`
      <a class="text-btn back" href="#/games">${raw(icon('left', 16))}Games</a>
      <header class="page-head"><div><h1>Chess</h1>
        <p>${rec.win}W · ${rec.loss}L · ${rec.draw}D${streak ? ` · ${streak}-day puzzle streak` : ''}</p></div></header>
      <div class="seg ptabs chess-tabs" role="tablist" aria-label="Chess">
        ${[['play', live ? 'Your game' : 'Play'], ['puzzle', todayPuzzle?.solved ? 'Puzzle ✓' : 'Daily puzzle'], ['history', 'History']].map(([k, v]) => html`
          <label><input type="radio" name="ctab" value="${k}" data-change="tab" ${tab === k ? 'checked' : ''}><span>${v}</span></label>`)}
      </div>
      <div id="chess-pane"></div>
    `);
    const pane = el.querySelector('#chess-pane');
    wire(el, { tab: (r) => { tab = r.value; replay = null; ctx.rerender(); } });
    if (!onPage) return;                       // prefetch: don't build boards off-screen
    await libs();
    // The board measures itself, so build it once the page is on screen.
    whenShown(pane, () => {
      if (tab === 'play') return playPane(pane, ctx, live);
      if (tab === 'puzzle') return puzzlePane(pane, ctx, todayPuzzle, streak);
      return historyPane(pane, ctx, done);
    });
  },
};

// ------------------------------------------------------------------ play
async function playPane(el, ctx, live) {
  if (!live) {
    mount(el, html`
      <section class="card chess-setup">
        <div class="card-head"><h2>New game</h2><span class="meta">vs Stockfish</span></div>
        <form data-form="start" class="form">
          <p class="small muted">Level</p>
          <div class="seg level-seg" role="radiogroup" aria-label="Level">
            ${LEVELS.map((L) => html`<label><input type="radio" name="level" value="${L.n}" ${setup.level === L.n ? 'checked' : ''}><span><b>${L.n}</b>${L.name}</span></label>`)}
          </div>
          <p class="small muted">You play</p>
          <div class="seg" role="radiogroup" aria-label="Your colour">
            ${[['w', 'White'], ['b', 'Black'], ['r', 'Random']].map(([k, v]) => html`<label><input type="radio" name="color" value="${k}" ${setup.color === k ? 'checked' : ''}><span>${v}</span></label>`)}
          </div>
          <button class="btn primary">${raw(icon('play', 18))}Start game</button>
          <p class="small faint">${engineLoaded() ? 'The engine is ready.' : 'The first game downloads the chess engine (about 6 MB). After that it’s instant, even offline.'}</p>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h2>XP</h2></div>
        <p class="small muted">Finish a game of 10 moves or more for +${XP.chessGame} Craft. A win adds +${XP.chessWin} × the level. Solve the daily puzzle for +${XP.puzzle}.</p>
      </section>`);
    startEngine().catch(() => {});             // warm up while you choose
    wire(el, {
      start: async (v) => {
        setup = { level: +v.level || 3, color: v.color || 'w' };
        const color = setup.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
        flipped = false;
        await ctx.store.insert('chess_games', { level: setup.level, color, pgn: '', moves: 0 });
        ctx.rerender();
      },
    });
    return;
  }

  const chess = new Chess();
  if (live.pgn) { try { chess.loadPgn(live.pgn); } catch { /* start fresh if the saved game is unreadable */ } }
  const you = live.color;
  const L = LEVELS[live.level - 1] || LEVELS[2];
  mount(el, html`
    <section class="card board-card">
      <div class="player top"><span class="pname">${raw(icon('spark', 15))}Stockfish · ${L.name}</span><span class="mat" id="mat-top"></span></div>
      <div class="board-wrap"><div class="cg-wrap" id="board"></div></div>
      <div class="player bottom"><span class="pname">You · ${colorName(you)}</span><span class="mat" id="mat-bottom"></span></div>
      <p class="chess-status" id="status" role="status" aria-live="polite"></p>
      <div class="row wrap chess-ctrls">
        <button class="btn sm" data-act="undo">Undo</button>
        <button class="btn sm" data-act="hint">Hint</button>
        <button class="btn sm" data-act="flip">Flip board</button>
        <button class="btn sm" data-act="resign">Resign</button>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Moves</h2><span class="meta" id="move-count"></span></div>
      <ol class="movelist" id="moves"></ol>
    </section>`);

  const boardEl = el.querySelector('#board');
  const status = (s) => { el.querySelector('#status').textContent = s; };
  let thinking = false;
  let over = false;
  const cg = Chessground(boardEl, {
    fen: chess.fen(), orientation: cgColor(flipped ? (you === 'w' ? 'b' : 'w') : you), coordinates: true,
    turnColor: cgColor(chess.turn()), check: inCheck(chess), lastMove: lastMove(chess),
    movable: { free: false, color: cgColor(you), dests: chess.turn() === you ? dests(chess) : new Map(), showDests: true },
    premovable: { enabled: false }, animation: { duration: 180 }, highlight: { lastMove: true, check: true },
    draggable: { showGhost: true }, drawable: { enabled: false },
    events: { move: (from, to) => onMove(from, to) },
  });
  const onResize = () => { if (boardEl.isConnected) cg.redrawAll(); else removeEventListener('resize', onResize); };
  addEventListener('resize', onResize);

  const sync = () => {
    cg.set({
      fen: chess.fen(), turnColor: cgColor(chess.turn()), check: inCheck(chess), lastMove: lastMove(chess),
      movable: { color: over ? undefined : cgColor(you), dests: !over && !thinking && chess.turn() === you ? dests(chess) : new Map() },
    });
    cg.setAutoShapes([]);
    const m = material(chess) * (you === 'w' ? 1 : -1);
    el.querySelector('#mat-bottom').textContent = m > 0 ? `+${m}` : '';
    el.querySelector('#mat-top').textContent = m < 0 ? `+${-m}` : '';
    const h = chess.history();
    el.querySelector('#moves').innerHTML = String(html`${Array.from({ length: Math.ceil(h.length / 2) }, (_, i) => html`<li><span>${h[2 * i]}</span><span>${h[2 * i + 1] || ''}</span></li>`)}`);
    el.querySelector('#moves').lastElementChild?.scrollIntoView?.({ block: 'nearest' });
    el.querySelector('#move-count').textContent = h.length ? `${Math.ceil(h.length / 2)}` : '';
    if (!over && !thinking) status(chess.turn() === you ? (chess.inCheck() ? 'Check! Your move' : 'Your move') : 'Stockfish to move');
  };
  const save = () => ctx.store.update('chess_games', live.id, { pgn: cleanPgn(chess.pgn()), moves: Math.ceil(chess.history().length / 2) }).catch(() => {});

  async function finish(result, why) {
    over = true; thinking = false;
    const moves = Math.ceil(chess.history().length / 2);
    const whiteWon = (result === 'win') === (you === 'w');
    chess.setHeader('Result', result === 'draw' ? '1/2-1/2' : whiteWon ? '1-0' : '0-1');
    await ctx.store.update('chess_games', live.id, { result, ending: why, pgn: cleanPgn(chess.pgn()), moves, ended_on: today() });
    if (why !== 'resigned' && why !== 'abandoned' && moves >= 10) {
      const amt = XP.chessGame + (result === 'win' ? XP.chessWin * live.level : 0);
      await ctx.award('CHA', amt, 'chess', live.id, result === 'win' ? `You beat ${L.name}` : result === 'draw' ? 'Draw' : 'Good game');
    }
    sync();
    const msg = { win: `You won! ${ENDING[why]}.`, loss: why === 'resigned' ? 'You resigned.' : `Stockfish won. ${ENDING[why]}.`, draw: `Draw. ${ENDING[why]}.` }[result];
    status(msg);
    el.querySelector('.chess-ctrls').innerHTML = String(html`<button class="btn primary sm" data-act="again">${raw(icon('play', 16))}New game</button><button class="btn sm" data-act="review">Review this game</button>`);
  }

  async function checkEnd() {
    const why = ending(chess);
    if (!why) return false;
    const result = why === 'checkmate' ? (chess.turn() === you ? 'loss' : 'win') : 'draw';
    await finish(result, why);
    return true;
  }

  async function engineTurn() {
    if (over || chess.turn() === you) return;
    thinking = true; sync(); status('Stockfish is thinking…');
    let mv = null;
    try { mv = await bestMove(chess.fen(), live.level); }
    catch (err) { thinking = false; status(err.message || 'The engine stopped. Tap Hint or reload to try again.'); return; }
    if (!boardEl.isConnected) return;
    thinking = false;
    if (mv) chess.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] || undefined });
    sync(); save();
    await checkEnd();
  }

  async function onMove(from, to) {
    if (over || thinking) { sync(); return; }
    const piece = chess.get(from);
    let promotion;
    if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) promotion = await askPromotion(boardEl, you);
    try { chess.move({ from, to, promotion }); } catch { sync(); return; }
    sync(); save();
    if (await checkEnd()) return;
    engineTurn();
  }

  sync();
  if (chess.turn() !== you) engineTurn();
  else startEngine().catch(() => {});

  wire(el, {
    undo: () => {
      if (thinking || over) return;
      if (chess.history().length === 0) return;
      chess.undo();
      if (chess.turn() !== you && chess.history().length) chess.undo();
      if (chess.turn() !== you) { sync(); engineTurn(); return; }   // you're Black and undid to the start
      sync(); save(); status('Move taken back');
    },
    hint: async () => {
      if (thinking || over || chess.turn() !== you) return;
      status('Looking for a good move…');
      try {
        const mv = await bestMove(chess.fen(), 5, { hint: true });
        if (!mv || !boardEl.isConnected) return;
        cg.setAutoShapes([{ orig: mv.slice(0, 2), dest: mv.slice(2, 4), brush: 'green' }]);
        const san = new Chess(chess.fen()).move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] || undefined }).san;
        status(`Hint: ${san}`);
      } catch (err) { status(err.message); }
    },
    flip: () => { flipped = !flipped; cg.toggleOrientation(); },
    resign: async () => {
      if (over) return;
      if (!confirm('Resign this game?')) return;
      await finish('loss', chess.history().length < 2 ? 'abandoned' : 'resigned');
    },
    again: () => { ctx.rerender(); },
    review: () => { tab = 'history'; replay = { id: live.id, ply: 0 }; ctx.rerender(); },
  });
}

// ------------------------------------------------------------------ daily puzzle
const PKEY = 'lifequest:puzzle';
async function dailyPuzzle(day) {
  try { const c = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (c && c.day === day) return c.data; } catch { /* ignore */ }
  const r = await fetch('https://lichess.org/api/puzzle/daily', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Couldn’t load today’s puzzle. Try again later.');
  const data = await r.json();
  try { localStorage.setItem(PKEY, JSON.stringify({ day, data })); } catch { /* ignore */ }
  return data;
}

async function puzzlePane(el, ctx, rec, streak) {
  const t = today();
  mount(el, html`<section class="card"><p class="muted">Loading today’s puzzle…</p></section>`);
  let data;
  try { data = await dailyPuzzle(t); } catch (err) { mount(el, html`<section class="card"><p class="muted">${err.message}</p></section>`); return; }
  if (!el.isConnected) return;
  const P = data.puzzle;
  const start = new Chess(P.fen);
  const you = start.turn();
  const chess = new Chess(P.fen);
  const sol = P.solution;
  let step = 0;
  let finished = Boolean(rec);
  let mistakes = 0;

  mount(el, html`
    <section class="card board-card">
      <div class="player top"><span class="pname">${raw(icon('spark', 15))}Lichess daily puzzle</span><span class="small muted">Rated ${P.rating}</span></div>
      <div class="board-wrap"><div class="cg-wrap" id="board"></div></div>
      <p class="chess-status" id="status" role="status" aria-live="polite"></p>
      <div class="row wrap chess-ctrls" id="pctrls"></div>
    </section>
    <section class="card">
      <div class="row spread"><p class="small muted">Themes: ${(P.themes || []).slice(0, 4).map((x) => x.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}</p>
        <p class="small muted">${streak ? `${streak}-day streak` : 'Start a streak today'}</p></div>
      <p class="small faint" style="margin-top:6px">A new puzzle every day from <a href="https://lichess.org/training/${P.id}" target="_blank" rel="noopener noreferrer"><u>Lichess</u></a>. Solve it for +${XP.puzzle} Craft.</p>
    </section>`);
  const boardEl = el.querySelector('#board');
  const status = (s) => { el.querySelector('#status').textContent = s; };
  const ctrls = (h) => { el.querySelector('#pctrls').innerHTML = String(h); };
  const play = (uci) => chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  const cg = Chessground(boardEl, {
    fen: chess.fen(), orientation: cgColor(you), coordinates: true, turnColor: cgColor(chess.turn()),
    lastMove: P.lastMove ? [P.lastMove.slice(0, 2), P.lastMove.slice(2, 4)] : undefined, check: inCheck(chess),
    movable: { free: false, color: cgColor(you), dests: dests(chess), showDests: true }, premovable: { enabled: false },
    drawable: { enabled: false }, animation: { duration: 200 },
    events: { move: (from, to) => onMove(from, to) },
  });
  addEventListener('resize', function r() { if (boardEl.isConnected) cg.redrawAll(); else removeEventListener('resize', r); });
  const sync = (interactive) => cg.set({ fen: chess.fen(), turnColor: cgColor(chess.turn()), check: inCheck(chess), lastMove: lastMove(chess) || undefined,
    movable: { color: interactive ? cgColor(you) : undefined, dests: interactive ? dests(chess) : new Map() } });

  async function record(solved) {
    finished = true;
    const row = { day: t, puzzle_id: P.id, rating: P.rating, solved };
    try { await ctx.store.insert('chess_puzzles', row); } catch { /* already recorded today */ }
    if (solved) await ctx.award('CHA', XP.puzzle, 'puzzle', t, 'Daily puzzle solved');
  }
  const showSolved = (solved) => {
    status(solved ? (mistakes ? 'Solved! Well done.' : 'Solved first try! Brilliant.') : 'Here’s the solution. Try again tomorrow.');
    ctrls(html`<button class="btn sm" data-act="replaysol">Replay solution</button><a class="btn sm" href="https://lichess.org/training/${P.id}" target="_blank" rel="noopener noreferrer">Open on Lichess</a>`);
  };

  if (finished) {
    for (const m of sol) play(m);
    sync(false);
    showSolved(rec.solved);
  } else {
    status(`${colorName(you)} to play. Find the best move.`);
    ctrls(html`<button class="btn sm" data-act="giveup">Show solution</button>`);
  }

  async function onMove(from, to) {
    if (finished) return;
    const exp = sol[step];
    const piece = chess.get(from);
    let promotion;
    if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) promotion = await askPromotion(boardEl, you);
    const tryMove = new Chess(chess.fen());
    let mv;
    try { mv = tryMove.move({ from, to, promotion }); } catch { sync(true); return; }
    const right = `${from}${to}${promotion || ''}` === exp || `${from}${to}` === exp || (step === sol.length - 1 && tryMove.isCheckmate());
    if (!right) {
      mistakes += 1;
      status(`${mv.san} isn’t it. Try again.`);
      setTimeout(() => sync(true), 350);
      return;
    }
    play(`${from}${to}${promotion || ''}`); step += 1; sync(false);
    if (step >= sol.length) { await record(true); showSolved(true); return; }
    status('Good move! Keep going…');
    await new Promise((r) => setTimeout(r, 450));
    play(sol[step]); step += 1;
    if (step >= sol.length) { sync(false); await record(true); showSolved(true); return; }
    sync(true);
  }

  wire(el, {
    giveup: async () => {
      if (!confirm('Show the solution? Today’s puzzle won’t count as solved.')) return;
      while (step < sol.length) { play(sol[step]); step += 1; sync(false); await new Promise((r) => setTimeout(r, 450)); }
      await record(false); showSolved(false);
    },
    replaysol: async () => {
      const c = new Chess(P.fen);
      cg.set({ fen: c.fen(), lastMove: undefined, check: false, movable: { color: undefined, dests: new Map() } });
      for (const m of sol) {
        await new Promise((r) => setTimeout(r, 650));
        c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] || undefined });
        cg.set({ fen: c.fen(), lastMove: [m.slice(0, 2), m.slice(2, 4)], check: c.inCheck() ? cgColor(c.turn()) : false });
      }
    },
  });
}

// ------------------------------------------------------------------ history + replay
async function historyPane(el, ctx, done) {
  const list = done.filter((g) => g.ending !== 'abandoned' || g.moves > 0).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (replay) {
    const g = list.find((x) => x.id === replay.id);
    if (g) return replayGame(el, ctx, g);
  }
  const byLevel = LEVELS.map((L) => {
    const gs = list.filter((g) => g.level === L.n);
    return { L, w: gs.filter((g) => g.result === 'win').length, l: gs.filter((g) => g.result === 'loss').length, d: gs.filter((g) => g.result === 'draw').length };
  }).filter((x) => x.w + x.l + x.d);
  mount(el, html`
    ${byLevel.length ? html`<section class="card"><div class="card-head"><h2>By level</h2><span class="meta">W · L · D</span></div>
      <ul class="list">${byLevel.map(({ L, w, l, d }) => html`<li class="item"><div class="body"><p class="title">${L.n}. ${L.name}</p></div><span class="rec"><b>${w}</b> · ${l} · ${d}</span></li>`)}</ul>
    </section>` : ''}
    <section class="card">
      <div class="card-head"><h2>Games</h2><span class="meta">${list.length}</span></div>
      ${list.length ? html`<ul class="list">${list.slice(0, 60).map((g) => html`<li><a class="item hit" href="#/games/chess" data-act="open" data-id="${g.id}">
        <span class="pill ${g.result === 'win' ? 'solid' : ''}">${RESULT[g.result]}</span>
        <div class="body"><p class="title">vs ${LEVELS[g.level - 1]?.name || 'Stockfish'} · as ${colorName(g.color)}</p>
          <p class="sub">${g.moves} moves · ${ENDING[g.ending] || ''} · ${relDate(g.ended_on || g.created_at.slice(0, 10))}</p></div>${raw(icon('right', 16))}</a></li>`)}</ul>`
        : empty('No finished games yet. Your games show up here to replay.')}
    </section>`);
  wire(el, {
    open: (a) => { replay = { id: a.dataset.id, ply: 0 }; ctx.rerender(); },
  });
}

async function replayGame(el, ctx, g) {
  const full = new Chess();
  try { full.loadPgn(g.pgn || ''); } catch { /* empty */ }
  const moves = full.history({ verbose: true });
  let ply = Math.min(replay.ply ?? moves.length, moves.length);
  mount(el, html`
    <button class="text-btn back" data-act="back">${raw(icon('left', 16))}All games</button>
    <section class="card board-card">
      <div class="player top"><span class="pname"><span class="pill ${g.result === 'win' ? 'solid' : ''}">${RESULT[g.result]}</span> vs ${LEVELS[g.level - 1]?.name} · ${ENDING[g.ending] || ''}</span>
        <span class="small muted">${fmtDate(g.ended_on || g.created_at.slice(0, 10))}</span></div>
      <div class="board-wrap"><div class="cg-wrap" id="board"></div></div>
      <div class="row replay-ctrls">
        <button class="icon-btn" data-act="first" aria-label="Start">⏮</button>
        <button class="icon-btn" data-act="prev" aria-label="Previous move">${raw(icon('left'))}</button>
        <span id="ply" class="small muted"></span>
        <button class="icon-btn" data-act="next" aria-label="Next move">${raw(icon('right'))}</button>
        <button class="icon-btn" data-act="last" aria-label="End">⏭</button>
      </div>
    </section>
    <section class="card"><ol class="movelist" id="moves">${Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => html`<li>
      <button type="button" data-act="goto" data-ply="${2 * i + 1}">${moves[2 * i].san}</button>
      ${moves[2 * i + 1] ? html`<button type="button" data-act="goto" data-ply="${2 * i + 2}">${moves[2 * i + 1].san}</button>` : html`<span></span>`}</li>`)}</ol></section>`);
  const boardEl = el.querySelector('#board');
  const cg = Chessground(boardEl, { viewOnly: true, coordinates: true, orientation: cgColor(g.color), animation: { duration: 160 }, drawable: { enabled: false } });
  addEventListener('resize', function r() { if (boardEl.isConnected) cg.redrawAll(); else removeEventListener('resize', r); });
  const show = () => {
    const c = new Chess();
    for (let i = 0; i < ply; i += 1) c.move(moves[i].san);
    const lm = ply ? [moves[ply - 1].from, moves[ply - 1].to] : undefined;
    cg.set({ fen: c.fen(), lastMove: lm, check: c.inCheck() ? cgColor(c.turn()) : false });
    el.querySelector('#ply').textContent = ply ? `Move ${Math.ceil(ply / 2)} of ${Math.ceil(moves.length / 2)}` : 'Start';
    el.querySelectorAll('#moves button').forEach((b) => b.classList.toggle('on', +b.dataset.ply === ply));
    replay.ply = ply;
  };
  show();
  const go = (p) => { ply = Math.max(0, Math.min(moves.length, p)); show(); };
  const onKey = (e) => {
    if (!boardEl.isConnected) { removeEventListener('keydown', onKey); return; }
    if (e.key === 'ArrowLeft') go(ply - 1); if (e.key === 'ArrowRight') go(ply + 1);
  };
  addEventListener('keydown', onKey);
  wire(el, {
    back: () => { replay = null; ctx.rerender(); },
    first: () => go(0), prev: () => go(ply - 1), next: () => go(ply + 1), last: () => go(moves.length),
    goto: (b) => go(+b.dataset.ply),
  });
}
