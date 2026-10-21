// Word Hive: make words from seven letters. Every word needs the centre letter and at least four
// letters, and letters can be used again. Everyone gets the same hive each day.
import { html, raw, wire, mount, today, addDays, fmtDate } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { dayNumber } from './word.js';

let lists = null;
export async function loadHive() {
  if (!lists) {
    const m = await import('../hive-words.js');
    lists = { answers: m.ANSWERS.split(' '), extra: new Set(m.EXTRA.split(' ')), puzzles: m.PUZZLES.split(' ') };
  }
  return lists;
}

export const RANKS = [
  ['Beginner', 0], ['Good start', 2], ['Moving up', 5], ['Good', 8], ['Solid', 15],
  ['Nice', 25], ['Great', 40], ['Amazing', 50], ['Genius', 70],
];
export const points = (w, letters) => (w.length === 4 ? 1 : w.length) + (new Set(w).size === 7 && [...letters].every((c) => w.includes(c)) ? 7 : 0);
export const isPangram = (w) => new Set(w).size === 7;

const hives = new Map();
export function hiveFor(day, L) {
  if (hives.has(day)) return hives.get(day);
  const n = dayNumber(day);
  const p = L.puzzles[((n - 1) % L.puzzles.length + L.puzzles.length) % L.puzzles.length];
  const letters = p.slice(0, 7); const centre = p[7];
  const fits = (w) => w.includes(centre) && [...w].every((c) => letters.includes(c));
  const words = L.answers.filter(fits).sort();
  const max = words.reduce((s, w) => s + points(w, letters), 0);
  const h = { n, letters, centre, outer: [...letters].filter((c) => c !== centre), words, max, fits };
  hives.set(day, h);
  return h;
}
export function rankOf(score, max) {
  const pct = max ? (score / max) * 100 : 0;
  let r = 0; RANKS.forEach(([, at], i) => { if (pct >= at) r = i; });
  return { i: r, name: RANKS[r][0], next: RANKS[r + 1] ? Math.ceil((RANKS[r + 1][1] / 100) * max) : null };
}
export function hiveStats(rows, t, L) {
  let genius = 0; let streak = 0;
  const played = new Set(rows.filter((r) => r.words?.length).map((r) => r.day));
  for (const r of rows) if (r.words?.length && rankOf(r.score, hiveFor(r.day, L).max).i >= 8) genius += 1;
  for (let d = played.has(t) ? t : addDays(t, -1); played.has(d); d = addDays(d, -1)) streak += 1;
  return { played: played.size, genius, streak };
}

// ---------- page ----------
let typed = '';
let typedDay = null;
let order = null;           // shuffled outer letters
let showYesterday = false;

