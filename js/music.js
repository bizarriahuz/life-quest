// Music data: iTunes Search (albums, no key) and Last.fm (what you've been playing).
import * as CFG from './config.js';

// ---------- iTunes album search ----------
const big = (u) => (u ? u.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/600x600bb.jpg') : null);
const album = (x) => ({
  itunes_id: x.collectionId,
  title: (x.collectionName || '').slice(0, 200),
  artist: (x.artistName || '').slice(0, 200) || null,
  year: x.releaseDate ? Number(x.releaseDate.slice(0, 4)) : null,
  tracks: x.trackCount || null,
  genre: (x.primaryGenreName || '').slice(0, 60) || null,
  art_url: big(x.artworkUrl100),
  apple_url: /^https:\/\/(music|itunes)\.apple\.com\//.test(x.collectionViewUrl || '') ? x.collectionViewUrl.split('?')[0].slice(0, 400) : null,
});

export async function searchAlbums(q) {
  const u = `https://itunes.apple.com/search?${new URLSearchParams({ term: q, entity: 'album', media: 'music', country: 'SG', limit: '10' })}`;
  // Apple sometimes refuses a burst of searches (403 or an empty reply); retry with a short pause.
  let j = null;
  for (let attempt = 0; attempt < 3 && !j; attempt += 1) {
    if (attempt) await new Promise((res) => setTimeout(res, 800 * attempt));
    try { const r = await fetch(u); if (r.ok) j = await r.json(); } catch { /* retry */ }
  }
  if (j) return (j.results || []).filter((x) => x.collectionId).map(album);
  // Apple unavailable: fall back to MusicBrainz, with covers from the Cover Art Archive.
  try { return await searchMusicBrainz(q); } catch { throw new Error('Album search is busy. Try again in a moment'); }
}

async function searchMusicBrainz(q) {
  const u = `https://musicbrainz.org/ws/2/release-group?${new URLSearchParams({ query: q, fmt: 'json', limit: '10' })}`;
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('busy');
  const j = await r.json();
  return (j['release-groups'] || []).map((g) => ({
    itunes_id: null,
    title: (g.title || '').slice(0, 200),
    artist: (g['artist-credit'] || []).map((c) => c.name + (c.joinphrase || '')).join('').slice(0, 200) || null,
    year: /^\d{4}/.test(g['first-release-date'] || '') ? Number(g['first-release-date'].slice(0, 4)) : null,
    tracks: null,
    genre: g['primary-type'] && g['primary-type'] !== 'Album' ? g['primary-type'] : null,
    art_url: `https://coverartarchive.org/release-group/${g.id}/front-250`,
    apple_url: null,
  }));
}

// ---------- Last.fm ----------
const LFM_KEY = (CFG.LASTFM_KEY || '').trim();
export const lastfmEnabled = Boolean(LFM_KEY);
const BLANK = '2a96cbd8b46e442fc41c2b86b821562f'; // Last.fm's grey star placeholder
const img = (arr) => {
  const u = (arr || []).map((i) => i['#text']).filter(Boolean).pop() || '';
  return u && !u.includes(BLANK) && u.startsWith('https://') ? u : null;
};

async function lfm(method, params) {
  const u = `https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({ method, api_key: LFM_KEY, format: 'json', ...params })}`;
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (j.error === 6) throw new Error('No Last.fm user with that name');
  if (j.error === 10 || j.error === 26) throw new Error('Last.fm key isn’t valid. Check LASTFM_KEY in config.js');
  if (j.error === 17) throw new Error('That Last.fm profile is private');
  if (!r.ok || j.error) throw new Error(j.message || 'Last.fm didn’t answer');
  return j;
}

const PERIOD = { '7day': 'this week', '1month': 'this month', '3month': 'last 3 months', '12month': 'this year', overall: 'of all time' };
const memo = new Map();   // short in-memory cache so tab switches stay instant
async function cached(key, ms, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v;
  const v = await fn();
  memo.set(key, { at: Date.now(), v });
  return v;
}

export function listening(user) {
  return cached(`lfm:${user}`, 60_000, async () => {
    const out = await fetchListening(user);
    try { localStorage.setItem(`lifequest:lfm:${user}`, JSON.stringify(out)); } catch { /* ignore */ }
    return out;
  });
}

async function fetchListening(user) {
  {
    const weekAgo = String(Math.floor(Date.now() / 1000) - 7 * 86400);
    // Use the shortest period that has plays, so a quiet week still shows something.
    const firstWith = async (method, key, periods, limit) => {
      // Ask for every period at once (in parallel) and use the shortest one that has plays.
      const all = await Promise.all(periods.map((period) => lfm(method, { user, period, limit })
        .then((j) => ({ period, rows: j[key]?.[key.replace(/^top(.*)s$/, '$1')] || [] }))));
      return all.find((x) => x.rows.length) || { rows: [], period: periods[0] };
    };
    const [recent, week, albums, artists, info] = await Promise.all([
      lfm('user.getrecenttracks', { user, limit: '8' }),
      lfm('user.getrecenttracks', { user, limit: '1', from: weekAgo }),
      firstWith('user.gettopalbums', 'topalbums', ['7day', '3month', '12month', 'overall'], '6'),
      firstWith('user.gettopartists', 'topartists', ['1month', '3month', '12month', 'overall'], '5'),
      lfm('user.getinfo', { user }),
    ]);
    const tracks = (recent.recenttracks?.track || []).map((t) => ({
      name: t.name, artist: t.artist?.['#text'] || t.artist?.name || '', album: t.album?.['#text'] || '',
      art: img(t.image), now: t['@attr']?.nowplaying === 'true', at: t.date?.uts ? Number(t.date.uts) * 1000 : null,
    }));
    return {
      tracks,
      albums: albums.rows.map((a) => ({ name: a.name, artist: a.artist?.name || '', plays: Number(a.playcount) || 0, art: img(a.image) })),
      artists: artists.rows.map((a) => ({ name: a.name, plays: Number(a.playcount) || 0 })),
      albumsPeriod: PERIOD[albums.period], artistsPeriod: PERIOD[artists.period],
      total: Number(info.user?.playcount) || 0,
      weekPlays: Number(week.recenttracks?.['@attr']?.total) || 0,
    };
  }
}

// Last snapshot, shown instantly while a fresh one loads.
export function cachedListening(user) {
  try { return JSON.parse(localStorage.getItem(`lifequest:lfm:${user}`) || 'null'); } catch { return null; }
}

export async function checkUser(user) {
  await lfm('user.getinfo', { user });
}
