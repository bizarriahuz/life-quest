import { cloudEnabled, getClient, cloudStore, localStore } from './store.js';
import { withCache } from './cache.js';
import { hasUnseen, markSeen } from './changelog.js';
import { applyTheme } from './theme.js';
import { captchaEnabled, mountCaptcha } from './captcha.js';
import { html, raw, mount, wire, toast, levelUpModal } from './ui.js';
import { icon } from './icons.js';
import { STATS, overallLevel, statLevel, enabledSections, visibleTotals } from './game.js';
import home from './views/home.js';
import tasks from './views/tasks.js';
import prayer from './views/prayer.js';
import fitness from './views/fitness.js';
import sleep from './views/sleep.js';
import books from './views/books.js';
import comics from './views/comics.js';
import notes from './views/notes.js';
import quotes from './views/quotes.js';
import hobbies from './views/hobbies.js';
import finance from './views/finance.js';
import settings from './views/settings.js';
import goals from './views/goals.js';
import clients from './views/clients.js';
import learning from './views/learning.js';
import mood from './views/mood.js';
import mtg from './views/mtg.js';
import watchlist from './views/watchlist.js';
import people from './views/people.js';
import music from './views/music.js';
import search from './views/search.js';
import review from './views/review.js';

const VIEWS = [home, tasks, goals, clients, prayer, fitness, sleep, books, comics, learning, notes, mood, quotes, hobbies, mtg, watchlist, music, people, finance, settings];
const HIDDEN = [search, review];   // pages reached from buttons, not the menu
const root = document.getElementById('app');
const S = { store: null, profile: null, rawTotals: {}, routeToken: 0, swipe: null };
const sections = () => enabledSections(S.profile);
const shownViews = () => {
  const byId = Object.fromEntries(VIEWS.map((v) => [v.id, v]));
  return [byId.home, ...[...sections()].map((id) => byId[id]).filter(Boolean), byId.settings];
};
const totals = () => visibleTotals(S.rawTotals, sections());

const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

async function refreshTotals() { S.rawTotals = await S.store.totals(); renderBrand(); }

// ---------- context shared with views ----------
const ctx = {
  get store() { return S.store; },
  get profile() { return S.profile; },
  get totals() { return totals(); },
  get sections() { return sections(); },
  get currency() { return S.profile?.currency || 'SGD'; },
  say: (msg) => toast(msg),
  rerender: () => route(),
  async award(stat, amount, source, id, label) {
    if (!amount || amount <= 0) return;
    const before = overallLevel(totals()).level;
    const statBefore = statLevel(S.rawTotals[stat] || 0).level;
    await S.store.award(stat, amount, source, id);
    await refreshTotals();
    const after = overallLevel(totals()).level;
    const statAfter = statLevel(S.rawTotals[stat] || 0).level;
    const statLine = statAfter > statBefore ? `${STATS[stat].name} reached level ${statAfter}` : null;
    if (after > before) levelUpModal(after, statLine ? [statLine] : [`You reached level ${after}`]);
    else toast(statLine ? `${statLine} · +${amount} XP` : `${label ? `${label} · ` : ''}+${amount} XP`);
  },
  async revoke(source, id) { await S.store.revoke(source, id); await refreshTotals(); },
  async setProfile(patch) {
    const before = JSON.stringify([...sections()]);
    S.profile = await S.store.saveProfile(patch);
    if (JSON.stringify([...sections()]) !== before) { renderShell(); route(); } else renderBrand();
  },
};

const COFFEE_URL = 'https://buymeacoffee.com/faustianecho';
const finePrint = () => html`<footer class="fine">Life Quest is built and kept running by one person, free of ads.
  If it helps you on your journey, you can <a href="${COFFEE_URL}" target="_blank" rel="noopener noreferrer">buy me a coffee ☕</a>
  · <a href="/about">About Life Quest</a></footer>`;

