/**
 * Schema-flexible normalizer.
 *
 * Your spreadsheets almost certainly do not use the exact column names below, so
 * every field is matched by synonym first and can be overridden by hand in the UI
 * (Data > Column mapping). Nothing here assumes a fixed layout.
 */

export const FIELDS = [
  { key: 'name', label: 'Product', required: true, kind: 'text' },
  { key: 'set', label: 'Set / expansion', kind: 'text' },
  { key: 'productType', label: 'Product type', kind: 'text', hint: 'Left empty, the format is read from the product name' },
  { key: 'qty', label: 'Quantity', kind: 'number' },
  { key: 'unitCost', label: 'Cost per unit', kind: 'money' },
  { key: 'totalCost', label: 'Total cost', kind: 'money' },
  { key: 'unitValue', label: 'Market value per unit', kind: 'money' },
  { key: 'totalValue', label: 'Total market value', kind: 'money' },
  { key: 'priceOverride', label: 'Price override per unit', kind: 'money' },
  { key: 'purchaseDate', label: 'Purchase date', kind: 'date' },
  { key: 'releaseDate', label: 'Set release date', kind: 'date' },
  { key: 'soldDate', label: 'Sold date', kind: 'date' },
  { key: 'soldPrice', label: 'Sold price (gross)', kind: 'money' },
  { key: 'soldQty', label: 'Quantity sold', kind: 'number' },
  { key: 'vendor', label: 'Bought from', kind: 'text' },
  { key: 'storage', label: 'Storage / location', kind: 'text' },
  { key: 'notes', label: 'Notes', kind: 'text' },
];

const SYNONYMS = {
  name: ['productname', 'itemname', 'cardname', 'product', 'item', 'name', 'description', 'title', 'card', 'listing'],
  set: ['set', 'expansion', 'series', 'setname', 'era'],
  productType: ['type', 'producttype', 'category', 'format', 'sealedtype', 'itemtype'],
  qty: ['qty', 'quantity', 'count', 'units', 'amount', 'numowned', 'owned', 'quantityowned'],
  unitCost: ['costperunit', 'unitcost', 'pricepaid', 'purchaseprice', 'buyprice', 'costeach', 'paid', 'costbasisperunit', 'perunitcost', 'cost'],
  totalCost: ['totalcost', 'costbasis', 'totalpaid', 'totalinvested', 'investment', 'totalspent', 'basis'],
  unitValue: ['marketvalue', 'marketprice', 'currentvalue', 'currentprice', 'value', 'price', 'lastsold', 'tcgmarket', 'marketpereach', 'valueeach', 'valueperunit', 'currentmarket'],
  priceOverride: ['priceoverride', 'overrideprice', 'customprice', 'manualprice'],
  totalValue: ['totalvalue', 'totalmarketvalue', 'currenttotal', 'totalworth', 'portfoliovalue', 'totalmarket'],
  purchaseDate: ['purchasedate', 'datepurchased', 'buydate', 'dateacquired', 'acquired', 'orderdate', 'date'],
  releaseDate: ['releasedate', 'setrelease', 'released', 'streetdate'],
  soldDate: ['solddate', 'datesold', 'saledate', 'exitdate'],
  soldPrice: ['soldprice', 'saleprice', 'soldfor', 'salesprice', 'grossproceeds', 'soldtotal', 'exitprice'],
  soldQty: ['qtysold', 'quantitysold', 'unitssold', 'numbersold'],
  vendor: ['vendor', 'boughtfrom', 'source', 'retailer', 'seller', 'store', 'marketplace', 'platform', 'purchasedfrom'],
  storage: ['storage', 'location', 'stored', 'unit', 'shelf', 'bin', 'where'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
};

export const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Columns holding the same value in every row (an export's "Portfolio Name", a
 * "Category" that is Pokemon all the way down) carry no information, so they are
 * held back from the text fields until nothing better is available.
 */
function informativeHeaders(headers, rows) {
  const keep = new Set();
  for (const h of headers) {
    const seen = new Set();
    for (const r of rows) {
      const v = String(r[h] ?? '').trim();
      if (v) seen.add(v);
      if (seen.size > 1) break;
    }
    if (seen.size > 1) keep.add(h);
  }
  return keep;
}

const VARIED_ONLY = new Set(['name', 'set', 'productType', 'vendor', 'storage', 'notes']);
// Reading the format off the product name beats a column that says the same thing
// on every row, so product type never falls back to a constant column.
const NEVER_CONSTANT = new Set(['productType']);

/** Best-guess header -> field mapping. Exact synonym match wins over partial. */
export function guessMapping(headers, rows = []) {
  const map = {};
  const taken = new Set();
  const slugged = headers.map((h) => ({ raw: h, s: slug(h) }));
  const varied = rows.length ? informativeHeaders(headers, rows) : null;

  for (const pass of ['exact', 'partial', 'exact-any', 'partial-any']) {
    const strict = varied && !pass.endsWith('-any');
    const exact = pass.startsWith('exact');
    for (const [field, words] of Object.entries(SYNONYMS)) {
      if (map[field]) continue;
      for (const { raw, s } of slugged) {
        if (!s || taken.has(raw)) continue;
        const needsVariety = strict ? VARIED_ONLY.has(field) : NEVER_CONSTANT.has(field);
        if (varied && needsVariety && !varied.has(raw)) continue;
        const hit = exact
          ? words.includes(s)
          : words.some((w) => w.length > 3 && (s.includes(w) || w.includes(s)));
        if (hit) {
          map[field] = raw;
          taken.add(raw);
          break;
        }
      }
    }
  }
  return map;
}

/**
 * Sealed exports rarely carry a product-type column — the format is buried in the
 * product name. Most specific pattern wins, so "Ultra-Premium Collection" is not
 * swallowed by "Collection" and "Enhanced Booster Box" lands with booster boxes.
 */
const TYPE_PATTERNS = [
  [/\bcases?\b/i, 'Booster case'],
  [/ultra[-\s]?premium collection/i, 'Ultra-premium collection'],
  [/premium (figure |)collection/i, 'Premium collection'],
  [/(elite trainer box|\betb\b|trainer box)/i, 'Elite trainer box'],
  [/booster box/i, 'Booster box'],
  [/(booster bundle|art bundle|\bbundle\b)/i, 'Booster bundle'],
  [/blister/i, 'Blister'],
  [/\btins?\b/i, 'Tin'],
  [/(sleeved booster|booster pack|\bpacks?\b)/i, 'Booster pack'],
  [/binder/i, 'Binder collection'],
  [/(illustration collection|special collection|sticker collection|poster collection|\bcollection\b)/i, 'Collection'],
  [/\bbox\b/i, 'Box set'],
];

export function inferProductType(name) {
  const base = String(name || '').replace(/\[[^\]]*\]/g, ' ');
  for (const [re, label] of TYPE_PATTERNS) if (re.test(base)) return label;
  return 'Other';
}

