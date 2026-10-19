import { html, raw, wire, mount, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';

let editing = null; // null | 'new' | note id
let search = '';

export default {
  id: 'notes',
  label: 'Notes',
  async render(el, ctx) {
    const notes = await ctx.store.list('notes', { order: 'updated_at' });
    notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
    const q = search.toLowerCase();
    const shown = q ? notes.filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(q)) : notes;
    const current = editing && editing !== 'new' ? notes.find((n) => n.id === editing) : null;
    if (editing && editing !== 'new' && !current) editing = null;

    const editor = () => html`
      <section class="card">
        <form data-form="save" class="form">
          <div class="row spread">
            <button type="button" class="text-btn row" data-act="close" style="gap:4px">${raw(icon('left', 16))}All notes</button>
            <div class="row">
              ${current ? html`
                <button type="button" class="icon-btn" data-act="pin" aria-pressed="${current.pinned}" aria-label="${current.pinned ? 'Unpin' : 'Pin'}" style="${current.pinned ? 'color:var(--fg)' : ''}">${raw(icon('pin'))}</button>
                <button type="button" class="icon-btn" data-act="delete" aria-label="Delete note">${raw(icon('trash'))}</button>` : ''}
              <button class="btn primary sm">Save</button>
            </div>
          </div>
          <input name="title" class="editor-title" value="${current?.title || ''}" maxlength="120" placeholder="Title" aria-label="Title">
          <textarea name="body" class="editor-body" rows="12" maxlength="20000" placeholder="Start writing…" aria-label="Note">${current?.body || ''}</textarea>
          ${current ? html`<p class="small faint">Created ${fmtDate(current.created_at)} · edited ${fmtDate(current.updated_at)}</p>` : ''}
        </form>
      </section>`;

    mount(el, html`
      <header class="page-head">
        <div><h1>Notes</h1><p>${notes.length} note${notes.length === 1 ? '' : 's'}</p></div>
        ${editing ? '' : html`<button class="btn primary" data-act="new">${raw(icon('plus', 18))}New note</button>`}
      </header>

      ${editing ? editor() : html`
        <input type="search" data-change="search" value="${search}" placeholder="Search notes" aria-label="Search notes">`}

      ${shown.length ? html`<ul class="notes">${shown.map((n) => html`
        <li>
          <button class="note ${n.id === editing ? 'sel' : ''}" data-act="open" data-id="${n.id}">
            <span class="note-top"><span class="note-title">${n.pinned ? raw(icon('pin', 14)) : ''}${n.title || 'Untitled'}</span>
              <span class="note-date">${fmtDate(n.updated_at, { day: 'numeric', month: 'short' })}</span></span>
            <span class="snippet">${n.body.slice(0, 200)}</span>
          </button>
        </li>`)}</ul>` : empty(q ? 'No notes match.' : 'No notes yet.')}
    `);

    wire(el, {
      new: () => { editing = 'new'; ctx.rerender(); },
      open: (b) => { editing = b.dataset.id; ctx.rerender(); window.scrollTo(0, 0); },
      close: () => { editing = null; ctx.rerender(); },
      search: (input) => { search = input.value.trim(); ctx.rerender(); },
      save: async (v) => {
        if (!v.title && !v.body) { ctx.say('Write something first'); return; }
        const now = new Date().toISOString();
        if (editing === 'new') {
          const row = await ctx.store.insert('notes', { title: v.title, body: v.body, updated_at: now });
          editing = row.id;
          await ctx.award('WIS', XP.note, 'note', row.id, 'Note saved');
        } else {
          await ctx.store.update('notes', current.id, { title: v.title, body: v.body, updated_at: now });
          ctx.say('Saved');
        }
        ctx.rerender();
      },
      pin: async () => { await ctx.store.update('notes', current.id, { pinned: !current.pinned }); ctx.rerender(); },
      delete: async () => {
        if (!confirm('Delete this note? Its XP will be removed.')) return;
        await ctx.store.remove('notes', current.id);
        await ctx.revoke('note', current.id);
        editing = null;
        ctx.rerender();
      },
    });
  },
};