// ---------- shell ----------
function renderShell() {
  mount(root, html`
    <a class="skip" href="#view">Skip to content</a>
    <div class="shell">
      <aside class="side">
        <div class="brand" id="brand"></div>
        <nav class="nav" aria-label="Sections">
          ${shownViews().map((v) => html`<a href="#/${v.id}" data-view="${v.id}" class="${v.id === 'settings' && hasUnseen() ? 'has-new' : ''}">${raw(icon(v.id))}<span>${v.label}</span></a>`)}
        </nav>
        <div class="side-foot">
          ${S.store.mode === 'cloud' ? html`
            <p style="margin-bottom:8px">${S.store.user.email}</p>
            <button class="text-btn" data-signout>Sign out</button>` : html`<p>Offline mode · saved in this browser</p>`}
        </div>
      </aside>
      <main id="view" tabindex="-1"></main>
      ${finePrint()}
    </div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  `);
  renderBrand();
}

function renderBrand() {
  const el = document.getElementById('brand');
  if (!el) return;
  const lv = overallLevel(totals());
  const name = S.profile?.hero_name || 'You';
  el.innerHTML = html`
    <a href="#/home" class="avatar" aria-label="Home">${initials(name)}</a>
    <div class="brand-text">
      <p class="brand-name">${name}</p>
      <div class="brand-lv"><span>Level ${lv.level}</span><div class="bar" role="progressbar" aria-label="Progress to next level" aria-valuenow="${lv.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${lv.pct}%"></i></div></div>
    </div>
    <a href="#/search" class="icon-btn search-btn" aria-label="Search everything" title="Search (/)">${raw(icon('search'))}</a>
    ${S.store?.mode === 'local' ? html`<span class="badge" title="Data is saved in this browser only">Offline</span>` : ''}
    ${S.store?.mode === 'cloud' ? html`<button class="icon-btn mobile-only" data-signout aria-label="Sign out">${raw(icon('logout'))}</button>` : ''}
  `.s;
}

