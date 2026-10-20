// Fetches a private calendar link (Google, Apple iCloud, Outlook) for the Calendar
// section. Browsers can't read these directly (no CORS), so this relays it.
// Only calendar hosts are allowed, so it can't be used as a general proxy.
const ALLOWED = [
  /^calendar\.google\.com$/,
  /^p\d+-caldav\.icloud\.com$/, /^p\d+-calendars\.icloud\.com$/, /^(www\.)?icloud\.com$/,
  /^outlook\.live\.com$/, /^outlook\.office365\.com$/, /^outlook\.office\.com$/,
];
const MAX_BYTES = 3 * 1024 * 1024;

const fail = (status, message) => new Response(JSON.stringify({ error: message }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

function check(raw) {
  let u;
  try { u = new URL(String(raw).trim().replace(/^webcals?:\/\//i, 'https://')); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  if (!ALLOWED.some((re) => re.test(u.hostname))) return null;
  return u;
}

export async function onRequestGet({ request }) {
  const here = new URL(request.url);
  // Only for pages on this site.
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return fail(403, 'Not allowed');
  let target = check(here.searchParams.get('url'));
  if (!target) return fail(400, 'That isn’t a Google, Apple or Outlook calendar link.');

  let res;
  for (let hop = 0; hop < 4; hop += 1) {
    try {
      res = await fetch(target.toString(), {
        redirect: 'manual',
        headers: { accept: 'text/calendar, text/plain;q=0.8', 'user-agent': 'LifeQuest-Calendar/1.0' },
        cf: { cacheTtl: 300, cacheEverything: false },
      });
    } catch { return fail(502, 'Couldn’t reach that calendar. Try again later.'); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      target = check(new URL(res.headers.get('location'), target).toString());
      if (!target) return fail(400, 'That calendar link redirects somewhere unexpected.');
      continue;
    }
    break;
  }
  if (res.status === 404 || res.status === 403 || res.status === 401) return fail(404, 'That calendar link doesn’t work any more. It may have been reset. Copy it again.');
  if (!res.ok) return fail(502, `The calendar service answered with an error (${res.status}).`);

  // Read with a size cap.
  const reader = res.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { reader.cancel(); return fail(413, 'That calendar is too big to show (over 3 MB).'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  const text = new TextDecoder().decode(all);
  if (!/BEGIN:VCALENDAR/.test(text.slice(0, 2000))) return fail(415, 'That link didn’t return a calendar. Check it’s the iCal / ICS address.');
  return new Response(text, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' },
  });
}
