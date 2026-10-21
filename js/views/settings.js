// Settings: a short menu, each row opening its own page (#/settings/<page>).
import { html, raw, wire, mount, fmtDate } from '../ui.js';
import { icon } from '../icons.js';
import { SECTIONS, CURRENCIES } from '../game.js';
import { CHANGELOG, LATEST, hasUnseen, markSeen } from '../changelog.js';
import { THEMES, DEFAULT_THEME, applyTheme } from '../theme.js';

const swatch = (t) => html`<span class="sw" style="--s0:${t.swatch[0]};--s1:${t.swatch[1]};--s2:${t.swatch[2]};--s3:${t.swatch[3]}" aria-hidden="true"><i></i></span>`;
const themeLabel = (t) => html`${swatch(t)}<span class="grow">${t.label} <span class="faint small">${t.group}</span></span>`;

const logEntry = (e) => html`
  <article class="log-entry">
    <p class="log-head"><span class="pill">${e.version}</span><b>${e.title}</b><span class="faint small">${fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
    <ul>${e.items.map((i) => html`<li>${i}</li>`)}</ul>
  </article>`;

const KINDS = { bug: 'Something’s wrong', idea: 'Idea', other: 'Other' };
const HINT = {
  bug: 'What happened, and what did you expect? Which section were you in?',
  idea: 'What would make Life Quest better for you?',
  other: 'Anything you’d like to say',
};
const STATUS = { new: 'Sent', read: 'Seen', done: 'Done' };
let inboxAll = false;     // admin: show handled feedback too
let lastPage;             // scroll to top when moving between Settings pages

// Short, non-identifying device description for bug reports.
function device() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPod/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone ? ' · home-screen app' : '';
  return `${os} · ${br}${app} · ${innerWidth}px`;
}
const when = (ts) => new Date(ts).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const PAGES = {
  appearance: { label: 'Appearance', icon: 'spark' },
  sections:   { label: 'Sections', icon: 'grid' },
  profile:    { label: 'Profile', icon: 'people' },
  new:        { label: 'What’s new', icon: 'review' },
  feedback:   { label: 'Feedback', icon: 'mail' },
  inbox:      { label: 'Feedback inbox', icon: 'mail' },
  admin:      { label: 'Admin', icon: 'review' },
  account:    { label: 'Account', icon: 'settings' },
};

