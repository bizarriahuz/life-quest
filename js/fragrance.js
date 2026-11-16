// Perfume lookup: Scento's public perfume API. No key, no sign-up, open CORS,
// so the browser calls it directly and no server function is needed.
// It returns null rather than inventing a detail — a wrong note pyramid is worse
// than an empty one, and the owner can always type the rest in by hand.
const API = 'https://www.scento.com/api/perfume/v1';

async function getJson(url, signal, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
  try {
    const res = await fetch(url, { signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// Scento pages are https://www.scento.com/perfumes/aventus-creed — the last path part is the id.
export const slugOf = (pageUrl) => String(pageUrl || '').replace(/\/+$/, '').split('/').pop() || null;

export async function searchPerfumes(q, signal) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const d = await getJson(`${API}/search?q=${encodeURIComponent(term)}`, signal);
  return (d?.detail?.matches || []).filter((m) => m.kind === 'perfume' && m.name);
}

export async function getPerfume(slug, signal) {
  if (!slug) return null;
  const d = await getJson(`${API}/perfumes/${encodeURIComponent(slug)}`, signal);
  const det = d?.detail;
  if (!det?.name) return null;
  const p = det.pyramid || {};
  const names = (v) => (Array.isArray(v) ? v.filter(Boolean).slice(0, 20) : []);
  return {
    name: det.name,
    house: det.house || null,
    year: Number.isInteger(det.year) ? det.year : null,
    concentration: det.concentration || null,
    perfumer: det.perfumer || null,
    family: det.family || null,
    top_notes: names(p.top),
    heart_notes: names(p.heart),
    base_notes: names(p.base),
    source_url: d?.scento_page?.url || null,
  };
}