/** Pull the snapshot date out of a header like "Market Price (As of 2026-02-01)". */
export function snapshotDateFrom(header) {
  const m = String(header || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function parseNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[^0-9.\-]/g, '');
  if (!s || s === '-' || s === '.') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    return new Date(EXCEL_EPOCH + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (us) {
    let [, m, d, y] = us;
    if (y.length === 2) y = String(2000 + Number(y));
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

const daysBetween = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));

/** Turn raw sheet rows into typed holdings with derived P/L fields. */
export function normalizeRows(rows, mapping, sourceLabel = '') {
  const today = new Date().toISOString().slice(0, 10);
  const out = [];

  // If the mapped type column says the same thing on every row, it is a label for
  // the whole export rather than a product type — read the type off the name instead.
  const typeHeader = mapping.productType;
  let typeUsable = false;
  if (typeHeader) {
    const seen = new Set();
    for (const r of rows) {
      const v = String(r[typeHeader] ?? '').trim();
      if (v) seen.add(v);
      if (seen.size > 1) { typeUsable = true; break; }
    }
  }

  rows.forEach((row, i) => {
    const get = (field) => (mapping[field] ? row[mapping[field]] : undefined);

    const name = String(get('name') ?? '').trim();
    const qty = parseNumber(get('qty')) ?? 1;
    const unitCost = parseNumber(get('unitCost'));
    let totalCost = parseNumber(get('totalCost'));
    const unitValue = parseNumber(get('unitValue'));
    let totalValue = parseNumber(get('totalValue'));
    const soldPrice = parseNumber(get('soldPrice'));
    const override = parseNumber(get('priceOverride'));
    const soldQty = parseNumber(get('soldQty'));
    const purchaseDate = parseDate(get('purchaseDate'));
    const soldDate = parseDate(get('soldDate'));

    const effectiveUnitValue = override != null && override > 0 ? override : unitValue;
    if (totalCost == null && unitCost != null) totalCost = unitCost * qty;
    if (totalValue == null && effectiveUnitValue != null) totalValue = effectiveUnitValue * qty;

    // A row with no identity and no money in it is spreadsheet padding, not a position.
    if (!name && totalCost == null && totalValue == null) return;

    const status = soldDate || soldPrice != null ? 'sold' : 'held';
    const heldDays = purchaseDate ? daysBetween(purchaseDate, soldDate || today) : null;

    const marketValue = status === 'sold' ? (soldPrice ?? totalValue ?? 0) : (totalValue ?? totalCost ?? 0);
    const cost = totalCost ?? 0;
    const gain = marketValue - cost;
    const roi = cost > 0 ? gain / cost : null;
    const annualized =
      roi != null && heldDays && heldDays > 30 && cost > 0 && marketValue > 0
        ? Math.pow(marketValue / cost, 365 / heldDays) - 1
        : null;

    out.push({
      id: `${sourceLabel}:${i}`,
      source: sourceLabel,
      name: name || '(unnamed row)',
      set: String(get('set') ?? '').trim() || 'Unassigned',
      productType: (typeUsable ? String(get('productType') ?? '').trim() : '') || inferProductType(name),
      vendor: String(get('vendor') ?? '').trim() || null,
      storage: String(get('storage') ?? '').trim() || null,
      notes: String(get('notes') ?? '').trim() || null,
      qty,
      soldQty,
      unitCost: unitCost ?? (totalCost != null && qty ? totalCost / qty : null),
      unitValue: effectiveUnitValue ?? (totalValue != null && qty ? totalValue / qty : null),
      totalCost: cost,
      totalValue: marketValue,
      purchaseDate,
      releaseDate: parseDate(get('releaseDate')),
      soldDate,
      soldPrice,
      status,
      heldDays,
      gain,
      roi,
      annualized,
      raw: row,
    });
  });

  return out;
}

const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);

