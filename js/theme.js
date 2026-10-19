// Colourways. Each sets the CSS tokens in css/style.css ([data-theme=…]).
// Swatches here are only for the picker preview: bg, card, accent, text.
export const THEMES = [
  { id: 'midnight', label: 'Midnight', group: 'Dark',   swatch: ['#000000', '#141414', '#ffffff', '#ffffff'] },
  { id: 'ocean',    label: 'Ocean',    group: 'Dark',   swatch: ['#0a1220', '#16243a', '#6cb6ff', '#e8f0fb'] },
  { id: 'forest',   label: 'Forest',   group: 'Dark',   swatch: ['#0c1410', '#1a2820', '#7fd3a0', '#e9f3ec'] },
  { id: 'plum',     label: 'Plum',     group: 'Dark',   swatch: ['#160e1a', '#2a1c31', '#f08dc6', '#f6eaf7'] },
  { id: 'dusk',     label: 'Dusk',     group: 'Dark',   swatch: ['#1a1929', '#2c2a43', '#c6b4ff', '#eceaff'] },
  { id: 'paper',    label: 'Paper',    group: 'Light',  swatch: ['#f6f6f4', '#ffffff', '#141414', '#141414'] },
  { id: 'sand',     label: 'Sand',     group: 'Light',  swatch: ['#f7f1e7', '#fffdf8', '#ad582c', '#3a3128'] },
  { id: 'blush',    label: 'Blush',    group: 'Pastel', swatch: ['#fdf3f3', '#ffffff', '#c8476e', '#3a2a2e'] },
  { id: 'lavender', label: 'Lavender', group: 'Pastel', swatch: ['#f5f2ff', '#ffffff', '#7656dc', '#2e2843'] },
  { id: 'peach',    label: 'Peach',    group: 'Pastel', swatch: ['#fff4ec', '#ffe7d9', '#c2552e', '#4a3228'] },
  { id: 'mint',     label: 'Mint',     group: 'Pastel', swatch: ['#eefaf4', '#d9f2e6', '#25785d', '#203c35'] },
  { id: 'sky',      label: 'Sky',      group: 'Pastel', swatch: ['#eff6ff', '#dbebfc', '#356fb5', '#1d3350'] },
  { id: 'butter',   label: 'Butter',   group: 'Pastel', swatch: ['#fffbe8', '#faf0c4', '#d4a017', '#433a1c'] },
  { id: 'candy',    label: 'Cotton candy', group: 'Pastel', swatch: ['#fdf3fa', '#f5e2f1', '#b04c92', '#3c2943'] },
  { id: 'sage',     label: 'Sage',     group: 'Pastel', swatch: ['#f2f6f0', '#e2eadd', '#587a4c', '#2d3a2a'] },
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
