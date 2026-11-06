// Football results, fixtures and tables for the Football section.
// Data comes from ESPN's public scoreboard feed. This relays it so the app gets a small,
// tidy answer, and keeps a copy at Cloudflare's edge so busy match days stay light:
// 1 minute while a match is live, 10 minutes otherwise, 30 minutes for tables.
// Only the six leagues below are allowed, so it can't be used as a general proxy.
const LEAGUES = {
  'eng.1': 'Premier League', 'esp.1': 'LaLiga', 'ger.1': 'Bundesliga',
  'ita.1': 'Serie A', 'fra.1': 'Ligue 1', 'sgp.1': 'Singapore Premier League',
};
const BASE = 'https://site.api.espn.com/apis';

const json = (body, maxAge, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
});
const months = (now) => {
  // The current month, plus the previous one early in a month and the next one late in it,
  // so "last 7 days" and "next 14 days" are always covered.
  const ym = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const out = new Set([ym(now)]);
  out.add(ym(new Date(now.getTime() - 8 * 864e5)));
  out.add(ym(new Date(now.getTime() + 15 * 864e5)));
  return [...out];
};
const side = (c) => ({
  name: c.team?.displayName || c.team?.name || '?',
  short: c.team?.shortDisplayName || c.team?.displayName || '?',
  abbr: c.team?.abbreviation || '',
  logo: /^https:\/\/a\.espncdn\.com\//.test(c.team?.logo || '') ? c.team.logo : null,
  score: c.score ?? null,
  winner: c.winner === true,
});
function match(e) {
  const comp = e.competitions?.[0] || {};
  const home = (comp.competitors || []).find((c) => c.homeAway === 'home');
  const away = (comp.competitors || []).find((c) => c.homeAway === 'away');
  const st = e.status?.type || {};
  return {
    id: e.id, date: e.date,
    state: st.state || 'pre',              // pre | in | post
    detail: st.shortDetail || '',          // "FT", "HT", "67'", "Postponed"…
    clock: e.status?.displayClock || '',
    home: home ? side(home) : null, away: away ? side(away) : null,
    venue: comp.venue?.fullName || null,
  };
}

async function cached(request, ctx, key, build) {
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await build();
  if (res.ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return json({ error: 'Not allowed' }, 0, 403);
  const league = url.searchParams.get('league');
  const view = url.searchParams.get('view') === 'table' ? 'table' : 'matches';
  if (!LEAGUES[league]) return json({ error: 'Unknown league' }, 0, 400);
  const key = new Request(`https://football.cache/${league}/${view}/${view === 'matches' ? months(new Date()).join('-') : ''}`);

  return cached(request, context, key, async () => {
    try {
      if (view === 'table') {
        const r = await fetch(`${BASE}/v2/sports/soccer/${league}/standings`, { headers: { accept: 'application/json' } });
        if (!r.ok) return json({ error: 'The table isn’t available right now' }, 60, 502);
        const d = await r.json();
        const group = d.children?.[0];
        const stat = (e, n) => e.stats?.find((s) => s.name === n);
        const rows = (group?.standings?.entries || []).map((e) => ({
          rank: Number(stat(e, 'rank')?.value) || null,
          name: e.team?.displayName || '?', short: e.team?.shortDisplayName || e.team?.displayName || '?', abbr: e.team?.abbreviation || '',
          logo: e.team?.logos?.[0]?.href && /^https:\/\/a\.espncdn\.com\//.test(e.team.logos[0].href) ? e.team.logos[0].href : null,
          p: Number(stat(e, 'gamesPlayed')?.value) || 0, w: Number(stat(e, 'wins')?.value) || 0,
          d: Number(stat(e, 'ties')?.value) || 0, l: Number(stat(e, 'losses')?.value) || 0,
          gd: Number(stat(e, 'pointDifferential')?.value) || 0, pts: Number(stat(e, 'points')?.value) || 0,
          note: e.note ? { color: /^#[0-9a-f]{6}$/i.test(e.note.color || '') ? e.note.color : null, text: String(e.note.description || '').slice(0, 60) } : null,
        })).sort((a, b) => (a.rank || 99) - (b.rank || 99));
        const season = group?.standings?.seasonDisplayName || d.seasons?.[0]?.displayName || null;
        return json({ league, name: LEAGUES[league], season, rows, updated: new Date().toISOString() }, 1800);
      }
      const lists = await Promise.all(months(new Date()).map(async (m) => {
        const r = await fetch(`${BASE}/site/v2/sports/soccer/${league}/scoreboard?dates=${m}&limit=300`, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error('feed');
        return r.json();
      }));
      const seen = new Set(); const matches = [];
      for (const d of lists) for (const e of d.events || []) if (!seen.has(e.id)) { seen.add(e.id); matches.push(match(e)); }
      matches.sort((a, b) => a.date.localeCompare(b.date));
      const season = lists[0]?.leagues?.[0]?.season || {};
      const live = matches.some((m) => m.state === 'in');
      return json({ league, name: LEAGUES[league], season: season.displayName || null, seasonEnd: season.endDate || null, live, matches, updated: new Date().toISOString() }, live ? 60 : 600);
    } catch {
      return json({ error: 'Scores aren’t available right now. Try again in a minute.' }, 60, 502);
    }
  });
}
