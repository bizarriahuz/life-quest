// Small SQL builders shared by the data API. Column names always come from schema.js, never from the request.
import { COLS, out } from './schema.js';
import { fail } from './util.js';

export const col = (table, k) => { if (!COLS[table][k]) fail(`Unknown field: ${k}`); return k; };
// Values in filters: booleans become 0/1, everything else is compared as given.
export const cond = (table, k, v) => (COLS[table][col(table, k)].type === 'bool' ? (v ? 1 : 0) : v);

// WHERE parts for the list options the app uses: match {k: v}, gte [k, v], lte [k, v]
export function filters(table, o = {}) {
  const w = [], args = [];
  for (const [k, v] of Object.entries(o.match || {})) {
    if (v === null) w.push(`${col(table, k)} is null`);
    else { w.push(`${col(table, k)} = ?`); args.push(cond(table, k, v)); }
  }
  if (o.gte) { w.push(`${col(table, o.gte[0])} >= ?`); args.push(cond(table, o.gte[0], o.gte[1])); }
  if (o.lte) { w.push(`${col(table, o.lte[0])} <= ?`); args.push(cond(table, o.lte[0], o.lte[1])); }
  return { w, args };
}
export function tail(table, o = {}) {
  let s = '';
  // Postgres puts nulls last when ascending and first when descending; SQLite does the opposite, so say it.
  if (o.order) s += ` order by ${col(table, o.order)} ${o.asc ? 'asc nulls last' : 'desc nulls first'}`;
  const lim = Math.min(Math.max(parseInt(o.limit, 10) || 0, 0), 5000);
  const off = Math.max(parseInt(o.offset, 10) || 0, 0);
  if (lim) s += ` limit ${lim}`; else if (off) s += ' limit -1';
  if (off) s += ` offset ${off}`;
  return s;
}

export async function rows(db, table, sql, ...args) {
  const r = await db.prepare(sql).bind(...args).all();
  return r.results.map((x) => out(table, x));
}
export async function one(db, table, sql, ...args) {
  return out(table, await db.prepare(sql).bind(...args).first());
}
export function insertSql(table, row) {
  const keys = Object.keys(row);
  return { sql: `insert into ${table}(${keys.join(', ')}) values (${keys.map(() => '?').join(', ')}) returning *`, args: keys.map((k) => row[k]) };
}
export function setSql(patch) {
  const keys = Object.keys(patch);
  return { set: keys.map((k) => `${k} = ?`).join(', '), args: keys.map((k) => patch[k]) };
}
