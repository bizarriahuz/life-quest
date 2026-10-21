// First sign-in: pick a name and the sections you want. Shown once, when
// profile.sections has never been set.
import { html, raw, wire, mount } from '../ui.js';
import { icon } from '../icons.js';
import { SECTIONS, DEFAULT_SECTIONS, newSections } from '../game.js';

const GROUPS = [
  ['Plan', ['tasks', 'calendar', 'goals', 'projects']],
  ['Health', ['fitness', 'sleep', 'mood']],
  ['Mind', ['notes', 'books', 'comics', 'learning', 'quotes']],
  ['Faith', ['prayer']],
  ['Money & work', ['finance', 'clients']],
  ['Fun', ['hobbies', 'watchlist', 'music', 'mtg']],
  ['People', ['people']],
];
const isDefaultName = (n) => !n || n === 'HERO' || n === 'You';

export default {
  id: 'welcome',
  label: 'Welcome',
  async render(el, ctx) {
    const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
    const listed = new Set(GROUPS.flatMap(([, ids]) => ids));
    const extra = SECTIONS.filter((s) => !listed.has(s.id)).map((s) => s.id);    // anything added later
    const groups = extra.length ? [...GROUPS, ['More', extra]] : GROUPS;
    const on = new Set(DEFAULT_SECTIONS);
    const name = isDefaultName(ctx.profile?.hero_name) ? '' : ctx.profile.hero_name;

    mount(el, html`
      <form data-form="start" class="welcome">
        <header class="welcome-head">
          <div class="auth-mark">${raw(icon('spark', 26))}</div>
          <h1>Welcome to Life Quest</h1>
          <p class="muted">Pick what you’d like to keep track of. You can change this any time in Settings.</p>
        </header>

        <section class="card">
          <label class="field">What should we call you?
            <input name="hero_name" maxlength="24" value="${name}" placeholder="Your name" autocomplete="given-name"></label>
        </section>

        ${groups.map(([g, ids]) => html`
          <section class="welcome-group">
            <h2>${g}</h2>
            <div class="pick-grid">${ids.filter((id) => byId[id]).map((id) => html`
              <label class="pick">
                <input type="checkbox" name="sec" value="${id}" ${on.has(id) ? 'checked' : ''}>
                <span class="pick-card">
                  <span class="i-wrap">${raw(icon(id))}</span>
                  <span class="pick-text"><b>${byId[id].label}</b><span>${byId[id].hint}</span></span>
                  <span class="pick-tick">${raw(icon('check', 16))}</span>
                </span>
              </label>`)}</div>
          </section>`)}

        <div class="welcome-go">
          <p class="small muted" id="pick-count"></p>
          <button class="btn primary">Start my quest →</button>
        </div>
      </form>
    `);

    const form = el.querySelector('form');
    const count = () => {
      const n = form.querySelectorAll('input[name=sec]:checked').length;
      el.querySelector('#pick-count').textContent = n ? `${n} section${n === 1 ? '' : 's'} chosen` : 'Choose at least one';
      form.querySelector('button.primary').disabled = !n;
    };
    form.addEventListener('change', count);
    count();

    wire(el, {
      start: async (v) => {
        // Keep the on-screen order: Plan first, then the rest.
        const chosen = [...form.querySelectorAll('input[name=sec]:checked')].map((i) => i.value);
        if (!chosen.length) return;
        const patch = { sections: chosen, seen_intros: newSections().map((s) => s.id) };   // they've just seen every section
        if (v.hero_name) patch.hero_name = v.hero_name.slice(0, 24);
        await ctx.setProfile(patch);
        document.body.classList.remove('onboarding');
        location.hash = '#/home';
        ctx.say('All set. Welcome!');
      },
    });
  },
};
