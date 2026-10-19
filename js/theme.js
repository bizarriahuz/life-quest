// Colourways. Each sets the CSS tokens in css/style.css ([data-theme=…]).
// Swatches here are only for the picker preview: bg, card, accent, text.
export const THEMES = [
  { id: 'midnight', label: 'Midnight', mode: 'dark',  swatch: ['#000000', '#141414', '#ffffff', '#ffffff'] },
  { id: 'ocean',    label: 'Ocean',    mode: 'dark',  swatch: ['#0a1220', '#16243a', '#6cb6ff', '#e8f0fb'] },
  { id: 'forest',   label: 'Forest',   mode: 'dark',  swatch: ['#0c1410', '#1a2820', '#7fd3a0', '#e9f3ec'] },
  { id: 'plum',     label: 'Plum',     mode: 'dark',  swatch: ['#160e1a', '#2a1c31', '#f08dc6', '#f6eaf7'] },
  { id: 'paper',    label: 'Paper',    mode: 'light', swatch: ['#f6f6f4', '#ffffff', '#141414', '#141414'] },
  { id: 'blush',    label: 'Blush',    mode: 'light', swatch: ['#fdf3f3', '#ffffff', '#c8476e', '#3a2a2e'] },
  { id: 'lavender', label: 'Lavender', mode: 'light', swatch: ['#f5f2ff', '#ffffff', '#7656dc', '#2e2843'] },
  { id: 'sand',     label: 'Sand',     mode: 'light', swatch: ['#f7f1e7', '#fffdf8', '#ad582c', '#3a3128'] },
];
export const DEFAULT_THEME = 'midnight';
const KEY = 'lifequest:theme';
const byId = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export function applyTheme(id) {
  const t = byId(id);
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.swatch[0]);
  try { localStorage.setItem(KEY, t.id); } catch { /* ignore */ }
  return t.id;
}
