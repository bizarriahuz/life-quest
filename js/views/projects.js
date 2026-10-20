// Shared projects: tasks, notes and split costs with people you invite.
// Everything here is visible to the project's members (and only to them).
import { html, raw, wire, mount, today, relDate, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP, money } from '../game.js';

const TABS = { task: 'Tasks', note: 'Notes', expense: 'Money', people: 'People' };
const ROLE = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };
const tabs = {};              // project id → open tab
let live = null;              // { id, stop } live updates for the open project
let poll = null;
let lastPid = null;

const isDefaultName = (n) => !n || n === 'HERO' || n === 'You';
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const inviteUrl = (token) => `${location.origin}/#/join/${token}`;
export const tokenFrom = (s) => (String(s).match(/(?:join\/)?([0-9a-f]{64})\b/) || [])[1] || null;

function ago(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return relDate(new Date(ts).toLocaleDateString('en-CA'));
}
const typing = () => {
  const a = document.activeElement;
  return a && a.closest?.('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value;
};
function stopLive() { live?.stop(); live = null; clearInterval(poll); poll = null; }

// Who owes whom, split equally between the people sharing costs.
function settle(members, expenses) {
  const sharers = members.filter((m) => m.role !== 'viewer').map((m) => m.user_id);
  for (const x of expenses) if (x.paid_by && !sharers.includes(x.paid_by)) sharers.push(x.paid_by);
  const total = expenses.reduce((n, x) => n + Number(x.amount), 0);
  const share = sharers.length ? total / sharers.length : 0;
  const bal = Object.fromEntries(sharers.map((u) => [u, -share]));
  for (const x of expenses) if (x.paid_by) bal[x.paid_by] += Number(x.amount);
  const paid = Object.fromEntries(sharers.map((u) => [u, expenses.filter((x) => x.paid_by === u).reduce((n, x) => n + Number(x.amount), 0)]));
  const owe = Object.entries(bal).filter(([, v]) => v < -0.005).map(([u, v]) => [u, -v]).sort((a, b) => b[1] - a[1]);
  const get = Object.entries(bal).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  const moves = [];
  for (let i = 0, j = 0; i < owe.length && j < get.length;) {
    const amt = Math.min(owe[i][1], get[j][1]);
    if (amt > 0.005) moves.push({ from: owe[i][0], to: get[j][0], amt });
    owe[i][1] -= amt; get[j][1] -= amt;
    if (owe[i][1] < 0.005) i += 1;
    if (get[j][1] < 0.005) j += 1;
  }
  return { total, share, sharers, paid, bal, moves };
}

const nameCard = (ctx) => isDefaultName(ctx.profile?.hero_name) ? html`
  <section class="card">
    <div class="card-head"><h2>What should people call you?</h2></div>
    <p class="small muted" style="margin-bottom:10px">Others in your projects see this name next to what you add.</p>
    <form data-form="myname" class="row">
      <input name="hero_name" maxlength="24" required placeholder="Your name" class="grow" aria-label="Your name">
      <button class="btn primary sm">Save</button>
    </form>
  </section>` : '';

export default {
  id: 'projects',
  label: 'Projects',
  async render(el, ctx) {
    const pid = (location.hash.match(/^#\/projects\/([0-9a-f-]{36})/) || [])[1];
    if (pid !== lastPid) { if (lastPid !== null || pid) requestAnimationFrame(() => window.scrollTo(0, 0)); lastPid = pid || null; }
    if (pid) return renderProject(el, ctx, pid);
    if (el.isConnected || document.getElementById('view')?.dataset.view === 'projects') stopLive();
    return renderList(el, ctx);
  },
};

const sharedHandlers = (ctx) => ({
  myname: async (v) => { if (v.hero_name) { await ctx.setProfile({ hero_name: v.hero_name.slice(0, 24) }); ctx.store.invalidate?.('projects'); ctx.say('Name saved'); ctx.rerender(); } },
});

// ---------------------------------------------------------------- list
async function renderList(el, ctx) {
  const me = ctx.store.user.id;
  const [projects, members, open] = await Promise.all([
    ctx.store.list('projects', { order: 'created_at', asc: true }),
    ctx.store.list('project_members', {}),
    ctx.store.list('project_entries', { match: { kind: 'task', done: false } }),
  ]);
  const cloud = ctx.store.mode === 'cloud';

  mount(el, html`
    <header class="page-head"><div><h1>Projects</h1><p>Shared with people you invite</p></div></header>
    ${cloud ? nameCard(ctx) : html`<section class="card banner"><span class="i-wrap">${raw(icon('projects'))}</span><span class="grow"><p>Offline mode</p><p class="small muted">Projects work here, but sharing them needs a Life Quest account.</p></span></section>`}

    <section class="card">
      <form data-form="create" class="form">
        <input name="name" maxlength="80" required placeholder="New project, e.g. Umrah trip 2027" aria-label="Project name">
        <input name="description" maxlength="300" placeholder="What it’s for (optional)" aria-label="Description">
        <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Create project</button></div>
      </form>
    </section>

    ${projects.length ? html`<div class="proj-grid">${projects.map((p) => {
      const mem = members.filter((m) => m.project_id === p.id).sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.joined_at.localeCompare(b.joined_at)));
      const mine = mem.find((m) => m.user_id === me);
      const tasks = open.filter((x) => x.project_id === p.id);
      const forMe = tasks.filter((x) => x.assignee_id === me).length;
      return html`<a class="card proj-card" href="#/projects/${p.id}">
        <div class="row spread"><h2>${p.name}</h2>${mine && mine.role !== 'owner' ? html`<span class="pill">${ROLE[mine.role]}</span>` : ''}</div>
        ${p.description ? html`<p class="small muted">${p.description}</p>` : ''}
        <div class="row spread proj-foot">
          <span class="faces">${mem.slice(0, 5).map((m) => html`<i title="${m.display_name}">${initials(m.user_id === me ? ctx.profile?.hero_name || 'You' : m.display_name)}</i>`)}${mem.length > 5 ? html`<i>+${mem.length - 5}</i>` : ''}</span>
          <span class="small muted">${tasks.length} open${forMe ? html` · <b class="accent">${forMe} for you</b>` : ''}</span>
        </div>
      </a>`;
    })}</div>` : html`<section class="card">${empty('No projects yet. Create one, then invite people with a link.')}</section>`}

    ${cloud ? html`<section class="card">
      <div class="card-head"><h2>Got an invite link?</h2></div>
      <form data-form="joinlink" class="row">
        <input name="link" required placeholder="Paste the link here" class="grow" aria-label="Invite link" autocomplete="off">
        <button class="btn sm">Open</button>
      </form>
    </section>` : ''}
  `);

  wire(el, {
    ...sharedHandlers(ctx),
    create: async (v) => {
      const p = await ctx.store.insert('projects', { name: v.name.slice(0, 80), description: v.description || null, currency: ctx.currency });
      ctx.store.invalidate?.('projects');
      tabs[p.id] = 'people';
      ctx.say('Project created. Invite people with a link');
      location.hash = `#/projects/${p.id}`;
    },
    joinlink: async (v) => {
      const tok = tokenFrom(v.link);
      if (!tok) { ctx.say('That doesn’t look like a Life Quest invite link'); return; }
      location.hash = `#/join/${tok}`;
    },
  });
}

// ---------------------------------------------------------------- one project
async function renderProject(el, ctx, pid) {
  const me = ctx.store.user.id;
  const t = today();
  const [proj] = await ctx.store.list('projects', { match: { id: pid } });
  if (!proj) {
    stopLive();
    mount(el, html`<a class="text-btn back" href="#/projects">${raw(icon('left', 16))}Projects</a>
      <section class="card"><h2>Project not available</h2><p class="muted" style="margin-top:6px">It may have been deleted, or you’re no longer a member.</p></section>`);
    return;
  }
  const [members, entries] = await Promise.all([
    ctx.store.list('project_members', { match: { project_id: pid } }),
    ctx.store.list('project_entries', { match: { project_id: pid }, order: 'created_at', asc: true }),
  ]);
  members.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.joined_at.localeCompare(b.joined_at)));
  const mine = members.find((m) => m.user_id === me);
  const role = mine?.role || 'viewer';
  const canEdit = role !== 'viewer';
  const isOwner = role === 'owner';
  const invites = isOwner ? (await ctx.store.list('project_invites', { match: { project_id: pid } }).catch(() => []))
    .filter((i) => new Date(i.expires_at) > new Date()).sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  const who = (uid) => (uid === me ? 'You' : members.find((m) => m.user_id === uid)?.display_name || 'Former member');
  const whom = (uid) => (uid === me ? 'you' : who(uid));
  const tab = tabs[pid] || 'task';
  const cur = proj.currency || ctx.currency;
  const $ = (n) => money(n, cur);
  const canDelete = (x) => isOwner || (canEdit && x.author_id === me);

  const tasks = entries.filter((x) => x.kind === 'task');
  const openT = tasks.filter((x) => !x.done).sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999') || a.created_at.localeCompare(b.created_at));
  const doneT = tasks.filter((x) => x.done).sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
  const notes = entries.filter((x) => x.kind === 'note').reverse();
  const costs = entries.filter((x) => x.kind === 'expense').reverse();
  const money_ = settle(members, costs);
  const others = members.filter((m) => m.user_id !== me);
  const memberOpts = (sel) => html`<option value="${me}" ${sel === me ? 'selected' : ''}>Me</option>${others.map((m) => html`<option value="${m.user_id}" ${sel === m.user_id ? 'selected' : ''}>${m.display_name}</option>`)}`;
  const counts = { task: openT.length, note: notes.length, expense: costs.length, people: members.length };

  const taskRow = (x) => html`
    <li class="item ${x.done ? 'done' : ''} ${x.assignee_id === me && !x.done ? 'mine' : ''}">
      <button class="check ${x.done ? 'on' : ''}" data-act="tick" data-id="${x.id}" aria-pressed="${x.done}" ${canEdit ? '' : 'disabled'}
        aria-label="${x.done ? 'Mark not done' : 'Complete'}: ${x.title}">${raw(icon('check'))}</button>
      <div class="body">
        <p class="title">${x.title}</p>
        <p class="sub task-sub">
          ${x.done ? html`<span>Done by ${who(x.done_by)} · ${relDate(x.done_on)}</span>` : html`
            ${x.assignee_id ? html`<span class="${x.assignee_id === me ? 'accent' : ''}">For ${whom(x.assignee_id)}</span>` : html`<span>Anyone</span>`}
            ${x.due_on ? html`<span class="${x.due_on < t ? 'due-late' : ''}">${x.due_on < t ? 'Overdue · ' : 'Due '}${relDate(x.due_on)}</span>` : ''}
            <span class="faint">added by ${x.author_id === me ? 'you' : x.author_name}</span>`}
        </p>
      </div>
      ${!x.done ? html`<span class="xp">+${XP.projectTask}</span>` : ''}
      ${canDelete(x) ? html`<button class="icon-btn" data-act="del" data-id="${x.id}" aria-label="Delete ${x.title}">${raw(icon('trash'))}</button>` : ''}
    </li>`;

  const panes = {
    task: () => html`
      ${canEdit ? html`<section class="card">
        <form data-form="addtask" class="form">
          <input name="title" maxlength="200" required placeholder="Add a task" aria-label="New task">
          <div class="fields">
            <label class="field">For<select name="assignee_id"><option value="">Anyone</option>${memberOpts(null)}</select></label>
            <label class="field">Due<input type="date" name="due_on"></label>
          </div>
          <div class="row end"><button class="btn primary sm">${raw(icon('plus', 16))}Add task</button></div>
        </form>
      </section>` : ''}
      <section class="card">
        <div class="card-head"><h2>To do</h2><span class="meta">${openT.length}</span></div>
        ${openT.length ? html`<ul class="list">${openT.map(taskRow)}</ul>` : empty(canEdit ? 'Nothing to do. Add the first task above.' : 'Nothing to do.')}
      </section>
      ${doneT.length ? html`<section class="card"><details><summary>Done <span class="muted small" style="margin-left:auto;margin-right:10px">${doneT.length}</span></summary>
        <ul class="list">${doneT.slice(0, 50).map(taskRow)}</ul></details></section>` : ''}`,

    note: () => html`
      ${canEdit ? html`<section class="card">
        <form data-form="addnote" class="form">
          <input name="title" maxlength="200" required placeholder="Note title, e.g. Hotel options" aria-label="Note title">
          <textarea name="body" maxlength="5000" rows="3" placeholder="Details, links, ideas… (optional)" aria-label="Note"></textarea>
          <div class="row end"><button class="btn primary sm">${raw(icon('plus', 16))}Add note</button></div>
        </form>
      </section>` : ''}
      ${notes.length ? notes.map((x) => html`
        <section class="card pnote">
          <div class="row spread" style="align-items:flex-start">
            <h3>${x.title}</h3>
            ${canDelete(x) ? html`<button class="icon-btn" data-act="del" data-id="${x.id}" aria-label="Delete ${x.title}">${raw(icon('trash'))}</button>` : ''}
          </div>
          ${x.body ? html`<p class="pnote-body">${x.body}</p>` : ''}
          <p class="small faint">${x.author_id === me ? 'You' : x.author_name} · ${ago(x.created_at)}</p>
        </section>`) : html`<section class="card">${empty('No notes yet.')}</section>`}`,

    expense: () => html`
      ${canEdit ? html`<section class="card">
        <form data-form="addcost" class="form">
          <input name="title" maxlength="200" required placeholder="What was it? e.g. Hotel deposit" aria-label="What was it">
          <div class="fields">
            <label class="field">Amount (${cur})<input name="amount" inputmode="decimal" required placeholder="0.00" pattern="[0-9]+([.,][0-9]{1,2})?"></label>
            <label class="field">Paid by<select name="paid_by">${memberOpts(me)}</select></label>
          </div>
          <div class="row end"><button class="btn primary sm">${raw(icon('plus', 16))}Add cost</button></div>
        </form>
      </section>` : ''}
      <section class="card">
        <div class="card-head"><h2>Split</h2><span class="meta">${$(money_.total)}</span></div>
        ${costs.length ? html`
          <p class="small muted" style="margin-bottom:10px">Split equally between ${money_.sharers.length} ${money_.sharers.length === 1 ? 'person' : 'people'}: ${$(money_.share)} each.</p>
          <ul class="list">${money_.sharers.map((u) => html`<li class="item"><div class="body"><p class="title">${who(u)}</p><p class="sub">Paid ${$(money_.paid[u] || 0)}</p></div>
            <span class="bal ${money_.bal[u] > 0.005 ? 'pos' : money_.bal[u] < -0.005 ? 'neg' : ''}">${Math.abs(money_.bal[u]) < 0.005 ? 'Settled' : money_.bal[u] > 0 ? `gets ${$(money_.bal[u])}` : `owes ${$(-money_.bal[u])}`}</span></li>`)}</ul>
          ${money_.moves.length ? html`<h3 class="small muted" style="margin:14px 0 6px">To settle up</h3>
            <ul class="settle">${money_.moves.map((m) => html`<li><b>${who(m.from)}</b> ${m.from === me ? 'pay' : 'pays'} <b>${whom(m.to)}</b> <span class="amt">${$(m.amt)}</span></li>`)}</ul>` : ''}`
          : empty('No costs yet. Add what someone paid and it’s split equally.')}
      </section>
      ${costs.length ? html`<section class="card">
        <div class="card-head"><h2>Costs</h2><span class="meta">${costs.length}</span></div>
        <ul class="list">${costs.map((x) => html`<li class="item"><div class="body"><p class="title">${x.title}</p>
          <p class="sub">${who(x.paid_by)} paid · ${ago(x.created_at)}</p></div>
          <span class="amt">${$(x.amount)}</span>
          ${canDelete(x) ? html`<button class="icon-btn" data-act="del" data-id="${x.id}" aria-label="Delete ${x.title}">${raw(icon('trash'))}</button>` : ''}</li>`)}</ul>
      </section>` : ''}`,

    people: () => html`
      <section class="card">
        <div class="card-head"><h2>People</h2><span class="meta">${members.length}</span></div>
        <ul class="list">${members.map((m) => html`<li class="item member">
          <span class="face">${initials(m.user_id === me ? ctx.profile?.hero_name || 'You' : m.display_name)}</span>
          <div class="body"><p class="title">${m.user_id === me ? `${m.display_name === 'Member' ? 'You' : m.display_name} (you)` : m.display_name}</p>
            <p class="sub">${m.role === 'owner' ? 'Owner' : `Joined ${relDate(m.joined_at.slice(0, 10))}`}</p></div>
          ${isOwner && m.role !== 'owner' ? html`
            <select data-change="role" data-uid="${m.user_id}" aria-label="Role for ${m.display_name}" class="role-sel">
              <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>Editor</option>
              <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            </select>
            <button class="icon-btn" data-act="kick" data-uid="${m.user_id}" aria-label="Remove ${m.display_name}">${raw(icon('close'))}</button>`
            : html`<span class="pill">${ROLE[m.role]}</span>`}
        </li>`)}</ul>
      </section>

      ${isOwner ? html`<section class="card">
        <div class="card-head"><h2>Invite people</h2></div>
        <p class="small muted" style="margin-bottom:10px">Anyone with a Life Quest account who opens the link can join. Links last 7 days.</p>
        <form data-form="invite" class="row wrap">
          <select name="role" aria-label="Invite as" style="width:auto"><option value="editor">Can add &amp; edit</option><option value="viewer">Can only view</option></select>
          <button class="btn primary sm">${raw(icon('link', 16))}Create invite link</button>
        </form>
        ${invites.length ? html`<ul class="list invites">${invites.map((i) => html`<li class="item">
          <div class="body"><p class="title mono">${inviteUrl(i.token).replace(/^https?:\/\//, '').slice(0, 34)}…</p>
            <p class="sub">${i.role === 'viewer' ? 'View only' : 'Can add & edit'} · expires ${fmtDate(new Date(i.expires_at).toLocaleDateString('en-CA'))}</p></div>
          ${navigator.share ? html`<button class="btn sm" data-act="share" data-token="${i.token}">Share</button>` : ''}
          <button class="btn sm" data-act="copy" data-token="${i.token}">${raw(icon('copy', 15))}Copy</button>
          <button class="icon-btn" data-act="uninvite" data-token="${i.token}" aria-label="Cancel this link">${raw(icon('trash'))}</button>
        </li>`)}</ul>` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>Project</h2></div>
        <form data-form="rename" class="form">
          <input name="name" maxlength="80" required value="${proj.name}" aria-label="Project name">
          <input name="description" maxlength="300" value="${proj.description || ''}" placeholder="What it’s for (optional)" aria-label="Description">
          <div class="row spread"><button type="button" class="text-btn danger" data-act="delproj">Delete project</button><button class="btn sm">Save</button></div>
        </form>
      </section>` : html`<section class="card row spread">
        <p class="small muted">${role === 'viewer' ? 'You can view this project. Ask the owner if you need to add things.' : 'You can add and tick off things here.'}</p>
        <button class="btn sm" data-act="leave">Leave project</button>
      </section>`}`,
  };

  mount(el, html`
    <a class="text-btn back" href="#/projects">${raw(icon('left', 16))}Projects</a>
    <header class="page-head"><div><h1>${proj.name}</h1><p>${proj.description || `${members.length} ${members.length === 1 ? 'person' : 'people'}`}</p></div></header>
    ${nameCard(ctx)}
    <div class="seg ptabs" role="tablist" aria-label="Project">
      ${Object.entries(TABS).map(([k, v]) => html`<label><input type="radio" name="ptab" value="${k}" data-change="tab" ${tab === k ? 'checked' : ''}><span>${v}${counts[k] ? html` <em>${counts[k]}</em>` : ''}</span></label>`)}
    </div>
    ${panes[tab]()}
  `);

  // ---- live updates while this project is open ----
  if (location.hash.startsWith(`#/projects/${pid}`) && live?.id !== pid) {
    stopLive();
    let timer;
    const onChange = (table) => {
      if (!location.hash.startsWith(`#/projects/${pid}`)) { stopLive(); return; }
      ctx.store.invalidate?.(table);
      clearTimeout(timer);
      timer = setTimeout(() => { if (!typing() && !document.querySelector('.levelup')) ctx.rerender(); }, 250);
    };
    live = { id: pid, stop: ctx.store.subscribe(pid, onChange) };
    poll = setInterval(() => {
      if (!location.hash.startsWith(`#/projects/${pid}`)) { stopLive(); return; }
      if (!document.hidden && !typing() && !document.querySelector('.levelup')) ctx.rerender();
    }, 20000);
  }

  const entry = (id) => entries.find((x) => x.id === id);
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ctx.say('Invite link copied'); }
    catch { window.prompt('Copy this link:', text); }
  };
  wire(el, {
    ...sharedHandlers(ctx),
    tab: (r) => { tabs[pid] = r.value; ctx.rerender(); },
    addtask: async (v, f) => {
      await ctx.store.insert('project_entries', { project_id: pid, kind: 'task', title: v.title, assignee_id: v.assignee_id || null, due_on: v.due_on || null });
      f.reset(); ctx.rerender();
    },
    addnote: async (v, f) => {
      await ctx.store.insert('project_entries', { project_id: pid, kind: 'note', title: v.title, body: v.body || null });
      f.reset(); ctx.rerender();
    },
    addcost: async (v, f) => {
      const amount = Math.round(Number(String(v.amount).replace(',', '.')) * 100) / 100;
      if (!(amount > 0)) { ctx.say('Enter an amount'); return; }
      await ctx.store.insert('project_entries', { project_id: pid, kind: 'expense', title: v.title, amount, paid_by: v.paid_by || me });
      f.reset(); ctx.rerender();
    },
    tick: async (b) => {
      const x = entry(b.dataset.id);
      if (!x || !canEdit) return;
      if (x.done) {
        await ctx.store.update('project_entries', x.id, { done: false });
        await ctx.revoke('ptask', x.id);
      } else {
        await ctx.store.update('project_entries', x.id, { done: true });
        await ctx.award('DEX', XP.projectTask, 'ptask', x.id, x.title);
      }
      ctx.rerender();
    },
    del: async (b) => {
      const x = entry(b.dataset.id);
      if (!x || !confirm(`Delete “${x.title}” for everyone in this project?`)) return;
      await ctx.store.remove('project_entries', x.id);
      ctx.rerender();
    },
    invite: async (v) => {
      const inv = await ctx.store.insert('project_invites', { project_id: pid, role: v.role || 'editor' });
      ctx.rerender();
      if (navigator.share) { try { await navigator.share({ title: `Join ${proj.name} on Life Quest`, url: inviteUrl(inv.token) }); return; } catch { /* closed */ } }
      await copy(inviteUrl(inv.token));
    },
    copy: (b) => copy(inviteUrl(b.dataset.token)),
    share: async (b) => { try { await navigator.share({ title: `Join ${proj.name} on Life Quest`, url: inviteUrl(b.dataset.token) }); } catch { /* closed */ } },
    uninvite: async (b) => {
      if (!confirm('Cancel this invite link? It will stop working.')) return;
      await ctx.store.removeWhere('project_invites', { token: b.dataset.token });
      ctx.rerender();
    },
    role: async (s) => {
      await ctx.store.updateWhere('project_members', { project_id: pid, user_id: s.dataset.uid }, { role: s.value });
      ctx.say('Role updated'); ctx.rerender();
    },
    kick: async (b) => {
      if (!confirm(`Remove ${who(b.dataset.uid)} from this project?`)) return;
      await ctx.store.removeWhere('project_members', { project_id: pid, user_id: b.dataset.uid });
      ctx.rerender();
    },
    leave: async () => {
      if (!confirm(`Leave “${proj.name}”? You’ll need a new invite to come back.`)) return;
      await ctx.store.removeWhere('project_members', { project_id: pid, user_id: me });
      ctx.store.invalidate?.('projects');
      stopLive();
      location.hash = '#/projects';
    },
    rename: async (v) => {
      await ctx.store.update('projects', pid, { name: v.name.slice(0, 80), description: v.description || null });
      ctx.say('Saved'); ctx.rerender();
    },
    delproj: async () => {
      const typed = prompt(`This deletes “${proj.name}” and everything in it, for everyone. Type the project name to confirm.`);
      if (typed == null) return;
      if (typed.trim() !== proj.name) { ctx.say('The name didn’t match. Nothing was deleted'); return; }
      await ctx.store.remove('projects', pid);
      stopLive();
      location.hash = '#/projects';
    },
  });
}