async function route() {
  const token = ++S.routeToken;
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const view = shownViews().find((v) => v.id === id) || HIDDEN.find((v) => v.id === id) || home;
  document.querySelectorAll('.nav a').forEach((a) => {
    const active = a.dataset.view === view.id;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${view.label} · Life Quest`;
  const main = document.getElementById('view');
  const fresh = document.createElement('div');
  fresh.className = 'view';
  try {
    await view.render(fresh, ctx);
  } catch (err) {
    console.error(err);
    fresh.innerHTML = html`<section class="card err-card"><h2>Something went wrong</h2>
      <p class="muted">${err?.message || String(err)}</p><p style="margin-top:14px"><button class="btn" data-reload>Retry</button></p></section>`.s;
  }
  if (token !== S.routeToken) return; // a newer navigation won
  const sameView = main.dataset.view === view.id;
  if (sameView) fresh.style.animation = 'none';
  else if (S.swipe) fresh.classList.add(S.swipe === 'next' ? 'in-right' : 'in-left');
  S.swipe = null;
  main.replaceChildren(fresh);
  main.dataset.view = view.id;
  if (view.id === 'settings') { markSeen(); document.querySelector('.nav a[data-view=settings]')?.classList.remove('has-new'); }
  if (!sameView) {
    window.scrollTo(0, 0);
    document.querySelector('.nav a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

// ---------- swipe left / right between sections (touch screens) ----------
// Follows the finger a little, then moves to the next or previous section in menu order.
function setupSwipe() {
  if (setupSwipe.done) return;
  setupSwipe.done = true;
  const NO_SWIPE = 'input, textarea, select, button, [contenteditable], .nav, .seg, .decks, .chart, .tmdb-results, .theme-menu, .more-menu, .album-grid, .scanner, .levelup, .mood-cal, .cardlist, .pgrid, details.more';
  let t = null;  // { x, y, at, dir, el }
  const main = () => document.getElementById('view');
  const neighbour = (step) => {
    const views = shownViews();
    const i = views.findIndex((v) => v.id === main()?.dataset.view);
    return i < 0 ? null : views[i + step] || null;
  };
  document.addEventListener('touchstart', (e) => {
    t = null;
    if (e.touches.length !== 1 || !S.store) return;
    const p = e.touches[0];
    const m = main();
    if (!m || !m.contains(e.target) || e.target.closest(NO_SWIPE)) return;
    if (p.clientX < 24 || p.clientX > innerWidth - 24) return;           // leave the phone's own edge gestures alone
    if (document.querySelector('.levelup, .scanner')) return;
    t = { x: p.clientX, y: p.clientY, at: Date.now(), dir: null, el: m.firstElementChild };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!t) return;
    const p = e.touches[0];
    const dx = p.clientX - t.x; const dy = p.clientY - t.y;
    if (!t.dir) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      t.dir = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'h' : 'v';
    }
    if (t.dir !== 'h' || !t.el) return;
    const edge = !neighbour(dx < 0 ? 1 : -1);                             // nothing that way: resist harder
    t.el.style.transition = 'none';
    t.el.style.transform = `translateX(${edge ? dx * 0.15 : dx}px)`;      // moves with the finger
  }, { passive: true });
  const end = (e) => {
    if (!t) return;
    const s = t; t = null;
    if (s.dir !== 'h') return;
    const p = e.changedTouches[0];
    const dx = p.clientX - s.x; const dy = p.clientY - s.y;
    const fast = Date.now() - s.at < 350 && Math.abs(dx) > 40;
    const go = (Math.abs(dx) > Math.min(110, innerWidth * 0.28) || fast) && Math.abs(dx) > Math.abs(dy) * 1.4;
    const target = go ? neighbour(dx < 0 ? 1 : -1) : null;
    if (s.el) {
      s.el.style.transition = 'transform .2s cubic-bezier(.2, .7, .2, 1)';
      s.el.style.transform = target ? `translateX(${dx < 0 ? '-100%' : '100%'})` : '';   // slide fully off, or spring back
    }
    if (target) {
      S.swipe = dx < 0 ? 'next' : 'prev';
      setTimeout(() => { location.hash = `#/${target.id}`; }, 150);
    }
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
}

// Background refresh found newer data: redraw, unless you're mid-typing.
function onStale() {
  const a = document.activeElement;
  if (a && a.closest?.('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if (document.querySelector('.levelup')) return;
  if (document.querySelector('#dirty:not([hidden])')) return; // unsaved Settings
  route();
}

// Warm every section's data so the first switch is instant too.
async function prefetch(currentId) {
  for (const v of shownViews()) {
    if (v.id === currentId || v.id === 'settings' || !S.store) continue;
    try { await v.render(document.createElement('div'), ctx); } catch { /* ignore */ }
  }
}

async function start(rawStore) {
  const store = withCache(rawStore, onStale);
  S.store = store;
  mount(root, html`<p class="loading">Loading…</p>`);
  try {
    [S.profile, S.rawTotals] = await Promise.all([store.profile(), store.totals()]);
    applyTheme(S.profile?.theme);
  } catch (err) {
    mount(root, html`<div class="auth"><section class="card err-card"><h2>Couldn't load your data</h2>
      <p class="muted">${err?.message || String(err)}</p><p style="margin-top:14px"><button class="btn" data-reload>Retry</button></p></section></div>`);
    return;
  }
  renderShell();
  setupSwipe();
  window.onhashchange = route;
  await route();
  prefetch(document.getElementById('view')?.dataset.view);
}

// ---------- sign in ----------
function renderLogin(sb, notice = '') {
  S.store = null;
  window.onhashchange = null;
  // Arrived from "Start your quest" on the About page: lead with Create account.
  const starting = new URLSearchParams(location.search).has('start');
  if (starting) history.replaceState(null, '', location.pathname + location.hash);
  mount(root, html`
    <div class="auth">
      <form data-form="signin" class="auth-card">
        <div class="auth-mark">${raw(icon('spark', 26))}</div>
        <div><h1>Life Quest</h1><p class="lead">Your tasks, habits, reading, fitness and money — in one place, with a little XP to keep you going.</p></div>
        <div class="form">
          <input type="email" name="email" placeholder="Email" autocomplete="email" required aria-label="Email">
          <input type="password" name="password" placeholder="Password (8+ characters)" autocomplete="${starting ? 'new-password' : 'current-password'}" minlength="8" required aria-label="Password">
          ${starting ? html`
            <button type="button" class="btn primary" data-act="signup">Create free account</button>
            <button class="btn">I already have an account · Sign in</button>` : html`
            <button class="btn primary">Sign in</button>
            <button type="button" class="btn" data-act="signup">Create account</button>`}
        </div>
        ${captchaEnabled ? html`<div id="captcha" class="captcha"></div>` : ''}
        <p class="msg" id="login-msg" role="status">${notice || (starting ? 'Welcome! Enter your email and choose a password (8+ characters). We’ll email you a link to confirm your account.' : '')}</p>
      </form>
      ${finePrint()}
    </div>
  `);
  const msg = (t) => { document.getElementById('login-msg').textContent = t; };
  const form = root.querySelector('form');
  // Bot check (Cloudflare Turnstile), if switched on in config.js.
  let captcha = null;
  if (captchaEnabled) mountCaptcha(root.querySelector('#captcha')).then((c) => { captcha = c; }).catch(() => { /* script blocked: sign-in still works */ });
  const human = async () => {
    if (!captchaEnabled) return {};
    if (!captcha) { msg('Loading the security check…'); await new Promise((r) => setTimeout(r, 1200)); }
    const captchaToken = await captcha?.token();
    // If the check itself couldn't run, carry on without it; the server decides.
    if (!captchaToken && (!captcha || captcha.failed)) return {};
    if (!captchaToken) { msg('Please complete the security check above, then try again.'); return null; }
    return { captchaToken };
  };
  wire(root, {
    signin: async (v) => {
      const extra = await human();
      if (!extra) return;
      msg('Signing in…');
      const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password, options: extra });
      captcha?.reset();
      if (error) msg(error.message);
    },
    signup: async () => {
      if (!form.reportValidity()) return;
      const v = Object.fromEntries(new FormData(form));
      const extra = await human();
      if (!extra) return;
      msg('Creating account…');
      const { data, error } = await sb.auth.signUp({
        email: v.email.trim(), password: v.password, options: { emailRedirectTo: location.origin, ...extra },
      });
      captcha?.reset();
      if (error) msg(error.message);
      else if (!data.session) msg('Check your email to confirm your account, then sign in.');
    },
  });
}

// ---------- keyboard: "/" opens search ----------
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || !S.store) return;
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
  e.preventDefault();
  if (location.hash === '#/search') document.getElementById('q')?.focus(); else location.hash = '#/search';
});

// ---------- global clicks ----------
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-reload]')) location.reload();
  if (e.target.closest('[data-signout]') && S.store) await S.store.signOut();
});

// ---------- boot ----------
async function boot() {
  if (!cloudEnabled) { start(localStore()); return; }
  let sb;
  try { sb = await getClient(); } catch (err) {
    mount(root, html`<div class="auth"><section class="card err-card"><h2>You're offline</h2>
      <p class="muted">Couldn't reach the server. Check your connection.</p><p style="margin-top:14px"><button class="btn" data-reload>Retry</button></p></section></div>`);
    return;
  }
  sb.auth.onAuthStateChange((event, session) => {
    // defer: calling Supabase inside this callback can deadlock
    setTimeout(() => {
      if (session?.user && !S.store) start(cloudStore(sb, session.user));
      else if (!session && event === 'SIGNED_OUT') renderLogin(sb, 'Signed out.');
      else if (!session && !S.store && event === 'INITIAL_SESSION') renderLogin(sb);
    }, 0);
  });
}

boot();
