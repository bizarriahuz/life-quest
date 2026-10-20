// Calendar: your own events, everything dated elsewhere in Life Quest
// (tasks, goals, shared projects, clients) and your phone calendars (iCal links).
import { html, raw, wire, mount, today, addDays, dateKey, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { REPEATS, toggleTask } from '../tasklogic.js';
import { cachedFeed, loadFeed, forgetFeed, expandICS } from '../ics.js';

let month = null;          // 'YYYY-MM' on screen
let sel = null;            // selected day
let editing = null;        // own event being edited
let addOpen = false;

export const SRC = {
  event:   { label: 'Event',    view: 'calendar' },
  task:    { label: 'Task',     view: 'tasks' },
  goal:    { label: 'Goal',     view: 'goals' },
  project: { label: 'Project',  view: 'projects' },
  client:  { label: 'Client',   view: 'clients' },
  feed:    { label: 'Calendar', view: 'calendar' },
};
const FEED_HOSTS = /^(calendar\.google\.com|p\d+-(caldav|calendars)\.icloud\.com|(www\.)?icloud\.com|outlook\.(live|office365|office)\.com)$/;
export function feedOk(link) {
  try { const u = new URL(String(link).trim().replace(/^webcals?:\/\//i, 'https://')); return u.protocol === 'https:' && FEED_HOSTS.test(u.hostname) ? u.toString() : null; } catch { return null; }
}

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function clock(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${pad(m)}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

// Own event occurrences between two date keys.
function ownDays(e, from, to) {
  const out = [];
  const len = e.ends_on ? Math.round((new Date(e.ends_on) - new Date(e.starts_on)) / 864e5) : 0;
  const push = (k) => { for (let i = 0; i <= len; i += 1) { const d = addDays(k, i); if (d >= from && d <= to) out.push({ key: d, first: i === 0, start: k }); } };
  if (!e.repeat) { push(e.starts_on); return out; }
  const [y, m, d] = e.starts_on.split('-').map(Number);
  for (let n = 0; n < 3000; n += 1) {
    let k;
    if (e.repeat === 'weekly') k = dateKey(new Date(y, m - 1, d + 7 * n));
    else if (e.repeat === 'fortnightly') k = dateKey(new Date(y, m - 1, d + 14 * n));
    else {
      const mm = e.repeat === 'monthly' ? m - 1 + n : m - 1 + 12 * n;
      const last = new Date(y, mm + 1, 0).getDate();
      k = dateKey(new Date(y, mm, Math.min(d, last)));
    }
    if (k > to) break;
    if (addDays(k, len) >= from) push(k);
  }
  return out;
}

// Everything dated between two date keys, as { key, time, end, title, src, … }.
export async function collect(ctx, from, to, { fetchFeeds = false, onFeed } = {}) {
  const on = ctx.sections;
  const none = Promise.resolve([]);
  const get = (sec, table, o) => (on.has(sec) ? ctx.store.list(table, o).catch(() => []) : none);
  const [events, tasks, goals, ptasks, clients] = await Promise.all([
    ctx.store.list('calendar_events', { lte: ['starts_on', to] }).catch(() => []),
    get('tasks', 'tasks', { match: { done: false }, gte: ['due_on', from], lte: ['due_on', to] }),
    get('goals', 'goals', { match: { status: 'active' }, gte: ['target_date', from], lte: ['target_date', to] }),
    get('projects', 'project_entries', { match: { kind: 'task', done: false }, gte: ['due_on', from], lte: ['due_on', to] }),
    get('clients', 'client_projects', { gte: ['due_on', from], lte: ['due_on', to] }),
  ]);
  const items = [];
  for (const e of events) for (const o of ownDays(e, from, to)) {
    items.push({ key: o.key, time: o.first ? e.start_time?.slice(0, 5) : null, end: o.first ? e.end_time?.slice(0, 5) : null, title: e.title, note: e.note, src: 'event', id: e.id, ev: e, more: !o.first });
  }
  for (const q of tasks) if (q.kind !== 'daily') items.push({ key: q.due_on, title: q.title, src: 'task', id: q.id, task: q });
  for (const g of goals) items.push({ key: g.target_date, title: `Goal: ${g.title}`, src: 'goal', href: '#/goals' });
  for (const x of ptasks) items.push({ key: x.due_on, title: x.title, src: 'project', href: `#/projects/${x.project_id}`, sub: x.assignee_id === ctx.store.user.id ? 'For you' : null });
  for (const c of clients) if (!['paid', 'lost'].includes(c.stage)) items.push({ key: c.due_on, title: `${c.client} · ${c.title}`, src: 'client', href: '#/clients' });

  // Phone calendars
  const feeds = Array.isArray(ctx.profile?.calendar_feeds) ? ctx.profile.calendar_feeds : [];
  const [fy, fm, fd] = from.split('-').map(Number); const [ty, tm, td] = to.split('-').map(Number);
  const F = new Date(fy, fm - 1, fd); const T = new Date(ty, tm - 1, td, 23, 59, 59);
  feeds.forEach((f, i) => {
    const c = cachedFeed(f.url);
    if (fetchFeeds) {
      const before = c?.at;
      loadFeed(f.url).then((n) => { if (n?.at !== before) onFeed?.(); }).catch(() => { if (!c?.error) onFeed?.(); });
    }
    if (!c) return;
    for (const o of expandICS(c.events, F, T)) {
      if (o.allDay) {
        for (let d = new Date(o.start); d < o.end || +d === +o.start; d.setDate(d.getDate() + 1)) {
          const k = dateKey(d); if (k >= from && k <= to) items.push({ key: k, title: o.title, src: 'feed', feed: i, cal: f.name, loc: o.location, more: +d !== +o.start });
          if (+o.end <= +o.start) break;
        }
      } else {
        const k = dateKey(o.start);
        if (k >= from && k <= to) items.push({ key: k, time: hm(o.start), end: +o.end > +o.start ? hm(o.end) : null, endDay: dateKey(o.end) !== k ? dateKey(o.end) : null, title: o.title, src: 'feed', feed: i, cal: f.name, loc: o.location });
      }
    }
  });
  const order = (a, b) => (a.time ? 1 : 0) - (b.time ? 1 : 0) || (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title);
  return items.sort((a, b) => a.key.localeCompare(b.key) || order(a, b));
}

export default {
  id: 'calendar',
  label: 'Calendar',
  async render(el, ctx) {
    const t = today();
    sel ??= t;
    month ??= t.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`;
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;                // Monday-first grid
    const gridFrom = addDays(first, -lead);
    const daysIn = new Date(y, m, 0).getDate();
    const weeks = Math.ceil((lead + daysIn) / 7);
    const gridTo = addDays(gridFrom, weeks * 7 - 1);
    const upTo = addDays(t, 14);
    const from = gridFrom < t ? gridFrom : t;
    const to = gridTo > upTo ? gridTo : upTo;
    let redraw;
    const items = await collect(ctx, from, to, { fetchFeeds: location.hash.startsWith('#/calendar'), onFeed: () => { clearTimeout(redraw); redraw = setTimeout(() => { if (location.hash.startsWith('#/calendar')) ctx.rerender(); }, 120); } });
    const byDay = {};
    for (const it of items) (byDay[it.key] ??= []).push(it);
    const feeds = Array.isArray(ctx.profile?.calendar_feeds) ? ctx.profile.calendar_feeds : [];
    const dayItems = byDay[sel] || [];
    const coming = items.filter((it) => it.key > t && it.key <= addDays(t, 7) && !it.more);

    const row = (it, showDate = false) => {
      if (it.src === 'event' && editing === it.id && !showDate) return editForm(it.ev);
      const when = it.time ? `${clock(it.time)}${it.end ? ` – ${clock(it.end)}` : ''}` : it.more ? 'continues' : 'All day';
      const subs = [SRC[it.src].label === 'Calendar' ? it.cal || 'Calendar' : SRC[it.src].label, it.loc, it.sub, it.ev?.repeat && REPEATS[it.ev.repeat].toLowerCase(), it.note].filter(Boolean);
      const body = html`<span class="cal-bar src-${it.src}"></span>
        <div class="cal-when">${showDate ? html`<b>${relDate(it.key)}</b>` : ''}<span>${when}</span></div>
        <div class="body"><p class="title">${it.title}</p><p class="sub">${subs.join(' · ')}</p></div>`;
      if (it.src === 'task') return html`<li class="item cal-item">${body}
        <button class="check" data-act="tick" data-id="${it.id}" aria-label="Complete: ${it.title}">${raw(icon('check'))}</button></li>`;
      if (it.src === 'event') return html`<li class="item cal-item">${body}
        ${!showDate ? html`<button class="icon-btn" data-act="edit" data-id="${it.id}" aria-label="Edit ${it.title}">${raw(icon('edit'))}</button>
        <button class="icon-btn" data-act="del" data-id="${it.id}" aria-label="Delete ${it.title}">${raw(icon('trash'))}</button>` : ''}</li>`;
      if (it.href) return html`<li><a class="item cal-item hit" href="${it.href}">${body}${raw(icon('right', 16))}</a></li>`;
      return html`<li class="item cal-item">${body}</li>`;
    };
    const fields = (e = {}) => html`
      <input name="title" maxlength="200" required placeholder="Event, e.g. Dentist" value="${e.title || ''}" aria-label="Event">
      <div class="fields">
        <label class="field">Date<input type="date" name="starts_on" required value="${e.starts_on || sel}"></label>
        <label class="field">Starts<input type="time" name="start_time" value="${e.start_time?.slice(0, 5) || ''}"></label>
        <label class="field">Ends<input type="time" name="end_time" value="${e.end_time?.slice(0, 5) || ''}"></label>
        <label class="field">Repeats<select name="repeat"><option value="">Doesn’t repeat</option>
          ${Object.entries(REPEATS).map(([k, v]) => html`<option value="${k}" ${e.repeat === k ? 'selected' : ''}>${v}</option>`)}</select></label>
        <label class="field">Last day<input type="date" name="ends_on" value="${e.ends_on || ''}" title="For events over several days"></label>
      </div>
      <input name="note" maxlength="500" placeholder="Note or place (optional)" value="${e.note || ''}" aria-label="Note">`;
    const editForm = (e) => html`<li class="item editing"><form data-form="saveedit" data-id="${e.id}" class="form grow">${fields(e)}
      <div class="row end"><button type="button" class="btn sm" data-act="canceledit">Cancel</button><button class="btn primary sm">Save</button></div></form></li>`;

    const label = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    mount(el, html`
      <header class="page-head"><div><h1>Calendar</h1><p>${fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></header>

      <section class="card cal-card">
        <div class="cal-head">
          <button class="icon-btn" data-act="prev" aria-label="Previous month">${raw(icon('left'))}</button>
          <h2>${label}</h2>
          <button class="icon-btn" data-act="next" aria-label="Next month">${raw(icon('right'))}</button>
          ${month !== t.slice(0, 7) || sel !== t ? html`<button class="btn sm" data-act="today">Today</button>` : ''}
        </div>
        <div class="cal-grid" role="grid" aria-label="${label}">
          ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => html`<span class="cal-dow">${d}</span>`)}
          ${[...Array(weeks * 7)].map((_, i) => {
            const k = addDays(gridFrom, i);
            const its = byDay[k] || [];
            const srcs = [...new Set(its.map((x) => x.src))].slice(0, 4);
            return html`<button class="cal-day ${k.slice(0, 7) !== month ? 'out' : ''} ${k === t ? 'today' : ''} ${k === sel ? 'sel' : ''} ${k < t ? 'past' : ''}"
              data-act="pick" data-day="${k}" aria-label="${fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' })}${its.length ? `, ${its.length} item${its.length === 1 ? '' : 's'}` : ''}" aria-pressed="${k === sel}">
              <span class="n">${Number(k.slice(8))}</span>
              <span class="dots">${srcs.map((s) => html`<i class="src-${s}"></i>`)}</span>
            </button>`;
          })}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${relDate(sel) === fmtDate(sel) ? fmtDate(sel, { weekday: 'long', day: 'numeric', month: 'long' }) : `${relDate(sel)} · ${fmtDate(sel, { day: 'numeric', month: 'short' })}`}</h2>
          <button class="btn sm" data-act="add">${raw(icon('plus', 16))}Event</button></div>
        ${addOpen ? html`<form data-form="addevent" class="form cal-add">${fields()}
          <div class="row end"><button type="button" class="btn sm" data-act="canceladd">Cancel</button><button class="btn primary sm">Add event</button></div></form>` : ''}
        ${dayItems.length ? html`<ul class="list">${dayItems.map((it) => row(it))}</ul>` : addOpen ? '' : empty('Nothing on this day.')}
      </section>

      ${coming.length ? html`<section class="card">
        <div class="card-head"><h2>Coming up</h2><span class="meta">next 7 days</span></div>
        <ul class="list">${coming.slice(0, 12).map((it) => row(it, true))}</ul>
      </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>Phone calendars</h2><span class="meta">${feeds.length}/5</span></div>
        ${feeds.length ? html`<ul class="list">${feeds.map((f, i) => {
          const c = cachedFeed(f.url);
          return html`<li class="item"><span class="cal-bar src-feed"></span><div class="body"><p class="title">${f.name || c?.name || 'Calendar'}</p>
            <p class="sub">${c?.error ? html`<span class="due-late">${c.error}</span>` : c ? `${c.events.length} events · updated ${new Date(c.at).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })}` : 'Loading…'}</p></div>
            <button class="icon-btn" data-act="refresh" data-i="${i}" aria-label="Refresh ${f.name}">${raw(icon('repeat'))}</button>
            <button class="icon-btn" data-act="unfeed" data-i="${i}" aria-label="Remove ${f.name}">${raw(icon('trash'))}</button></li>`;
        })}</ul>` : html`<p class="small muted">See your Google, Apple or Outlook calendar here, next to everything else.</p>`}
        ${feeds.length < 5 ? html`<form data-form="addfeed" class="form" style="margin-top:12px">
          <input name="url" required placeholder="Paste your calendar’s private iCal link" aria-label="Calendar link" autocomplete="off">
          <div class="row"><input name="name" maxlength="40" placeholder="Name, e.g. Work" class="grow" aria-label="Calendar name"><button class="btn sm">Add</button></div>
        </form>
        <details class="feed-help"><summary>Where do I find the link?</summary>
          <div class="small muted">
            <p><b>Google Calendar</b> (on a computer): open calendar.google.com → Settings ⚙ → click your calendar on the left → “Integrate calendar” → copy <b>Secret address in iCal format</b>.</p>
            <p><b>iPhone / iCloud</b>: Calendar app → Calendars → tap ⓘ next to a calendar → turn on <b>Public Calendar</b> → Share Link → Copy.</p>
            <p><b>Outlook</b>: outlook.com → Settings → Calendar → Shared calendars → Publish a calendar → copy the <b>ICS</b> link.</p>
            <p>Life Quest only reads the calendar; it can’t change it. Keep the link private: anyone who has it can see that calendar. Events refresh every 15 minutes.</p>
          </div></details>` : ''}
      </section>
    `);

    // Swipe the month grid left/right to change month.
    const grid = el.querySelector('.cal-grid');
    let sx = null;
    grid.addEventListener('touchstart', (e) => { sx = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() } : null; }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      if (!sx) return;
      const dx = e.changedTouches[0].clientX - sx.x; const dy = e.changedTouches[0].clientY - sx.y;
      const go = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5;
      sx = null;
      if (!go) return;
      e.preventDefault();
      const d = new Date(y, m - 1 + (dx < 0 ? 1 : -1), 1);
      month = dateKey(d).slice(0, 7);
      ctx.rerender();
    });

    const ev = (id) => items.find((x) => x.ev?.id === id)?.ev;
    const values = (v) => {
      const start = v.start_time || null;
      return {
        title: v.title.slice(0, 200), starts_on: v.starts_on, start_time: start,
        end_time: start && v.end_time && v.end_time > start ? v.end_time : null,
        ends_on: v.ends_on && v.ends_on > v.starts_on ? v.ends_on : null,
        repeat: v.repeat || null, note: v.note || null,
      };
    };
    const saveFeeds = (list) => ctx.setProfile({ calendar_feeds: list });
    wire(el, {
      prev: () => { const d = new Date(y, m - 2, 1); month = dateKey(d).slice(0, 7); ctx.rerender(); },
      next: () => { const d = new Date(y, m, 1); month = dateKey(d).slice(0, 7); ctx.rerender(); },
      today: () => { month = t.slice(0, 7); sel = t; ctx.rerender(); },
      pick: (b) => { sel = b.dataset.day; editing = null; if (sel.slice(0, 7) !== month) month = sel.slice(0, 7); ctx.rerender(); },
      add: async () => { addOpen = true; editing = null; await ctx.rerender(); document.querySelector('form[data-form=addevent] input[name=title]')?.focus(); },
      canceladd: () => { addOpen = false; ctx.rerender(); },
      addevent: async (v) => {
        const row = values(v);
        await ctx.store.insert('calendar_events', row);
        addOpen = false; sel = row.starts_on; month = sel.slice(0, 7);
        ctx.say('Event added'); ctx.rerender();
      },
      edit: (b) => { editing = b.dataset.id; addOpen = false; ctx.rerender(); },
      canceledit: () => { editing = null; ctx.rerender(); },
      saveedit: async (v, f) => {
        await ctx.store.update('calendar_events', f.dataset.id, values(v));
        editing = null; ctx.say('Event updated'); ctx.rerender();
      },
      del: async (b) => {
        const e = ev(b.dataset.id);
        if (!e || !confirm(e.repeat ? `Delete “${e.title}” and all its repeats?` : `Delete “${e.title}”?`)) return;
        await ctx.store.remove('calendar_events', e.id);
        ctx.rerender();
      },
      tick: async (b) => {
        const it = items.find((x) => x.src === 'task' && x.id === b.dataset.id);
        if (it) { await toggleTask(ctx, it.task); ctx.rerender(); }
      },
      addfeed: async (v) => {
        const url = feedOk(v.url);
        if (!url) { ctx.say('Paste the private iCal link from Google, iCloud or Outlook (see “Where do I find the link?”)'); return; }
        if (feeds.some((f) => f.url === url)) { ctx.say('That calendar is already added'); return; }
        ctx.say('Checking the calendar…');
        let got;
        try { got = await loadFeed(url, { force: true }); } catch (err) { ctx.say(err.message); return; }
        await saveFeeds([...feeds, { name: (v.name || got?.name || 'Calendar').slice(0, 40), url }]);
        ctx.say(`Added · ${got?.events.length || 0} events`);
        ctx.rerender();
      },
      unfeed: async (b) => {
        const f = feeds[+b.dataset.i];
        if (!f || !confirm(`Remove “${f.name}” from Life Quest? Your calendar itself isn’t touched.`)) return;
        forgetFeed(f.url);
        await saveFeeds(feeds.filter((_, i) => i !== +b.dataset.i));
        ctx.rerender();
      },
      refresh: async (b) => {
        const f = feeds[+b.dataset.i];
        try { await loadFeed(f.url, { force: true }); ctx.say('Calendar refreshed'); } catch (err) { ctx.say(err.message); }
        ctx.rerender();
      },
    });
  },
};
