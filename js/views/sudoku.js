// Sudoku: a new puzzle every day at Easy, Medium and Hard. Each puzzle is generated on the phone
// from the date, so everyone gets the same three puzzles, and every one has exactly one solution.
import { html, raw, wire, mount, today, addDays, fmtDate } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { dayNumber } from './word.js';

export const LEVELS = [
  { id: 'easy', label: 'Easy', clues: 40 },
  { id: 'medium', label: 'Medium', clues: 32 },
  { id: 'hard', label: 'Hard', clues: 25 },
];

// ---------- puzzle maker ----------
function rng(seed) {                       // mulberry32: small, fast, the same on every device
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const ROW = (i) => Math.floor(i / 9);
const COL = (i) => i % 9;
const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (let j = 0; j < 81; j += 1) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
  return [...s];
});
const bits = (m) => { let n = 0; while (m) { m &= m - 1; n += 1; } return n; };

// Count solutions (stopping at `limit`). Optionally fills `out` with the first solution found.
function solve(grid, limit = 2, r = null, out = null) {
  const g = grid.slice();
  const rows = new Array(9).fill(0); const cols = new Array(9).fill(0); const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i += 1) if (g[i]) {
    const b = 1 << g[i];
    if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & b) return 0;
    rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b;
  }
  let count = 0;
  const go = () => {
    let best = -1; let bestMask = 0; let bestN = 10;
    for (let i = 0; i < 81; i += 1) if (!g[i]) {
      const m = ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & 0x3FE;
      const n = bits(m);
      if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) { count += 1; if (out && count === 1) out.splice(0, 81, ...g); return count >= limit; }
    if (!bestN) return false;
    const ds = []; for (let d = 1; d <= 9; d += 1) if (bestMask & (1 << d)) ds.push(d);
    if (r) shuffle(ds, r);
    const rr = ROW(best); const cc = COL(best); const bb = BOX(best);
    for (const d of ds) {
      const b = 1 << d;
      g[best] = d; rows[rr] |= b; cols[cc] |= b; boxes[bb] |= b;
      if (go()) return true;
      g[best] = 0; rows[rr] &= ~b; cols[cc] &= ~b; boxes[bb] &= ~b;
    }
    return false;
  };
  go();
  return count;
}

const made = new Map();
export function puzzleFor(day, level) {
  const key = `${day}:${level}`;
  if (made.has(key)) return made.get(key);
  const lv = LEVELS.find((l) => l.id === level) || LEVELS[0];
  const r = rng(dayNumber(day) * 7919 + LEVELS.indexOf(lv) * 104729 + 20261021);
  const solution = [];
  solve(new Array(81).fill(0), 1, r, solution);
  const grid = solution.slice();
  let clues = 81;
  // Take numbers away in symmetric pairs while the puzzle still has only one answer.
  for (const i of shuffle([...Array(41).keys()], r)) {
    if (clues <= lv.clues) break;
    const j = 80 - i;
    const keep = [grid[i], grid[j]];
    grid[i] = 0; grid[j] = 0;
    if (solve(grid, 2) === 1) clues -= i === j ? 1 : 2;
    else { grid[i] = keep[0]; grid[j] = keep[1]; }
  }
  // Still short of the target? Try single squares too.
  for (const i of shuffle([...Array(81).keys()], r)) {
    if (clues <= lv.clues) break;
    if (!grid[i]) continue;
    const keep = grid[i];
    grid[i] = 0;
    if (solve(grid, 2) === 1) clues -= 1; else grid[i] = keep;
  }
  const p = { puzzle: grid.join(''), solution: solution.join(''), clues };
  made.set(key, p);
  return p;
}

