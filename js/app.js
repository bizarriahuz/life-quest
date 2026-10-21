import { cloudEnabled, getClient, cloudStore, localStore } from './store.js';
import { withCache } from './cache.js';
import { hasUnseen } from './changelog.js';
import { applyTheme } from './theme.js';
import { showIntros } from './intro.js';
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
import projects from './views/projects.js';
import join from './views/join.js';
import calendar from './views/calendar.js';
import games from './views/games.js';
import welcome from './views/welcome.js';

const VIEWS = [home, tasks, calendar, goals, projects, clients, prayer, fitness, sleep, books, comics, learning, notes, mood, quotes, hobbies, games, mtg, watchlist, music, people, finance, settings];
const HIDDEN = [search, review, join, welcome];   // pages reached from buttons, not the menu
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
  if (location.hash.startsWith('#/chess')) { location.replace('#/games/chess'); return; }   // Chess moved into Games
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1];
  let view = shownViews().find((v) => v.id === id) || HIDDEN.find((v) => v.id === id) || home;
  // First time in: choose sections before anything else (an invite link can go first).
  const choosing = S.profile && S.profile.sections == null && view.id !== 'join';
  if (choosing) view = welcome;
  document.body.classList.toggle('onboarding', choosing);
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
  // Settings dot: unread What's new, or (for the maker) new feedback.
  if (view.id === 'settings') {
    if (location.hash.startsWith('#/settings/inbox')) S.inboxNew = 0;
    document.querySelector('.nav a[data-view=settings]')?.classList.toggle('has-new', hasUnseen() || S.inboxNew > 0);
    if (!/^#\/settings\/\w/.test(location.hash)) checkInbox();
  }
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
  const NO_SWIPE = 'input, textarea, select, button, [contenteditable], .nav, .seg, .decks, .chart, .tmdb-results, .theme-menu, .more-menu, .album-grid, .scanner, .levelup, .mood-cal, .cardlist, .pgrid, details.more, .cal-grid, .ph-grid, .board-wrap, .promo, .movelist, .replay-ctrls, .level-seg, .wd-keys, .wd-grid, .su-grid, .su-pad, .hv-hive, .hv-ctrls';
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

// Only for the app's maker: a dot on Settings when new feedback has arrived.
let isAdmin = null;
async function checkInbox() {
  if (!S.store || S.store.mode !== 'cloud' || document.hidden) return;
  try {
    isAdmin ??= Boolean(await S.store.rpc('is_admin', {}));
    if (!isAdmin) return;
    const fresh = await S.store.list('feedback', { match: { status: 'new' }, limit: 50 });
    S.inboxNew = location.hash.startsWith('#/settings/inbox') ? 0 : fresh.length;
    const a = document.querySelector('.nav a[data-view=settings]');
    if (a) { a.classList.toggle('has-new', hasUnseen() || S.inboxNew > 0); a.title = S.inboxNew ? `${S.inboxNew} new feedback` : ''; }
  } catch { /* ignore */ }
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
  // Opened an invite link while signed out: carry on to it now.
  try {
    const pending = localStorage.getItem(JOIN_KEY);
    if (pending) { localStorage.removeItem(JOIN_KEY); if (!location.hash.startsWith('#/join/')) location.hash = pending; }
  } catch { /* ignore */ }
  window.onhashchange = route;
  await route();
  prefetch(document.getElementById('view')?.dataset.view);
  checkInbox();
  setInterval(checkInbox, 5 * 60 * 1000);
  setTimeout(() => showIntros(ctx), 900);      // introduce any section added since last time
}

// ---------- sign in ----------
const JOIN_KEY = 'lifequest:join';
function renderLogin(sb, notice = '') {
  S.store = null;
  const joining = location.hash.startsWith('#/join/');
  if (joining) try { localStorage.setItem(JOIN_KEY, location.hash); } catch { /* ignore */ }
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
        ${joining ? html`<p class="join-note">${raw(icon('projects', 18))}You’ve been invited to a shared project. Sign in or create a free account to join.</p>` : ''}
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
      if (!error) return;
      if (/not confirmed/i.test(error.message)) { renderCheckEmail(sb, v.email.trim(), 'unconfirmed'); return; }
      msg(/invalid login/i.test(error.message)
        ? 'Wrong email or password. New here? Tap “Create account” instead.'
        : error.message);
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
      if (error) { msg(/rate limit/i.test(error.message) ? 'Too many sign-ups right now. Please try again in an hour.' : error.message); return; }
      // Supabase hides whether an email is taken: a known email comes back with no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        msg('That email already has an account. Sign in instead.');
        return;
      }
      if (!data.session) renderCheckEmail(sb, v.email.trim(), 'new');
    },
  });
}

// After sign-up: a clear "check your email" screen, with a way to resend.
function renderCheckEmail(sb, email, why) {
  mount(root, html`
    <div class="auth">
      <section class="auth-card check-email" aria-live="polite">
        <div class="auth-mark">${raw(icon('mail', 26))}</div>
        <div>
          <h1>${why === 'new' ? 'Check your email' : 'Confirm your email first'}</h1>
          <p class="lead">${why === 'new' ? 'Your account is almost ready. We sent a confirmation link to' : 'Your account isn’t confirmed yet. We sent a link to'}</p>
          <p class="email-to">${email}</p>
        </div>
        <ol class="steps">
          <li>Open the email from <b>Supabase Auth</b> (subject “Confirm your signup”).</li>
          <li>Tap <b>Confirm your mail</b>. You’ll come back here signed in.</li>
          <li>Can’t find it? Check <b>Spam</b> or <b>Promotions</b>. It can take a few minutes.</li>
        </ol>
        ${captchaEnabled ? html`<div id="captcha" class="captcha"></div>` : ''}
        <div class="form">
          <button type="button" class="btn" data-act="resend">Send the email again</button>
          <button type="button" class="btn primary" data-act="back">Back to sign in</button>
        </div>
        <p class="msg" id="login-msg" role="status"></p>
      </section>
      ${finePrint()}
    </div>
  `);
  const msg = (t) => { document.getElementById('login-msg').textContent = t; };
  let captcha = null;
  if (captchaEnabled) mountCaptcha(root.querySelector('#captcha')).then((c) => { captcha = c; }).catch(() => {});
  let last = 0;
  wire(root, {
    back: () => renderLogin(sb),
    resend: async () => {
      if (Date.now() - last < 60000) { msg('Sent. Please wait a minute before asking again.'); return; }
      let options = {};
      if (captchaEnabled) {
        const tok = await captcha?.token();
        if (!tok && captcha && !captcha.failed) { msg('Please complete the security check above, then try again.'); return; }
        if (tok) options = { captchaToken: tok };
      }
      msg('Sending…');
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin, ...options } });
      captcha?.reset();
      if (error) { msg(/rate limit|security purposes/i.test(error.message) ? 'Too many emails just now. Please try again in a little while.' : error.message); return; }
      last = Date.now();
      msg(`Sent again to ${email}.`);
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
