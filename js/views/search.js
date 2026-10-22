// Search everything: one box across every section you have switched on.
import { html, raw, mount, esc, fmtDate } from '../ui.js';
import { icon } from '../icons.js';
import { REPEAT_SHORT } from '../tasklogic.js';

let lastQuery = '';

// section → [table, how to read a row]
const SOURCES = {
  tasks:    ['tasks', (r) => ({ title: r.title, text: r.note, sub: [r.kind === 'daily' ? 'Daily' : r.done ? 'Done' : r.due_on ? `Due ${fmtDate(r.due_on)}` : 'To do', r.repeat && `repeats ${REPEAT_SHORT[r.repeat]}`] })],
  calendar: ['calendar_events', (r) => ({ title: r.title, text: r.note, sub: [fmtDate(r.starts_on), r.start_time && r.start_time.slice(0, 5), r.repeat && `repeats ${REPEAT_SHORT[r.repeat]}`] })],
  goals:    ['goals', (r) => ({ title: r.title, text: r.why, sub: [r.status === 'done' ? 'Achieved' : r.status === 'dropped' ? 'Let go' : 'Active'] })],
  clients:  ['client_projects', (r) => ({ title: `${r.client} · ${r.title}`, text: r.note, sub: [r.stage[0].toUpperCase() + r.stage.slice(1)] })],
  books:    ['books', (r) => ({ title: r.title, text: r.author, sub: [r.author, { queued: 'To read', reading: 'Reading', finished: 'Finished' }[r.status]] })],
  comics:   ['comics', (r) => ({ title: r.title + (r.issue ? ` ${/^\d+$/.test(r.issue) ? '#' : ''}${r.issue}` : ''), text: r.publisher, sub: [r.publisher, { queued: 'In pile', reading: 'Reading', read: 'Read' }[r.status]] })],
  learning: ['learning_items', (r) => ({ title: r.title, text: r.provider, sub: [r.provider, r.status === 'done' ? 'Completed' : r.status] })],
  notes:    ['notes', (r) => ({ title: r.title || 'Untitled note', text: r.body, sub: [fmtDate((r.updated_at || r.created_at).slice(0, 10))] })],
  mood:     ['moods', (r) => ({ title: r.gratitude ? 'Grateful for' : null, text: r.gratitude, sub: [fmtDate(r.logged_on)] })],
  quotes:   ['quotes', (r) => ({ title: r.text, text: r.source, sub: [r.source] })],
  hobbies:  ['hobbies', (r) => ({ title: r.name, sub: ['Hobby'] })],
  mtg:      ['mtg_decks', (r) => ({ title: r.name, text: `${r.commander || ''}\n${r.decklist || ''}`, sub: [r.commander, r.format], deck: true })],
  watchlist: ['watchlist', (r) => ({ title: r.title, text: r.note, sub: [r.year, r.kind, r.status === 'done' ? 'Watched' : r.status === 'watching' ? 'Watching' : 'Want to watch'] })],
  music:    ['albums', (r) => ({ title: r.title, text: `${r.artist || ''} ${r.note || ''}`, sub: [r.artist, r.year, r.status === 'listened' ? 'Listened' : 'Want to listen'] })],
  people:   ['contacts', (r) => ({ title: r.name, text: `${r.relation || ''} ${r.note || ''}`, sub: [r.relation] })],
  projects: ['project_entries', (r) => ({ title: r.title, text: r.body, sub: [{ task: r.done ? 'Done task' : 'Task', event: `Event · ${r.due_on}`, note: 'Note', photo: 'Photo', expense: `Cost · $${Number(r.amount).toFixed(2)}` }[r.kind], r.author_name], href: `#/projects/${r.project_id}` })],   // a couple space's link forwards to #/couple
  finance:  ['transactions', (r) => ({ title: r.note, sub: [fmtDate(r.occurred_on), r.kind === 'sadaqah' ? 'Donation' : r.kind === 'income' ? 'Income' : 'Spent', `$${Number(r.amount).toFixed(2)}`] })],
};
const LABEL = { calendar: 'Calendar', tasks: 'Tasks', goals: 'Goals', projects: 'Projects', clients: 'Clients', books: 'Books', comics: 'Comics', learning: 'Learning', notes: 'Notes', mood: 'Mood', quotes: 'Quotes', hobbies: 'Hobbies', mtg: 'MTG', watchlist: 'Watchlist', music: 'Music', people: 'People', finance: 'Finance' };

