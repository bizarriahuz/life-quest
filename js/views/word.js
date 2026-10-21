// Daily Word: guess the five-letter word in six tries. Everyone gets the same word each day.
// The word lists load only when you open the game.
import { html, raw, wire, mount, today, addDays, fmtDate } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

export const START = '2026-10-21';          // Daily Word #1
const ROWS = 6;
const KEYS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];   // + = Enter, - = Backspace
let lists = null;
let typing = '';                             // letters typed on the current row
let typingDay = null;
let showStats = false;

export async function loadLists() {
  if (!lists) {
    const m = await import('../words.js');
    lists = { answers: m.ANSWERS, ok: new Set([...m.ANSWERS, ...m.EXTRA]) };
  }
  return lists;
}
const utc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dayNumber = (day) => Math.round((utc(day) - utc(START)) / 864e5) + 1;
export function wordFor(day, answers) {
  const i = ((dayNumber(day) - 1) % answers.length + answers.length) % answers.length;
  return answers[i];
}

// Colour each letter: hit (right place), near (in the word), miss. Repeated letters are only
// marked as often as they appear in the answer.
export function score(guess, answer) {
  const res = Array(5).fill('miss');
  const left = {};
  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) res[i] = 'hit';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i += 1) {
    if (res[i] !== 'hit' && left[guess[i]]) { res[i] = 'near'; left[guess[i]] -= 1; }
  }
  return res;
}

export function wordStats(rows, t) {
  const done = rows.filter((r) => r.finished);
  const won = done.filter((r) => r.solved);
  const solvedDays = new Set(won.map((r) => r.day));
  let streak = 0;
  const missedToday = done.some((r) => r.day === t && !r.solved);            // a miss today breaks the streak
  if (!missedToday) for (let d = solvedDays.has(t) ? t : addDays(t, -1); solvedDays.has(d); d = addDays(d, -1)) streak += 1;
  let best = 0; let run = 0; let prev = null;
  for (const d of [...solvedDays].sort()) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const dist = [1, 2, 3, 4, 5, 6].map((n) => won.filter((r) => r.guesses.length === n).length);
  return { played: done.length, won: won.length, pct: done.length ? Math.round((won.length / done.length) * 100) : 0, streak, best, dist };
}

const EMOJI = { hit: '🟩', near: '🟨', miss: '⬛' };

