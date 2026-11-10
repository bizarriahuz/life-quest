// Today's weather for the line under the date on Home. Data from Open-Meteo (free, no key).
// The app sends a rounded location (2 decimals, about 1 km); answers are kept at the edge
// for 15 minutes per rounded spot, so many people in one city share one lookup.
const json = (body, maxAge, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
});
// WMO weather codes → plain words.
const SKY = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Foggy', 48: 'Foggy', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow',
  80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorms', 96: 'Thunderstorms', 99: 'Thunderstorms' };

export async function onRequestGet(context) {
  const { request } = context;
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return json({ error: 'Not allowed' }, 0, 403);
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'Bad location' }, 0, 400);
  const la = lat.toFixed(2); const lo = lon.toFixed(2);
  const key = new Request(`https://weather.cache/${la}/${lo}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const api = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
  try {
    const r = await fetch(api, { headers: { accept: 'application/json' } });
    if (!r.ok) return json({ error: 'Weather isn’t available right now' }, 60, 502);
    const d = await r.json();
    // First hour from now with a 50%+ chance of rain.
    const nowLocal = (d.current?.time || '').slice(0, 13);
    const times = d.hourly?.time || []; const probs = d.hourly?.precipitation_probability || [];
    let rainAt = null;
    for (let i = 0; i < times.length; i += 1) if (times[i].slice(0, 13) >= nowLocal && probs[i] >= 50) { rainAt = times[i].slice(11, 16); break; }
    const body = {
      temp: Math.round(d.current?.temperature_2m), sky: SKY[d.current?.weather_code] || null,
      high: Math.round(d.daily?.temperature_2m_max?.[0]), low: Math.round(d.daily?.temperature_2m_min?.[0]),
      rainAt, rainNow: [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(d.current?.weather_code),
    };
    const res = json(body, 900);
    context.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch {
    return json({ error: 'Weather isn’t available right now' }, 60, 502);
  }
}
