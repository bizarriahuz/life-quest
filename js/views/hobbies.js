import { html, raw, wire, mount, today, addDays, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

const hrs = (min) => (min >= 60 ? `${(min / 60).toFixed(1).replace(/\.0$/, '')} h` : `${min} min`);

export default {
  id: 'hobbies',
  label: 'Hobbies',
  async render(el, ctx) {
    const t = today();
    const [hobbies, sessions] = await Promise.all([
      ctx.store.list('hobbies', { order: 'name', asc: true }),
      ctx.store.list('hobby_sessions', { gte: ['session_on', addDays(t, -365)], order: 'session_on' }),
    ]);
    sessions.sort((a, b) => b.session_on.localeCompare(a.session_on) || b.created_at.localeCompare(a.created_at));
    const nameOf = Object.fromEntries(hobbies.map((h) => [h.id, h.name]));
    const stats = (id) => {
      const s = sessions.filter((x) => x.hobby_id === id);
      return { n: s.length, min: s.reduce((a, x) => a + (x.duration_min || 0), 0), last: s[0]?.session_on };
    };

    mount(el, html`
      <header class="page-head"><div><h1>Hobbies</h1><p>${hobbies.length} hobb${hobbies.length === 1 ? 'y' : 'ies'} · past 12 months</p></div></header>

      ${hobbies.length ? html`
        <section class="card">
          <div class="card-head"><h2>Log a session</h2></div>
          <form data-form="log" class="form">
            <div class="fields">
              <label class="field">Hobby<select name="hobby_id">${hobbies.map((h) => html`<option value="${h.id}">${h.name}</option>`)}</select></label>
              <label class="field">Date<input type="date" name="session_on" value="${t}" max="${t}" required></label>
              <label class="field">Minutes<input type="number" name="duration_min" min="1" max="1440" inputmode="numeric" required placeholder="60"></label>
            </div>
            <input name="note" maxlength="200" placeholder="Note (optional)" aria-label="Note">
            <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Log session</button></div>
          </form>
        </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>Your hobbies</h2></div>
        ${hobbies.length ? html`<ul class="list">${hobbies.map((h) => {
          const s = stats(h.id);
          return html`
            <li class="item">
              <div class="body"><p class="title">${h.name}</p>
                <p class="sub">${s.n} session${s.n === 1 ? '' : 's'} · ${hrs(s.min)}${s.last ? ` · last ${relDate(s.last).toLowerCase()}` : ''}</p></div>
              <button class="icon-btn" data-act="delhobby" data-id="${h.id}" aria-label="Delete ${h.name}">${raw(icon('trash'))}</button>
            </li>`;
        })}</ul>` : empty('Add a hobby to start tracking time spent on it.')}
        <form data-form="add" class="row" style="margin-top:12px">
          <input name="name" maxlength="60" placeholder="New hobby" required aria-label="Hobby name" class="grow">
          <button class="btn">Add</button>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Recent sessions</h2></div>
        ${sessions.length ? html`<ul class="list">${sessions.slice(0, 25).map((s) => html`
          <li class="item">
            <div class="body"><p class="title">${nameOf[s.hobby_id] || 'Hobby'} · ${s.duration_min} min</p>
              <p class="sub">${relDate(s.session_on)}${s.note ? ` · ${s.note}` : ''}</p></div>
            <span class="xp">+${XP.hobby(s.duration_min)}</span>
            <button class="icon-btn" data-act="delsession" data-id="${s.id}" aria-label="Delete session">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty('No sessions yet.')}
      </section>
    `);

    wire(el, {
      add: async (v, form) => {
        const name = v.name.replace(/\s+/g, ' ');
        if (hobbies.some((h) => h.name.toLowerCase() === name.toLowerCase())) { ctx.say('You already have that hobby'); return; }
        await ctx.store.insert('hobbies', { name });
        form.reset();
        ctx.say(`${name} added`);
        ctx.rerender();
      },
      log: async (v, form) => {
        const min = Math.max(1, Math.min(1440, parseInt(v.duration_min, 10) || 0));
        const row = await ctx.store.insert('hobby_sessions', {
          hobby_id: v.hobby_id, session_on: v.session_on || t, duration_min: min, note: v.note || null,
        });
        form.reset();
        await ctx.award('CHA', XP.hobby(min), 'hobby_session', row.id, nameOf[v.hobby_id]);
        ctx.rerender();
      },
      delsession: async (b) => {
        if (!confirm('Delete this session? Its XP will be removed.')) return;
        await ctx.store.remove('hobby_sessions', b.dataset.id);
        await ctx.revoke('hobby_session', b.dataset.id);
        ctx.rerender();
      },
      delhobby: async (b) => {
        const h = hobbies.find((x) => x.id === b.dataset.id);
        const own = sessions.filter((s) => s.hobby_id === h.id);
        if (!confirm(`Delete ${h.name} and its ${own.length} session(s)? Their XP will be removed.`)) return;
        for (const s of own) await ctx.store.revoke('hobby_session', s.id);
        await ctx.store.remove('hobbies', h.id);
        await ctx.revoke('hobby', h.id); // refreshes totals
        ctx.rerender();
      },
    });
  },
};
