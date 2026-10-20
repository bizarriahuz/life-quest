// Opening an invite link: #/join/<token>
import { html, raw, wire, mount } from '../ui.js';
import { icon } from '../icons.js';

const isDefaultName = (n) => !n || n === 'HERO' || n === 'You';

export default {
  id: 'join',
  label: 'Join project',
  async render(el, ctx) {
    const tok = (location.hash.match(/^#\/join\/([0-9a-f]{64})/) || [])[1];
    const card = (title, text, extra = '') => mount(el, html`
      <section class="card join-card"><span class="i-wrap">${raw(icon('projects', 26))}</span><h1>${title}</h1><p class="muted">${text}</p>${extra}</section>`);
    if (!tok) return card('Invite link not valid', 'Check you copied the whole link, or ask for a new one.', html`<a class="btn" href="#/projects">Go to Projects</a>`);
    if (ctx.store.mode !== 'cloud') return card('Sign in to join', 'Joining a shared project needs a Life Quest account.');
    let info;
    try { [info] = await ctx.store.rpc('invite_info', { p_token: tok }); } catch (err) { return card('Couldn’t open the invite', err?.message || String(err)); }
    if (!info) return card('This invite has expired', 'Invite links last 7 days. Ask the person who sent it for a new one.', html`<a class="btn" href="#/projects">Go to Projects</a>`);
    if (info.already) { location.replace(`#/projects/${info.project_id}`); return; }
    const needName = isDefaultName(ctx.profile?.hero_name);
    card(`Join “${info.name}”?`, `${info.members} ${info.members === 1 ? 'person is' : 'people are'} in this project. You’ll ${info.role === 'viewer' ? 'be able to view it' : 'be able to add tasks, notes and costs'}.`, html`
      <form data-form="join" class="form" style="width:100%;max-width:360px">
        ${needName ? html`<label class="field">Your name, as others will see it<input name="hero_name" maxlength="24" required autocomplete="given-name"></label>` : ''}
        <button class="btn primary">${raw(icon('plus', 18))}Join project</button>
        <a class="text-btn" href="#/home" style="text-align:center">Not now</a>
      </form>`);
    wire(el, {
      join: async (v) => {
        if (v.hero_name) await ctx.setProfile({ hero_name: v.hero_name.slice(0, 24) });
        const id = await ctx.store.rpc('join_project', { p_token: tok });
        if (!ctx.sections.has('projects')) await ctx.setProfile({ sections: [...ctx.sections, 'projects'] });
        ctx.store.invalidate?.('projects');
        ctx.say(`You joined ${info.name}`);
        location.hash = `#/projects/${id}`;
      },
    });
  },
};