export default {
  id: 'settings',
  label: 'Settings',
  async render(el, ctx) {
    const page = (location.hash.match(/^#\/settings\/(\w+)/) || [])[1];
    const cloud = ctx.store.mode === 'cloud';
    const admin = cloud ? await ctx.store.rpc('is_admin', {}).catch(() => false) : false;
    const known = PAGES[page] && (!['inbox', 'admin'].includes(page) || admin) ? page : null;
    if (known !== lastPage && lastPage !== undefined) requestAnimationFrame(() => window.scrollTo(0, 0));
    lastPage = known;
    if (known === 'new') markSeen();
    const pages = { appearance, sections, profile, new: whatsNew, feedback, inbox, admin: adminPage, account };
    if (!known) return menu(el, ctx, admin);
    mount(el, html`
      <a class="text-btn back" href="#/settings">${raw(icon('left', 16))}Settings</a>
      <header class="page-head"><div><h1>${PAGES[known].label}</h1></div></header>
      <div class="set-page" id="set-${known}"></div>`);
    await pages[known](el.querySelector('.set-page'), ctx);
  },
};

// ---------------------------------------------------------------- menu
async function menu(el, ctx, admin) {
  const on = ctx.sections;
  const theme = THEMES.find((t) => t.id === (ctx.profile?.theme || DEFAULT_THEME)) || THEMES[0];
  const fresh = admin ? (await ctx.store.list('feedback', { match: { status: 'new' }, limit: 200 }).catch(() => [])).length : 0;
  const stats = admin ? await ctx.store.rpc('admin_stats', {}).catch(() => null) : null;
  const name = ctx.profile?.hero_name;
  const row = (id, sub, extra = '') => html`
    <li><a class="item set-row" href="#/settings/${id}">
      <span class="i-wrap">${id === 'appearance' ? swatch(theme) : raw(icon(PAGES[id].icon))}</span>
      <span class="body"><span class="title">${PAGES[id].label}</span><span class="sub">${sub}</span></span>
      ${extra}${raw(icon('right', 16))}
    </a></li>`;
  mount(el, html`
    <header class="page-head"><div><h1>Settings</h1><p>Make Life Quest yours</p></div></header>
    <section class="card set-menu"><ul class="list">
      ${row('sections', `${on.size} of ${SECTIONS.length} on · choose and reorder`)}
      ${row('appearance', `${theme.label} theme`)}
      ${row('profile', `${name && name !== 'HERO' ? name : 'Your name'} · ${ctx.currency}`)}
    </ul></section>
    <section class="card set-menu"><ul class="list">
      ${row('new', `Version ${LATEST}`, hasUnseen() ? html`<span class="pill solid">New</span>` : '')}
      ${row('feedback', 'Report a problem or share an idea')}
      ${admin ? row('admin', stats ? `${stats.total} accounts · ${stats.active7} active this week` : 'Who’s using Life Quest') : ''}
      ${admin ? row('inbox', fresh ? `${fresh} new message${fresh === 1 ? '' : 's'}` : 'All caught up', fresh ? html`<span class="pill solid">${fresh}</span>` : '') : ''}
    </ul></section>
    <section class="card set-menu"><ul class="list">
      ${row('account', ctx.store.mode === 'cloud' ? ctx.store.user.email : 'Offline mode')}
    </ul></section>
    <p class="small faint set-foot">Life Quest ${LATEST} · <a href="/about"><u>About</u></a></p>
  `);
}

// ---------------------------------------------------------------- appearance
async function appearance(el, ctx) {
  const current = THEMES.find((t) => t.id === (ctx.profile?.theme || DEFAULT_THEME)) || THEMES[0];
  mount(el, html`
    <section class="card">
      <div class="card-head"><h2>Theme</h2><span class="meta">Changes straight away</span></div>
      <details class="theme-dd" id="theme-dd">
        <summary class="theme-dd-btn" id="theme-current" aria-label="Theme">${themeLabel(current)}</summary>
        <div class="theme-menu" role="radiogroup" aria-label="Theme">
          ${['Dark', 'Light', 'Pastel'].map((g) => html`
            <p class="theme-group">${g}</p>
            ${THEMES.filter((t) => t.group === g).map((t) => html`
              <label class="theme-row">
                <input type="radio" name="theme" value="${t.id}" data-change="theme" ${current.id === t.id ? 'checked' : ''}>
                ${swatch(t)}<span class="grow">${t.label}</span>${raw(icon('check', 16))}
              </label>`)}`)}
        </div>
      </details>
    </section>`);
  // Close the dropdown when tapping elsewhere or pressing Escape.
  const dd = el.querySelector('#theme-dd');
  el.addEventListener('click', (e) => {
    if (dd.open && !e.target.closest('#theme-dd')) dd.open = false;
    if (e.target.closest('.theme-row')) setTimeout(() => { dd.open = false; }, 0); // also when re-picking the current one
  });
  dd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { dd.open = false; dd.querySelector('summary').focus(); } });
  wire(el, {
    theme: async (r) => {
      const id = applyTheme(r.value);
      const t = THEMES.find((x) => x.id === id);
      el.querySelector('#theme-current').innerHTML = themeLabel(t).s;
      dd.open = false;
      await ctx.setProfile({ theme: id });
    },
  });
}

