import { cloudEnabled, getClient, cloudStore, localStore } from './store.js';
import { withCache } from './cache.js';
import { hasUnseen, markSeen } from './changelog.js';
import { html, raw, mount, wire, toast, levelUpModal } from './ui.js';
import { icon } from './icons.js';
import { STATS, overallLevel, statLevel, enabledSections, visibleTotals } from './game.js';
import home from './views/home.js';
import tasks from './views/tasks.js';
import prayer from './views/prayer.js';
import fitness from './views/fitness.js';
import books from './views/books.js';
import notes from './views/notes.js';
import quotes from './views/quotes.js';
import hobbies from './views/hobbies.js';
import finance from './views/finance.js';
import settings from './views/settings.js';

const VIEWS = [home, tasks, prayer, fitness, books, notes, quotes, hobbies, finance, settings];
const root = document.getElementById('app');
const S = { store: null, profile: null, rawTotals: {}, routeToken: 0 };
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
    ${S.store?.mode === 'local' ? html`<span class="badge" title="Data is saved in this browser only">Offline</span>` : ''}
    ${S.store?.mode === 'cloud' ? html`<button class="icon-btn mobile-only" data-signout aria-label="Sign out">${raw(icon('logout'))}</button>` : ''}
  `.s;
}

async function route() {
  const token = ++S.routeToken;
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const view = shownViews().find((v) => v.id === id) || home;
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
  main.replaceChildren(fresh);
  main.dataset.view = view.id;
  if (view.id === 'settings') { markSeen(); document.querySelector('.nav a[data-view=settings]')?.classList.remove('has-new'); }
  if (!sameView) {
    window.scrollTo(0, 0);
    document.querySelector('.nav a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
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
  } catch (err) {
    mount(root, html`<div class="auth"><section class="card err-card"><h2>Couldn't load your data</h2>
      <p class="muted">${err?.message || String(err)}</p><p style="margin-top:14px"><button class="btn" data-reload>Retry</button></p></section></div>`);
    return;
  }
  renderShell();
  window.onhashchange = route;
  await route();
  prefetch(document.getElementById('view')?.dataset.view);
}

// ---------- sign in ----------
function renderLogin(sb, notice = '') {
  S.store = null;
  window.onhashchange = null;
  mount(root, html`
    <div class="auth">
      <form data-form="signin" class="auth-card">
        <div class="auth-mark">${raw(icon('spark', 26))}</div>
        <div><h1>Life Quest</h1><p class="lead">Your tasks, habits, reading, fitness and money — in one place, with a little XP to keep you going.</p></div>
        <div class="form">
          <input type="email" name="email" placeholder="Email" autocomplete="email" required aria-label="Email">
          <input type="password" name="password" placeholder="Password (8+ characters)" autocomplete="current-password" minlength="8" required aria-label="Password">
          <button class="btn primary">Sign in</button>
          <button type="button" class="btn" data-act="signup">Create account</button>
        </div>
        <p class="msg" id="login-msg" role="status">${notice}</p>
      </form>
    </div>
  `);
  const msg = (t) => { document.getElementById('login-msg').textContent = t; };
  const form = root.querySelector('form');
  wire(root, {
    signin: async (v) => {
      msg('Signing in…');
      const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password });
      if (error) msg(error.message);
    },
    signup: async () => {
      if (!form.reportValidity()) return;
      const v = Object.fromEntries(new FormData(form));
      msg('Creating account…');
      const { data, error } = await sb.auth.signUp({
        email: v.email.trim(), password: v.password, options: { emailRedirectTo: location.origin },
      });
      if (error) msg(error.message);
      else if (!data.session) msg('Check your email to confirm your account, then sign in.');
    },
  });
}

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