export default {
  id: 'hive',
  label: 'Word Hive',
  async render(el, ctx) {
    const t = today();
    if (typedDay !== t) { typed = ''; typedDay = t; order = null; showYesterday = false; }
    const [L, rows] = await Promise.all([loadHive(), ctx.store.list('hive_games', { order: 'day', limit: 2000 })]);
    const h = hiveFor(t, L);
    if (!order) order = h.outer.slice();
    let rec = rows.find((r) => r.day === t) || null;
    const found = rec?.words ? [...rec.words] : [];
    let score = found.reduce((s, w) => s + points(w, h.letters), 0);
    const y = addDays(t, -1);
    const yh = hiveFor(y, L);
    const yrec = rows.find((r) => r.day === y);

    mount(el, html`
      <a class="text-btn back" href="#/games">${raw(icon('left', 16))}Games</a>
      <header class="page-head"><div><h1>Word Hive</h1><p>#${h.n} · ${fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></header>
      <section class="hv-wrap">
        <div class="hv-rank" id="hv-rank"></div>
        <div class="hv-found" id="hv-found"></div>
        <div class="hv-play">
          <p class="wd-msg" id="hv-msg" role="status" aria-live="polite"></p>
          <div class="hv-input" id="hv-input" aria-label="Your word"></div>
          <div class="hv-hive" id="hv-hive" aria-label="Letters"></div>
        </div>
        <div class="hv-ctrls">
          <button type="button" class="btn" data-k="Backspace">Delete</button>
          <button type="button" class="icon-btn hv-shuf" data-k="shuffle" aria-label="Shuffle letters">${raw(icon('shuffle', 20))}</button>
          <button type="button" class="btn primary" data-k="Enter">Enter</button>
        </div>
      </section>
      <section class="card wd-help">
        <p class="small muted">Make words of 4 or more letters. Every word must use the <b class="hv-c">centre letter</b>, and letters can repeat. 4-letter words score 1 point, longer words score 1 per letter, and a <b>pangram</b> (all seven letters) scores 7 extra.
        Reach <b>Great</b> for +${XP.hive.great} and <b>Genius</b> for +${XP.hive.genius} Craft. A new hive every day at midnight.</p>
        ${yh.words.length ? html`<button class="text-btn" data-act="yesterday">${showYesterday ? 'Hide' : 'Show'} yesterday’s words</button>
          <div id="hv-yest" ${showYesterday ? '' : 'hidden'}><p class="small muted">Centre <b>${yh.centre.toUpperCase()}</b> · ${yh.letters.toUpperCase()} · you found ${yrec?.words?.length || 0} of ${yh.words.length}</p>
          <p class="hv-ylist small">${yh.words.map((w) => html`<span class="${yrec?.words?.includes(w) ? 'got' : ''} ${isPangram(w) ? 'pg' : ''}">${w}</span>`)}</p></div>` : ''}
      </section>`);

    const msg = (s, kind = '', ms = 1500) => {
      const m = el.querySelector('#hv-msg'); m.textContent = s; m.className = `wd-msg show ${kind}`;
      clearTimeout(msg.t); if (ms) msg.t = setTimeout(() => m.classList.remove('show'), ms);
    };
    const drawHive = () => {
      const cells = [h.centre, ...order];
      el.querySelector('#hv-hive').innerHTML = String(html`${cells.map((c, i) => html`<button type="button" class="hv-cell ${i ? '' : 'mid'} p${i}" data-k="${c}" aria-label="${c.toUpperCase()}${i ? '' : ', centre letter'}">${c.toUpperCase()}</button>`)}`);
    };
    const drawInput = () => {
      el.querySelector('#hv-input').innerHTML = typed
        ? String(html`${[...typed].map((c) => html`<span class="${c === h.centre ? 'mid' : h.letters.includes(c) ? '' : 'bad'}">${c.toUpperCase()}</span>`)}<i class="hv-caret"></i>`)
        : '<i class="hv-caret"></i>';
    };
    let openList = false;
    const drawScore = () => {
      const r = rankOf(score, h.max);
      el.querySelector('#hv-rank').innerHTML = String(html`<div class="row spread"><b class="hv-rname">${r.name}</b><span class="small muted">${score} point${score === 1 ? '' : 's'}${r.next ? ` · ${r.next - score} to ${RANKS[r.i + 1][0]}` : ''}</span></div>
        <div class="hv-track" role="progressbar" aria-valuemin="0" aria-valuemax="${RANKS.length - 1}" aria-valuenow="${r.i}" aria-label="Rank">${RANKS.map((_, i) => html`<i class="${i < r.i ? 'past' : i === r.i ? 'now' : ''}">${i === r.i ? score : ''}</i>`)}</div>`);
      const sorted = [...found].sort();
      el.querySelector('#hv-found').innerHTML = String(html`<button type="button" class="hv-fbar" data-act="list" aria-expanded="${openList}">
          <span>${found.length ? html`You found ${found.length} word${found.length === 1 ? '' : 's'}${openList ? '' : html`: <span class="muted">${[...found].reverse().slice(0, 8).join(' ')}</span>`}` : html`<span class="muted">Your words will appear here</span>`}</span>${raw(icon(openList ? 'up' : 'down', 16))}</button>
        ${openList && found.length ? html`<p class="hv-flist">${sorted.map((w) => html`<span class="${isPangram(w) ? 'pg' : ''}">${w}</span>`)}</p>` : ''}
        ${found.length === h.words.length && h.words.length ? html`<p class="small hv-all">You found every word. Hive master!</p>` : ''}`);
    };
    drawHive(); drawInput(); drawScore();

    let busy = false;
    async function submit() {
      const w = typed; typed = ''; drawInput();
      if (!w) return;
      const why = w.length < 4 ? 'Too short' : !w.includes(h.centre) ? 'Missing centre letter' : ![...w].every((c) => h.letters.includes(c)) ? 'Bad letters'
        : found.includes(w) ? 'Already found' : !(h.words.includes(w) || L.extra.has(w)) ? 'Not in the word list' : null;
      if (why) { msg(why); const i = el.querySelector('#hv-input'); i.classList.remove('shake'); void i.offsetWidth; i.classList.add('shake'); return; }
      busy = true;
      const before = rankOf(score, h.max).i;
      found.push(w);
      const pts = points(w, h.letters);
      score += pts;
      try {
        rec = rec ? await ctx.store.update('hive_games', rec.id, { words: found, score }) : await ctx.store.insert('hive_games', { day: t, words: found, score });
      } catch (err) { found.pop(); score -= pts; busy = false; msg(err.message || 'Couldn’t save that word', '', 3000); drawScore(); return; }
      busy = false;
      const praise = isPangram(w) ? 'Pangram!' : w.length >= 7 ? 'Awesome!' : w.length >= 5 ? 'Nice!' : 'Good!';
      msg(`${praise} +${pts}`, isPangram(w) ? 'pg' : 'ok');
      drawScore();
      const after = rankOf(score, h.max).i;
      if (after >= 6 && before < 6) await ctx.award('CHA', XP.hive.great, 'hive', `${t}:great`, 'Word Hive: Great');
      if (after >= 8 && before < 8) await ctx.award('CHA', XP.hive.genius, 'hive', `${t}:genius`, 'Word Hive: Genius');
    }
    function press(k) {
      if (busy) return;
      if (k === 'Enter') { submit(); return; }
      if (k === 'Backspace') typed = typed.slice(0, -1);
      else if (k === 'shuffle') {
        for (let i = order.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        drawHive(); return;
      } else if (/^[a-z]$/.test(k) && typed.length < 19) typed += k;
      else return;
      drawInput();
    }
    el.querySelector('.hv-wrap').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    const onKey = (e) => {
      if (!el.isConnected) { removeEventListener('keydown', onKey); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      const k = e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key === ' ' ? 'shuffle' : e.key.length === 1 ? e.key.toLowerCase() : null;
      if (!k) return;
      e.preventDefault();
      press(k);
    };
    addEventListener('keydown', onKey);

    wire(el, {
      list: () => { openList = !openList; drawScore(); },
      yesterday: (b) => { showYesterday = !showYesterday; el.querySelector('#hv-yest').hidden = !showYesterday; b.textContent = `${showYesterday ? 'Hide' : 'Show'} yesterday’s words`; },
    });
  },
};