// ---------------------------------------------------------------- sections
async function sections(el, ctx) {
  const on = ctx.sections;
  // Turned-on sections in your order, then the rest in the default order.
  const byId = Object.fromEntries(SECTIONS.map((x) => [x.id, x]));
  const ordered = [...[...on].map((id) => byId[id]).filter(Boolean), ...SECTIONS.filter((x) => !on.has(x.id))];
  mount(el, html`
    <form data-form="save" class="form" style="gap:16px">
      <section class="card">
        <div class="card-head"><h2>Your sections</h2><span class="meta">Switch on, off, and reorder</span></div>
        <ul class="list" id="sec-list">
          ${ordered.map((s) => html`
            <li class="item" data-sec="${s.id}">
              <span class="mover">
                <button type="button" class="icon-btn" data-act="up" aria-label="Move ${s.label} up">${raw(icon('up', 16))}</button>
                <button type="button" class="icon-btn" data-act="down" aria-label="Move ${s.label} down">${raw(icon('down', 16))}</button>
              </span>
              <span class="i-wrap">${raw(icon(s.id))}</span>
              <label class="body switch-row" for="sec-${s.id}">
                <span class="title">${s.label}</span>
                <span class="sub">${s.hint}</span>
              </label>
              <span class="switch"><input type="checkbox" id="sec-${s.id}" name="sec" value="${s.id}" ${on.has(s.id) ? 'checked' : ''}><i aria-hidden="true"></i></span>
            </li>`)}
        </ul>
        <p class="small faint" style="margin-top:10px">The order here is the order in your menu and on Home. Hidden sections keep their data, and your level only counts the sections you use.</p>
      </section>
      <div class="row end save-bar"><span class="small muted" id="dirty" hidden>Unsaved changes</span><button class="btn primary">Save changes</button></div>
    </form>`);
  const list = el.querySelector('#sec-list');
  const markDirty = () => { el.querySelector('#dirty').hidden = false; };
  const refreshArrows = () => {
    const items = [...list.children];
    items.forEach((li, i) => {
      li.querySelector('[data-act=up]').disabled = i === 0;
      li.querySelector('[data-act=down]').disabled = i === items.length - 1;
    });
  };
  const move = (btn, dir) => {
    const li = btn.closest('li');
    const sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
    if (!sib) return;
    if (dir < 0) list.insertBefore(li, sib); else list.insertBefore(sib, li);
    refreshArrows(); markDirty();
    (btn.disabled ? li.querySelector(`[data-act=${dir < 0 ? 'down' : 'up'}]`) : btn).focus();
  };
  refreshArrows();
  el.addEventListener('change', markDirty);
  wire(el, {
    up: (b) => move(b, -1),
    down: (b) => move(b, 1),
    save: async (v, form) => {
      const chosen = [...form.querySelectorAll('input[name=sec]:checked')].map((i) => i.value); // in on-screen order
      if (!chosen.length) { ctx.say('Keep at least one section on'); return; }
      await ctx.setProfile({ sections: chosen.filter((id) => SECTIONS.some((x) => x.id === id)) });
      ctx.say('Sections saved');
      ctx.rerender();
    },
  });
}

// ---------------------------------------------------------------- profile
async function profile(el, ctx) {
  const name = ctx.profile?.hero_name && ctx.profile.hero_name !== 'HERO' ? ctx.profile.hero_name : '';
  const currency = ctx.currency;
  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];
  mount(el, html`
    <form data-form="save" class="form" style="gap:16px">
      <section class="card">
        <div class="fields">
          <label class="field">Name<input name="hero_name" maxlength="24" value="${name}" required></label>
          <label class="field">Currency<select name="currency">${currencies.map((c) => html`<option value="${c}" ${c === currency ? 'selected' : ''}>${c}</option>`)}</select></label>
        </div>
        <p class="small faint" style="margin-top:10px">Your name shows on Home and to people in your shared projects. Currency is used in Finance and Clients.</p>
      </section>
      <div class="row end save-bar"><span class="small muted" id="dirty" hidden>Unsaved changes</span><button class="btn primary">Save changes</button></div>
    </form>`);
  el.addEventListener('input', () => { el.querySelector('#dirty').hidden = false; });
  el.addEventListener('change', () => { el.querySelector('#dirty').hidden = false; });
  wire(el, {
    save: async (v) => {
      await ctx.setProfile({
        hero_name: (v.hero_name || 'You').slice(0, 24),
        currency: /^[A-Z]{3}$/.test(v.currency) ? v.currency : 'SGD',
      });
      ctx.say('Profile saved');
      ctx.rerender();
    },
  });
}

// ---------------------------------------------------------------- what's new
async function whatsNew(el) {
  mount(el, html`
    <section class="card" id="whats-new">
      <div class="card-head"><h2>Latest</h2><span class="meta">Version ${LATEST}</span></div>
      <div class="log">${CHANGELOG.slice(0, 5).map((e) => logEntry(e))}</div>
      ${CHANGELOG.length > 5 ? html`
        <details style="margin-top:12px"><summary class="small muted" style="font-weight:500">Earlier updates</summary>
          <div class="log">${CHANGELOG.slice(5).map((e) => logEntry(e))}</div>
        </details>` : ''}
    </section>`);
}

