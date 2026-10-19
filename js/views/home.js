import { html, raw, wire, mount, bar, today, relDate, relDateInline, fmtDate, greeting } from '../ui.js';
import { icon } from '../icons.js';
import { cachedTimes, loadMonth, nextPrayer } from '../prayertimes.js';
import { addDays } from '../ui.js';
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
    const [prayerLogs, openTasks, lastWorkout, reading, quotes, monthTxns, cats, comicsAll, sleepLogs,
      goalsAll, steps, projects, learnWeek, moodToday, decks, lastMatch, watchingNow, contacts, contactLogs] = await Promise.all([
      on.has('prayer') ? ctx.store.list('prayer_logs', { match: { prayed_on: t } }) : none,
      on.has('tasks') ? ctx.store.list('tasks', { match: { done: false } }) : none,
      on.has('fitness') ? ctx.store.list('workouts', { order: 'performed_on', limit: 1 }) : none,
      on.has('books') ? ctx.store.list('books', { match: { status: 'reading' } }) : none,
      on.has('quotes') ? ctx.store.list('quotes', { limit: 500 }) : none,
      on.has('finance') ? ctx.store.list('transactions', { match: { kind: 'expense' }, gte: ['occurred_on', `${m}-01`], lte: ['occurred_on', monthEnd] }) : none,
      on.has('finance') ? ctx.store.list('finance_categories', { order: 'name', asc: true }) : none,
      on.has('comics') ? ctx.store.list('comics', {}) : none,
      on.has('sleep') ? ctx.store.list('sleep_logs', { gte: ['slept_on', addDays(t, -7)] }) : none,
      on.has('goals') ? ctx.store.list('goals', { match: { status: 'active' } }) : none,
      on.has('goals') ? ctx.store.list('goal_milestones', {}) : none,
      on.has('clients') ? ctx.store.list('client_projects', {}) : none,
      on.has('learning') ? ctx.store.list('learning_sessions', { gte: ['session_on', addDays(t, -6)] }) : none,
      on.has('mood') ? ctx.store.list('moods', { match: { logged_on: t } }) : none,
      on.has('mtg') ? ctx.store.list('mtg_decks', { match: { retired: false } }) : none,
      on.has('mtg') ? ctx.store.list('mtg_matches', { order: 'played_on', limit: 1 }) : none,
      on.has('watchlist') ? ctx.store.list('watchlist', {}) : none,
      on.has('people') ? ctx.store.list('contacts', {}) : none,
      on.has('people') ? ctx.store.list('contact_logs', { gte: ['contacted_on', addDays(t, -366)] }) : none,
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

    let nextP = null;
    if (on.has('prayer')) {
      const tm = addDays(t, 1);
      for (const d of [t, tm]) if (cachedTimes(d) === undefined) loadMonth(d.slice(0, 7)).then((f) => { if (f && el.isConnected) ctx.rerender(); });
      nextP = nextPrayer(t, tm);
    }
    const PNAME = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
    const comicsReading = comicsAll.filter((c) => c.status === 'reading');
    const comicsPile = comicsAll.filter((c) => c.status === 'queued').length;
    const comicsMonth = comicsAll.filter((c) => c.status === 'read' && (c.read_on || '').startsWith(m)).length;
    const sleepSorted = [...sleepLogs].sort((x, y) => y.slept_on.localeCompare(x.slept_on));
    const lastSleep = sleepSorted[0];
    const sleepAvg = sleepLogs.length ? sleepLogs.reduce((n, x) => n + x.duration_min, 0) / sleepLogs.length : 0;
    const hmin = (n) => `${Math.floor(n / 60)}h ${String(Math.round(n % 60)).padStart(2, '0')}m`;
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const nextGoal = [...goalsAll].sort((a, b) => (a.target_date || '9999').localeCompare(b.target_date || '9999'))[0];
    const goalSteps = nextGoal ? steps.filter((s) => s.goal_id === nextGoal.id) : [];
    const working = projects.filter((p) => p.stage === 'active' || p.stage === 'done');
    const unpaid = projects.filter((p) => p.stage === 'done');
    const learnMin = learnWeek.reduce((n, x) => n + x.duration_min, 0);
    const MOODS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];
    const lastSeen = {};
    for (const l of contactLogs) if (!lastSeen[l.contact_id] || l.contacted_on > lastSeen[l.contact_id]) lastSeen[l.contact_id] = l.contacted_on;
    const overdue = contacts.filter((c) => !lastSeen[c.id] || addDays(lastSeen[c.id], c.every_days) <= t);
    const lm = lastMatch[0];
    const todayRows = {
      goals: () => html`<a href="#/goals">${raw(icon('goals'))}<span class="t-label">Goals</span>
              <span class="t-val"><span class="t-txt">${nextGoal ? `${nextGoal.title} · ${goalSteps.filter((s) => s.done).length}/${goalSteps.length}` : 'Set a goal'}</span></span></a>`,
      clients: () => html`<a href="#/clients">${raw(icon('clients'))}<span class="t-label">Clients</span>
              <span class="t-val"><span class="t-txt">${working.length ? `${working.length} in progress${unpaid.length ? ` · ${unpaid.length} to invoice` : ''}` : 'Nothing on the go'}</span></span></a>`,
      learning: () => html`<a href="#/learning">${raw(icon('learning'))}<span class="t-label">Learning</span>
              <span class="t-val"><span class="t-txt">${learnMin ? `${learnMin >= 60 ? `${(learnMin / 60).toFixed(1).replace(/\.0$/, '')} h` : `${learnMin} min`} this week` : 'No study time this week'}</span></span></a>`,
      mood: () => html`<a href="#/mood">${raw(icon('mood'))}<span class="t-label">Mood</span>
              <span class="t-val"><span class="t-txt">${moodToday[0] ? MOODS[moodToday[0].mood - 1] : 'Check in'}</span></span></a>`,
      mtg: () => html`<a href="#/mtg">${raw(icon('mtg'))}<span class="t-label">MTG</span>
              <span class="t-val"><span class="t-txt">${lm ? `Last game ${relDateInline(lm.played_on)} · ${lm.result}` : plural(decks.length, 'deck')}</span></span></a>`,
      watchlist: () => html`<a href="#/watchlist">${raw(icon('watchlist'))}<span class="t-label">Watchlist</span>
              <span class="t-val"><span class="t-txt">${watchingNow.some((w) => w.status === 'watching') ? `Watching ${watchingNow.filter((w) => w.status === 'watching').map((w) => w.title).join(', ')}` : `${watchingNow.filter((w) => w.status === 'queued').length} to watch`}</span></span></a>`,
      people: () => html`<a href="#/people">${raw(icon('people'))}<span class="t-label">People</span>
              <span class="t-val"><span class="t-txt">${contacts.length ? (overdue.length ? `${overdue.slice(0, 2).map((c) => c.name).join(', ')}${overdue.length > 2 ? ` +${overdue.length - 2}` : ''} to catch up` : 'All caught up') : 'Add someone'}</span></span></a>`,
      prayer: () => html`<a href="#/prayer">${raw(icon('prayer'))}<span class="t-label">Prayer</span>
              <span class="t-val"><span class="dots">${['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((p) =>
                html`<i class="${prayers.some((x) => x.prayer === p) ? 'on' : ''}"></i>`)}<i class="aw ${awradDone ? 'on' : ''}" title="Daily Awrad ${awradDone ? 'done' : 'not yet'}"></i></span><span class="t-txt">${prayers.length === 5 ? '5/5 ✓' : nextP ? `${PNAME[nextP.key]} ${nextP.label}` : `${prayers.length}/5`}</span></span></a>`,
      tasks: () => html`<a href="#/tasks">${raw(icon('tasks'))}<span class="t-label">Tasks</span>
              <span class="t-val">${jobsOpen ? `${jobsOpen} job${jobsOpen === 1 ? '' : 's'} · ` : ''}${dailies.length ? `${dailyLeft} daily left` : 'No dailies'}${due ? ` · ${due} due` : ''}</span></a>`,
      finance: () => html`<a href="#/finance">${raw(icon('finance'))}<span class="t-label">Money</span>
              <span class="t-val">${$(spentMonth)} spent${budgetMonth ? ` · ${budgetUsed > budgetMonth ? `${$(budgetUsed - budgetMonth)} over` : `${$(budgetMonth - budgetUsed)} left`}` : ' this month'}</span></a>`,
      fitness: () => html`<a href="#/fitness">${raw(icon('fitness'))}<span class="t-label">Fitness</span>
              <span class="t-val">${w ? `${w.kind[0].toUpperCase()}${w.kind.slice(1)} · ${relDate(w.performed_on)}` : 'Nothing logged yet'}</span></a>`,
      comics: () => html`<a href="#/comics">${raw(icon('comics'))}<span class="t-label">Comics</span>
              <span class="t-val"><span class="t-txt">${comicsReading.length ? comicsReading.map((c) => c.title + (c.issue ? ` ${/^\d+$/.test(c.issue) ? '#' : ''}${c.issue}` : '')).join(', ') : `${comicsMonth} read this month · ${comicsPile} in pile`}</span></span></a>`,
      sleep: () => html`<a href="#/sleep">${raw(icon('sleep'))}<span class="t-label">Sleep</span>
              <span class="t-val"><span class="t-txt">${lastSleep ? `${hmin(lastSleep.duration_min)}${lastSleep.slept_on === t ? ' last night' : ''} · avg ${hmin(sleepAvg)}` : 'Log last night'}</span></span></a>`,
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
              <a class="stat" href="#/${s.sections.find((x) => on.has(x)) || s.view}">
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
            ${on.has('sleep') ? html`<li class="item">Sleep: ${XP.sleepLog} per night logged, +${XP.sleepGoal} when you hit your goal</li>` : ''}
            ${on.has('books') ? html`<li class="item">Books: 1 per 10 pages, ${XP.bookFinished} for finishing</li>` : ''}
            ${on.has('comics') ? html`<li class="item">Comics: ${XP.comicRead} per comic read</li>` : ''}
            ${on.has('notes') || on.has('quotes') ? html`<li class="item">Notes: ${XP.note} per new note · Quotes: ${XP.quote} each</li>` : ''}
            ${on.has('hobbies') ? html`<li class="item">Hobbies: 1 per 2 minutes (minimum 5)</li>` : ''}
            ${on.has('goals') ? html`<li class="item">Goals: ${XP.milestone} per milestone, ${XP.goalDone} for achieving a goal</li>` : ''}
            ${on.has('learning') ? html`<li class="item">Learning: 1 per 2 minutes studied (minimum 5), ${XP.learnDone} for completing a course</li>` : ''}
            ${on.has('clients') ? html`<li class="item">Clients: ${XP.clientActive} when a project starts, ${XP.clientPaid} when it’s paid</li>` : ''}
            ${on.has('mood') ? html`<li class="item">Mood: ${XP.mood} per daily check-in</li>` : ''}
            ${on.has('mtg') ? html`<li class="item">MTG: ${XP.mtgMatch} per game, +${XP.mtgWin} for a win</li>` : ''}
            ${on.has('watchlist') ? html`<li class="item">Watchlist: ${XP.watched} per film or series finished</li>` : ''}
            ${on.has('people') ? html`<li class="item">People: ${XP.contact} for each person you catch up with, once a day</li>` : ''}
            ${on.has('finance') && on.has('prayer') ? html`<li class="item">Sadaqah: ${XP.sadaqahDay} Faith on each day you give</li>` : ''}
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
