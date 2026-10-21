// One-time pop-up introducing a section added in an update.
// Shown to people who don't have that section on yet; either button marks it seen.
import { html, raw } from './ui.js';
import { icon } from './icons.js';
import { newSections } from './game.js';

function ask(s) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'intro-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'intro-title');
    ov.innerHTML = String(html`<div class="intro-card">
      <div class="intro-icon">${raw(icon(s.id, 30))}</div>
      <p class="intro-kicker">New section</p>
      <h2 id="intro-title">${s.label}</h2>
      <p class="intro-blurb">${s.intro.blurb || s.hint}</p>
      ${s.intro.features?.length ? html`<ul class="intro-list">${s.intro.features.map((f) => html`<li>${raw(icon('check', 16))}<span>${f}</span></li>`)}</ul>` : ''}
      <div class="intro-go">
        <button class="btn primary" data-v="on">Turn it on</button>
        <button class="btn" data-v="later">Not now</button>
      </div>
      <p class="small faint">You can switch sections on or off any time in Settings.</p>
    </div>`);
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done('later'); };
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    ov.querySelector('[data-v=on]').focus();
  });
}

let running = false;
export async function showIntros(ctx) {
  if (running || !ctx.profile || ctx.profile.sections == null) return;     // still choosing on the welcome screen
  if (location.hash.startsWith('#/join/')) return;
  running = true;
  try {
    const seen = new Set(ctx.profile.seen_intros || []);
    for (const s of newSections()) {
      if (seen.has(s.id) || ctx.sections.has(s.id)) continue;
      while (document.querySelector('.levelup, .lightbox, .scanner')) await new Promise((r) => setTimeout(r, 800));
      const v = await ask(s);
      seen.add(s.id);
      const patch = { seen_intros: [...seen] };
      if (v === 'on') patch.sections = [...ctx.sections, s.id];
      await ctx.setProfile(patch);
      if (v === 'on') { location.hash = `#/${s.id}`; ctx.say(`${s.label} is on`); break; }
    }
  } catch (err) { console.warn('intro', err); }
  finally { running = false; }
}