const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Escaped text with every search word marked (ignores case and accents, so "cafe" marks "Café").
function mark(text, words) {
  const src = String(text ?? '');
  let folded = ''; const at = [];                        // at[i] = index in src of folded char i
  [...src].forEach((ch, i, arr) => {
    const off = arr.slice(0, i).join('').length;
    for (const c of fold(ch)) { folded += c; at.push(off); }
  });
  const on = new Array(src.length).fill(false);
  for (const w of words) {
    for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + 1)) {
      const s0 = at[i]; const e0 = i + w.length < at.length ? at[i + w.length] : src.length;
      for (let k = s0; k < e0; k += 1) on[k] = true;
    }
  }
  let out = ''; let open = false;
  for (let k = 0; k < src.length; k += 1) {
    if (on[k] && !open) { out += '<mark>'; open = true; }
    if (!on[k] && open) { out += '</mark>'; open = false; }
    out += esc(src[k]);
  }
  return out + (open ? '</mark>' : '');
}

// A short piece of longer text around the first match.
function snippet(text, words) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const f = fold(s);
  const at = Math.min(...words.map((w) => { const i = f.indexOf(w); return i < 0 ? Infinity : i; }));
  if (at === Infinity) return '';
  const start = Math.max(0, at - 40);
  return (start ? '…' : '') + s.slice(start, start + 140) + (start + 140 < s.length ? '…' : '');
}

export default {
  id: 'search',
  label: 'Search',
  async render(el, ctx) {
    const on = [...ctx.sections].filter((k) => SOURCES[k]);
    const rows = {};
    await Promise.all(on.map(async (k) => {
      try { rows[k] = await ctx.store.list(SOURCES[k][0], { order: 'created_at', limit: 5000 }); } catch { rows[k] = []; }
    }));
    // Index once: folded text per row.
    const index = on.flatMap((k) => rows[k].map((r) => {
      const v = SOURCES[k][1](r);
      if (!v.title && !v.text) return null;
      return { k, r, v, hay: fold(`${v.title || ''}\n${v.text || ''}`) };
    }).filter(Boolean));

    mount(el, html`
      <header class="page-head"><div><h1>Search</h1><p>Across ${on.length} section${on.length === 1 ? '' : 's'}</p></div></header>
      <section class="card search-card">
        <label class="search-box">${raw(icon('search'))}
          <input type="search" id="q" placeholder="Find a task, note, book, person…" autocomplete="off" enterkeyhint="search" aria-label="Search everything" value="${lastQuery}">
        </label>
      </section>
      <div id="results" class="search-results" aria-live="polite"></div>
    `);

    const box = el.querySelector('#q');
    const out = el.querySelector('#results');
    const show = () => {
      const q = box.value.trim();
      lastQuery = q;
      const words = fold(q).split(/\s+/).filter(Boolean);
      if (!words.length) {
        out.innerHTML = String(html`<p class="empty">Type to search ${on.map((k) => LABEL[k].toLowerCase()).join(', ')}.</p>`);
        return;
      }
      const hits = index.filter((x) => words.every((w) => x.hay.includes(w)));
      if (!hits.length) { out.innerHTML = String(html`<section class="card"><p class="empty">Nothing found for “${q}”.</p></section>`); return; }
      const groups = on.map((k) => [k, hits.filter((x) => x.k === k)]).filter(([, h]) => h.length);
      out.innerHTML = String(html`
        <p class="small muted search-count">${hits.length} result${hits.length === 1 ? '' : 's'}</p>
        ${groups.map(([k, h]) => html`
          <section class="card">
            <div class="card-head"><h2>${raw(icon(k, 18))} ${LABEL[k]}</h2><span class="meta">${h.length}</span></div>
            <ul class="list">${h.slice(0, 20).map(({ v }) => {
              const titleHit = words.some((w) => fold(v.title).includes(w));
              const snip = !titleHit || (v.text && words.some((w) => fold(v.text).includes(w))) ? snippet(v.text, words) : '';
              const sub = v.sub.filter(Boolean).join(' · ');
              return html`<li><a class="item hit" href="${v.href || `#/${k}`}">
                <div class="body">
                  <p class="title">${raw(mark(v.title || snip || '', words))}</p>
                  ${snip && v.title && !v.deck ? html`<p class="sub snip">${raw(mark(snip, words))}</p>` : ''}
                  ${sub ? html`<p class="sub">${sub}</p>` : ''}
                </div>${raw(icon('right', 16))}</a></li>`;
            })}</ul>
            ${h.length > 20 ? html`<p class="small muted" style="margin-top:8px">+${h.length - 20} more in <a href="#/${k}"><u>${LABEL[k]}</u></a></p>` : ''}
          </section>`)}`);
    };
    let timer;
    box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(show, 80); });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { box.value = ''; show(); } });
    show();
    requestAnimationFrame(() => { if (el.isConnected) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); } });
  },
};
