// Weekly review: what the week added up to, Monday to Sunday.
import { html, raw, wire, mount, today, addDays, fmtDate } from '../ui.js';
import { icon } from '../icons.js';
import { STATS, statVisible, money } from '../game.js';

let offset = null;          // 0 = this week, -1 = last week …

const MOODS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];
const FACE = ['😞', '😕', '😐', '🙂', '😄'];
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export function weekStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;      // Monday = 0
  return addDays(key, -dow);
}
const iso = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };
const hmin = (n) => `${Math.floor(n / 60)}h ${String(Math.round(n % 60)).padStart(2, '0')}m`;
const hours = (min) => (min >= 60 ? `${(min / 60).toFixed(1).replace(/\.0$/, '')} h` : `${Math.round(min)} min`);
const plural = (n, w, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;
const sum = (xs, f) => xs.reduce((n, x) => n + (Number(f(x)) || 0), 0);
const localDay = (ts) => new Date(ts).toLocaleDateString('en-CA');

export default {
  id: 'review',
  label: 'Week in review',
  async render(el, ctx) {
    const t = today();
    const thisWeek = weekStart(t);
    // On a Monday, this week is still empty: open on last week instead.
    if (offset === null) offset = t === thisWeek ? -1 : 0;
    const a = addDays(thisWeek, offset * 7);
    const b = addDays(a, 6);
    const pa = addDays(a, -7);
    const days = [...Array(7)].map((_, i) => addDays(a, i));
    const elapsed = days.filter((d) => d <= t).length;
    const on = ctx.sections;
    const none = Promise.resolve([]);
    const range = (col) => ({ gte: [col, a], lte: [col, b] });
    const get = (sec, table, o) => (on.has(sec) ? ctx.store.list(table, o).catch(() => []) : none);

    const [xpAll, tasksDone, steps, goalsDone, prayers, workouts, sleeps, books, comics, learnS, learnI, notes,
      moods, quotes, hobbySes, hobbies, matches, watched, albums, cLogs, contacts, txns, projects] = await Promise.all([
      ctx.store.list('xp_events', { gte: ['created_at', iso(pa)], lte: ['created_at', iso(addDays(b, 1))] }).catch(() => []),
      get('tasks', 'tasks', { match: { done: true }, ...range('done_on') }),
      get('goals', 'goal_milestones', { match: { done: true }, ...range('done_on') }),
      get('goals', 'goals', { match: { status: 'done' }, ...range('done_on') }),
      get('prayer', 'prayer_logs', range('prayed_on')),
      get('fitness', 'workouts', range('performed_on')),
      get('sleep', 'sleep_logs', range('slept_on')),
      get('books', 'books', range('finished_on')),
      get('comics', 'comics', range('read_on')),
      get('learning', 'learning_sessions', range('session_on')),
      get('learning', 'learning_items', range('done_on')),
      get('notes', 'notes', { gte: ['created_at', iso(a)], lte: ['created_at', iso(addDays(b, 1))] }),
      get('mood', 'moods', range('logged_on')),
      get('quotes', 'quotes', { gte: ['created_at', iso(a)], lte: ['created_at', iso(addDays(b, 1))] }),
      get('hobbies', 'hobby_sessions', range('session_on')),
      get('hobbies', 'hobbies', {}),
      get('mtg', 'mtg_matches', range('played_on')),
      get('watchlist', 'watchlist', { match: { status: 'done' }, ...range('done_on') }),
      get('music', 'albums', { match: { status: 'listened' }, ...range('listened_on') }),
      get('people', 'contact_logs', range('contacted_on')),
      get('people', 'contacts', {}),
      get('finance', 'transactions', range('occurred_on')),
      get('clients', 'client_projects', range('paid_on')),
    ]);
    const [chessG, chessP, wordG] = on.has('games') ? await Promise.all([
      ctx.store.list('chess_games', { gte: ['ended_on', a], lte: ['ended_on', b] }).catch(() => []),
      ctx.store.list('chess_puzzles', range('day')).catch(() => []),
      ctx.store.list('word_games', range('day')).catch(() => []),
    ]) : [[], [], []];

    // ---- XP ----
    const inWeek = (e) => { const d = localDay(e.created_at); return d >= a && d <= b; };
    const xpWeek = xpAll.filter(inWeek);
    const xpPrev = xpAll.filter((e) => { const d = localDay(e.created_at); return d >= pa && d < a; });
    const total = sum(xpWeek, (e) => e.amount);
    const prev = sum(xpPrev, (e) => e.amount);
    const byDay = Object.fromEntries(days.map((d) => [d, 0]));
    for (const e of xpWeek) byDay[localDay(e.created_at)] += e.amount;
    const peak = Math.max(1, ...Object.values(byDay));
    const best = days.reduce((x, d) => (byDay[d] > byDay[x] ? d : x), days[0]);
    const byStat = {};
    for (const e of xpWeek) byStat[e.stat] = (byStat[e.stat] || 0) + e.amount;
    const statRows = Object.entries(byStat).filter(([k]) => STATS[k] && statVisible(k, on)).sort((x, y) => y[1] - x[1]);
    const change = prev ? Math.round(((total - prev) / prev) * 100) : null;

    // ---- per section ----
    const tasks = tasksDone.filter((q) => q.kind !== 'daily');
    const dailyTicks = xpWeek.filter((e) => e.source === 'task' && e.source_id.includes(':')).length;
    const pDays = {};
    for (const l of prayers) (pDays[l.prayed_on] ??= new Set()).add(l.prayer);
    const fard = prayers.filter((l) => l.prayer !== 'awrad').length;
    const fullDays = days.filter((d) => PRAYERS.every((p) => pDays[d]?.has(p))).length;
    const awradDays = days.filter((d) => pDays[d]?.has('awrad')).length;
    const runKm = sum(workouts, (w) => w.distance_km);
    const workMin = sum(workouts, (w) => w.duration_min);
    const sleepAvg = sleeps.length ? sum(sleeps, (s) => s.duration_min) / sleeps.length : 0;
    const goalMin = ctx.profile?.sleep_goal_min || 480;
    const learnMin = sum(learnS, (s) => s.duration_min);
    const moodAvg = moods.length ? sum(moods, (m) => m.mood) / moods.length : null;
    const moodBy = Object.fromEntries(moods.map((m) => [m.logged_on, m]));
    const hobbyMin = sum(hobbySes, (s) => s.duration_min);
    const hobbyBy = {};
    for (const s of hobbySes) hobbyBy[s.hobby_id] = (hobbyBy[s.hobby_id] || 0) + s.duration_min;
    const topHobby = Object.entries(hobbyBy).sort((x, y) => y[1] - x[1])[0];
    const hobbyName = topHobby ? hobbies.find((h) => h.id === topHobby[0])?.name : null;
    const wins = matches.filter((m) => m.result === 'win').length;
    const people = [...new Set(cLogs.map((l) => contacts.find((c) => c.id === l.contact_id)?.name).filter(Boolean))];
    const spent = sum(txns.filter((x) => x.kind === 'expense'), (x) => x.amount);
    const income = sum(txns.filter((x) => x.kind === 'income'), (x) => x.amount);
    const given = sum(txns.filter((x) => x.kind === 'sadaqah'), (x) => x.amount);
    const paid = projects.filter((p) => p.stage === 'paid');
    const $ = (n) => money(n, ctx.currency, { maximumFractionDigits: 0 });

    // Tiles: one per section that had something (or matters even when empty).
    const tiles = [];
    const tile = (sec, label, value, sub) => tiles.push({ sec, label, value, sub });
    if (on.has('tasks')) tile('tasks', 'Tasks done', tasks.length, dailyTicks ? `+ ${plural(dailyTicks, 'daily tick')}` : plural(tasks.filter((q) => q.kind === 'main').length, 'main task'));
    if (on.has('goals') && (steps.length || goalsDone.length)) tile('goals', 'Goals', plural(steps.length, 'milestone'), goalsDone.length ? `${plural(goalsDone.length, 'goal')} achieved` : 'ticked off');
    if (on.has('prayer')) tile('prayer', 'Prayers', `${fard}/${elapsed * 5}`, `${plural(fullDays, 'full day')}${awradDays ? ` · awrad ${awradDays}/${elapsed}` : ''}`);
    if (on.has('fitness')) tile('fitness', 'Workouts', workouts.length, workouts.length ? `${hours(workMin)}${runKm ? ` · ${runKm.toFixed(1).replace(/\.0$/, '')} km` : ''}` : 'none logged');
    if (on.has('sleep')) tile('sleep', 'Sleep', sleeps.length ? hmin(sleepAvg) : '–', sleeps.length ? `avg · ${sleeps.filter((s) => s.duration_min >= goalMin).length}/${sleeps.length} nights on goal` : 'no nights logged');
    if (on.has('books') || on.has('comics')) tile(on.has('books') ? 'books' : 'comics', 'Finished reading', books.length + comics.length, [books.length && plural(books.length, 'book'), comics.length && plural(comics.length, 'comic')].filter(Boolean).join(' · ') || 'nothing finished');
    if (on.has('learning')) tile('learning', 'Learning', learnMin ? hours(learnMin) : '0', learnI.length ? `${plural(learnI.length, 'course')} completed` : `${plural(learnS.length, 'session')}`);
    if (on.has('mood')) tile('mood', 'Mood', moodAvg == null ? '–' : `${FACE[Math.round(moodAvg) - 1]} ${MOODS[Math.round(moodAvg) - 1]}`, `${moods.length}/${elapsed} check-ins`);
    if (on.has('notes')) tile('notes', 'Notes', notes.length, on.has('quotes') && quotes.length ? `+ ${plural(quotes.length, 'quote')}` : 'written');
    if (on.has('hobbies')) tile('hobbies', 'Hobbies', hobbyMin ? hours(hobbyMin) : '0', hobbyName ? `mostly ${hobbyName}` : 'no time logged');
    if (on.has('games') && wordG.length) {
      const ws = wordG.filter((w) => w.solved);
      tile('games', 'Daily Word', `${ws.length}/${elapsed}`, ws.length ? `avg ${(ws.reduce((n, w) => n + w.guesses.length, 0) / ws.length).toFixed(1)} guesses` : 'none solved');
    }
    if (on.has('games') && (chessG.length || chessP.length)) {
      const cw = chessG.filter((g) => g.result === 'win').length;
      tile('games', 'Chess', `${cw}–${chessG.filter((g) => g.result === 'loss').length}`, [chessG.length && `${chessG.length} game${chessG.length === 1 ? '' : 's'}`, chessP.filter((p) => p.solved).length && `${chessP.filter((p) => p.solved).length} puzzle${chessP.filter((p) => p.solved).length === 1 ? '' : 's'}`].filter(Boolean).join(' · '));
    }
    if (on.has('mtg') && matches.length) tile('mtg', 'MTG', `${wins}–${matches.length - wins}`, `${plural(matches.length, 'game')}`);
    if (on.has('watchlist')) tile('watchlist', 'Watched', watched.length, watched.length ? watched.map((w) => w.title).slice(0, 2).join(', ') : 'nothing finished');
    if (on.has('music')) tile('music', 'Albums', albums.length, albums.length ? albums.map((x) => x.title).slice(0, 2).join(', ') : 'none logged');
    if (on.has('people')) tile('people', 'Caught up with', people.length, people.length ? people.slice(0, 3).join(', ') + (people.length > 3 ? ` +${people.length - 3}` : '') : 'nobody yet');
    if (on.has('finance')) tile('finance', 'Spent', $(spent), [income && `${$(income)} in`, given && `${$(given)} sadaqah`].filter(Boolean).join(' · ') || 'this week');
    if (on.has('clients') && paid.length) tile('clients', 'Clients paid', paid.length, $(sum(paid, (p) => p.value)));

    // Highlights: a few plain sentences worth smiling at.
    const hi = [];
    if (goalsDone.length) hi.push(`Achieved ${goalsDone.map((g) => `“${g.title}”`).join(' and ')}`);
    if (fullDays && elapsed && fullDays === elapsed) hi.push(`Prayed all five every day${elapsed === 7 ? ' this week' : ' so far'}`);
    else if (fullDays) hi.push(`Prayed all five on ${plural(fullDays, 'day')}`);
    for (const bk of books) hi.push(`Finished ${bk.title}${bk.author ? ` by ${bk.author}` : ''}`);
    if (learnI.length) hi.push(`Completed ${learnI.map((x) => x.title).join(', ')}`);
    if (runKm >= 5) hi.push(`Ran ${runKm.toFixed(1).replace(/\.0$/, '')} km`);
    if (tasks.length >= 5) hi.push(`Cleared ${tasks.length} tasks`);
    if (given) hi.push(`Gave ${$(given)} in sadaqah`);
    if (prev && total > prev) hi.push(`${total - prev} more XP than the week before`);
    const gratitude = moods.filter((m) => m.gratitude).sort((x, y) => x.logged_on.localeCompare(y.logged_on));

    const title = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : `${fmtDate(a, { day: 'numeric', month: 'short' })} week`;
    const span = `${fmtDate(a, { day: 'numeric', month: 'short' })} – ${fmtDate(b, { day: 'numeric', month: 'short', year: a.slice(0, 4) !== t.slice(0, 4) ? 'numeric' : undefined })}`;

    mount(el, html`
      <header class="page-head"><div><h1>Week in review</h1><p>${title} · ${span}</p></div></header>

      <div class="week-nav">
        <button class="btn sm" data-act="prev" aria-label="Previous week">${raw(icon('left', 16))}Earlier</button>
        ${offset !== 0 ? html`<button class="text-btn" data-act="now">This week</button>` : html`<span></span>`}
        <button class="btn sm" data-act="next" ${offset >= 0 ? 'disabled' : ''} aria-label="Next week">Later${raw(icon('right', 16))}</button>
      </div>

      <section class="card review-hero">
        <div class="rh-top">
          <div><p class="rh-xp">${total}<span> XP</span></p>
            <p class="small muted">${change == null ? (offset === 0 && elapsed < 7 ? `${plural(7 - elapsed, 'day')} to go` : 'earned') : html`<span class="${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%</span> vs the week before (${prev})`}</p></div>
          ${total ? html`<p class="small muted rh-best">Best day<br><b>${fmtDate(best, { weekday: 'long' })}</b> · ${byDay[best]} XP</p>` : ''}
        </div>
        <div class="week-bars" role="img" aria-label="XP each day">
          ${days.map((d) => html`<div class="wb ${d === t ? 'today' : ''} ${d > t ? 'future' : ''}">
            <span class="wb-v">${byDay[d] || ''}</span><i style="height:${Math.round((byDay[d] / peak) * 100)}%"></i>
            <span class="wb-d">${fmtDate(d, { weekday: 'narrow' })}</span></div>`)}
        </div>
        ${statRows.length ? html`<div class="stat-chips">${statRows.map(([k, v]) => html`<span class="chip"><b>+${v}</b> ${STATS[k].name}</span>`)}</div>` : ''}
      </section>

      ${hi.length ? html`<section class="card">
        <div class="card-head"><h2>Highlights</h2></div>
        <ul class="highlights">${hi.slice(0, 6).map((h) => html`<li>${h}</li>`)}</ul>
      </section>` : ''}

      ${tiles.length ? html`<div class="review-tiles">${tiles.map((x) => html`
        <a class="rtile card" href="#/${x.sec}">
          <span class="rt-label">${raw(icon(x.sec, 16))}${x.label}</span>
          <b class="rt-val">${x.value}</b>
          <span class="rt-sub">${x.sub}</span>
        </a>`)}</div>` : ''}

      ${on.has('mood') && moods.length ? html`<section class="card">
        <div class="card-head"><h2>How the week felt</h2></div>
        <div class="mood-week">${days.map((d) => html`<span class="${d > t ? 'future' : ''}" title="${fmtDate(d)}${moodBy[d] ? ` · ${MOODS[moodBy[d].mood - 1]}` : ''}">
          <b>${moodBy[d] ? FACE[moodBy[d].mood - 1] : '·'}</b>${fmtDate(d, { weekday: 'narrow' })}</span>`)}</div>
        ${gratitude.length ? html`<h3 class="small muted" style="margin:14px 0 6px">Grateful for</h3>
          <ul class="list">${gratitude.map((m) => html`<li class="item"><div class="body"><p class="title">${m.gratitude}</p><p class="sub">${fmtDate(m.logged_on, { weekday: 'long' })}</p></div></li>`)}</ul>` : ''}
      </section>` : ''}

      ${tasks.length ? html`<section class="card">
        <details><summary>Tasks done <span class="muted small" style="margin-left:auto;margin-right:10px">${tasks.length}</span></summary>
          <ul class="list">${tasks.sort((x, y) => x.done_on.localeCompare(y.done_on)).map((q) => html`<li class="item done"><div class="body"><p class="title">${q.title}</p><p class="sub">${fmtDate(q.done_on, { weekday: 'long' })}</p></div></li>`)}</ul>
        </details>
      </section>` : ''}

      ${!total && !tiles.some((x) => Number(x.value)) ? html`<section class="card"><p class="empty">Nothing logged ${offset === 0 ? 'yet this week' : 'that week'}.</p></section>` : ''}
    `);

    wire(el, {
      prev: () => { offset -= 1; ctx.rerender(); },
      next: () => { offset = Math.min(0, offset + 1); ctx.rerender(); },
      now: () => { offset = 0; ctx.rerender(); },
    });
  },
};
