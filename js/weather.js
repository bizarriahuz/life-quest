// Weather line on Home. Location: the device's (if the person chose that, rounded to ~1 km)
// or Singapore by default. Answers are reused for 15 minutes.
const LOC = 'lifequest:weather-loc';
const DEFAULT = { lat: 1.35, lon: 103.82, name: 'Singapore' };
const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
export const weatherLoc = () => get(LOC) || DEFAULT;
export const weatherOff = () => get(LOC)?.off === true;
export const setWeatherLoc = (v) => { set(LOC, v); last = null; };
let last = null;   // { at, key, data }

export async function weatherNow() {
  if (weatherOff()) return null;
  const { lat, lon } = weatherLoc();
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (last && last.key === key && Date.now() - last.at < 15 * 60000) return last.data;
  const r = await fetch(`/api/weather?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`);
  if (!r.ok) return null;
  const data = await r.json();
  last = { at: Date.now(), key, data };
  return data;
}
const hour = (hm) => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`; };
export const weatherText = (w) => (w ? [`${w.temp}°${w.sky ? ` ${w.sky.toLowerCase()}` : ''}`,
  w.rainNow ? 'raining now' : w.rainAt ? `rain likely from ${hour(w.rainAt)}` : null,
  Number.isFinite(w.high) ? `high ${w.high}°` : null].filter(Boolean).join(', ') : '');

export function useMyLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This device can’t share its location')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const v = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100, name: 'Your location' }; setWeatherLoc(v); resolve(v); },
      () => reject(new Error('Location wasn’t shared. You can allow it in your browser settings.')),
      { maximumAge: 3600000, timeout: 10000 });
  });
}
