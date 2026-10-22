// Magic: The Gathering helpers — decklist parsing and Scryfall lookups.
// Accepts what Moxfield, Archidekt, MTGA, MTGO and plain text exports produce:
//   1 Sol Ring            1x Sol Ring           1 Sol Ring (CMM) 410 *F*
//   Commander / Deck / Sideboard / Maybeboard headers, "// comments", blank lines.

const HEADERS = [
  [/^(commanders?|command zone)\b/i, 'commander'],
  [/^(companion)\b/i, 'commander'],
  [/^(deck|main|mainboard|main deck|library)\b/i, 'main'],
  [/^(sideboard|side)\b/i, 'side'],
  [/^(maybeboard|maybe|considering)\b/i, 'maybe'],
];

export function parseDecklist(text, format = '') {
  const cards = [];
  let section = 'main', headed = false, group = 0;
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim();
    if (!line) { group += 1; continue; }
    const bare = line.replace(/^(\/\/|#)\s*/, '');
    const head = HEADERS.find(([re]) => re.test(bare)) && /^[a-z ]+:?\s*(\(\d+\))?$/i.test(bare) ? HEADERS.find(([re]) => re.test(bare)) : null;
    if (head) { section = head[1]; headed = true; continue; }
    if (/^(\/\/|#)/.test(line)) continue;
    const m = line.match(/^(SB:\s*)?(\d+)\s*x?\s+(.+)$/i);
    if (!m) continue;
    const foil = /\*(F|E|FOIL|ETCHED)\*\s*$/i.test(m[3]);
    const pr = m[3].replace(/\s+\*[A-Z]+\*\s*$/i, '').replace(/\s+\[[^\]]*\]\s*$/, '').match(/\s\(([A-Z0-9]{2,6})\)(?:\s+([\w\u2605-]+))?\s*$/i);
    const name = m[3]
      .replace(/\s+\*[A-Z]+\*\s*$/i, '')                 // *F* foil markers
      .replace(/\s+\[[^\]]*\]\s*$/, '')                  // [Category] tags (Archidekt)
      .replace(/\s+\([A-Z0-9]{2,6}\)(\s+[\w\u2605-]+)?\s*$/i, '') // (SET) 123
      .trim();
    if (!name) continue;
    cards.push({ qty: Math.min(250, parseInt(m[2], 10) || 1), name, section: m[1] ? 'side' : section, group, foil, set: pr ? pr[1].toLowerCase() : null, num: pr?.[2] || null });
  }
  // No headers, and a short block after a blank line at the end: that's the sideboard (MTGA / MTGO style).
  const groups = [...new Set(cards.map((c) => c.group))];
  if (!headed && groups.length > 1) {
    const last = cards.filter((c) => c.group === groups.at(-1) && c.section === 'main');
    const n = last.reduce((a, c) => a + c.qty, 0);
    if (n <= 15 && cards.length - last.length > last.length) {
      // Commander exports put the commander(s) last, on their own.
      const to = format === 'commander' && n <= 2 ? 'commander' : 'side';
      for (const c of last) c.section = to;
    }
  }
  const merged = [];
  for (const c of cards) {
    const prev = merged.find((x) => x.section === c.section && x.name.toLowerCase() === c.name.toLowerCase());
    if (prev) prev.qty += c.qty; else merged.push({ qty: c.qty, name: c.name, section: c.section, foil: c.foil, set: c.set, num: c.num });
  }
  const count = (s) => merged.filter((c) => c.section === s).reduce((n, c) => n + c.qty, 0);
  return { cards: merged, main: count('main'), commander: count('commander'), side: count('side'), maybe: count('maybe') };
}

const API = 'https://api.scryfall.com';
const front = (name) => name.split(' // ')[0];
const artOf = (c) => c?.image_uris?.art_crop || c?.card_faces?.[0]?.image_uris?.art_crop || null;

// Look up one card by (fuzzy) name: used for a deck's commander.
export async function lookupCard(name) {
  const r = await fetch(`${API}/cards/named?fuzzy=${encodeURIComponent(name)}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  const c = await r.json();
  return { name: c.name, colors: colorString(c.color_identity), art: artOf(c), type: c.type_line };
}

export const colorString = (arr) => 'WUBRG'.split('').filter((x) => (arr || []).includes(x)).join('');

// Analyse a parsed list: mana curve, card types, colour identity, prices.
// Cards with a set and number ("(CMM) 410") are priced as that printing; others by name.
const memo = new Map();
export const cardKey = (c) => `${c.set && c.num ? `${c.set}|${c.num}` : ''}|${front(c.name).toLowerCase()}`;
export function priceOf(card, foil) {
  const p = card?.prices || {};
  const n = (v) => (v == null || v === '' ? null : Number(v));
  return foil ? n(p.usd_foil) ?? n(p.usd_etched) ?? n(p.usd) : n(p.usd) ?? n(p.usd_foil) ?? n(p.usd_etched);
}
async function collection(ids) {
  const r = await fetch(`${API}/cards/collection`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identifiers: ids }),
  });
  if (!r.ok) throw new Error('Scryfall didn’t answer. Try again in a moment.');
  return r.json();
}
export async function analyse(parsed) {
  const wanted = parsed.cards;
  const key = wanted.map(cardKey).sort().join('~');
  if (memo.has(key)) return memo.get(key);
  const byPrint = new Map(); const byName = new Map();
  const prints = [...new Map(wanted.filter((c) => c.set && c.num).map((c) => [`${c.set}|${c.num}`, { set: c.set, collector_number: c.num }])).values()];
  for (let i = 0; i < prints.length; i += 75) {
    const j = await collection(prints.slice(i, i + 75));
    for (const c of j.data || []) byPrint.set(`${c.set}|${c.collector_number}`.toLowerCase(), c);
    await new Promise((res) => setTimeout(res, 120)); // be polite
  }
  const names = [...new Set(wanted.filter((c) => !(c.set && c.num && byPrint.has(`${c.set}|${c.num}`.toLowerCase()))).map((c) => front(c.name)))];
  const missing = [];
  for (let i = 0; i < names.length; i += 75) {
    const j = await collection(names.slice(i, i + 75).map((name) => ({ name })));
    for (const c of j.data || []) byName.set(front(c.name).toLowerCase(), c);
    for (const nf of j.not_found || []) missing.push(nf.name);
    if (i + 75 < names.length) await new Promise((res) => setTimeout(res, 120));
  }
  const cardFor = (c) => (c.set && c.num && byPrint.get(`${c.set}|${c.num}`.toLowerCase())) || byName.get(front(c.name).toLowerCase()) || null;
  const prices = {};
  for (const c of wanted) { const p = priceOf(cardFor(c), c.foil); prices[cardKey(c)] = p; }
  const TYPES = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Battle', 'Land'];
  const curve = Array(8).fill(0);
  const types = Object.fromEntries(TYPES.map((t) => [t, 0]));
  const identity = new Set();
  let price = 0, lands = 0, spells = 0, cmcSum = 0;
  for (const c of parsed.cards) {
    if (c.section === 'maybe' || c.section === 'side') continue;
    const card = cardFor(c);
    if (!card) continue;
    for (const x of card.color_identity || []) identity.add(x);
    price += (prices[cardKey(c)] || 0) * c.qty;
    const tl = card.type_line || card.card_faces?.[0]?.type_line || '';
    const t = TYPES.find((x) => tl.split(' // ')[0].includes(x));
    if (t) types[t] += c.qty;
    if (/\bLand\b/.test(tl.split(' // ')[0])) { lands += c.qty; continue; }
    spells += c.qty;
    cmcSum += (card.cmc || 0) * c.qty;
    curve[Math.min(7, Math.floor(card.cmc || 0))] += c.qty;
  }
  const total = (sec) => wanted.filter((c) => c.section === sec).reduce((n, c) => n + (prices[cardKey(c)] || 0) * c.qty, 0);
  const totals = { commander: total('commander'), main: total('main'), side: total('side'), maybe: total('maybe') };
  const unpriced = wanted.filter((c) => c.section !== 'maybe' && prices[cardKey(c)] == null && cardFor(c)).length;
  const out = { curve, types, lands, spells, avg: spells ? cmcSum / spells : 0, price, prices, totals, unpriced, colors: colorString([...identity]), missing };
  memo.set(key, out);
  return out;
}
