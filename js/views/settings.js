import { html, raw, wire, mount } from '../ui.js';
import { icon } from '../icons.js';
import { SECTIONS, CURRENCIES } from '../game.js';
import { CHANGELOG, LATEST } from '../changelog.js';
import { fmtDate } from '../ui.js';
import { THEMES, DEFAULT_THEME, applyTheme } from '../theme.js';

const logEntry = (e) => html`
  <article class="log-entry">
    <p class="log-head"><span class="pill">${e.version}</span><b>${e.title}</b><span class="faint small">${fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
    <ul>${e.items.map((i) => html`<li>${i}</li>`)}</ul>
  </article>`;

export default {
  id: 'settings',
  label: 'Settings',
  async render(el, ctx) {
    const on = ctx.sections;
    // Turned-on sections in your order, then the rest in the default order.
    const byId = Object.fromEntries(SECTIONS.map((x) => [x.id, x]));
    const ordered = [...[...on].map((id) => byId[id]).filter(Boolean), ...SECTIONS.filter((x) => !on.has(x.id))];
    const name = ctx.profile?.hero_name || '';
    const currency = ctx.currency;
    const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];

    mount(el, html`
      <header class="page-head"><div><h1>Settings</h1><p>Make Life Quest yours</p></div></header>

      <section class="card">
        <div class="card-head"><h2>Theme</h2><span class="meta">Changes straight away</span></div>
        <div class="themes" role="radiogroup" aria-label="Theme">
          ${THEMES.map((t) => html`
            <label class="theme-opt">
              <input type="radio" name="theme" value="${t.id}" data-change="theme" ${(ctx.profile?.theme || DEFAULT_THEME) === t.id ? 'checked' : ''}>
              <span class="theme-card" style="--t-bg:${t.swatch[0]};--t-card:${t.swatch[1]};--t-acc:${t.swatch[2]};--t-fg:${t.swatch[3]}">
                <span class="tp"><i class="tp-bar"></i><i class="tp-line"></i><i class="tp-line short"></i><i class="tp-dot"></i></span>
                <span class="theme-name">${t.label}<span class="faint">${t.mode === 'light' ? 'Light' : 'Dark'}</span></span>
              </span>
            </label>`)}
        </div>
      </section>

      <form data-form="save" class="form" style="gap:16px">
        <section class="card">
          <div class="card-head"><h2>Sections</h2><span class="meta">Switch on, off, and reorder</span></div>
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

        <section class="card">
          <div class="card-head"><h2>Profile</h2></div>
          <div class="fields">
            <label class="field">Name<input name="hero_name" maxlength="24" value="${name}" required></label>
            <label class="field">Currency<select name="currency">${currencies.map((c) => html`<option value="${c}" ${c === currency ? 'selected' : ''}>${c}</option>`)}</select></label>
          </div>
        </section>

        <div class="row end"><span class="small muted" id="dirty" hidden>Unsaved changes</span><button class="btn primary">Save changes</button></div>
      </form>

      <section class="card" id="whats-new">
        <div class="card-head"><h2>What's new</h2><span class="meta">Version ${LATEST}</span></div>
        <div class="log">
          ${CHANGELOG.slice(0, 3).map((e) => logEntry(e))}
        </div>
        ${CHANGELOG.length > 3 ? html`
          <details style="margin-top:12px"><summary class="small muted" style="font-weight:500">Earlier updates</summary>
            <div class="log">${CHANGELOG.slice(3).map((e) => logEntry(e))}</div>
          </details>` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>Account</h2></div>
        ${ctx.store.mode === 'cloud' ? html`
          <div class="row spread wrap">
            <p class="muted">${ctx.store.user.email}</p>
            <button class="btn sm" data-signout>${raw(icon('logout', 16))}Sign out</button>
          </div>` : html`<p class="muted">Offline mode: everything is saved in this browser only.</p>`}
      </section>
    `);

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
    el.addEventListener('change', (e) => { if (e.target.closest('form')) markDirty(); });

    wire(el, {
      theme: async (r) => {
        const id = applyTheme(r.value);
        await ctx.setProfile({ theme: id });
      },
      up: (b) => move(b, -1),
      down: (b) => move(b, 1),
      save: async (v, form) => {
        const chosen = [...form.querySelectorAll('input[name=sec]:checked')].map((i) => i.value); // in on-screen order
        await ctx.setProfile({
          hero_name: (v.hero_name || 'You').slice(0, 24),
          currency: /^[A-Z]{3}$/.test(v.currency) ? v.currency : 'SGD',
          sections: chosen.filter((id) => SECTIONS.some((x) => x.id === id)),
        });
        ctx.say('Settings saved');
        ctx.rerender();
      },
    });
  },
};
