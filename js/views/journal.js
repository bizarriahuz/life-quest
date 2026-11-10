import { html, raw, wire, mount, today, addDays, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

// One line a day. "On this day" looks back a month, six months and a year (and more, once there is more).
const monthsBack = (t, n) => {
  const [y, m, d] = t.split('-').map(Number);
  const last = new Date(y, m - 1 - n + 1, 0).getDate();
  const dt = new Date(y, m - 1 - n, Math.min(d, last));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

export default {
  id: 'journal',
  label: 'One line',
  async render(el, ctx) {
    const t = today();
    const lines = await ctx.store.list('journal_lines', { order: 'day' });
    lines.sort((a, b) => b.day.localeCompare(a.day));
    const byDay = Object.fromEntries(lines.map((l) => [l.day, l]));
    const todays = byDay[t];
    let streak = 0;
    for (let d = todays ? t : addDays(t, -1); byDay[d]; d = addDays(d, -1)) streak += 1;
    const back = [[1, 'A month ago'], [6, 'Six months ago'], ...[1, 2, 3, 4, 5].map((y) => [12 * y, y === 1 ? 'A year ago' : `${y} years ago`])]
      .map(([n, label]) => ({ label, line: byDay[monthsBack(t, n)] })).filter((x) => x.line);
    const recent = lines.filter((l) => l.day !== t).slice(0, 30);

    mount(el, html`
      <header class="page-head"><div><h1>One line a day</h1><p>${streak ? `${streak}-day streak` : 'A sentence about today'} · ${lines.length} line${lines.length === 1 ? '' : 's'} so far</p></div></header>

      <section class="card">
        <div class="card-head"><h2>${fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div>
        <form data-form="save" class="form">
          <textarea name="body" maxlength="280" rows="2" required placeholder="What happened today, in one line?" aria-label="Today’s line">${todays?.body || ''}</textarea>
          <div class="row spread"><span class="small faint" data-count>${(todays?.body || '').length}/280</span>
            <button class="btn primary">${raw(icon(todays ? 'check' : 'plus', 18))}${todays ? 'Update' : `Save · +${XP.journalLine}`}</button></div>
        </form>
      </section>

      ${back.length ? html`<section class="card">
        <div class="card-head"><h2>On this day</h2></div>
        <ul class="list">${back.map((b) => html`<li class="item"><div class="body"><p class="sub">${b.label} · ${fmtDate(b.line.day, { day: 'numeric', month: 'short', year: 'numeric' })}</p><p class="title" style="white-space:normal">${b.line.body}</p></div></li>`)}</ul>
      </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>Earlier</h2></div>
        ${recent.length ? html`<ul class="list">${recent.map((l) => html`<li class="item">
          <div class="body"><p class="sub">${relDate(l.day)}</p><p class="title" style="white-space:normal">${l.body}</p></div>
          <button class="icon-btn" data-act="delete" data-id="${l.id}" aria-label="Delete the line from ${fmtDate(l.day)}">${raw(icon('trash'))}</button>
        </li>`)}</ul>` : empty('Your lines will build up here. Come back tomorrow for the next one.')}
      </section>
    `);

    const ta = el.querySelector('textarea[name=body]');
    ta.addEventListener('input', () => { el.querySelector('[data-count]').textContent = `${ta.value.length}/280`; });
    wire(el, {
      save: async (v) => {
        const body = (v.body || '').trim().slice(0, 280);
        if (!body) return;
        if (todays) { await ctx.store.update('journal_lines', todays.id, { body }); ctx.say('Updated'); }
        else {
          await ctx.store.insert('journal_lines', { day: t, body });
          await ctx.award('WIS', XP.journalLine, 'journal', t, 'One line a day');
        }
        ctx.rerender();
      },
      delete: async (b) => {
        const l = lines.find((x) => x.id === b.dataset.id);
        if (!l || !confirm('Delete this line? Its XP will be removed.')) return;
        await ctx.store.remove('journal_lines', l.id);
        await ctx.revoke('journal', l.day);
        ctx.rerender();
      },
    });
  },
};