export default {
  id: 'word',
  label: 'Daily Word',
  async render(el, ctx) {
    const t = today();
    if (typingDay !== t) { typing = ''; typingDay = t; }
    const [{ answers, ok }, rows] = await Promise.all([
      loadLists(),
      ctx.store.list('word_games', { order: 'day', limit: 2000 }),
    ]);
    const answer = wordFor(t, answers);
    const n = dayNumber(t);
    let rec = rows.find((r) => r.day === t) || null;
    let guesses = rec?.guesses ? [...rec.guesses] : [];
    let finished = Boolean(rec?.finished);
    const stats = () => wordStats([...rows.filter((r) => r.day !== t), ...(rec ? [rec] : [])], t);

    mount(el, html`
      <a class="text-btn back" href="#/games">${raw(icon('left', 16))}Games</a>
      <header class="page-head wd-head"><div><h1>Daily Word</h1><p>#${n} · ${fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <button class="icon-btn" data-act="stats" aria-label="Your stats">${raw(icon('review'))}</button></header>
      <section class="wd-wrap">
        <p class="wd-msg" id="wd-msg" role="status" aria-live="polite"></p>
        <div class="wd-grid" id="wd-grid" role="grid" aria-label="Guesses"></div>
        <div class="wd-after" id="wd-after"></div>
        <div class="wd-keys" id="wd-keys" aria-label="Keyboard"></div>
      </section>
      <section class="card wd-help">
        <p class="small muted">Guess the five-letter word in six tries. <b class="wd-chip hit">G</b> right letter, right spot · <b class="wd-chip near">Y</b> in the word, wrong spot · <b class="wd-chip miss">X</b> not in the word.
        Solve it for +${XP.word} Craft. A new word every day at midnight.</p>
      </section>`);

    const grid = el.querySelector('#wd-grid');
    const keysEl = el.querySelector('#wd-keys');
    const msg = (s, ms = 1600) => {
      const m = el.querySelector('#wd-msg'); m.textContent = s; m.classList.add('show');
      clearTimeout(msg.t); if (ms) msg.t = setTimeout(() => m.classList.remove('show'), ms);
    };

    const keyState = () => {
      const st = {};
      const rank = { miss: 1, near: 2, hit: 3 };
      for (const g of guesses) score(g, answer).forEach((s, i) => { if ((rank[s] || 0) > (rank[st[g[i]]] || 0)) st[g[i]] = s; });
      return st;
    };
    const drawGrid = (reveal = -1) => {
      grid.innerHTML = String(html`${Array.from({ length: ROWS }, (_, r) => {
        const g = guesses[r];
        const sc = g ? score(g, answer) : null;
        const letters = g || (r === guesses.length && !finished ? typing.padEnd(5) : '     ');
        return html`<div class="wd-row ${r === guesses.length && !finished ? 'cur' : ''}" role="row">${[...letters].map((ch, i) => html`
          <span role="gridcell" class="wd-tile ${sc ? sc[i] : ch.trim() ? 'filled' : ''} ${r === reveal ? 'flip' : ''}" style="${r === reveal ? `animation-delay:${i * 260}ms` : ''}"
            aria-label="${ch.trim() ? `${ch.toUpperCase()}${sc ? `, ${{ hit: 'correct', near: 'in the word', miss: 'not in the word' }[sc[i]]}` : ''}` : 'empty'}">${ch.trim().toUpperCase()}</span>`)}</div>`;
      })}`);
    };
    const drawKeys = () => {
      const st = keyState();
      keysEl.innerHTML = String(html`${KEYS.map((row) => html`<div class="wd-krow">${[...row].map((k) => (k === '+'
        ? html`<button type="button" class="wd-key wide" data-k="Enter" aria-label="Enter">Enter</button>`
        : k === '-' ? html`<button type="button" class="wd-key wide" data-k="Backspace" aria-label="Delete letter">${raw(icon('left', 18))}</button>`
          : html`<button type="button" class="wd-key ${st[k] || ''}" data-k="${k}">${k.toUpperCase()}</button>`))}</div>`)}`);
    };
    const nextIn = () => {
      const now = new Date(); const mid = new Date(now); mid.setHours(24, 0, 0, 0);
      const s = Math.max(0, Math.floor((mid - now) / 1000));
      return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    const drawAfter = () => {
      const box = el.querySelector('#wd-after');
      if (!finished && !showStats) { box.innerHTML = ''; keysEl.hidden = false; return; }
      const s = stats(); const max = Math.max(1, ...s.dist);
      const solved = rec?.solved;
      keysEl.hidden = finished;
      box.innerHTML = String(html`<section class="card wd-result">
        ${finished ? html`<h2>${solved ? ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'][guesses.length - 1] : 'Not this time'}</h2>
          <p class="muted">${solved ? `Solved in ${guesses.length}/6.` : html`The word was <b class="wd-answer">${answer.toUpperCase()}</b>.`}</p>` : html`<h2>Your stats</h2>`}
        <div class="wd-stats">
          <span><b>${s.played}</b>Played</span><span><b>${s.pct}</b>Win %</span><span><b>${s.streak}</b>Streak</span><span><b>${s.best}</b>Best</span>
        </div>
        <p class="small muted" style="margin:12px 0 6px">Guesses</p>
        <ol class="wd-dist">${s.dist.map((c, i) => html`<li><span>${i + 1}</span><i class="${finished && solved && guesses.length === i + 1 ? 'me' : ''}" style="width:${Math.max(8, (c / max) * 100)}%">${c}</i></li>`)}</ol>
        ${finished ? html`<div class="row spread wrap wd-foot">
          <p class="small muted">Next word in <b id="wd-next">${nextIn()}</b></p>
          <button class="btn primary sm" data-act="share">${raw(icon('copy', 15))}Share</button></div>` : html`<button class="btn sm" data-act="stats">Back to the game</button>`}
      </section>`);
    };
    const drawAll = (reveal) => { drawGrid(reveal); drawKeys(); drawAfter(); };
    drawAll();
    const startTick = () => {
      const tick = setInterval(() => { const n2 = el.querySelector('#wd-next'); if (!n2 || !el.isConnected) { clearInterval(tick); return; } n2.textContent = nextIn(); }, 1000);
    };
    if (finished) startTick();

    let busy = false;
    async function submit() {
      if (finished || busy) return;
      if (typing.length < 5) { msg('Not enough letters'); shake(); return; }
      if (!ok.has(typing)) { msg('Not in the word list'); shake(); return; }
      busy = true;
      guesses.push(typing); typing = '';
      const solved = guesses[guesses.length - 1] === answer;
      finished = solved || guesses.length >= ROWS;
      const patch = { guesses, solved, finished };
      try {
        rec = rec ? await ctx.store.update('word_games', rec.id, patch) : await ctx.store.insert('word_games', { day: t, ...patch });
      } catch (err) { guesses.pop(); finished = false; busy = false; msg(err.message || 'Couldn’t save that guess', 3000); drawAll(); return; }
      drawGrid(guesses.length - 1); drawKeys();
      await new Promise((r) => setTimeout(r, 5 * 260 + 250));
      busy = false;
      if (!el.isConnected) return;
      if (finished) {
        if (solved) {
          grid.querySelectorAll('.wd-row')[guesses.length - 1]?.classList.add('win');
          await ctx.award('CHA', XP.word, 'word', t, `Daily Word in ${guesses.length}`);
        } else msg(answer.toUpperCase(), 0);
        drawAfter();
        startTick();
      }
    }
    function shake() { const row = grid.querySelectorAll('.wd-row')[guesses.length]; row?.classList.remove('shake'); void row?.offsetWidth; row?.classList.add('shake'); }
    function press(k) {
      if (finished || busy) return;
      if (k === 'Enter') { submit(); return; }
      if (k === 'Backspace') typing = typing.slice(0, -1);
      else if (/^[a-z]$/.test(k) && typing.length < 5) typing += k;
      else return;
      drawGrid();
      const tile = grid.querySelectorAll('.wd-row')[guesses.length]?.children[Math.max(0, typing.length - 1)];
      if (k !== 'Backspace') tile?.classList.add('pop');
    }
    keysEl.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    const onKey = (e) => {
      if (!el.isConnected) { removeEventListener('keydown', onKey); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      const k = e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.length === 1 ? e.key.toLowerCase() : null;
      if (!k) return;
      e.preventDefault();
      press(k);
    };
    addEventListener('keydown', onKey);

    wire(el, {
      stats: () => { showStats = !showStats; drawAfter(); if (showStats) el.querySelector('#wd-after')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
      share: async () => {
        const lines = guesses.map((g) => score(g, answer).map((s) => EMOJI[s]).join(''));
        const text = `Daily Word #${n} ${rec?.solved ? guesses.length : 'X'}/6\n\n${lines.join('\n')}\n\n${location.origin}`;
        if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* closed */ } }
        try { await navigator.clipboard.writeText(text); ctx.say('Result copied. Paste it anywhere'); } catch { window.prompt('Copy your result:', text); }
      },
    });
  },
};
