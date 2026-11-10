import { html, raw, wire, mount, today, addDays, fmtDate, empty } from '../ui.js';
import { icon } from '../icons.js';
import { findCouple } from './couple.js';

// A week of meals (today + 6 days) and a recipe box. A recipe's ingredients can go
// straight onto the couple's shared "Groceries" list.
export const SLOTS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const GROCERIES = 'Groceries';
let openRecipe = null;
let adding = false;

export default {
  id: 'meals',
  label: 'Meals',
  async render(el, ctx) {
    const t = today();
    const days = Array.from({ length: 7 }, (_, i) => addDays(t, i));
    const [plan, recipes, us] = await Promise.all([
      ctx.store.list('meal_plan', { gte: ['day', t], lte: ['day', days[6]] }),
      ctx.store.list('recipes', { order: 'title', asc: true }),
      ctx.sections.has('couple') ? findCouple(ctx) : null,
    ]);
    recipes.sort((a, b) => a.title.localeCompare(b.title));
    const at = (d, s) => plan.find((p) => p.day === d && p.slot === s);
    const planned = plan.length;
    const ingr = (r) => (r.ingredients || '').split('\n').map((x) => x.replace(/^[-•*\s]+/, '').trim()).filter(Boolean);

    mount(el, html`
      <header class="page-head"><div><h1>Meals</h1><p>${planned ? `${planned} meal${planned === 1 ? '' : 's'} planned this week` : 'Plan the week ahead'} · ${recipes.length} recipe${recipes.length === 1 ? '' : 's'}</p></div></header>

      <section class="card">
        <div class="card-head"><h2>This week</h2></div>
        <form data-form="plan" class="row wrap" style="gap:8px">
          <select name="day" aria-label="Day">${days.map((d, i) => html`<option value="${d}">${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtDate(d, { weekday: 'long' })}</option>`)}</select>
          <select name="slot" aria-label="Meal">${Object.entries(SLOTS).map(([k, v]) => html`<option value="${k}" ${k === 'dinner' ? 'selected' : ''}>${v}</option>`)}</select>
          <input name="title" maxlength="120" required placeholder="What’s cooking?" aria-label="Meal" list="ml-recipes" class="grow" style="min-width:160px">
          <button class="btn primary">${raw(icon('plus', 18))}Plan</button>
        </form>
        <datalist id="ml-recipes">${recipes.map((r) => html`<option value="${r.title}"></option>`)}</datalist>
        <ol class="ml-week">${days.map((d, i) => html`<li class="${i === 0 ? 'today' : ''}">
          <p class="ml-day">${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtDate(d, { weekday: 'short', day: 'numeric' })}</p>
          <div class="ml-slots">${Object.entries(SLOTS).map(([k, v]) => { const m = at(d, k); return m ? html`
            <span class="ml-meal"><span class="small faint">${v}</span> ${m.title}<button class="icon-btn sm" data-act="unplan" data-id="${m.id}" aria-label="Remove ${m.title} from ${v.toLowerCase()}">${raw(icon('close', 14))}</button></span>` : ''; })}
            ${!Object.keys(SLOTS).some((k) => at(d, k)) ? html`<span class="small faint">Nothing planned</span>` : ''}</div>
        </li>`)}</ol>
      </section>

      <section class="card">
        <div class="card-head"><h2>Recipes</h2><button class="btn sm" data-act="toggle-add">${raw(icon(adding ? 'close' : 'plus', 15))}${adding ? 'Close' : 'New recipe'}</button></div>
        ${adding ? html`<form data-form="recipe" class="form" style="margin-bottom:12px">
          <input name="title" maxlength="120" required placeholder="Recipe name" aria-label="Recipe name">
          <label class="field">Ingredients, one per line<textarea name="ingredients" maxlength="3000" rows="5" placeholder="2 eggs&#10;1 cup rice&#10;Soy sauce"></textarea></label>
          <label class="field">Steps<textarea name="steps" maxlength="5000" rows="5"></textarea></label>
          <input name="link" type="url" maxlength="300" placeholder="Link to the recipe (optional)" aria-label="Link">
          <div class="row end"><button class="btn primary">${raw(icon('check', 18))}Save recipe</button></div>
        </form>` : ''}
        ${recipes.length ? html`<ul class="list">${recipes.map((r) => html`<li class="item ml-recipe">
          <details ${openRecipe === r.id ? 'open' : ''} data-id="${r.id}">
            <summary><span class="title">${r.title}</span>${ingr(r).length ? html`<span class="small faint">${ingr(r).length} ingredients</span>` : ''}</summary>
            ${ingr(r).length ? html`<ul class="ml-ingr">${ingr(r).map((x) => html`<li>${x}</li>`)}</ul>` : ''}
            ${r.steps ? html`<p class="small" style="white-space:pre-line">${r.steps}</p>` : ''}
            ${r.link ? html`<p class="small"><a href="${r.link}" target="_blank" rel="noopener noreferrer"><u>Open the recipe</u></a></p>` : ''}
            <div class="row wrap" style="gap:8px;margin-top:8px">
              <button class="btn sm" data-act="tonight" data-id="${r.id}">Have it tonight</button>
              ${us && ingr(r).length ? html`<button class="btn sm" data-act="shop" data-id="${r.id}">Add ingredients to ${GROCERIES}</button>` : ''}
              <button class="btn sm" data-act="delrecipe" data-id="${r.id}">Delete</button>
            </div>
          </details>
        </li>`)}</ul>` : adding ? '' : empty('Save the dishes you make often, so planning the week takes a minute.')}
      </section>
    `);

    el.querySelectorAll('.ml-recipe details').forEach((d) => d.addEventListener('toggle', () => { if (d.open) openRecipe = d.dataset.id; else if (openRecipe === d.dataset.id) openRecipe = null; }));
    const setMeal = async (day, slot, title, recipe) => {
      const old = at(day, slot);
      const row = { title: title.slice(0, 120), recipe_id: recipe?.id || null };
      if (old) await ctx.store.update('meal_plan', old.id, row);
      else await ctx.store.insert('meal_plan', { day, slot, ...row });
    };
    wire(el, {
      plan: async (v) => {
        const r = recipes.find((x) => x.title.toLowerCase() === v.title.toLowerCase());
        await setMeal(v.day, v.slot, v.title, r);
        ctx.rerender();
      },
      unplan: async (b) => { await ctx.store.remove('meal_plan', b.dataset.id); ctx.rerender(); },
      'toggle-add': () => { adding = !adding; ctx.rerender(); },
      recipe: async (v) => {
        const saved = await ctx.store.insert('recipes', { title: v.title, ingredients: v.ingredients || null, steps: v.steps || null, link: /^https?:\/\//.test(v.link || '') ? v.link : null });
        adding = false; openRecipe = saved.id; ctx.say(`Saved ${v.title}`); ctx.rerender();
      },
      tonight: async (b) => {
        const r = recipes.find((x) => x.id === b.dataset.id);
        await setMeal(t, 'dinner', r.title, r);
        ctx.say(`${r.title} for dinner tonight`); ctx.rerender();
      },
      shop: async (b) => {
        const r = recipes.find((x) => x.id === b.dataset.id);
        const have = new Set((await ctx.store.list('project_entries', { match: { project_id: us.id, kind: 'task', done: false } }))
          .filter((x) => x.body === GROCERIES).map((x) => x.title.toLowerCase()));
        const add = ingr(r).filter((x) => !have.has(x.toLowerCase())).slice(0, 40);
        for (const title of add) await ctx.store.insert('project_entries', { project_id: us.id, kind: 'task', title: title.slice(0, 200), body: GROCERIES });
        ctx.say(add.length ? `Added ${add.length} to ${GROCERIES}` : `Already on ${GROCERIES}`);
      },
      delrecipe: async (b) => {
        const r = recipes.find((x) => x.id === b.dataset.id);
        if (!confirm(`Delete the recipe for ${r.title}?`)) return;
        await ctx.store.remove('recipes', r.id); ctx.rerender();
      },
    });
  },
};