// ---------------------------------------------------------------- feedback
async function feedback(el, ctx) {
  const cloud = ctx.store.mode === 'cloud';
  const mine = await ctx.store.list('feedback', { match: { user_id: ctx.store.user.id }, order: 'created_at', limit: 10 }).catch(() => []);
  mount(el, html`
    <section class="card" id="feedback">
      <div class="card-head"><h2>Tell us what you think</h2><span class="meta">Goes straight to the maker</span></div>
      <form data-form="feedback" class="form">
        <div class="seg" role="radiogroup" aria-label="Kind of feedback">
          ${Object.entries(KINDS).map(([k, v], i) => html`<label><input type="radio" name="kind" value="${k}" data-change="fbkind" ${i === 1 ? 'checked' : ''}><span>${v}</span></label>`)}
        </div>
        <textarea name="message" rows="5" minlength="3" maxlength="2000" required placeholder="${HINT.idea}" aria-label="Your feedback"></textarea>
        <div class="row spread wrap">
          ${cloud ? html`<label class="tick small muted"><input type="checkbox" name="reply" checked> Include my email so I can get a reply</label>` : html`<span></span>`}
          <button class="btn primary sm">Send feedback</button>
        </div>
      </form>
    </section>
    ${mine.length ? html`<section class="card fb-mine-card">
      <div class="card-head"><h2>What you’ve sent</h2></div>
      <ul class="list">${mine.map((f) => html`<li class="item"><div class="body"><p class="title fb-msg">${f.message}</p>
        <p class="sub">${KINDS[f.kind]} · ${when(f.created_at)}</p></div><span class="pill ${f.status === 'done' ? 'solid' : ''}">${STATUS[f.status]}</span></li>`)}</ul>
    </section>` : ''}`);
  wire(el, {
    fbkind: (r) => { el.querySelector('form[data-form=feedback] textarea').placeholder = HINT[r.value]; },
    feedback: async (v, f) => {
      if ((v.message || '').length < 3) return;
      await ctx.store.insert('feedback', {
        kind: v.kind || 'idea', message: v.message.slice(0, 2000), reply_to: v.reply ? 'yes' : null,
        app_version: LATEST, device: device().slice(0, 120), page: 'settings',
      });
      f.reset();
      ctx.say('Thank you! Your feedback was sent');
      ctx.rerender();
    },
  });
}

// ---------------------------------------------------------------- inbox (maker only)
async function inbox(el, ctx) {
  const all = await ctx.store.list('feedback', { order: 'created_at', limit: 200 }).catch(() => []);
  const fresh = all.filter((f) => f.status === 'new').length;
  const shown = inboxAll ? all : all.filter((f) => f.status !== 'done');
  mount(el, html`<section class="card" id="inbox">
    <div class="card-head"><h2>${fresh ? html`<span class="pill solid">${fresh} new</span>` : 'Messages'}</h2>
      <label class="tick small muted"><input type="checkbox" data-change="inboxall" ${inboxAll ? 'checked' : ''}> Show done</label></div>
    ${shown.length ? html`<ul class="list fb-list">${shown.map((f) => html`<li class="item fb ${f.status}">
      <div class="body">
        <p class="fb-meta"><span class="pill ${f.kind === 'bug' ? 'solid' : ''}">${f.kind === 'bug' ? 'Bug' : f.kind === 'idea' ? 'Idea' : 'Other'}</span>
          <b>${f.sender_name || 'Someone'}</b><span class="faint small">${when(f.created_at)}</span></p>
        <p class="fb-msg">${f.message}</p>
        <p class="sub">${[f.app_version && `v${f.app_version}`, f.device].filter(Boolean).join(' · ')}</p>
        <div class="row wrap fb-actions">
          ${f.reply_to ? html`<a class="btn sm" href="mailto:${f.reply_to}?subject=${encodeURIComponent('Re: your Life Quest feedback')}&body=${encodeURIComponent(`\n\n> ${f.message.replace(/\n/g, '\n> ')}`)}">${raw(icon('mail', 15))}Reply</a>` : html`<span class="small faint">No email shared</span>`}
          ${f.status === 'new' ? html`<button class="btn sm" data-act="fbstatus" data-id="${f.id}" data-s="read">Mark read</button>` : ''}
          ${f.status !== 'done' ? html`<button class="btn sm" data-act="fbstatus" data-id="${f.id}" data-s="done">${raw(icon('check', 15))}Done</button>`
            : html`<button class="btn sm" data-act="fbstatus" data-id="${f.id}" data-s="read">Reopen</button>`}
        </div>
      </div></li>`)}</ul>` : html`<p class="empty">${all.length ? 'All handled.' : 'No feedback yet.'}</p>`}
  </section>`);
  wire(el, {
    fbstatus: async (b) => { await ctx.store.update('feedback', b.dataset.id, { status: b.dataset.s }); ctx.rerender(); },
    inboxall: (c) => { inboxAll = c.checked; ctx.rerender(); },
  });
}