// ---------- stats ----------
export function sudokuStats(rows, t) {
  const won = rows.filter((r) => r.solved);
  const days = new Set(won.map((r) => r.day));
  let streak = 0;
  for (let d = days.has(t) ? t : addDays(t, -1); days.has(d); d = addDays(d, -1)) streak += 1;
  const best = Object.fromEntries(LEVELS.map((l) => {
    const s = won.filter((r) => r.level === l.id).map((r) => r.seconds);
    return [l.id, s.length ? Math.min(...s) : null];
  }));
  return { solved: won.length, streak, best };
}
export const clock = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:` : '') + `${String(Math.floor((s % 3600) / 60)).padStart(s >= 3600 ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;

// ---------- page ----------
let level = 'easy';
let sel = -1;
let notesMode = false;
const undo = new Map();              // `${day}:${level}` -> past states, kept while the app is open

export default {
  id: 'sudoku',
  label: 'Sudoku',
  async render(el, ctx) {
    const t = today();
    const rows = await ctx.store.list('sudoku_games', { order: 'day', limit: 3000 });
    const todays = Object.fromEntries(rows.filter((r) => r.day === t).map((r) => [r.level, r]));
    const { puzzle, solution } = puzzleFor(t, level);
    let rec = todays[level] || null;
    const cells = [...(rec?.cells || puzzle)].map(Number);
    const notes = rec?.notes?.length === 81 ? [...rec.notes] : new Array(81).fill(0);
    let mistakes = rec?.mistakes || 0;
    let seconds = rec?.seconds || 0;
    let solved = Boolean(rec?.solved);
    const given = [...puzzle].map((c) => c !== '0');
    const ukey = `${t}:${level}`;
    if (!undo.has(ukey)) undo.set(ukey, []);
    const past = undo.get(ukey);
    if (sel >= 0 && given[sel]) sel = -1;

    mount(el, html`
      <a class="text-btn back" href="#/games">${raw(icon('left', 16))}Games</a>
      <header class="page-head"><div><h1>Sudoku</h1><p>${fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></header>
      <div class="seg su-levels" role="tablist">${LEVELS.map((l) => html`<button role="tab" aria-selected="${l.id === level}" class="${l.id === level ? 'on' : ''}" data-act="level" data-level="${l.id}">${l.label}${todays[l.id]?.solved ? html` <span class="su-tick">✓</span>` : ''}</button>`)}</div>
      <section class="su-wrap">
        <div class="su-bar"><span>Mistakes <b id="su-mis">${mistakes}</b></span><span class="su-time" id="su-time">${clock(seconds)}</span></div>
        <div class="su-grid" id="su-grid" role="grid" aria-label="Sudoku grid"></div>
        <div class="su-after" id="su-after"></div>
        <div class="su-pad" id="su-pad"></div>
      </section>
      <section class="card wd-help">
        <p class="small muted">Fill every row, column and 3×3 box with 1 to 9. Tap a square, then a number. Turn on <b>Notes</b> to pencil in small candidates. Wrong numbers turn red.
        Solve Easy for +${XP.sudoku.easy}, Medium for +${XP.sudoku.medium} and Hard for +${XP.sudoku.hard} Craft. New puzzles every day at midnight.</p>
      </section>`);

    const grid = el.querySelector('#su-grid');
    const pad = el.querySelector('#su-pad');
    const wrong = (i) => cells[i] && !given[i] && cells[i] !== Number(solution[i]);

    const drawGrid = () => {
      const sv = sel >= 0 ? cells[sel] : 0;
      grid.innerHTML = String(html`${Array.from({ length: 81 }, (_, i) => {
        const v = cells[i];
        const near = sel >= 0 && (ROW(i) === ROW(sel) || COL(i) === COL(sel) || BOX(i) === BOX(sel));
        const cls = ['su-cell', given[i] ? 'given' : '', wrong(i) ? 'bad' : '', i === sel ? 'sel' : near ? 'near' : '', sv && v === sv && i !== sel ? 'same' : '',
          COL(i) % 3 === 2 && COL(i) < 8 ? 'br' : '', ROW(i) % 3 === 2 && ROW(i) < 8 ? 'bb' : ''].filter(Boolean).join(' ');
        const label = `Row ${ROW(i) + 1} column ${COL(i) + 1}, ${v ? v : 'empty'}${given[i] ? ', given' : ''}${wrong(i) ? ', wrong' : ''}`;
        return html`<button type="button" role="gridcell" class="${cls}" data-i="${i}" aria-label="${label}" ${solved ? 'disabled' : ''}>${v ? v
          : notes[i] ? html`<span class="su-notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => html`<i>${notes[i] & (1 << d) ? d : ''}</i>`)}</span>` : ''}</button>`;
      })}`);
    };
    const drawPad = () => {
      if (solved) { pad.innerHTML = ''; return; }
      const left = (d) => 9 - cells.filter((v, i) => v === d && v === Number(solution[i])).length;
      pad.innerHTML = String(html`<div class="su-nums">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => html`<button type="button" class="su-num" data-d="${d}" ${left(d) ? '' : 'disabled'} aria-label="${d}">${d}<small>${left(d) || ''}</small></button>`)}</div>
        <div class="su-tools">
          <button type="button" class="btn sm" data-tool="undo" ${past.length ? '' : 'disabled'}>${raw(icon('left', 15))}Undo</button>
          <button type="button" class="btn sm" data-tool="erase">${raw(icon('close', 15))}Erase</button>
          <button type="button" class="btn sm ${notesMode ? 'primary' : ''}" data-tool="notes" aria-pressed="${notesMode}">${raw(icon('edit', 15))}Notes ${notesMode ? 'on' : 'off'}</button>
        </div>`);
    };
    const drawAfter = () => {
      const box = el.querySelector('#su-after');
      if (!solved) { box.innerHTML = ''; return; }
      const s = sudokuStats([...rows.filter((r) => !(r.day === t && r.level === level)), rec], t);
      const lv = LEVELS.find((l) => l.id === level);
      const nextLv = LEVELS.find((l) => !todays[l.id]?.solved && l.id !== level);
      box.innerHTML = String(html`<section class="card wd-result">
        <h2>Solved!</h2>
        <p class="muted">${lv.label} in <b>${clock(seconds)}</b>${mistakes ? ` with ${mistakes} mistake${mistakes === 1 ? '' : 's'}` : ' with no mistakes'}.</p>
        <div class="wd-stats"><span><b>${s.solved}</b>Solved</span><span><b>${s.streak}</b>Day streak</span>
          <span><b>${s.best[level] != null ? clock(s.best[level]) : '–'}</b>Best ${lv.label.toLowerCase()}</span></div>
        <div class="row spread wrap wd-foot">
          <button class="btn sm" data-act="share">${raw(icon('copy', 15))}Share</button>
          ${nextLv ? html`<button class="btn primary sm" data-act="level" data-level="${nextLv.id}">Try ${nextLv.label}</button>` : html`<p class="small muted">All three done today. New puzzles at midnight.</p>`}
        </div></section>`);
    };
    const drawAll = () => { drawGrid(); drawPad(); drawAfter(); el.querySelector('#su-mis').textContent = mistakes; };
    drawAll();

    // Saving: the first move creates today's row, later moves update it (a short pause batches taps).
    let saveTimer = null; let saving = Promise.resolve();
    const save = (now = false) => {
      clearTimeout(saveTimer);
      const run = () => {
        const patch = { cells: cells.join(''), notes, mistakes, seconds, solved };
        saving = saving.then(async () => {
          try {
            rec = rec ? await ctx.store.update('sudoku_games', rec.id, patch) : await ctx.store.insert('sudoku_games', { day: t, level, ...patch });
            todays[level] = rec;
          } catch (err) { ctx.say(err.message || 'Couldn’t save your Sudoku'); }
        });
        return saving;
      };
      if (now) return run();
      saveTimer = setTimeout(run, 700);
      return null;
    };

    // Timer: runs while this page is open and on screen, until solved.
    let dirtyTime = false;
    const timer = setInterval(() => {
      if (!el.isConnected) { clearInterval(timer); if (dirtyTime && !solved) save(true); return; }
      if (solved || document.hidden || (!rec && !past.length)) return;
      seconds += 1; dirtyTime = true;
      const tm = el.querySelector('#su-time'); if (tm) tm.textContent = clock(seconds);
      if (seconds % 15 === 0) { dirtyTime = false; save(); }
    }, 1000);

    const snap = () => { past.push({ cells: cells.slice(), notes: notes.slice() }); if (past.length > 300) past.shift(); };
    async function place(d) {
      if (solved || sel < 0 || given[sel]) return;
      const i = sel;
      if (notesMode && d) {
        if (cells[i]) return;
        snap(); notes[i] ^= 1 << d;
      } else {
        if (cells[i] === d) return;
        snap();
        cells[i] = d; notes[i] = 0;
        if (d && d !== Number(solution[i])) mistakes += 1;
        if (d && d === Number(solution[i])) for (const p of PEERS[i]) notes[p] &= ~(1 << d);   // tidy notes
      }
      if (cells.join('') === solution) {
        solved = true; sel = -1;
        drawGrid(); drawPad();
        await save(true);
        drawAfter();
        grid.classList.add('win');
        await ctx.award('CHA', XP.sudoku[level], 'sudoku', ukey, `Sudoku ${LEVELS.find((l) => l.id === level).label}`);
        el.querySelector('.su-levels [data-level="' + level + '"]')?.insertAdjacentHTML('beforeend', ' <span class="su-tick">✓</span>');
        return;
      }
      drawAll();
      save();
    }
    function move(dr, dc) {
      if (sel < 0) { sel = 0; drawGrid(); return; }
      const r = (ROW(sel) + dr + 9) % 9; const c = (COL(sel) + dc + 9) % 9;
      sel = r * 9 + c; drawGrid();
      grid.querySelector(`[data-i="${sel}"]`)?.focus({ preventScroll: true });
    }

    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b || solved) return;
      sel = Number(b.dataset.i); drawGrid();
    });
    pad.addEventListener('click', (e) => {
      const n = e.target.closest('[data-d]');
      if (n) { place(Number(n.dataset.d)); return; }
      const tool = e.target.closest('[data-tool]')?.dataset.tool;
      if (tool === 'notes') { notesMode = !notesMode; drawPad(); }
      if (tool === 'erase') place(0);
      if (tool === 'undo' && past.length) { const p = past.pop(); cells.splice(0, 81, ...p.cells); notes.splice(0, 81, ...p.notes); drawAll(); save(); }
    });
    const onKey = (e) => {
      if (!el.isConnected) { removeEventListener('keydown', onKey); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || solved) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      const k = e.key;
      const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (/^[1-9]$/.test(k)) place(Number(k));
      else if (k === '0' || k === 'Backspace' || k === 'Delete') place(0);
      else if (arrows[k]) move(...arrows[k]);
      else if (k === 'n' || k === 'N') { notesMode = !notesMode; drawPad(); }
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);

    wire(el, {
      level: async (b) => {
        if (b.dataset.level === level) return;
        clearTimeout(saveTimer);
        if (dirtyTime && !solved && rec) await save(true);
        await saving;
        level = b.dataset.level; sel = -1;
        ctx.rerender();
      },
      share: async () => {
        const lv = LEVELS.find((l) => l.id === level).label;
        const text = `Sudoku ${lv} · ${fmtDate(t, { day: 'numeric', month: 'short' })}\n⏱ ${clock(seconds)}${mistakes ? ` · ${mistakes} mistake${mistakes === 1 ? '' : 's'}` : ' · no mistakes'}\n\n${location.origin}`;
        if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* closed */ } }
        try { await navigator.clipboard.writeText(text); ctx.say('Result copied. Paste it anywhere'); } catch { window.prompt('Copy your result:', text); }
      },
    });
  },
};
