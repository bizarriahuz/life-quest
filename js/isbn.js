// ISBN lookup: asks Google Books and Open Library at the same time and merges
// whatever each one knows (title, author, pages, cover).

export function cleanIsbn(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^0-9X]/g, '');
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((n, c, i) => n + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0 ? s : null;
  }
  if (/^\d{13}$/.test(s)) {
    const sum = [...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? s : null;
  }
  return null;
}

async function getJson(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

const https = (u) => (u ? u.replace(/^http:\/\//, 'https://') : null);

async function google(isbn) {
  const d = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  const v = d?.items?.[0]?.volumeInfo;
  if (!v) return {};
  return {
    title: [v.title, v.subtitle].filter(Boolean).join(': ') || null,
    author: v.authors?.length ? v.authors.slice(0, 2).join(', ') : null,
    pages: v.pageCount || null,
    cover: https(v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail),
  };
}

async function openLibrary(isbn) {
  const d = await getJson(`https://openlibrary.org/search.json?isbn=${isbn}&fields=title,author_name,number_of_pages_median,cover_i&limit=1`);
  const v = d?.docs?.[0];
  if (!v) return {};
  return {
    title: v.title || null,
    author: v.author_name?.[0] || null,
    pages: v.number_of_pages_median || null,
    cover: v.cover_i ? `https://covers.openlibrary.org/b/id/${v.cover_i}-M.jpg` : null,
  };
}

export async function lookupIsbn(isbn) {
  const [g, o] = await Promise.all([google(isbn), openLibrary(isbn)]);
  const pick = (k) => g[k] || o[k] || null;
  const book = { title: pick('title'), author: pick('author'), pages: pick('pages'), cover: o.cover || g.cover || null };
  return book.title ? book : null;
}