// ---------------------------------------------------------------- admin (maker only)
// Names and activity counts only: never anyone's entries, notes or email.
const ago = (ts) => {
  if (!ts) return 'never';
  const m = Math.max(0, (Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${Math.floor(m)} min ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h ago`;
  const d = Math.floor(m / 1440);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(ts).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
};
async function adminPage(el, ctx) {
  const s = await ctx.store.rpc('admin_stats', {});
  const merged = {};
  for (const [k, n] of Object.entries(s.sections || {})) { const id = k === 'chess' ? 'games' : k; merged[id] = Math.max(merged[id] || 0, n); }
  const secRows = SECTIONS.map((x) => ({ ...x, n: merged[x.id] || 0 })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const top = Math.max(1, ...secRows.map((x) => x.n));
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 864e5); return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); });
  const sign = days.map((d) => s.signups?.[d] || 0);
  const peak = Math.max(1, ...sign);
  const recent = (u) => u.last_seen && Date.now() - new Date(u.last_seen).getTime() < 7 * 864e5;
  mount(el, html`
    <section class="card">
      <div class="adm-kpis">
        <span><b>${s.total}</b>Accounts</span><span><b>${s.active1}</b>Active today</span>
        <span><b>${s.active7}</b>This week</span><span><b>${s.new7}</b>New this week</span>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Sign-ups</h2><span class="meta">last 30 days</span></div>
      <div class="adm-bars" role="img" aria-label="Sign-ups per day over the last 30 days: ${sign.reduce((a, b) => a + b, 0)} in total">
        ${sign.map((n, i) => html`<i style="height:${n ? Math.max(8, (n / peak) * 100) : 2}%" title="${days[i]}: ${n}"></i>`)}
      </div>
      <div class="row spread small faint"><span>${fmtDate(days[0], { day: 'numeric', month: 'short' })}</span><span>Today</span></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>People</h2><span class="meta">${s.users.length}</span></div>
      <ul class="list adm-people">${s.users.map((u) => html`<li class="item ${recent(u) ? '' : 'adm-quiet'}">
        <span class="adm-dot ${recent(u) ? 'on' : ''}" aria-hidden="true"></span>
        <div class="body"><p class="title">${u.name && u.name !== 'HERO' ? u.name : html`<span class="muted">${u.name === 'HERO' ? 'HERO (default name)' : 'No name yet'}</span>`}${u.me ? html` <span class="pill">You</span>` : ''}${u.confirmed ? '' : html` <span class="pill">Email not confirmed</span>`}</p>
          <p class="sub">Seen ${ago(u.last_seen)} · joined ${ago(u.joined)} · ${u.sections == null ? 'not set up' : `${u.sections} sections`}</p></div>
        <span class="adm-xp"><b>${u.xp7}</b>actions this week</span>
      </li>`)}</ul>
      <p class="small faint" style="margin-top:8px">“Seen” is the last time they opened the app or earned XP. You only see names and counts, never anyone’s entries.</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>Sections people use</h2>${s.not_set_up ? html`<span class="meta">${s.not_set_up} not set up</span>` : ''}</div>
      <ul class="adm-secs">${secRows.map((x) => html`<li><span>${x.label}</span><i style="width:${(x.n / top) * 100}%"></i><b>${x.n}</b></li>`)}</ul>
    </section>
    <section class="card">
      <div class="adm-kpis three"><span><b>${s.projects}</b>Shared projects</span><span><b>${s.couples}</b>Couple spaces</span>
        <a href="#/settings/inbox"><b>${s.feedback_new}</b>New feedback</a></div>
    </section>`);
}

// ---------------------------------------------------------------- account
async function account(el, ctx) {
  mount(el, html`
    <section class="card">
      ${ctx.store.mode === 'cloud' ? html`
        <p class="small muted">Signed in as</p>
        <p class="acct-email">${ctx.store.user.email}</p>
        <p class="small faint" style="margin:8px 0 14px">Your data is synced to your account and private to you, except what you add to shared projects.</p>
        <button class="btn" data-signout>${raw(icon('logout', 16))}Sign out</button>` : html`<p class="muted">Offline mode: everything is saved in this browser only.</p>`}
    </section>
    <section class="card">
      <p class="small muted">Life Quest is built and kept running by one person, free of ads.</p>
      <div class="row wrap" style="margin-top:12px;gap:8px">
        <a class="btn sm" href="/about">About Life Quest</a>
        <a class="btn sm" href="https://buymeacoffee.com/faustianecho" target="_blank" rel="noopener noreferrer">Buy me a coffee ☕</a>
      </div>
    </section>`);
}
