// Tiny UI toolkit: safe HTML templates, event wiring, dates, toasts.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

const fmt = (v) => {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (v === false || v == null) return '';
  return esc(v);
};

// html`...` escapes every interpolated value unless it is raw() or another html``.
export function html(strings, ...vals) {
  return raw(strings.reduce((out, str, i) => out + str + (i < vals.length ? fmt(vals[i]) : ''), ''));
}

export function mount(el, tpl) { el.innerHTML = String(tpl); }

// Wire handlers by data attributes:
//   <button data-act="name" data-id="…">   → handlers.name(el, event)
//   <form data-form="name">                 → handlers.name(values, form)
//   <input data-change="name">              → handlers.name(el, event)
// Handlers are guarded against double-firing; errors become a toast.
export function wire(el, handlers) {
  let busy = false;
  const run = async (fn, ...args) => {
    if (!fn || busy) return;
    busy = true;
    try { await fn(...args); } catch (err) { console.error(err); toast(err?.message || String(err), true); }
    finally { busy = false; }
  };
  el.onclick = (e) => {
    const t = e.target.closest('[data-act]');
    if (t && el.contains(t)) { e.preventDefault(); run(handlers[t.dataset.act], t, e); }
  };
  el.onsubmit = (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const values = Object.fromEntries(new FormData(f));
    for (const k of Object.keys(values)) if (typeof values[k] === 'string') values[k] = values[k].trim();
    run(handlers[f.dataset.form], values, f);
  };
  el.onchange = (e) => {
    const t = e.target.closest('[data-change]');
    if (t && el.contains(t)) run(handlers[t.dataset.change], t, e);
  };
}

// ---------- dates (local time) ----------
export const dateKey = (d = new Date()) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD
export const today = () => dateKey();
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}
export function fmtDate(key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!key) return '';
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts);
}
export function relDate(key) {
  const t = today();
  if (key === t) return 'Today';
  if (key === addDays(t, -1)) return 'Yesterday';
  if (key === addDays(t, 1)) return 'Tomorrow';
  return fmtDate(key);
}
export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ---------- widgets ----------
export const bar = (pct, cls = '') =>
  html`<div class="bar ${cls}" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;

export const empty = (msg) => html`<p class="empty">${msg}</p>`;

// ---------- toast ----------
let toastTimer;
export function toast(msg, isError = false) {
  const box = document.getElementById('toast');
  if (!box) return;
  clearTimeout(toastTimer);
  box.textContent = msg;
  box.className = `toast show${isError ? ' err' : ''}`;
  box.onclick = () => box.classList.remove('show');
  toastTimer = setTimeout(() => box.classList.remove('show'), isError ? 7000 : 2800);
}

export function levelUpModal(level, lines) {
  document.querySelectorAll('.levelup').forEach((el) => el.remove());
  const ov = document.createElement('div');
  ov.className = 'levelup';
  ov.setAttribute('role', 'alertdialog');
  ov.setAttribute('aria-label', `Level ${level}`);
  ov.innerHTML = `<div class="lu-card">
      <p class="lu-kicker">Level up</p>
      <p class="lu-level">${level}</p>
      ${lines.map((l) => `<p class="lu-line">${esc(l)}</p>`).join('')}
      <button class="btn primary" type="button">Continue</button>
    </div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('button')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  ov.querySelector('button').focus();
}
