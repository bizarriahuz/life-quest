import { html, raw, wire, mount, today, fmtDate, relDate, bar, empty } from '../ui.js';
import { icon } from '../icons.js';
import { XP, money, cents } from '../game.js';

const DEFAULT_CATEGORIES = [
  ['expense', 'Food'], ['expense', 'Transport'], ['expense', 'Bills'], ['expense', 'Shopping'],
  ['expense', 'Health'], ['expense', 'Other'], ['income', 'Salary'], ['income', 'Other income'],
];

let month = null;            // 'YYYY-MM' being viewed
let seeding = null;          // promise while default categories are created
let budgetChecked = false;   // last month's budget reward checked this session

const monthKey = (d = today()) => d.slice(0, 7);
function shiftMonth(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthRange(m) {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`];
}
const monthLabel = (m) => fmtDate(`${m}-01`, { month: 'long', year: 'numeric' });
const sum = (rows) => Math.round(rows.reduce((n, r) => n + Number(r.amount), 0) * 100) / 100;

async function seedDefaults(store) {
  seeding ??= (async () => {
    for (const [kind, name] of DEFAULT_CATEGORIES) {
      try { await store.insert('finance_categories', { kind, name }); } catch { /* already there */ }
    }
  })();
  await seeding;
}

// A finished month at or under budget earns a one-off reward.
async function checkLastMonth(ctx, cats) {
  if (budgetChecked) return;
  budgetChecked = true;
  const prev = shiftMonth(monthKey(), -1);
  const budgeted = cats.filter((c) => c.kind === 'expense' && Number(c.budget) > 0);
  if (!budgeted.length) return;
  const done = await ctx.store.list('xp_events', { match: { source: 'budget_month', source_id: prev } });
  if (done.length) return;
  const [from, to] = monthRange(prev);
  const spent = await ctx.store.list('transactions', { match: { kind: 'expense' }, gte: ['occurred_on', from], lte: ['occurred_on', to] });
  if (!spent.length) return;
  const ids = new Set(budgeted.map((c) => c.id));
  const used = sum(spent.filter((x) => ids.has(x.category_id)));
  const limit = budgeted.reduce((n, c) => n + Number(c.budget), 0);
  if (used <= limit) await ctx.award('WLT', XP.budgetMonth, 'budget_month', prev, `${monthLabel(prev)} under budget`);
}

export default {
  id: 'finance',
  label: 'Finance',
  async render(el, ctx) {
    const t = today();
    const cur = monthKey(t);
    if (!month || month > cur) month = cur;
    const [from, to] = monthRange(month);
    const ccy = ctx.currency;
    const $ = (n, o) => money(n, ccy, o);

    let cats = await ctx.store.list('finance_categories', { order: 'name', asc: true });
    if (!cats.length) { await seedDefaults(ctx.store); cats = await ctx.store.list('finance_categories', { order: 'name', asc: true }); }
    const [txns, goals, contribs] = await Promise.all([
      ctx.store.list('transactions', { gte: ['occurred_on', from], lte: ['occurred_on', to], order: 'occurred_on' }),
      ctx.store.list('savings_goals', { order: 'created_at', asc: true }),
      ctx.store.list('savings_contributions', { order: 'made_on' }),
    ]);
    checkLastMonth(ctx, cats).catch(() => {});

    txns.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
    const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
    const expCats = cats.filter((c) => c.kind === 'expense');
    const incCats = cats.filter((c) => c.kind === 'income');
    const spending = txns.filter((x) => x.kind === 'expense');
    const income = sum(txns.filter((x) => x.kind === 'income'));
    const spent = sum(spending);
    const net = Math.round((income - spent) * 100) / 100;
    const spentIn = (id) => sum(spending.filter((x) => x.category_id === id));
    const uncategorised = sum(spending.filter((x) => !catById[x.category_id]));
    const budgeted = expCats.filter((c) => Number(c.budget) > 0);
    const totalBudget = budgeted.reduce((n, c) => n + Number(c.budget), 0);
    const budgetUsed = sum(spending.filter((x) => budgeted.some((c) => c.id === x.category_id)));
    const savedIn = (id) => sum(contribs.filter((c) => c.goal_id === id));
    const defaultDate = month === cur ? t : to;

    const budgetRow = (label, used, limit) => {
      const pct = limit ? (used / limit) * 100 : 0;
      const over = limit && used > limit;
      return html`
        <div class="budget">
          <div class="row"><span>${label}</span>
            <span class="small ${over ? 'over' : 'muted'}">${limit
              ? (over ? `${$(used - limit)} over` : `${$(limit - used)} left of ${$(limit)}`)
              : $(used)}</span></div>
          ${limit ? bar(Math.min(100, pct), over ? 'over' : '') : ''}
        </div>`;
    };

    mount(el, html`
      <header class="page-head">
        <div><h1>Finance</h1><p>${monthLabel(month)}</p></div>
        <div class="monthnav">
          <button class="icon-btn" data-act="prevm" aria-label="Previous month">${raw(icon('left'))}</button>
          <button class="icon-btn" data-act="nextm" aria-label="Next month" ${month >= cur ? 'disabled style="visibility:hidden"' : ''}>${raw(icon('right'))}</button>
        </div>
      </header>

      <div class="kpis">
        <div class="kpi"><b>${$(income, { maximumFractionDigits: 0 })}</b><span>Income</span></div>
        <div class="kpi"><b>${$(spent, { maximumFractionDigits: 0 })}</b><span>Spent</span></div>
        <div class="kpi ${net < 0 ? 'neg' : ''}"><b>${net < 0 ? '−' : ''}${$(Math.abs(net), { maximumFractionDigits: 0 })}</b><span>${net < 0 ? 'Overspent' : 'Left over'}</span></div>
      </div>

      <section class="card">
        <div class="card-head"><h2>Add an entry</h2></div>
        <form data-form="add" class="form">
          <div class="fields">
            <label class="field">Amount (${ccy})<input name="amount" inputmode="decimal" placeholder="0.00" required autocomplete="off" pattern="[0-9]*[.,]?[0-9]{0,2}"></label>
            <label class="field">Category<select name="category_id">
              <optgroup label="Spending">${expCats.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</optgroup>
              <optgroup label="Income">${incCats.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</optgroup>
            </select></label>
            <label class="field">Date<input type="date" name="occurred_on" value="${defaultDate}" required></label>
          </div>
          <input name="note" maxlength="200" placeholder="Note (optional)" aria-label="Note">
          <div class="row end"><button class="btn primary">${raw(icon('plus', 18))}Add</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Budgets</h2><span class="meta">${monthLabel(month)}</span></div>
        ${totalBudget ? budgetRow(html`<b style="font-weight:600">All budgets</b>`, budgetUsed, totalBudget) : ''}
        ${expCats.filter((c) => Number(c.budget) > 0 || spentIn(c.id) > 0).map((c) => budgetRow(c.name, spentIn(c.id), Number(c.budget) || 0))}
        ${uncategorised ? budgetRow('Uncategorised', uncategorised, 0) : ''}
        ${!totalBudget && !spent ? empty('Set monthly budgets under Categories below.') : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>Savings goals</h2></div>
        ${goals.length ? html`<div>${goals.map((g) => {
          const saved = savedIn(g.id);
          const target = Number(g.target);
          const own = contribs.filter((c) => c.goal_id === g.id).sort((a, b) => b.made_on.localeCompare(a.made_on) || b.created_at.localeCompare(a.created_at));
          return html`
            <div class="goal">
              <div class="row spread"><b style="font-weight:600">${g.name}</b>
                <button class="icon-btn" data-act="delgoal" data-id="${g.id}" aria-label="Delete goal ${g.name}">${raw(icon('trash'))}</button></div>
              ${bar(Math.min(100, (saved / target) * 100), 'thick')}
              <p class="small muted">${$(saved)} of ${$(target)} · ${saved >= target ? 'goal reached 🎉' : `${$(target - saved)} to go`}</p>
              <div class="row wrap">
                <input class="grow" style="flex-basis:8em" inputmode="decimal" placeholder="Amount" aria-label="Amount for ${g.name}" data-goal-amt="${g.id}" autocomplete="off">
                <button class="btn sm primary" data-act="deposit" data-id="${g.id}">Add</button>
                <button class="btn sm" data-act="withdraw" data-id="${g.id}">Withdraw</button>
              </div>
              ${own.length ? html`
                <details><summary class="small muted" style="font-weight:500">History</summary>
                  <ul class="list">${own.slice(0, 20).map((c) => html`
                    <li class="item"><div class="body"><p class="sub">${relDate(c.made_on)}</p></div>
                      <span class="amt ${c.amount > 0 ? 'in' : 'out'}">${c.amount > 0 ? '+' : '−'}${$(Math.abs(c.amount))}</span>
                      <button class="icon-btn" data-act="delcontrib" data-id="${c.id}" aria-label="Delete entry">${raw(icon('trash'))}</button></li>`)}
                  </ul></details>` : ''}
            </div>`;
        })}</div>` : empty('No goals yet. An emergency fund is a good first one.')}
        <form data-form="addgoal" class="row wrap" style="margin-top:12px">
          <input name="name" maxlength="60" placeholder="New goal" required aria-label="Goal name" class="grow" style="flex-basis:10em">
          <input name="target" inputmode="decimal" placeholder="Target" required aria-label="Target amount" style="width:120px" autocomplete="off">
          <button class="btn">Add goal</button>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Entries</h2><span class="meta">${txns.length}</span></div>
        ${txns.length ? html`<ul class="list">${txns.map((x) => html`
          <li class="item">
            <div class="body">
              <p class="title">${catById[x.category_id]?.name || 'Uncategorised'}${x.note ? html` <span class="muted">· ${x.note}</span>` : ''}</p>
              <p class="sub">${relDate(x.occurred_on)}</p>
            </div>
            <span class="amt ${x.kind === 'income' ? 'in' : 'out'}">${x.kind === 'income' ? '+' : '−'}${$(x.amount)}</span>
            <button class="icon-btn" data-act="deltxn" data-id="${x.id}" aria-label="Delete entry">${raw(icon('trash'))}</button>
          </li>`)}</ul>` : empty(`Nothing logged in ${monthLabel(month)}.`)}
      </section>

      <section class="card">
        <details>
          <summary>Categories &amp; budgets</summary>
          <p class="small muted" style="margin-bottom:6px">Monthly budget per spending category. Leave blank for no budget.</p>
          <ul class="list">
            ${expCats.map((c) => html`
              <li class="item cat-row">
                <div class="body"><p class="title">${c.name}</p></div>
                <form data-form="budget" data-id="${c.id}" class="row">
                  <input name="budget" class="budget-in" inputmode="decimal" placeholder="No budget" value="${c.budget ? Number(c.budget) : ''}" aria-label="Monthly budget for ${c.name}" autocomplete="off">
                  <button class="btn sm">Save</button>
                </form>
                <button class="icon-btn" data-act="delcat" data-id="${c.id}" aria-label="Delete ${c.name}">${raw(icon('trash'))}</button>
              </li>`)}
            ${incCats.map((c) => html`
              <li class="item"><div class="body"><p class="title">${c.name} <span class="pill">Income</span></p></div>
                <button class="icon-btn" data-act="delcat" data-id="${c.id}" aria-label="Delete ${c.name}">${raw(icon('trash'))}</button></li>`)}
          </ul>
          <form data-form="addcat" class="form" style="margin-top:12px">
            <div class="row wrap">
              <input name="name" maxlength="40" placeholder="New category" required aria-label="Category name" class="grow" style="flex-basis:10em">
              <div class="seg" role="radiogroup" aria-label="Type">
                <label><input type="radio" name="kind" value="expense" checked><span>Spending</span></label>
                <label><input type="radio" name="kind" value="income"><span>Income</span></label>
              </div>
              <button class="btn">Add</button>
            </div>
          </form>
        </details>
      </section>
    `);

    const amountOk = (n) => n > 0 && n < 1e10;

    wire(el, {
      prevm: () => { month = shiftMonth(month, -1); ctx.rerender(); },
      nextm: () => { if (month < cur) { month = shiftMonth(month, 1); ctx.rerender(); } },
      add: async (v, form) => {
        const amount = cents(v.amount.replace(',', '.'));
        if (!amountOk(amount)) { ctx.say('Enter an amount above zero'); return; }
        const cat = catById[v.category_id];
        if (!cat) { ctx.say('Pick a category'); return; }
        const day = v.occurred_on || t;
        const firstToday = !(await ctx.store.list('transactions', { match: { occurred_on: day }, limit: 1 })).length;
        await ctx.store.insert('transactions', { kind: cat.kind, amount, category_id: cat.id, occurred_on: day, note: v.note || null });
        form.elements.amount.value = ''; form.elements.note.value = '';
        if (day.slice(0, 7) !== month) month = day.slice(0, 7) > cur ? cur : day.slice(0, 7);
        if (firstToday) await ctx.award('WLT', XP.financeDay, 'finance_day', day, `${cat.name} logged`);
        else ctx.say(`${cat.name} · ${cat.kind === 'income' ? '+' : '−'}${$(amount)}`);
        ctx.rerender();
      },
      deltxn: async (b) => {
        const x = txns.find((r) => r.id === b.dataset.id);
        if (!x || !confirm('Delete this entry?')) return;
        await ctx.store.remove('transactions', x.id);
        const left = await ctx.store.list('transactions', { match: { occurred_on: x.occurred_on }, limit: 1 });
        if (!left.length) await ctx.revoke('finance_day', x.occurred_on);
        ctx.rerender();
      },
      addgoal: async (v, form) => {
        const target = cents(v.target);
        if (!amountOk(target)) { ctx.say('Enter a target above zero'); return; }
        await ctx.store.insert('savings_goals', { name: v.name, target });
        form.reset();
        ctx.say(`Goal added: ${v.name}`);
        ctx.rerender();
      },
      deposit: async (b) => {
        const g = goals.find((x) => x.id === b.dataset.id);
        const input = el.querySelector(`[data-goal-amt="${g.id}"]`);
        const amount = cents(input.value);
        if (!amountOk(amount)) { ctx.say('Enter an amount above zero'); return; }
        const row = await ctx.store.insert('savings_contributions', { goal_id: g.id, amount, made_on: t });
        await ctx.award('WLT', XP.saving(amount), 'saving', row.id, `${$(amount)} to ${g.name}`);
        ctx.rerender();
      },
      withdraw: async (b) => {
        const g = goals.find((x) => x.id === b.dataset.id);
        const input = el.querySelector(`[data-goal-amt="${g.id}"]`);
        const amount = Math.min(cents(input.value), savedIn(g.id));
        if (!amountOk(amount)) { ctx.say(savedIn(g.id) ? 'Enter an amount above zero' : 'Nothing saved in this goal yet'); return; }
        await ctx.store.insert('savings_contributions', { goal_id: g.id, amount: -amount, made_on: t });
        ctx.say(`Withdrew ${$(amount)} from ${g.name}`);
        ctx.rerender();
      },
      delcontrib: async (b) => {
        if (!confirm('Delete this entry? Any XP it earned will be removed.')) return;
        await ctx.store.remove('savings_contributions', b.dataset.id);
        await ctx.revoke('saving', b.dataset.id);
        ctx.rerender();
      },
      delgoal: async (b) => {
        const g = goals.find((x) => x.id === b.dataset.id);
        if (!g || !confirm(`Delete "${g.name}" and its history? XP from it will be removed.`)) return;
        for (const c of contribs.filter((x) => x.goal_id === g.id)) await ctx.store.revoke('saving', c.id);
        await ctx.store.remove('savings_goals', g.id);
        await ctx.revoke('saving', '-'); // refresh totals
        ctx.rerender();
      },
      budget: async (v, form) => {
        const n = v.budget === '' ? null : cents(v.budget);
        if (n !== null && !amountOk(n)) { ctx.say('Budget must be above zero, or blank'); return; }
        await ctx.store.update('finance_categories', form.dataset.id, { budget: n });
        ctx.say(n ? `Budget set: ${$(n)} a month` : 'Budget removed');
        ctx.rerender();
      },
      addcat: async (v, form) => {
        const name = v.name.replace(/\s+/g, ' ');
        const kind = v.kind === 'income' ? 'income' : 'expense';
        if (cats.some((c) => c.kind === kind && c.name.toLowerCase() === name.toLowerCase())) { ctx.say('That category already exists'); return; }
        await ctx.store.insert('finance_categories', { name, kind });
        form.reset();
        ctx.say(`Category added: ${name}`);
        ctx.rerender();
      },
      delcat: async (b) => {
        const c = catById[b.dataset.id];
        if (!c || !confirm(`Delete "${c.name}"? Its entries are kept as Uncategorised.`)) return;
        await ctx.store.remove('finance_categories', c.id);
        ctx.rerender();
      },
    });
  },
};
