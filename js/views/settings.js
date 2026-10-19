import { html, raw, wire, mount } from '../ui.js';
import { icon } from '../icons.js';
import { SECTIONS, CURRENCIES } from '../game.js';

export default {
  id: 'settings',
  label: 'Settings',
  async render(el, ctx) {
    const on = ctx.sections;
    const name = ctx.profile?.hero_name || '';
    const currency = ctx.currency;
    const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];

    mount(el, html`
      <header class="page-head"><div><h1>Settings</h1><p>Make Life Quest yours</p></div></header>

      <form data-form="save" class="form" style="gap:16px">
        <section class="card">
          <div class="card-head"><h2>Sections</h2><span class="meta">Turn off what you don't use</span></div>
          <ul class="list">
            ${SECTIONS.map((s) => html`
              <li class="item">
                <span class="i-wrap">${raw(icon(s.id))}</span>
                <label class="body switch-row" for="sec-${s.id}">
                  <span class="title">${s.label}</span>
                  <span class="sub">${s.hint}</span>
                </label>
                <span class="switch"><input type="checkbox" id="sec-${s.id}" name="sec" value="${s.id}" ${on.has(s.id) ? 'checked' : ''}><i aria-hidden="true"></i></span>
              </li>`)}
          </ul>
          <p class="small faint" style="margin-top:10px">Hidden sections keep their data. Your level only counts the sections you use.</p>
        </section>

        <section class="card">
          <div class="card-head"><h2>Profile</h2></div>
          <div class="fields">
            <label class="field">Name<input name="hero_name" maxlength="24" value="${name}" required></label>
            <label class="field">Currency<select name="currency">${currencies.map((c) => html`<option value="${c}" ${c === currency ? 'selected' : ''}>${c}</option>`)}</select></label>
          </div>
        </section>

        <div class="row end"><button class="btn primary">Save changes</button></div>
      </form>

      <section class="card">
        <div class="card-head"><h2>Account</h2></div>
        ${ctx.store.mode === 'cloud' ? html`
          <div class="row spread wrap">
            <p class="muted">${ctx.store.user.email}</p>
            <button class="btn sm" data-signout>${raw(icon('logout', 16))}Sign out</button>
          </div>` : html`<p class="muted">Offline mode: everything is saved in this browser only.</p>`}
      </section>
    `);

    wire(el, {
      save: async (v, form) => {
        const chosen = [...form.querySelectorAll('input[name=sec]:checked')].map((i) => i.value);
        await ctx.setProfile({
          hero_name: (v.hero_name || 'You').slice(0, 24),
          currency: /^[A-Z]{3}$/.test(v.currency) ? v.currency : 'SGD',
          sections: SECTIONS.map((s) => s.id).filter((id) => chosen.includes(id)),
        });
        ctx.say('Settings saved');
        ctx.rerender();
      },
    });
  },
};
