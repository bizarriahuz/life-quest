import { html, raw, wire, mount, today, addDays, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { api } from '../api.js';
import { shrink } from '../photo.js';

// Journal: one line is enough, but an entry can be as long as you like and hold up to 4 photos.
// Jump to any day with the month calendar, or search what you wrote. "On this day" looks back
// a month, six months and each year. XP only for writing about today (no back-filling for points).
// Photos live in a private Cloudflare R2 bucket via /api/journal-photo, so they need an account.
const MAX_PHOTOS = 4;
let day = null;          // the day being written or read (null = today)
let month = null;        // 'YYYY-MM' shown in the calendar
let query = '';
let draft = null;        // { day, body, photos[] } unsaved changes for the open day
let uploading = 0;
const urls = new Map();  // photo key -> object URL (this visit)

const monthsBack = (t, n) => {
  const [y, m, d] = t.split('-').map(Number);
  const last = new Date(y, m - 1 - n + 1, 0).getDate();
  const dt = new Date(y, m - 1 - n, Math.min(d, last));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const firstLine = (s) => String(s || '').split('\n').find((x) => x.trim()) || '';
const ym = (k) => k.slice(0, 7);
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

async function photoUrl(ctx, key) {
  if (!urls.has(key)) urls.set(key, api(ctx, `/api/journal-photo?key=${encodeURIComponent(key)}`, { as: 'blob' }).then((b) => URL.createObjectURL(b)));
  return urls.get(key);
}

export default {
  id: 'journal',
  label: 'Journal',
  async render(el, ctx) {
    const t = today();
    const open = day || t;
    if (!month) month = ym(open);
    const lines = await ctx.store.list('journal_lines', { order: 'day' });
    lines.sort((a, b) => b.day.localeCompare(a.day));
    const byDay = Object.fromEntries(lines.map((l) => [l.day, l]));
    const entry = byDay[open] || null;
    if (!draft || draft.day !== open) draft = { day: open, body: entry?.body || '', photos: [...(entry?.photos || [])] };
    const dirty = draft.body !== (entry?.body || '') || draft.photos.join() !== (entry?.photos || []).join();
    let streak = 0;
    for (let d = byDay[t] ? t : addDays(t, -1); byDay[d]; d = addDays(d, -1)) streak += 1;
    const back = [[1, 'A month ago'], [6, 'Six months ago'], ...[1, 2, 3, 4, 5].map((y) => [12 * y, y === 1 ? 'A year ago' : `${y} years ago`])]
      .map(([n, label]) => ({ label, line: byDay[monthsBack(t, n)] })).filter((x) => x.line);
    const q = query.trim().toLowerCase();
    const found = q ? lines.filter((l) => l.body.toLowerCase().includes(q)).slice(0, 50) : [];
    const recent = lines.filter((l) => l.day !== open).slice(0, 20);
    const cloud = ctx.store.mode === 'cloud';

    // Month calendar (weeks start Monday)
    const [cy, cm] = month.split('-').map(Number);
    const first = new Date(cy, cm - 1, 1); const lead = (first.getDay() + 6) % 7;
    const daysIn = new Date(cy, cm, 0).getDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
    const written = lines.filter((l) => ym(l.day) === month).length;

    const card = (l, big = false) => html`<li class="item jr-entry">
      <button class="jr-open" data-act="open" data-day="${l.day}">
        <span class="sub">${big ? relDate(l.day) : fmtDate(l.day, { weekday: 'short', day: 'numeric', month: 'short', year: l.day.slice(0, 4) === t.slice(0, 4) ? undefined : 'numeric' })}${l.photos?.length ? ` · ${l.photos.length} photo${l.photos.length === 1 ? '' : 's'}` : ''}</span>
        <span class="title jr-text">${big ? l.body : firstLine(l.body)}</span>
      </button></li>`;

    mount(el, html`
      <header class="page-head"><div><h1>Journal</h1><p>${streak ? `${streak}-day streak` : 'A line a day is enough'} · ${lines.length} entr${lines.length === 1 ? 'y' : 'ies'}</p></div></header>

      <section class="card jr-write">
        <div class="card-head"><h2>${open === t ? 'Today' : fmtDate(open, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
          ${open !== t ? html`<button class="btn sm" data-act="today">Back to today</button>` : ''}</div>
        <form data-form="save" class="form">
          <textarea name="body" maxlength="10000" rows="${Math.min(14, Math.max(3, draft.body.split('\n').length + 1))}" placeholder="${open === t ? 'What happened today? One line is enough.' : 'What happened that day?'}" aria-label="Journal entry">${draft.body}</textarea>
          ${draft.photos.length ? html`<div class="jr-photos">${draft.photos.map((k) => html`<figure data-key="${k}"><img alt="Journal photo" data-photo="${k}"><button type="button" class="icon-btn sm" data-act="unphoto" data-key="${k}" aria-label="Remove photo">${raw(icon('close', 14))}</button></figure>`)}</div>` : ''}
          <div class="row spread wrap" style="gap:8px">
            <div class="row" style="gap:8px">
              ${cloud ? html`<label class="btn sm ${draft.photos.length >= MAX_PHOTOS || uploading ? 'disabled' : ''}">${raw(icon('plus', 15))}${uploading ? 'Adding…' : 'Photo'}<input type="file" accept="image/*" multiple hidden data-change="photos" ${draft.photos.length >= MAX_PHOTOS || uploading ? 'disabled' : ''}></label>` : html`<span class="small faint">Sign in to add photos</span>`}
              <span class="small faint" data-count>${draft.body.length.toLocaleString()} characters</span>
            </div>
            <div class="row" style="gap:8px">
              ${entry ? html`<button type="button" class="btn sm" data-act="delete">Delete</button>` : ''}
              <button class="btn primary" ${uploading ? 'disabled' : ''}>${raw(icon('check', 18))}${entry ? (dirty ? 'Save changes' : 'Saved') : open === t ? `Save · +${XP.journalLine}` : 'Save'}</button>
            </div>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>${fmtDate(`${month}-01`, { month: 'long', year: 'numeric' })}</h2>
          <div class="row" style="gap:6px"><span class="meta">${written} day${written === 1 ? '' : 's'}</span>
            <button class="icon-btn sm" data-act="prevm" aria-label="Previous month">‹</button><button class="icon-btn sm" data-act="nextm" aria-label="Next month" ${month >= ym(t) ? 'disabled' : ''}>›</button></div></div>
        <div class="jr-cal" role="grid" aria-label="Pick a day">
          ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => html`<span class="jr-dow" aria-hidden="true">${d}</span>`)}
          ${cells.map((k) => (k ? html`<button class="jr-day ${byDay[k] ? 'has' : ''} ${k === open ? 'sel' : ''} ${k === t ? 'now' : ''}" data-act="open" data-day="${k}" ${k > t ? 'disabled' : ''} aria-label="${fmtDate(k, { day: 'numeric', month: 'long' })}${byDay[k] ? ', has an entry' : ''}">${Number(k.slice(8))}</button>` : html`<span></span>`))}
        </div>
      </section>

      <section class="card">
        <form data-form="search" class="row" style="gap:8px" role="search">
          <input name="q" type="search" class="grow" placeholder="Search your journal" aria-label="Search your journal" value="${query}">
          <button class="btn">Search</button>
        </form>
        ${q ? (found.length ? html`<ul class="list" style="margin-top:10px">${found.map((l) => card(l))}</ul>` : html`<p class="small muted" style="margin-top:10px">Nothing matches “${query}”.</p>`) : ''}
      </section>

      ${back.length ? html`<section class="card">
        <div class="card-head"><h2>On this day</h2></div>
        <ul class="list">${back.map((b) => html`<li class="item jr-entry"><button class="jr-open" data-act="open" data-day="${b.line.day}"><span class="sub">${b.label} · ${fmtDate(b.line.day, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span class="title jr-text">${b.line.body}</span></button></li>`)}</ul>
      </section>` : ''}

      <section class="card">
        <div class="card-head"><h2>Earlier</h2></div>
        ${recent.length ? html`<ul class="list">${recent.map((l) => card(l))}</ul>` : empty('Your entries will build up here. Come back tomorrow for the next one.')}
      </section>
    `);

    // Photos load after the page shows.
    el.querySelectorAll('img[data-photo]').forEach(async (img) => {
      try { img.src = await photoUrl(ctx, img.dataset.photo); } catch { img.alt = 'Photo unavailable'; }
    });
    const ta = el.querySelector('textarea[name=body]');
    ta.addEventListener('input', () => { draft.body = ta.value; el.querySelector('[data-count]').textContent = `${ta.value.length.toLocaleString()} characters`; });

    const go = (k) => { day = k === t ? null : k; month = ym(k); draft = null; ctx.rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    wire(el, {
      open: (b) => go(b.dataset.day),
      today: () => go(t),
      prevm: () => { month = shiftMonth(month, -1); ctx.rerender(); },
      nextm: () => { month = shiftMonth(month, 1); ctx.rerender(); },
      search: (v) => { query = (v.q || '').slice(0, 80); ctx.rerender(); },
      photos: async (input) => {
        const files = [...(input.files || [])].slice(0, MAX_PHOTOS - draft.photos.length);
        if (!files.length) return;
        uploading = files.length; draft.body = ta.value; ctx.rerender();
        for (const f of files) {
          try {
            const blob = await shrink(f);
            const { key } = await api(ctx, '/api/journal-photo', { method: 'POST', body: blob, type: 'image/jpeg' });
            draft.photos.push(key);
          } catch (e) { ctx.say(e.message); }
          uploading -= 1;
        }
        uploading = 0; ctx.rerender();
        if (entry) await ctx.store.update('journal_lines', entry.id, { photos: draft.photos });   // keep photos even if the text isn't saved yet
      },
      unphoto: async (b) => {
        const key = b.dataset.key;
        draft.body = ta.value;
        draft.photos = draft.photos.filter((k) => k !== key);
        if (entry) await ctx.store.update('journal_lines', entry.id, { photos: draft.photos });
        api(ctx, `/api/journal-photo?key=${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
        ctx.rerender();
      },
      save: async (v) => {
        const body = (v.body || '').trim().slice(0, 10000);
        if (!body) { ctx.say(draft.photos.length ? 'Write a line to go with your photos' : 'Write something first'); return; }
        if (entry) { await ctx.store.update('journal_lines', entry.id, { body, photos: draft.photos }); ctx.say('Saved'); }
        else {
          await ctx.store.insert('journal_lines', { day: open, body, photos: draft.photos });
          if (open === t) await ctx.award('WIS', XP.journalLine, 'journal', t, 'Journal entry');
          else ctx.say('Saved');
        }
        draft = null; ctx.rerender();
      },
      delete: async () => {
        if (!entry || !confirm(`Delete the entry for ${fmtDate(open, { day: 'numeric', month: 'long' })}${entry.photos?.length ? ' and its photos' : ''}?`)) return;
        await ctx.store.remove('journal_lines', entry.id);
        await ctx.revoke('journal', entry.day);
        for (const k of entry.photos || []) api(ctx, `/api/journal-photo?key=${encodeURIComponent(k)}`, { method: 'DELETE' }).catch(() => {});
        draft = null; ctx.rerender();
      },
    });
  },
};
