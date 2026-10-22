// Couple space: a private space for two. Built on shared projects (a project with kind 'couple'),
// so pairing, live updates and photos work the same way and only the two of you can see it.
import { html, raw, wire, mount, today, addDays, fmtDate, relDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP } from '../game.js';
import { shrink } from '../photo.js';
import { dayNumber } from './word.js';
import { inviteUrl, tokenFrom } from './projects.js';
import { QUESTIONS, SUGGESTIONS } from '../couple-data.js';

const TABS = { today: 'Today', dates: 'Dates', memories: 'Memories', list: 'Our list', us: 'Us' };
let tab = 'today';
let picked = null;            // date idea picked from the jar
let memoryDraft = null;
let cdEdit = null;           // countdown being edited       // title carried over from a finished date
let live = null;
let poll = null;

const isDefaultName = (n) => !n || n === 'HERO' || n === 'You' || n === 'Member';
const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const mod = (n, m) => ((n % m) + m) % m;
export const questionFor = (day) => QUESTIONS[mod(dayNumber(day) - 1, QUESTIONS.length)];
export const suggestionFor = (day, uid, name) => SUGGESTIONS[mod(dayNumber(day) + hash(uid), SUGGESTIONS.length)].replaceAll('{name}', name);
const utc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const daysTogether = (since, t) => (since && since <= t ? daysBetween(since, t) : null);

// The next time a date comes round (this year or next, for yearly ones). 29 Feb falls on 28 Feb in other years.
export function nextOccurrence(date, yearly, t) {
  if (!yearly || date >= t) return date;
  const [, m, d] = date.split('-').map(Number);
  const on = (y) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const dd = m === 2 && d === 29 && !leap ? 28 : d;
    return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  };
  const y = Number(t.slice(0, 4));
  return on(y) >= t ? on(y) : on(y + 1);
}

export async function findCouple(ctx) {
  const ps = await ctx.store.list('projects', { match: { kind: 'couple' } }).catch(() => []);
  return ps[0] || null;
}

