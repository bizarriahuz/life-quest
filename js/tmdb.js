// TMDB (themoviedb.org) lookups for the Watchlist: search, IMDb codes, details
// and where to watch in Singapore. Switched on by TMDB_KEY in config.js.
// This product uses the TMDB API but is not endorsed or certified by TMDB.
import * as CFG from './config.js';

const KEY = (CFG.TMDB_KEY || '').trim();
export const tmdbEnabled = Boolean(KEY);
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const REGION = 'SG';

async function req(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = { Accept: 'application/json' };
  // Accept either the short API key or the long "read access token".
  if (KEY.length > 60) headers.Authorization = `Bearer ${KEY}`; else url.searchParams.set('api_key', KEY);
  const r = await fetch(url, { headers });
  if (r.status === 401) throw new Error('TMDB key isn’t valid. Check TMDB_KEY in config.js');
  if (!r.ok) throw new Error('TMDB didn’t answer. Try again in a moment');
  return r.json();
}

const yearOf = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
export const poster = (path, size = 'w185') => (path ? `${IMG}${size}${path}` : null);
const brief = (x, type) => ({
  id: x.id, type, title: x.title || x.name || '', year: yearOf(x.release_date || x.first_air_date),
  poster: poster(x.poster_path), overview: x.overview || '',
});

export function imdbIdFrom(text) {
  const m = String(text || '').match(/\btt\d{5,10}\b/);
  return m ? m[0] : null;
}

export async function search(q) {
  const j = await req('/search/multi', { query: q, include_adult: 'false', language: 'en-US', page: '1' });
  return (j.results || []).filter((x) => x.media_type === 'movie' || x.media_type === 'tv')
    .slice(0, 8).map((x) => brief(x, x.media_type));
}

export async function findByImdb(tt) {
  const j = await req(`/find/${tt}`, { external_source: 'imdb_id' });
  const m = j.movie_results?.[0]; const t = j.tv_results?.[0];
  return m ? brief(m, 'movie') : t ? brief(t, 'tv') : null;
}

const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`);

// Full details → the fields we keep on a watchlist row.
export async function details(type, id) {
  const x = await req(`/${type}/${id}`, { append_to_response: 'external_ids', language: 'en-US' });
  const genres = (x.genres || []).map((g) => g.name);
  const gid = new Set((x.genres || []).map((g) => g.id));
  const kind = gid.has(99) ? 'documentary'
    : gid.has(16) && (x.original_language === 'ja' || (x.origin_country || []).includes('JP')) ? 'anime'
    : type === 'tv' ? 'series' : 'film';
  const len = type === 'movie'
    ? (x.runtime ? hm(x.runtime) : '')
    : (x.number_of_seasons ? `${x.number_of_seasons} season${x.number_of_seasons === 1 ? '' : 's'}` : '');
  const imdb = x.imdb_id || x.external_ids?.imdb_id || null;
  return {
    tmdb_id: x.id, tmdb_type: type, kind,
    title: (x.title || x.name || '').slice(0, 200),
    year: yearOf(x.release_date || x.first_air_date),
    imdb_id: imdb && /^tt\d{5,10}$/.test(imdb) ? imdb : null,
    poster_url: poster(x.poster_path),
    details: [len, genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ').slice(0, 200) || null,
    overview: (x.overview || '').slice(0, 700) || null,
  };
}

// Streaming services in Singapore (data from JustWatch via TMDB). Cached for a day.
export async function providers(type, id) {
  const ck = `lifequest:wtw:${type}:${id}`;
  try {
    const c = JSON.parse(localStorage.getItem(ck) || 'null');
    if (c && Date.now() - c.at < 864e5) return c.v;
  } catch { /* ignore */ }
  const j = await req(`/${type}/${id}/watch/providers`);
  const sg = j.results?.[REGION] || {};
  const names = (list) => (list || []).map((p) => p.provider_name);
  const v = { stream: [...new Set([...names(sg.flatrate), ...names(sg.free), ...names(sg.ads)])], rent: names(sg.rent), buy: names(sg.buy), link: sg.link || null };
  try { localStorage.setItem(ck, JSON.stringify({ at: Date.now(), v })); } catch { /* ignore */ }
  return v;
}
