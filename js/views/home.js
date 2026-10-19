import { html, raw, wire, mount, bar, today, relDate, fmtDate, greeting } from '../ui.js';
import { icon } from '../icons.js';
import { STATS, XP, overallLevel, statLevel, totalXP, strongest, statVisible, money } from '../game.js';

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
    const on = ctx.sections;
    const none = Promise.resolve([]);
    const m = t.slice(0, 7);
    const [yy, mm] = m.split('-').map(Number);
    const monthEnd = `${m}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
    const [prayerLogs, openTasks, lastWorkout, reading, quotes, monthTxns, cats] = await Promise.all([
      on.has('prayer') ? ctx.store.list('prayer_logs', { match: { prayed_on: t } }) : none,
      on.has('tasks') ? ctx.store.list('tasks', { match: { done: false } }) : none,
      on.has('fitness') ? ctx.store.list('workouts', { order: 'performed_on', limit: 1 }) : none,
      on.has('books') ? ctx.store.list('books', { match: { status: 'reading' } }) : none,
      on.has('quotes') ? ctx.store.list('quotes', { limit: 500 }) : none,
      on.has('finance') ? ctx.store.list('transactions', { match: { kind: 'expense' }, gte: ['occurred_on', `${m}-01`], lte: ['occurred_on', monthEnd] }) : none,
      on.has('finance') ? ctx.store.list('finance_categories', { order: 'name', asc: true }) : none,
    ]);
    const spentMonth = monthTxns.reduce((n, x) => n + Number(x.amount), 0);
    const budgetMonth = cats.reduce((n, c) => n + (c.kind === 'expense' ? Number(c.budget) || 0 : 0), 0);
    const budgetIds = new Set(cats.filter((c) => Number(c.budget) > 0).map((c) => c.id));
    const budgetUsed = monthTxns.filter((x) => budgetIds.has(x.category_id)).reduce((n, x) => n + Number(x.amount), 0);
    const $ = (n) => money(n, ctx.currency, { maximumFractionDigits: 0 });
    const prayers = prayerLogs.filter((x) => x.prayer !== 'awrad');
    const awradDone = prayerLogs.some((x) => x.prayer === 'awrad');
    const totals = ctx.totals;
    const lv = overallLevel(totals);
    const name = ctx.profile?.hero_name || 'You';
    const dailies = openTasks.filter((q) => q.kind === 'daily');
    const jobsOpen = openTasks.filter((q) => q.kind === 'job').length;
    const dailyLeft = dailies.filter((q) => q.done_on !== t).length;
    const due = openTasks.filter((q) => q.kind !== 'daily' && q.due_on && q.due_on <= t).length;
    const quote = quotes.length ? quotes[dailyIndex(quotes.length)] : null;
    const w = lastWorkout[0];
    const top = strongest(totals);

    const todayRows = {
      prayer: () => html`<a href="#/prayer">${raw(icon('prayer'))}<span class="t-label">Prayer</span>
              <span class="t-val"><span class="dots">${['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((p) =>
                html`<i class="${prayers.some((x) => x.prayer === p) ? 'on' : ''}"></i>`)}</span>${prayers.length}/5 · awrad ${awradDone ? '✓' : '–'}</span></a>`,
      tasks: () => html`<a href="#/tasks">${raw(icon('tasks'))}<span class="t-label">Tasks</span>
              <span class="t-val">${jobsOpen ? `${jobsOpen} job${jobsOpen === 1 ? '' : 's'} · ` : ''}${dailies.length ? `${dailyLeft} daily left` : 'No dailies'}${due ? ` · ${due} due` : ''}</span></a>`,
      finance: () => html`<a href="#/finance">${raw(icon('finance'))}<span class="t-label">Money</span>
              <span class="t-val">${$(spentMonth)} spent${budgetMonth ? ` · ${budgetUsed > budgetMonth ? `${$(budgetUsed - budgetMonth)} over` : `${$(budgetMonth - budgetUsed)} left`}` : ' this month'}</span></a>`,
      fitness: () => html`<a href="#/fitness">${raw(icon('fitness'))}<span class="t-label">Fitness</span>
              <span class="t-val">${w ? `${w.kind[0].toUpperCase()}${w.kind.slice(1)} · ${relDate(w.performed_on)}` : 'Nothing logged yet'}</span></a>`,
      books: () => html`<a href="#/books">${raw(icon('books'))}<span class="t-label">Reading</span>
              <span class="t-val">${reading.length ? reading.map((b) => b.title).join(', ') : 'Nothing in progress'}</span></a>`,
    };

    mount(el, html`
      <header class="page-head">
        <div><h1>${greeting()}</h1><p>${fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
      </header>

      ${ctx.profile && ctx.profile.sections == null ? html`
        <a class="card banner" href="#/settings">
          <span class="i-wrap">${raw(icon('settings'))}</span>
          <span class="grow"><p>Make it yours</p><p class="small muted">Choose the sections you want: tasks, prayer, fitness, books, finance and more.</p></span>
          ${raw(icon('right', 18))}
        </a>` : ''}

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
          ${Object.entries(STATS).filter(([k]) => statVisible(k, on)).map(([k, s]) => {
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

      <div class="${on.has('quotes') ? 'grid-2' : ''}">
        <section class="card">
          <div class="card-head"><h2>Today</h2></div>
          <div class="today">
            ${[...on].filter((k) => todayRows[k]).map((k) => todayRows[k]())}
            ${!Object.keys(todayRows).some((k) => on.has(k)) ? html`<p class="empty">Turn on a few sections in <a href="#/settings"><u>Settings</u></a>.</p>` : ''}
          </div>
        </section>

        ${on.has('quotes') ? html`<section class="card">
          <div class="card-head"><h2>Quote of the day</h2></div>
          ${quote ? html`
            <blockquote class="quote">“${quote.text}”${quote.source ? html`<cite>${quote.source}</cite>` : ''}</blockquote>` : html`
            <p class="empty">No quotes yet. <a href="#/quotes"><u>Add your first one</u></a></p>`}
        </section>` : ''}
      </div>

      <section class="card">
        <details>
          <summary>How XP works</summary>
          <ul class="list small muted">
            ${on.has('tasks') ? html`<li class="item">Tasks: main or job ${XP.task.main}, side ${XP.task.side}, daily ${XP.task.daily}</li>` : ''}
            ${on.has('prayer') ? html`<li class="item">Prayer: ${XP.prayer} each, +${XP.prayerFullDay} for all five in a day · Daily Awrad: ${XP.awrad}</li>` : ''}
            ${on.has('finance') ? html`<li class="item">Finance: ${XP.financeDay} for each day you log, 1 per ${money(10, ctx.currency, { maximumFractionDigits: 0 })} saved toward a goal (5–50), ${XP.budgetMonth} for a month at or under budget</li>` : ''}
            ${on.has('fitness') ? html`<li class="item">Fitness: 1 per minute (up to 120) + 5 per km</li>` : ''}
            ${on.has('books') ? html`<li class="item">Books: 1 per 10 pages, ${XP.bookFinished} for finishing</li>` : ''}
            ${on.has('notes') || on.has('quotes') ? html`<li class="item">Notes: ${XP.note} per new note · Quotes: ${XP.quote} each</li>` : ''}
            ${on.has('hobbies') ? html`<li class="item">Hobbies: 1 per 2 minutes (minimum 5)</li>` : ''}
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
