// Football: results, fixtures and tables for the top five European leagues and the Singapore Premier League.
// Scores come through /api/football (a Cloudflare function that relays ESPN's public feed and keeps a short copy).
import { html, raw, wire, mount, today, addDays, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';

export const LEAGUES = [
  { id: 'eng.1', name: 'Premier League', short: 'EPL' },
  { id: 'esp.1', name: 'LaLiga', short: 'LaLiga' },
  { id: 'ger.1', name: 'Bundesliga', short: 'Bundesliga' },
  { id: 'ita.1', name: 'Serie A', short: 'Serie A' },
  { id: 'fra.1', name: 'Ligue 1', short: 'Ligue 1' },
  { id: 'sgp.1', name: 'Singapore Premier League', short: 'SPL' },
];
const PREF = 'lifequest:football';
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } })();
let league = LEAGUES.some((l) => l.id === pref.league) ? pref.league : 'eng.1';
let view = ['results', 'fixtures', 'table'].includes(pref.view) ? pref.view : 'results';
const remember = () => { try { localStorage.setItem(PREF, JSON.stringify({ league, view })); } catch { /* private mode */ } };

// Answers are kept for a minute in the page too, so switching tabs is instant.
const memo = new Map();
export async function football(lg, kind) {
  const key = `${lg}:${kind}`;
  const m = memo.get(key);
  if (m && Date.now() - m.at < 60000) return m.data;
  const r = await fetch(`/api/football?league=${encodeURIComponent(lg)}&view=${kind === 'table' ? 'table' : 'matches'}`);
  const data = await r.json().catch(() => ({ error: 'Scores aren’t available right now.' }));
  if (!r.ok || data.error) throw new Error(data.error || 'Scores aren’t available right now.');
  memo.set(key, { at: Date.now(), data });
  return data;
}

const localDay = (iso) => new Date(iso).toLocaleDateString('en-CA');
const time = (iso) => new Date(iso).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' });
const crest = (t) => (t?.logo ? html`<img class="fb-crest" src="${t.logo}" alt="" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="fb-crest none" aria-hidden="true">${(t?.abbr || t?.short || '?').slice(0, 3)}</span>`);
let poll = null;
// The page is drawn off-screen first, then shown: wait until it's on screen (up to ~5 s).
const shown = (el) => new Promise((resolve) => { let n = 0; const f = () => (el.isConnected ? resolve(true) : ++n > 300 ? resolve(false) : requestAnimationFrame(f)); f(); });

