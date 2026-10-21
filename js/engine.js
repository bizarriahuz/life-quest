// Stockfish in a Web Worker. Loaded only when the Chess section first needs it
// (about 6 MB once, then cached by the browser), so the rest of the app is unaffected.
const URL_ = '/js/vendor/stockfish/stockfish-17.1-lite-single-03e3232.js';

// Strength levels: Stockfish "Skill Level" plus limits on how deep / long it thinks.
export const LEVELS = [
  { n: 1, name: 'Beginner', skill: 0, depth: 1, ms: 80 },
  { n: 2, name: 'Casual', skill: 3, depth: 3, ms: 200 },
  { n: 3, name: 'Club', skill: 8, depth: 6, ms: 400 },
  { n: 4, name: 'Strong', skill: 14, depth: 10, ms: 800 },
  { n: 5, name: 'Master', skill: 20, depth: 16, ms: 1500 },
];

let worker = null;
let ready = null;
let listeners = [];

function send(cmd) { worker.postMessage(cmd); }
function waitFor(test, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { listeners = listeners.filter((l) => l !== fn); reject(new Error('The chess engine took too long to answer.')); }, timeout);
    const fn = (line) => { if (test(line)) { clearTimeout(t); listeners = listeners.filter((l) => l !== fn); resolve(line); return true; } return false; };
    listeners.push(fn);
  });
}

export function engineLoaded() { return Boolean(worker); }

export function startEngine() {
  if (ready) return ready;
  ready = (async () => {
    if (typeof WebAssembly !== 'object') throw new Error('This browser can’t run the chess engine. Try an up-to-date Chrome or Safari.');
    worker = new Worker(URL_);
    worker.onmessage = (e) => { const line = String(e.data); for (const l of [...listeners]) l(line); };
    worker.onerror = (e) => { console.warn('engine', e.message); };
    send('uci');
    await waitFor((l) => l === 'uciok', 60000);
    send('isready');
    await waitFor((l) => l === 'readyok', 60000);
  })().catch((err) => { stopEngine(); throw err; });
  return ready;
}

export function stopEngine() {
  try { worker?.terminate(); } catch { /* ignore */ }
  worker = null; ready = null; listeners = [];
}

let busy = Promise.resolve();
// Best move for a position, as UCI ("e2e4", "e7e8q"). Calls are queued so they never overlap.
export function bestMove(fen, level = 3, { hint = false } = {}) {
  const run = async () => {
    await startEngine();
    const L = hint ? { skill: 20, depth: 12, ms: 1200 } : (LEVELS[level - 1] || LEVELS[2]);
    send('stop');
    send(`setoption name Skill Level value ${L.skill}`);
    send('ucinewgame');
    send('isready');
    await waitFor((l) => l === 'readyok');
    send(`position fen ${fen}`);
    const done = waitFor((l) => l.startsWith('bestmove'), 30000);
    send(`go depth ${L.depth} movetime ${L.ms}`);
    const line = await done;
    const mv = line.split(/\s+/)[1];
    return mv && mv !== '(none)' ? mv : null;
  };
  const p = busy.then(run, run);
  busy = p.catch(() => {});
  return p;
}
