// Subscriptions: next renewal date rolls forward on its own, so nothing needs ticking.
export const EVERY = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' };
const PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
export const perMonth = (s) => Number(s.amount) * (PER_MONTH[s.every] || 1);
function step(k, every, n) {
  const [y, m, d] = k.split('-').map(Number);
  if (every === 'weekly') { const dt = new Date(y, m - 1, d + 7 * n); return key(dt); }
  const months = every === 'yearly' ? 12 * n : every === 'quarterly' ? 3 * n : n;
  const last = new Date(y, m - 1 + months + 1, 0).getDate();
  return key(new Date(y, m - 1 + months, Math.min(d, last)));
}
const key = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
// Next renewal on or after `from`.
export function nextRenewal(s, from) {
  if (s.next_on >= from) return s.next_on;
  for (let n = 1; n < 1000; n += 1) { const k = step(s.next_on, s.every, n); if (k >= from) return k; }
  return from;
}
// All renewal dates between from and to (for the Calendar).
export function renewalsBetween(s, from, to) {
  const out = [];
  for (let k = nextRenewal(s, from), n = 0; k <= to && n < 60; n += 1) { out.push(k); k = step(k, s.every, 1); }
  return out;
}