export default {
  id: 'football',
  label: 'Football',
  async render(el, ctx) {
    clearInterval(poll); poll = null;
    const t = today();
    const lg = LEAGUES.find((l) => l.id === league);
    mount(el, html`
      <header class="page-head"><div><h1>Football</h1><p>${lg.name}</p></div></header>
      <div class="fb-leagues" role="tablist" aria-label="League">
        ${LEAGUES.map((l) => html`<button role="tab" aria-selected="${l.id === league}" class="fb-league ${l.id === league ? 'on' : ''}" data-act="league" data-id="${l.id}">${l.short}</button>`)}
      </div>
      <div class="seg fb-views" role="radiogroup" aria-label="Show">
        ${[['results', 'Results'], ['fixtures', 'Fixtures'], ['table', 'Table']].map(([k, label]) => html`<label><input type="radio" name="fbv" value="${k}" data-change="view" ${view === k ? 'checked' : ''}><span>${label}</span></label>`)}
      </div>
      <div id="fb-body"><section class="card"><p class="muted small">Loading…</p></section></div>
      <p class="small faint fb-credit">Scores and tables from ESPN. Times are shown in your phone’s time zone.</p>`);

    const body = el.querySelector('#fb-body');
    const draw = async () => {
      try {
        if (view === 'table') {
          const d = await football(league, 'table');
          if (!(await shown(el))) return;
          body.innerHTML = String(d.rows.length ? html`<section class="card fb-table-card">
            ${d.season ? html`<p class="small muted" style="margin-bottom:8px">${d.season}</p>` : ''}
            <table class="fb-table"><thead><tr><th class="num">#</th><th>Team</th><th>P</th><th class="wide">W</th><th class="wide">D</th><th class="wide">L</th><th>GD</th><th>Pts</th></tr></thead>
            <tbody>${d.rows.map((r) => html`<tr>
              <td class="num"><span class="fb-zone" style="${r.note?.color ? `background:${r.note.color}` : ''}" title="${r.note?.text || ''}"></span>${r.rank ?? ''}</td>
              <td class="team">${crest(r)}<span>${r.short}</span></td>
              <td>${r.p}</td><td class="wide">${r.w}</td><td class="wide">${r.d}</td><td class="wide">${r.l}</td>
              <td>${r.gd > 0 ? `+${r.gd}` : r.gd}</td><td><b>${r.pts}</b></td></tr>`)}</tbody></table>
            ${(() => { const zones = [...new Map(d.rows.filter((r) => r.note?.text && r.note.color).map((r) => [r.note.text, r.note.color])).entries()];
              return zones.length ? html`<p class="fb-legend">${zones.map(([txt, c]) => html`<span><i style="background:${c}"></i>${txt}</span>`)}</p>` : ''; })()}
          </section>` : html`<section class="card">${empty('No table for this league right now.')}</section>`);
          return;
        }
        const d = await football(league, 'matches');
        if (!(await shown(el))) return;
        const from = addDays(t, -7); const to = addDays(t, 14);
        const live = d.matches.filter((m) => m.state === 'in');
        const list = view === 'results'
          ? d.matches.filter((m) => m.state === 'post' && localDay(m.date) >= from).reverse()
          : d.matches.filter((m) => m.state === 'pre' && localDay(m.date) <= to);
        const days = [];
        for (const m of list) { const k = localDay(m.date); let g = days.find((x) => x.k === k); if (!g) days.push(g = { k, items: [] }); g.items.push(m); }
        const row = (m) => {
          const done = m.state === 'post'; const on = m.state === 'in';
          const off = /postpon|cancel|abandon|suspend/i.test(m.detail);
          return html`<li class="fb-match ${on ? 'live' : ''}">
            <span class="fb-side home ${done && m.home?.winner ? 'won' : ''}"><span class="fb-name">${m.home?.short}</span>${crest(m.home)}</span>
            <span class="fb-score">${on || (done && !off)
              ? html`<span class="fb-nums"><b>${m.home?.score ?? '–'}</b><i>–</i><b>${m.away?.score ?? '–'}</b></span>`
              : html`<span class="fb-time">${off ? m.detail : time(m.date)}</span>`}
              ${on ? html`<span class="fb-live">${m.detail || 'Live'}</span>` : done && !/^FT$/i.test(m.detail) && !off ? html`<span class="fb-note">${m.detail}</span>` : ''}</span>
            <span class="fb-side away ${done && m.away?.winner ? 'won' : ''}">${crest(m.away)}<span class="fb-name">${m.away?.short}</span></span>
          </li>`;
        };
        const stale = !list.length && !live.length && d.seasonEnd && d.seasonEnd.slice(0, 10) < t;
        body.innerHTML = String(html`
          ${live.length ? html`<section class="card fb-live-card"><div class="card-head"><h2><span class="fb-dot"></span>Live now</h2></div><ul class="fb-list">${live.map(row)}</ul></section>` : ''}
          ${days.length ? days.map((g) => html`<section class="card">
              <div class="card-head"><h2>${g.k === t ? 'Today' : g.k === addDays(t, -1) ? 'Yesterday' : g.k === addDays(t, 1) ? 'Tomorrow' : fmtDate(g.k, { weekday: 'long', day: 'numeric', month: 'short' })}</h2><span class="meta">${g.items.length}</span></div>
              <ul class="fb-list">${g.items.map(row)}</ul></section>`)
            : html`<section class="card">${empty(stale ? `${d.season || 'The last season'} has finished, and the new season’s matches aren’t in the feed yet.`
              : view === 'results' ? 'No results in the last 7 days.' : 'No matches in the next two weeks.')}</section>`}`);
        body.querySelectorAll('img.fb-crest').forEach((img) => img.addEventListener('error', () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'fb-crest none' })), { once: true }));
        // Keep live scores fresh while the page is open.
        if (live.length && !poll) {
          poll = setInterval(() => {
            if (!el.isConnected || !location.hash.startsWith('#/football')) { clearInterval(poll); poll = null; return; }
            if (!document.hidden) { memo.delete(`${league}:matches`); draw(); }
          }, 60000);
        }
      } catch (err) {
        if (await shown(el)) body.innerHTML = String(html`<section class="card">${empty(err.message)}<div class="row end"><button class="btn sm" data-act="retry">${raw(icon('repeat', 15))}Try again</button></div></section>`);
      }
    };
    draw();

    wire(el, {
      league: (b) => { league = b.dataset.id; remember(); ctx.rerender(); },
      view: (r) => { view = r.value; remember(); ctx.rerender(); },
      retry: () => { memo.clear(); ctx.rerender(); },
    });
  },
};
