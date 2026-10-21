// Games: a list of the games, each opening its own page (#/games/<game>).
import { html, raw, mount, today, addDays } from '../ui.js';
import { icon } from '../icons.js';
import chess from './chess.js';
import word, { loadLists, wordStats } from './word.js';

const GAMES = { chess, word };

export default {
  id: 'games',
  label: 'Games',
  async render(el, ctx) {
    const sub = (location.hash.match(/^#\/games\/(\w+)/) || [])[1];
    if (GAMES[sub]) return GAMES[sub].render(el, ctx);
    const t = today();
    const [words, games, puzzles] = await Promise.all([
      ctx.store.list('word_games', { order: 'day', limit: 2000 }).catch(() => []),
      ctx.store.list('chess_games', { order: 'created_at', limit: 200 }).catch(() => []),
      ctx.store.list('chess_puzzles', { gte: ['day', addDays(t, -400)] }).catch(() => []),
    ]);
    const ws = wordStats(words, t);
    const todayWord = words.find((w) => w.day === t);
    const live = games.find((g) => !g.result);
    const done = games.filter((g) => g.result && g.ending !== 'abandoned');
    const wins = done.filter((g) => g.result === 'win').length;
    const solved = new Set(puzzles.filter((p) => p.solved).map((p) => p.day));
    let pstreak = 0;
    if (!puzzles.some((p) => p.day === t && !p.solved)) for (let d = solved.has(t) ? t : addDays(t, -1); solved.has(d); d = addDays(d, -1)) pstreak += 1;
    const wordLine = todayWord?.finished ? (todayWord.solved ? `Solved in ${todayWord.guesses.length}/6 today` : 'Missed today’s word')
      : todayWord?.guesses?.length ? `${todayWord.guesses.length} of 6 guesses so far` : 'Today’s word is waiting';
    const chessLine = live ? `Game in progress · move ${Math.max(1, live.moves)}` : puzzles.some((p) => p.day === t) ? 'Today’s puzzle done' : 'Today’s puzzle is waiting';

    mount(el, html`
      <header class="page-head"><div><h1>Games</h1><p>Quick daily games, with streaks and Craft XP</p></div></header>
      <div class="game-list">
        <a class="card game-card" href="#/games/word">
          <span class="game-art wd-art" aria-hidden="true"><i class="hit">D</i><i class="near">A</i><i class="miss">I</i><i class="hit">L</i><i class="hit">Y</i></span>
          <span class="game-text"><b>Daily Word</b><span class="game-sub">Guess the five-letter word in six tries</span>
            <span class="game-status ${todayWord?.finished ? 'done' : ''}">${wordLine}${ws.streak ? ` · ${ws.streak}-day streak` : ''}</span></span>
          ${raw(icon('right', 18))}
        </a>
        <a class="card game-card" href="#/games/chess">
          <span class="game-art chess-art" aria-hidden="true">${raw(icon('chess', 34))}</span>
          <span class="game-text"><b>Chess</b><span class="game-sub">Play Stockfish, solve the daily puzzle</span>
            <span class="game-status ${live ? 'live' : ''}">${chessLine}${pstreak ? ` · ${pstreak}-day streak` : ''}${done.length ? ` · ${wins}W ${done.length - wins}L/D` : ''}</span></span>
          ${raw(icon('right', 18))}
        </a>
      </div>
      <p class="small faint games-more">More games may join later.</p>
    `);
    loadLists().catch(() => {});      // warm up Daily Word
  },
};
