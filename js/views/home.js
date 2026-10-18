import { html, raw, wire, mount, bar, today, relDate, fmtDate, greeting } from '../ui.js';
import { icon } from '../icons.js';
import { STATS, XP, overallLevel, statLevel, totalXP, strongest } from '../game.js';

let renaming = false;

const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function dailyIndex(n) {
  let h = 0;
  for (const c of today()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n ? h % n : 0;
}

export default {
  id: 'home',
  label: 'Home',
  async render(el, ctx) {
    const t = today();
    const [prayers, openTasks, lastWorkout, reading, quotes] = await Promise.all([
      ctx.store.list('prayer_logs', { match: { prayed_on: t } }),
      ctx.store.list('tasks', { match: { done: false } }),
      ctx.store.list('workouts', { order: 'performed_on', limit: 1 }),
      ctx.store.list('books', { match: { status: 'reading' } }),
      ctx.store.list('quotes', { limit: 500 }),
    ]);
    const totals = ctx.totals;
    const lv = overallLevel(totals);
    const name = ctx.profile?.hero_name || 'You';
    const dailies = openTasks.filter((q) => q.kind === 'daily');
    const dailyLeft = dailies.filter((q) => q.done_on !== t).length;
    const due = openTasks.filter((q) => q.kind !== 'daily' && q.due_on && q.due_on <= t).length;
    const quote = quotes.length ? quotes[dailyIndex(quotes.length)] : null;
    const w = lastWorkout[0];
    const top = strongest(totals);

    mount(el, html`
      <header class="page-head">
        <div><h1>${greeting()}</h1><p>${fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
      </header>

      <section class="card hero">
        <div class="hero-top">
          <div class="avatar">${initials(name)}</div>
          <div class="grow">
            ${renaming ? html`
              <form data-form="rename" class="row">
                <input name="hero_name" maxlength="24" value="${name}" aria-label="Your name" required autofocus>
                <button class="btn primary sm">Save</button>
              </form>` : html`
              <p class="hero-name">${name}
                <button class="text-btn" data-act="rename-open" aria-label="Edit name">Edit</button></p>
              <p class="hero-sub">Level ${lv.level}${top ? ` · strongest in ${top}` : ''}</p>`}
          </div>
        </div>
        <div>
          <div class="lv-row"><span><b>${lv.into}</b> / ${lv.need} XP to level ${lv.level + 1}</span><span>${totalXP(totals)} total</span></div>
          ${bar(lv.pct, 'thick')}
        </div>
        <div class="stats">
          ${Object.entries(STATS).map(([k, s]) => {
            const sl = statLevel(totals[k] || 0);
            return html`
              <a class="stat" href="#/${s.view}">
                <span class="stat-top"><span class="stat-name">${s.name}</span><span class="stat-lv">Lv ${sl.level}</span></span>
                ${bar(sl.pct)}
                <span class="stat-from">${s.from}</span>
              </a>`;
          })}
        </div>
      </section>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Today</h2></div>
          <div class="today">
            <a href="#/prayer">${raw(icon('prayer'))}<span class="t-label">Prayer</span>
              <span class="t-val"><span class="dots">${['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((p) =>
                html`<i class="${prayers.some((x) => x.prayer === p) ? 'on' : ''}"></i>`)}</span>${prayers.length}/5</span></a>
            <a href="#/tasks">${raw(icon('tasks'))}<span class="t-label">Tasks</span>
              <span class="t-val">${dailies.length ? `${dailyLeft} daily left` : 'No dailies'}${due ? ` · ${due} due` : ''}</span></a>
            <a href="#/fitness">${raw(icon('fitness'))}<span class="t-label">Fitness</span>
              <span class="t-val">${w ? `${w.kind[0].toUpperCase()}${w.kind.slice(1)} · ${relDate(w.performed_on)}` : 'Nothing logged yet'}</span></a>
            <a href="#/books">${raw(icon('books'))}<span class="t-label">Reading</span>
              <span class="t-val">${reading.length ? reading.map((b) => b.title).join(', ') : 'Nothing in progress'}</span></a>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Quote of the day</h2></div>
          ${quote ? html`
            <blockquote class="quote">“${quote.text}”${quote.source ? html`<cite>${quote.source}</cite>` : ''}</blockquote>` : html`
            <p class="empty">No quotes yet. <a href="#/quotes"><u>Add your first one</u></a></p>`}
        </section>
      </div>

      <section class="card">
        <details>
          <summary>How XP works</summary>
          <ul class="list small muted">
            <li class="item">Tasks: main ${XP.task.main}, side ${XP.task.side}, daily ${XP.task.daily}</li>
            <li class="item">Prayer: ${XP.prayer} each, +${XP.prayerFullDay} for all five in a day</li>
            <li class="item">Fitness: 1 per minute (up to 120) + 5 per km</li>
            <li class="item">Books: 1 per 10 pages, ${XP.bookFinished} for finishing</li>
            <li class="item">Notes: ${XP.note} per new note · Quotes: ${XP.quote} each</li>
            <li class="item">Hobbies: 1 per 2 minutes (minimum 5)</li>
            <li class="item">Undo or delete something and its XP is removed.</li>
          </ul>
        </details>
      </section>
    `);

    wire(el, {
      'rename-open': () => { renaming = true; ctx.rerender(); },
      rename: async ({ hero_name }) => {
        renaming = false;
        if (hero_name) await ctx.setProfile({ hero_name: hero_name.slice(0, 24) });
        ctx.rerender();
      },
    });
  },
};