export function computeMetrics(holdings) {
  const held = holdings.filter((h) => h.status === 'held');
  const sold = holdings.filter((h) => h.status === 'sold');

  const costHeld = sum(held, (h) => h.totalCost);
  const valueHeld = sum(held, (h) => h.totalValue);
  const costSold = sum(sold, (h) => h.totalCost);
  const proceeds = sum(sold, (h) => h.totalValue);

  // A $5 pack that doubled outranks every real position on percentage alone, so
  // rank only positions carrying enough of the basis to matter.
  const withRoi = held.filter((h) => h.roi != null && h.totalCost > 0);
  const floor = Math.max(25, costHeld * 0.005);
  const material = withRoi.filter((h) => h.totalCost >= floor);
  const pool = material.length >= 5 ? material : withRoi;
  const ranked = [...pool].sort((a, b) => b.roi - a.roi);

  const dated = held.filter((h) => h.purchaseDate).sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
  let running = 0;
  const capitalDeployed = dated.map((h) => {
    running += h.totalCost;
    return { date: h.purchaseDate, costBasis: Math.round(running), name: h.name };
  });

  const weightedDays = costHeld > 0
    ? sum(held.filter((h) => h.heldDays != null), (h) => h.heldDays * h.totalCost) /
      Math.max(1, sum(held.filter((h) => h.heldDays != null), (h) => h.totalCost))
    : null;

  return {
    positions: held.length,
    units: sum(held, (h) => h.qty),
    costHeld,
    valueHeld,
    unrealized: valueHeld - costHeld,
    roiHeld: costHeld > 0 ? (valueHeld - costHeld) / costHeld : null,
    realized: proceeds - costSold,
    realizedRoi: costSold > 0 ? (proceeds - costSold) / costSold : null,
    soldCount: sold.length,
    best: ranked[0] ?? null,
    worst: ranked[ranked.length - 1] ?? null,
    avgHoldDays: weightedDays ? Math.round(weightedDays) : null,
    ranked,
    materialFloor: material.length >= 5 ? floor : null,
    capitalDeployed,
    groupBy: (key) => groupBy(held, key),
    held,
    sold,
  };
}

export function groupBy(holdings, key) {
  const map = new Map();
  for (const h of holdings) {
    const k = h[key] || 'Unassigned';
    const g = map.get(k) || { key: k, cost: 0, value: 0, units: 0, count: 0 };
    g.cost += h.totalCost || 0;
    g.value += h.totalValue || 0;
    g.units += h.qty || 0;
    g.count += 1;
    map.set(k, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, gain: g.value - g.cost, roi: g.cost > 0 ? (g.value - g.cost) / g.cost : null }))
    .sort((a, b) => b.value - a.value);
}

/** Data-quality checks, so silent gaps in the sheet do not become silently wrong numbers. */
export function auditRows(holdings) {
  const issues = [];
  const push = (label, rows) => rows.length && issues.push({ label, count: rows.length, rows: rows.slice(0, 8) });

  push('No cost recorded', holdings.filter((h) => !h.totalCost));
  push('No market value recorded', holdings.filter((h) => h.status === 'held' && !h.totalValue));
  push('No purchase date', holdings.filter((h) => !h.purchaseDate));
  push('No set assigned', holdings.filter((h) => h.set === 'Unassigned'));
  push('Value more than 10x cost — check for a typo', holdings.filter((h) => h.totalCost > 0 && h.totalValue / h.totalCost > 10));
  return issues;
}
