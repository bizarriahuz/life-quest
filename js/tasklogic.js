// Shared task behaviour (Tasks, Goals and Home all tick tasks the same way).
// A repeating task, once done, makes its next copy with the next due date.
import { today, dateKey, fmtDate } from './ui.js';
import { XP } from './game.js';

export const REPEATS = { daily: 'Every day', weekly: 'Every week', fortnightly: 'Every 2 weeks', monthly: 'Every month', yearly: 'Every year' };
export const REPEAT_SHORT = { daily: 'daily', weekly: 'weekly', fortnightly: 'every 2 weeks', monthly: 'monthly', yearly: 'yearly' };

function step(key, repeat, n) {
  const [y, m, d] = key.split('-').map(Number);
  if (repeat === 'daily') return dateKey(new Date(y, m - 1, d + n));
  if (repeat === 'weekly') return dateKey(new Date(y, m - 1, d + 7 * n));
  if (repeat === 'fortnightly') return dateKey(new Date(y, m - 1, d + 14 * n));
  const months = repeat === 'yearly' ? 12 * n : n;
  const last = new Date(y, m - 1 + months + 1, 0).getDate();          // stay on the 31st → 30th/28th in short months
  return dateKey(new Date(y, m - 1 + months, Math.min(d, last)));
}

// Next due date after `from` (normally today), counted on from the task's own due date.
export function nextDue(due, repeat, from = today()) {
  const base = due || from;
  for (let n = 1; n < 2000; n += 1) {
    const k = step(base, repeat, n);
    if (k > from) return k;
  }
  return step(from, repeat, 1);
}

// Tick or untick one task. Returns nothing; caller re-renders.
export async function toggleTask(ctx, q) {
  const t = today();
  if (q.kind === 'daily') {
    const sid = `${q.id}:${t}`;
    if (q.done_on === t) {
      await ctx.store.update('tasks', q.id, { done_on: null });
      await ctx.revoke('task', sid);
    } else {
      await ctx.store.update('tasks', q.id, { done_on: t });
      await ctx.award('DEX', XP.task.daily, 'task', sid, q.title);
    }
    return;
  }
  if (q.done) {
    await ctx.store.update('tasks', q.id, { done: false, done_on: null });
    await ctx.revoke('task', q.id);
    if (q.repeat) {                                                    // take back the copy it made
      const next = nextDue(q.due_on, q.repeat, q.done_on || t);
      const open = await ctx.store.list('tasks', { match: { done: false } });
      const copy = open.find((x) => x.id !== q.id && x.title === q.title && x.repeat === q.repeat && x.due_on === next);
      if (copy) await ctx.store.remove('tasks', copy.id);
    }
    return;
  }
  await ctx.store.update('tasks', q.id, { done: true, done_on: t });
  let label = q.title;
  if (q.repeat) {
    const next = nextDue(q.due_on, q.repeat, t);
    await ctx.store.insert('tasks', { title: q.title, kind: q.kind, due_on: next, repeat: q.repeat, goal_id: q.goal_id || null });
    label = `${q.title} · next ${fmtDate(next, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  }
  await ctx.award('DEX', XP.task[q.kind], 'task', q.id, label);
}
