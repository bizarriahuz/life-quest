// Colourways. Each sets the CSS tokens in css/style.css ([data-theme=…]).
// Swatches here are only for the picker preview: bg, card, accent, text.
export const THEMES = [
  { id: 'midnight', label: 'Midnight', group: 'Dark',   swatch: ['#000000', '#141414', '#ffffff', '#ffffff'] },
  { id: 'ocean',    label: 'Ocean',    group: 'Dark',   swatch: ['#0a1220', '#16243a', '#6cb6ff', '#e8f0fb'] },
  { id: 'forest',   label: 'Forest',   group: 'Dark',   swatch: ['#0c1410', '#1a2820', '#7fd3a0', '#e9f3ec'] },
  { id: 'plum',     label: 'Plum',     group: 'Dark',   swatch: ['#160e1a', '#2a1c31', '#f08dc6', '#f6eaf7'] },
  { id: 'dusk',     label: 'Dusk',     group: 'Dark',   swatch: ['#1a1929', '#2c2a43', '#c6b4ff', '#eceaff'] },
  { id: 'burgundy', label: 'Oxide Burgundy', group: 'Dark', swatch: ['#54252F', '#653a41', '#E5D8C5', '#e8ddcc'] },
  { id: 'olive', label: 'Midnight Olive', group: 'Dark', swatch: ['#292E22', '#3a4032', '#B7C3A5', '#cdd5c0'] },
  { id: 'obsidian', label: 'Obsidian Plum', group: 'Dark', swatch: ['#251626', '#3a2a33', '#D5BD91', '#d5bd91'] },
  { id: 'petrol', label: 'Petroleum Teal', group: 'Dark', swatch: ['#153A3D', '#284241', '#c2927d', '#e2ccc3'] },
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
  { id: 'coastal', label: 'Sea Salt', group: 'Pastel', swatch: ['#F1E8D8', '#f9f5ed', '#467992', '#1b2e37'] },
  { id: 'ivory', label: 'Soft Sage', group: 'Pastel', swatch: ['#F4EBDD', '#faf6f0', '#607d46', '#24301b'] },
  { id: 'mist', label: 'Misty Lavender', group: 'Pastel', swatch: ['#DCE5E7', '#eff3f4', '#8368aa', '#322841'] },
  { id: 'rose', label: 'Dusty Rose', group: 'Pastel', swatch: ['#DDBFC2', '#f0e2e4', '#a45d72', '#3e232b'] },
  { id: 'cream', label: 'Dusty Blush', group: 'Pastel', swatch: ['#F4EBDD', '#faf6f0', '#b85356', '#462021'] },
  { id: 'meadow', label: 'Soft Butter', group: 'Pastel', swatch: ['#E8DFAF', '#f5f1db', '#677844', '#272e1a'] },
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