// Signed photo links last an hour; reuse them for 50 minutes.
const photoUrl = new Map();
async function urlsFor(ctx, paths) {
  const now = Date.now();
  const need = paths.filter((p) => !(photoUrl.get(p)?.at > now - 50 * 60 * 1000));
  if (need.length) {
    const got = await ctx.store.photoUrls(need).catch(() => ({}));
    for (const [p, url] of Object.entries(got)) photoUrl.set(p, { url, at: now });
  }
  return Object.fromEntries(paths.map((p) => [p, photoUrl.get(p)?.url]).filter(([, u]) => u));
}
function stopLive() { live?.stop(); live = null; clearInterval(poll); poll = null; }
const typing = () => {
  const a = document.activeElement;
  return a && a.closest?.('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value;
};
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;

export default {
  id: 'couple',
  label: 'Couple',
  async render(el, ctx) {
    const couple = await findCouple(ctx);
    if (!couple) { stopLive(); return renderStart(el, ctx); }
    return renderSpace(el, ctx, couple);
  },
};

// ---------------------------------------------------------------- not set up yet
function renderStart(el, ctx) {
  const cloud = ctx.store.mode === 'cloud';
  const needName = isDefaultName(ctx.profile?.hero_name);
  mount(el, html`
    <header class="page-head"><div><h1>Couple</h1><p>A private space for the two of you</p></div></header>
    <section class="card cp-start">
      <span class="cp-hearts" aria-hidden="true">${raw(icon('couple', 40))}</span>
      <h2>Start your couple space</h2>
      <p class="muted">Count your days together, answer a question each day, keep a jar of date ideas, save memories and leave each other little notes. Only the two of you can see it.</p>
      <form data-form="start" class="form">
        ${needName ? html`<label class="field">Your name, as your partner will see it<input name="hero_name" maxlength="24" required autocomplete="given-name"></label>` : ''}
        <label class="field">Together since (optional)<input type="date" name="together_since" max="${today()}"></label>
        <button class="btn primary">${raw(icon('heart', 18))}Start our space</button>
      </form>
      ${cloud ? '' : html`<p class="small faint">Offline mode: inviting your partner needs a Life Quest account.</p>`}
    </section>
    ${cloud ? html`<section class="card">
      <div class="card-head"><h2>Did your partner send you a link?</h2></div>
      <form data-form="joinlink" class="row">
        <input name="link" required placeholder="Paste the invite link here" class="grow" aria-label="Invite link" autocomplete="off">
        <button class="btn sm">Open</button>
      </form>
    </section>` : ''}`);
  wire(el, {
    start: async (v) => {
      if (v.hero_name) await ctx.setProfile({ hero_name: v.hero_name.slice(0, 24) });
      await ctx.store.insert('projects', { name: 'Us', kind: 'couple', together_since: v.together_since || null, currency: ctx.currency });
      ctx.store.invalidate?.('projects');
      tab = 'us';
      ctx.say('Your couple space is ready. Now invite your partner');
      ctx.rerender();
    },
    joinlink: (v) => {
      const tok = tokenFrom(v.link);
      if (!tok) { ctx.say('That doesn’t look like a Life Quest invite link'); return; }
      location.hash = `#/join/${tok}`;
    },
  });
}

// ---------------------------------------------------------------- the space
async function renderSpace(el, ctx, couple) {
  const pid = couple.id;
  const me = ctx.store.user.id;
  const t = today();
  const cloud = ctx.store.mode === 'cloud';
  const [members, entries, kindXp, qXp] = await Promise.all([
    ctx.store.list('project_members', { match: { project_id: pid } }),
    ctx.store.list('project_entries', { match: { project_id: pid }, order: 'created_at', asc: true }),
    ctx.store.list('xp_events', { match: { source: 'kindness', source_id: t } }).catch(() => []),
    ctx.store.list('xp_events', { match: { source: 'question', source_id: t } }).catch(() => []),
  ]);
  const mine = members.find((m) => m.user_id === me);
  const partner = members.find((m) => m.user_id !== me) || null;
  const isOwner = mine?.role === 'owner';
  const myName = isDefaultName(ctx.profile?.hero_name) ? 'You' : ctx.profile.hero_name;
  const pName = partner ? (isDefaultName(partner.display_name) ? 'your partner' : partner.display_name) : 'your partner';
  const PName = pName === 'your partner' ? 'Your partner' : pName;
  const invites = isOwner && !partner ? (await ctx.store.list('project_invites', { match: { project_id: pid } }).catch(() => []))
    .filter((i) => new Date(i.expires_at) > new Date()).sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  let answeredBy = [];
  if (cloud) answeredBy = (await ctx.store.rpc('answer_authors', { p: pid, d: t }).catch(() => [])).map((r) => (typeof r === 'string' ? r : r.answer_authors));
  const kinds = (k) => entries.filter((x) => x.kind === k);
  const answers = kinds('answer');
  const myAnswer = answers.find((x) => x.title === t && x.author_id === me);
  const theirAnswer = answers.find((x) => x.title === t && x.author_id !== me);
  const partnerAnswered = Boolean(theirAnswer) || (partner && answeredBy.includes(partner.user_id));
  const notesForMe = kinds('love').filter((x) => x.assignee_id === me && !x.done).reverse();
  const sentNotes = kinds('love').filter((x) => x.author_id === me).reverse().slice(0, 5);
  const ideas = kinds('idea');
  const ideasOpen = ideas.filter((x) => !x.done).reverse();
  const ideasDone = ideas.filter((x) => x.done).sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
  const memories = kinds('memory').sort((a, b) => (b.due_on || b.created_at).localeCompare(a.due_on || a.created_at));
  const listOpen = kinds('task').filter((x) => !x.done);
  const listDone = kinds('task').filter((x) => x.done).sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
  const since = couple.together_since;
  const days = daysTogether(since, t);
  const countdowns = kinds('countdown').map((x) => ({ ...x, next: nextOccurrence(x.due_on, x.yearly, t) }));
  if (since) {
    const next = nextOccurrence(since, true, t);
    const years = Number(next.slice(0, 4)) - Number(since.slice(0, 4));
    if (years > 0) countdowns.push({ id: null, title: `Anniversary · ${years} year${years === 1 ? '' : 's'}`, next, yearly: true, auto: true });
  }
  countdowns.sort((a, b) => a.next.localeCompare(b.next));
  const upcoming = countdowns.filter((c) => c.next >= t);
  const past = countdowns.filter((c) => c.next < t).reverse();
  if (!picked || !ideasOpen.some((x) => x.id === picked)) picked = null;
  const pick = ideasOpen.find((x) => x.id === picked);
  const who = (x) => (x.author_id === me ? 'You' : x.author_name);
  const canDelete = (x) => isOwner || x.author_id === me;
  const answerCard = (x, name) => html`<div class="cp-ans"><p class="small muted">${name}</p><p>${x.body}</p></div>`;
  const cdRow = (c) => {
    const n = daysBetween(t, c.next);
    if (c.id && c.id === cdEdit) return html`<li class="item"><form data-form="cdsave" data-id="${c.id}" class="form grow">
      <input name="title" maxlength="200" required value="${c.title}" aria-label="What">
      <div class="fields"><label class="field">Date<input type="date" name="due_on" required value="${c.due_on}"></label>
        <label class="tick"><input type="checkbox" name="yearly" value="1" ${c.yearly ? 'checked' : ''}> Every year</label></div>
      <div class="row spread">${canDelete(c) ? html`<button type="button" class="text-btn danger" data-act="del" data-id="${c.id}">Delete</button>` : html`<span></span>`}
        <span class="row"><button type="button" class="btn sm" data-act="cdcancel">Cancel</button><button class="btn primary sm">Save</button></span></div></form></li>`;
    return html`<li class="item ${n < 0 ? 'done' : ''}"><span class="cp-cd-n"><b>${n === 0 ? 'Today' : Math.abs(n).toLocaleString()}</b>${n === 0 ? '' : `${Math.abs(n) === 1 ? 'day' : 'days'}${n < 0 ? ' ago' : ''}`}</span>
      <div class="body"><p class="title">${c.title}</p><p class="sub">${fmtDate(c.next, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}${c.yearly ? ' · every year' : ''}${c.auto ? ' · from Together since' : ''}</p></div>
      ${c.id ? html`<button class="icon-btn" data-act="cdedit" data-id="${c.id}" aria-label="Edit ${c.title}">${raw(icon('edit'))}</button>` : ''}</li>`;
  };
  const pastQs = [...new Set(answers.map((x) => x.title).filter((d) => d < t))].sort().reverse().slice(0, 30);

  const panes = {
    today: () => html`
      ${!partner ? inviteCard() : ''}
      <section class="card cp-days">
        ${days != null ? html`<p class="cp-num">${days === 0 ? 'Day one' : days.toLocaleString()}</p>
          <p class="muted">${days === 0 ? 'together. Here’s to many more' : 'days together'} · since ${fmtDate(since, { day: 'numeric', month: 'long', year: 'numeric' })}</p>`
          : html`<p class="muted">When did you two get together?</p>
            <form data-form="since" class="row cp-since"><input type="date" name="together_since" max="${t}" required aria-label="Together since"><button class="btn primary sm">Save</button></form>`}
      </section>

      ${notesForMe.map((x) => html`<section class="card cp-note">
        <p class="small cp-note-from">${raw(icon('heart', 15))}A note from ${who(x)} · ${relDate(x.created_at.slice(0, 10))}</p>
        <p class="cp-note-body">${x.title}</p>
        <div class="row end"><button class="btn sm primary" data-act="readnote" data-id="${x.id}">${raw(icon('heart', 15))}Got it</button></div>
      </section>`)}

      <section class="card cp-q">
        <div class="card-head"><h2>Question of the day</h2>${partnerAnswered && !myAnswer ? html`<span class="pill cp-pill">${PName} answered</span>` : ''}</div>
        <p class="cp-question">${questionFor(t)}</p>
        ${myAnswer ? html`
          ${answerCard(myAnswer, 'You')}
          ${theirAnswer ? answerCard(theirAnswer, PName) : html`<p class="small muted">${partner ? `Waiting for ${pName}. You’ll see their answer once they reply.` : 'Invite your partner to see their answers too.'}</p>`}`
          : html`<form data-form="answer" class="form">
            <textarea name="body" rows="2" maxlength="1000" required placeholder="Your answer" aria-label="Your answer"></textarea>
            <div class="row spread"><span class="small faint">${partner ? `${PName} sees it once they’ve answered too` : 'Only you can see it for now'}</span><button class="btn primary sm">Answer · +${XP.coupleQuestion}</button></div>
          </form>`}
        ${pastQs.length ? html`<details class="cp-past"><summary>Past questions</summary>${pastQs.map((d) => {
          const a = answers.filter((x) => x.title === d);
          const mineA = a.find((x) => x.author_id === me); const theirs = a.find((x) => x.author_id !== me);
          return html`<div class="cp-pastq"><p class="small faint">${fmtDate(d)}</p><p><b>${questionFor(d)}</b></p>
            ${mineA ? answerCard(mineA, 'You') : ''}${theirs ? answerCard(theirs, PName) : mineA ? html`<p class="small faint">${PName} didn’t answer</p>` : ''}</div>`;
        })}</details>` : ''}
      </section>

      <section class="card cp-idea">
        <div class="card-head"><h2>Today’s idea</h2></div>
        <p class="cp-sugg">${suggestionFor(t, me, pName)}</p>
        <div class="row end">${kindXp.length ? html`<span class="small accent">Done today ✓</span>` : html`<button class="btn sm" data-act="kind">${raw(icon('check', 15))}Done · +${XP.kindness}</button>`}</div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Countdowns</h2></div>
        ${upcoming.length ? html`<ul class="list cp-cd">${upcoming.map(cdRow)}</ul>` : empty('Add birthdays, trips and special days to count down to.')}
        <details class="cp-add"><summary>Add a countdown</summary>
          <form data-form="countdown" class="form">
            <input name="title" maxlength="200" required placeholder="e.g. ${pName === 'your partner' ? 'Their' : `${pName}’s`} birthday, Bali trip" aria-label="What">
            <div class="fields"><label class="field">Date<input type="date" name="due_on" required></label>
              <label class="tick"><input type="checkbox" name="yearly" value="1"> Every year</label></div>
            <p class="small faint">For birthdays and anniversaries, pick the original date and tick Every year.</p>
            <div class="row end"><button class="btn primary sm">Add</button></div>
          </form></details>
        ${past.length ? html`<details class="cp-past" ${past.some((c) => c.id === cdEdit) ? 'open' : ''}><summary>Past dates <span class="faint">${past.length}</span></summary>
          <ul class="list cp-cd">${past.map(cdRow)}</ul></details>` : ''}
      </section>

      ${partner ? html`<section class="card">
        <div class="card-head"><h2>Leave ${pName} a note</h2></div>
        <form data-form="note" class="form">
          <textarea name="title" rows="2" maxlength="200" required placeholder="They’ll see it next time they open the app" aria-label="Note for ${pName}"></textarea>
          <div class="row end"><button class="btn primary sm">${raw(icon('send', 15))}Send</button></div>
        </form>
        ${sentNotes.length ? html`<ul class="list cp-sent">${sentNotes.map((x) => html`<li class="item"><div class="body"><p class="title">${x.title}</p>
          <p class="sub">${relDate(x.created_at.slice(0, 10))} · ${x.done ? html`<span class="accent">Read ${raw(icon('heart', 12))}</span>` : 'Not read yet'}</p></div>
          <button class="icon-btn" data-act="del" data-id="${x.id}" aria-label="Delete note">${raw(icon('trash'))}</button></li>`)}</ul>` : ''}
      </section>` : ''}`,

    dates: () => html`
      <section class="card cp-jar">
        <div class="card-head"><h2>Date ideas jar</h2><span class="meta">${ideasOpen.length}</span></div>
        ${pick ? html`<div class="cp-pick" role="status"><p class="small muted">Tonight’s pick</p><p class="cp-pick-t">${pick.title}</p>
            ${pick.body ? html`<p class="small muted">${pick.body}</p>` : ''}
            <div class="row wrap cp-pick-btns"><button class="btn sm" data-act="pick">${raw(icon('shuffle', 15))}Pick another</button>
              <button class="btn primary sm" data-act="dated" data-id="${pick.id}">${raw(icon('check', 15))}We did it · +${XP.date}</button></div></div>`
          : ideasOpen.length ? html`<button class="btn primary cp-pickbtn" data-act="pick">${raw(icon('shuffle', 18))}Pick one for us</button>` : ''}
        <form data-form="idea" class="form">
          <input name="title" maxlength="200" required placeholder="Add an idea, e.g. Sunset picnic at East Coast" aria-label="Date idea">
          <div class="row end"><button class="btn sm">${raw(icon('plus', 15))}Add to the jar</button></div>
        </form>
        ${ideasOpen.length ? html`<ul class="list">${ideasOpen.map((x) => html`<li class="item ${x.id === picked ? 'mine' : ''}">
          <button class="check" data-act="dated" data-id="${x.id}" aria-label="We did this: ${x.title}">${raw(icon('check'))}</button>
          <div class="body"><p class="title">${x.title}</p><p class="sub">added by ${who(x).replace(/^You$/, 'you')}</p></div>
          ${canDelete(x) ? html`<button class="icon-btn" data-act="del" data-id="${x.id}" aria-label="Delete ${x.title}">${raw(icon('trash'))}</button>` : ''}</li>`)}</ul>`
          : empty('The jar is empty. Add a few ideas, then let it pick for you.')}
      </section>
      ${ideasDone.length ? html`<section class="card"><div class="card-head"><h2>Dates you’ve been on</h2><span class="meta">${ideasDone.length}</span></div>
        <ul class="list">${ideasDone.map((x) => html`<li class="item done">
          <div class="body"><p class="title">${x.title}</p><p class="sub">${x.done_on ? relDate(x.done_on) : ''}</p></div>
          ${memories.some((m) => m.title === x.title) ? html`<span class="small faint">Saved</span>` : html`<button class="btn sm" data-act="tomemory" data-id="${x.id}">${raw(icon('plus', 14))}Memory</button>`}
          <button class="icon-btn" data-act="undate" data-id="${x.id}" aria-label="Back in the jar: ${x.title}">${raw(icon('repeat'))}</button></li>`)}</ul></section>` : ''}`,

    memories: () => html`
      <section class="card">
        <form data-form="memory" class="form">
          <input name="title" maxlength="200" required placeholder="What happened? e.g. Our first trip to Japan" aria-label="Memory" value="${memoryDraft || ''}">
          <textarea name="body" rows="2" maxlength="5000" placeholder="A few words to remember it by (optional)" aria-label="Details"></textarea>
          <div class="fields"><label class="field">When<input type="date" name="due_on" value="${t}" max="${t}"></label>
            <label class="field">Photo (optional)<input type="file" name="photo" accept="image/*"></label></div>
          <p class="small faint" id="mem-status" role="status"></p>
          <div class="row end"><button class="btn primary sm">${raw(icon('plus', 15))}Save memory</button></div>
        </form>
      </section>
      ${memories.length ? html`<ol class="cp-timeline">${memories.map((x) => html`<li class="card cp-mem">
        ${x.photo_path ? html`<button class="cp-mem-ph" data-act="openphoto" data-path="${x.photo_path}" aria-label="Open photo: ${x.title}"><img alt="" loading="lazy" data-path="${x.photo_path}" ${photoUrl.get(x.photo_path) ? html`src="${photoUrl.get(x.photo_path).url}"` : ''}></button>` : ''}
        <div class="cp-mem-t"><p class="small faint">${fmtDate(x.due_on || x.created_at.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })} · ${who(x)}</p>
          <h3>${x.title}</h3>${x.body ? html`<p class="pnote-body">${x.body}</p>` : ''}</div>
        ${canDelete(x) ? html`<button class="icon-btn cp-mem-del" data-act="delmem" data-id="${x.id}" aria-label="Delete memory ${x.title}">${raw(icon('trash'))}</button>` : ''}
      </li>`)}</ol>` : html`<section class="card">${empty('No memories yet. Save the moments you want to keep, with a photo if you like.')}</section>`}`,

    list: () => html`
      <section class="card">
        <form data-form="item" class="row">
          <input name="title" maxlength="200" required placeholder="Add to our list, e.g. Milk, light bulbs" aria-label="New item" class="grow">
          <button class="btn primary sm">${raw(icon('plus', 15))}Add</button>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h2>Our list</h2><span class="meta">${listOpen.length}</span></div>
        ${listOpen.length ? html`<ul class="list">${listOpen.map((x) => html`<li class="item">
          <button class="check" data-act="tick" data-id="${x.id}" aria-label="Got it: ${x.title}">${raw(icon('check'))}</button>
          <div class="body"><p class="title">${x.title}</p><p class="sub">added by ${who(x).replace(/^You$/, 'you')}</p></div>
          <button class="icon-btn" data-act="del" data-id="${x.id}" aria-label="Delete ${x.title}">${raw(icon('trash'))}</button></li>`)}</ul>`
          : empty('Nothing on the list. Groceries, things for the house, anything you both need.')}
      </section>
      ${listDone.length ? html`<section class="card"><details><summary>Done <span class="muted small" style="margin-left:auto;margin-right:10px">${listDone.length}</span></summary>
        <ul class="list">${listDone.slice(0, 40).map((x) => html`<li class="item done">
          <button class="check on" data-act="tick" data-id="${x.id}" aria-label="Put back: ${x.title}">${raw(icon('check'))}</button>
          <div class="body"><p class="title">${x.title}</p></div>
          <button class="icon-btn" data-act="del" data-id="${x.id}" aria-label="Delete ${x.title}">${raw(icon('trash'))}</button></li>`)}</ul></details></section>` : ''}`,

    us: () => html`
      ${!partner ? inviteCard() : html`<section class="card cp-pair">
        <span class="face">${(myName || 'Y')[0].toUpperCase()}</span>${raw(icon('heart', 22))}<span class="face">${pName[0].toUpperCase()}</span>
        <p><b>${myName}</b> &amp; <b>${PName}</b></p>
        <p class="small muted">Together in Life Quest since ${fmtDate(partner.joined_at.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </section>`}
      <section class="card">
        <div class="card-head"><h2>Together since</h2></div>
        <form data-form="since" class="row"><input type="date" name="together_since" value="${since || ''}" max="${t}" aria-label="Together since" class="grow"><button class="btn sm">Save</button></form>
        <p class="small faint" style="margin-top:8px">Used for your days together and your anniversary countdown. Either of you can change it.</p>
      </section>
      ${isDefaultName(ctx.profile?.hero_name) ? html`<section class="card"><div class="card-head"><h2>Your name</h2></div>
        <form data-form="myname" class="row"><input name="hero_name" maxlength="24" required placeholder="Your name" class="grow" aria-label="Your name"><button class="btn sm">Save</button></form></section>` : ''}
      <section class="card">
        <div class="card-head"><h2>${isOwner ? 'Manage' : 'Leave'}</h2></div>
        ${isOwner ? html`<div class="row wrap">
            ${partner ? html`<button class="btn sm" data-act="unpair">Remove ${pName}</button>` : ''}
            <button class="text-btn danger" data-act="delspace">Delete our couple space</button></div>
          <p class="small faint" style="margin-top:8px">Deleting removes everything here (memories, photos, answers, notes) for both of you.</p>`
          : html`<button class="btn sm" data-act="leave">Leave this couple space</button>
          <p class="small faint" style="margin-top:8px">${PName} keeps everything that’s here.</p>`}
      </section>`,
  };

  function inviteCard() {
    if (!isOwner) return '';
    return html`<section class="card cp-invite">
      <div class="card-head"><h2>Invite your partner</h2></div>
      ${cloud ? html`<p class="small muted" style="margin-bottom:10px">Send them a link. Once they open it and sign in, your space is shared. Links last 7 days.</p>
        <button class="btn primary sm" data-act="invite">${raw(icon('link', 16))}Create invite link</button>
        ${invites.length ? html`<ul class="list invites">${invites.slice(0, 2).map((i) => html`<li class="item">
          <div class="body"><p class="title mono">${inviteUrl(i.token).replace(/^https?:\/\//, '').slice(0, 34)}…</p>
            <p class="sub">Expires ${fmtDate(new Date(i.expires_at).toLocaleDateString('en-CA'))}</p></div>
          ${navigator.share ? html`<button class="btn sm" data-act="share" data-token="${i.token}">Share</button>` : ''}
          <button class="btn sm" data-act="copy" data-token="${i.token}">${raw(icon('copy', 15))}Copy</button></li>`)}</ul>` : ''}`
        : html`<p class="small muted">Inviting your partner needs a Life Quest account. Everything here still works on this device.</p>`}
    </section>`;
  }

  mount(el, html`
    <header class="page-head cp-head"><div><h1>${partner ? html`${myName} <span class="cp-amp">&amp;</span> ${PName}` : 'Couple'}</h1>
      <p>${days != null ? `${plural(days, 'day')} together` : 'Your private space'}</p></div></header>
    <div class="seg ptabs cp-tabs" role="tablist" aria-label="Couple">
      ${Object.entries(TABS).map(([k, v]) => html`<label><input type="radio" name="ctab" value="${k}" data-change="tab" ${tab === k ? 'checked' : ''}><span>${v}${k === 'today' && notesForMe.length ? html` <em>${notesForMe.length}</em>` : k === 'list' && listOpen.length ? html` <em>${listOpen.length}</em>` : ''}</span></label>`)}
    </div>
    ${panes[tab]()}
  `);
  if (tab === 'memories') memoryDraft = null;

  // Photos for memories.
  const paths = tab === 'memories' ? memories.filter((x) => x.photo_path).map((x) => x.photo_path) : [];
  if (paths.length) urlsFor(ctx, paths).then((urls) => el.querySelectorAll('img[data-path]').forEach((img) => { const u = urls[img.dataset.path]; if (u && img.getAttribute('src') !== u) img.src = u; }));

  // Live updates while the page is open.
  if (location.hash.startsWith('#/couple') && live?.id !== pid && ctx.store.subscribe) {
    stopLive();
    let timer;
    const onChange = (table) => {
      if (!location.hash.startsWith('#/couple')) { stopLive(); return; }
      ctx.store.invalidate?.(table);
      clearTimeout(timer);
      timer = setTimeout(() => { if (!typing() && !document.querySelector('.levelup, .lightbox')) ctx.rerender(); }, 250);
    };
    live = { id: pid, stop: ctx.store.subscribe(pid, onChange) };
    poll = setInterval(() => {
      if (!location.hash.startsWith('#/couple')) { stopLive(); return; }
      if (!document.hidden && !typing() && !document.querySelector('.levelup, .lightbox')) ctx.rerender();
    }, 30000);
  }

  const entry = (id) => entries.find((x) => x.id === id);
  const add = (row) => ctx.store.insert('project_entries', { project_id: pid, ...row });
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); ctx.say('Invite link copied'); } catch { window.prompt('Copy this link:', text); } };
  const shareInvite = async (token) => {
    const url = inviteUrl(token);
    if (navigator.share) { try { await navigator.share({ title: 'Join our couple space on Life Quest', url }); return; } catch { /* closed */ } }
    await copy(url);
  };
  const leaveTo = () => { stopLive(); ctx.store.invalidate?.('projects'); tab = 'today'; ctx.rerender(); };

  wire(el, {
    tab: (r) => { tab = r.value; ctx.rerender(); },
    since: async (v) => {
      if (!v.together_since || v.together_since > t) { ctx.say('Pick a date up to today'); return; }
      await ctx.store.update('projects', pid, { together_since: v.together_since });
      ctx.store.invalidate?.('projects'); ctx.say('Saved'); ctx.rerender();
    },
    myname: async (v) => { await ctx.setProfile({ hero_name: v.hero_name.slice(0, 24) }); ctx.store.invalidate?.('projects'); ctx.rerender(); },
    answer: async (v) => {
      await add({ kind: 'answer', title: t, body: v.body.slice(0, 1000) });
      await ctx.award('CON', XP.coupleQuestion, 'question', t, 'Question of the day');
      ctx.rerender();
    },
    kind: async () => { await ctx.award('CON', XP.kindness, 'kindness', t, 'Today’s idea'); ctx.rerender(); },
    note: async (v, f) => {
      await add({ kind: 'love', title: v.title.slice(0, 200), assignee_id: partner.user_id });
      f.reset(); ctx.say(`Note sent to ${pName}`); ctx.rerender();
    },
    readnote: async (b) => { await ctx.store.update('project_entries', b.dataset.id, { done: true }); ctx.rerender(); },
    cdedit: (b) => { cdEdit = b.dataset.id; ctx.rerender(); },
    cdcancel: () => { cdEdit = null; ctx.rerender(); },
    cdsave: async (v, f) => {
      await ctx.store.update('project_entries', f.dataset.id, { title: v.title, due_on: v.due_on, yearly: Boolean(v.yearly) });
      cdEdit = null; ctx.say('Saved'); ctx.rerender();
    },
    countdown: async (v, f) => {
      await add({ kind: 'countdown', title: v.title, due_on: v.due_on, yearly: Boolean(v.yearly) });
      f.reset(); ctx.rerender();
    },
    idea: async (v, f) => { await add({ kind: 'idea', title: v.title }); f.reset(); ctx.rerender(); },
    pick: () => {
      const pool = ideasOpen.filter((x) => x.id !== picked);
      const from = pool.length ? pool : ideasOpen;
      picked = from[Math.floor(Math.random() * from.length)]?.id || null;
      ctx.rerender();
    },
    dated: async (b) => {
      const x = entry(b.dataset.id); if (!x) return;
      await ctx.store.update('project_entries', x.id, { done: true });
      await ctx.award('CON', XP.date, 'date', x.id, x.title);
      picked = null;
      ctx.say('Lovely. Add it to your memories from “Dates you’ve been on”');
      ctx.rerender();
    },
    undate: async (b) => { await ctx.store.update('project_entries', b.dataset.id, { done: false }); await ctx.revoke('date', b.dataset.id); ctx.rerender(); },
    tomemory: (b) => { memoryDraft = entry(b.dataset.id)?.title || null; tab = 'memories'; ctx.rerender(); },
    memory: async (v, f) => {
      const file = f.querySelector('input[type=file]')?.files?.[0];
      const status = (s) => { const n = el.querySelector('#mem-status'); if (n) n.textContent = s; };
      let row = null;
      try {
        if (file) {
          status('Adding the photo…');
          const blob = await shrink(file);
          const path = `${pid}/${crypto.randomUUID()}.jpg`;
          row = await add({ kind: 'memory', title: v.title, body: v.body || null, due_on: v.due_on || t, photo_path: path });
          await ctx.store.uploadPhoto(path, blob);
          photoUrl.set(path, { url: URL.createObjectURL(blob), at: Date.now() - 40 * 60 * 1000 });
        } else {
          await add({ kind: 'memory', title: v.title, body: v.body || null, due_on: v.due_on || t });
        }
      } catch (err) {
        if (row) await ctx.store.remove('project_entries', row.id).catch(() => {});
        status(''); throw err;
      }
      f.reset(); ctx.say('Memory saved'); ctx.rerender();
    },
    openphoto: async (b) => {
      const urls = await urlsFor(ctx, [b.dataset.path]);
      if (!urls[b.dataset.path]) return;
      const box = document.createElement('div');
      box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Photo');
      box.innerHTML = String(html`<div class="lb-top"><span></span><button class="icon-btn" data-lb="close" aria-label="Close">${raw(icon('close'))}</button></div>
        <div class="lb-img"><img src="${urls[b.dataset.path]}" alt=""></div><div class="lb-cap"></div>`);
      const close = () => { box.remove(); removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-lb=close]')) close(); });
      addEventListener('keydown', onKey);
      document.body.appendChild(box);
    },
    delmem: async (b) => {
      const x = entry(b.dataset.id);
      if (!x || !confirm(`Delete the memory “${x.title}” for both of you?`)) return;
      if (x.photo_path) await ctx.store.removePhotos([x.photo_path]).catch(() => {});
      await ctx.store.remove('project_entries', x.id); ctx.rerender();
    },
    item: async (v, f) => { await add({ kind: 'task', title: v.title }); f.reset(); ctx.rerender(); el.querySelector('form[data-form=item] input')?.focus(); },
    tick: async (b) => { const x = entry(b.dataset.id); if (x) { await ctx.store.update('project_entries', x.id, { done: !x.done }); ctx.rerender(); } },
    del: async (b) => {
      const x = entry(b.dataset.id);
      if (!x || !confirm(`Delete “${x.title.slice(0, 60)}”?`)) return;
      await ctx.store.remove('project_entries', x.id); cdEdit = null; ctx.rerender();
    },
    invite: async () => {
      const inv = await ctx.store.insert('project_invites', { project_id: pid, role: 'editor' });
      ctx.rerender(); await shareInvite(inv.token);
    },
    copy: (b) => copy(inviteUrl(b.dataset.token)),
    share: (b) => shareInvite(b.dataset.token),
    unpair: async () => {
      if (!confirm(`Remove ${pName} from your couple space? They’ll lose access to everything here.`)) return;
      await ctx.store.removeWhere('project_members', { project_id: pid, user_id: partner.user_id });
      ctx.rerender();
    },
    leave: async () => {
      if (!confirm('Leave your couple space? You’ll need a new invite to come back.')) return;
      await ctx.store.removeWhere('project_members', { project_id: pid, user_id: me });
      leaveTo();
    },
    delspace: async () => {
      const typed = prompt('This deletes your couple space and everything in it (memories, photos, answers, notes) for both of you. Type DELETE to confirm.');
      if (typed == null) return;
      if (typed.trim().toUpperCase() !== 'DELETE') { ctx.say('Nothing was deleted'); return; }
      await ctx.store.removePhotos(entries.filter((x) => x.photo_path).map((x) => x.photo_path)).catch(() => {});
      await ctx.store.remove('projects', pid);
      leaveTo();
    },
  });
}
