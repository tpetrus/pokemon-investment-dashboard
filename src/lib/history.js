/**
 * Pure aggregation over already-normalized snapshot holdings. No R2 access, no
 * React — `Dashboard.jsx` builds `dailyHoldings` (one `guessMapping` +
 * `normalizeRows` pass per historical sheet, see its comments for why only the
 * newest snapshot gets localStorage overrides) and hands it to these two
 * functions.
 *
 * Each snapshot is a fresh full export of the portfolio's state as of that
 * date, and sold rows persist in these exports rather than disappearing after
 * a sale (see `HoldingsTable.jsx`'s status filter and `computeMetrics()`,
 * which both treat a sold row as a permanent record, not a removed one). That
 * means `computeMetrics(snapshotHoldings)` run independently on a single
 * snapshot's own rows already yields the cumulative realized P/L as of that
 * snapshot's date — there is no running sum to build across snapshots here.
 */

import { computeMetrics, slug } from './normalize.js';

/** Product identity across snapshots: no stable SKU exists in the source data. */
export function productKey(name, set) {
  return `${slug(name)}|${slug(set)}`;
}

/**
 * @param {Array<{date: string, holdings: Array}>} dailyHoldings
 * @returns {Array<{date, costHeld, valueHeld, unrealized, roiHeld, realized, realizedRoi, positions}>}
 *   Ascending by date. A date is omitted only when its snapshot produced zero
 *   holdings rows entirely (nothing to report) — never zero-filled.
 */
export function buildPortfolioSeries(dailyHoldings) {
  return dailyHoldings
    .filter((d) => d.holdings.length > 0)
    .map(({ date, holdings }) => {
      const m = computeMetrics(holdings);
      return {
        date,
        costHeld: m.costHeld,
        valueHeld: m.valueHeld,
        unrealized: m.unrealized,
        roiHeld: m.roiHeld,
        realized: m.realized,
        realizedRoi: m.realizedRoi,
        positions: m.positions,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * @param {Array<{date: string, holdings: Array}>} dailyHoldings
 * @returns {Array<{key, name, set, points: Array<{date, unitValue, totalValue, qty}>}>}
 *   Sorted by each product's own most recent `totalValue` descending, so the
 *   largest/most current holding is first — usable directly as `<select>`
 *   options. A product with no held rows in a given snapshot (sold off, or not
 *   yet owned) simply has no point for that date.
 */
export function buildProductSeries(dailyHoldings) {
  const products = new Map();

  for (const { date, holdings } of dailyHoldings) {
    const perProduct = new Map();
    for (const h of holdings) {
      if (h.status !== 'held') continue;
      const key = productKey(h.name, h.set);
      const agg = perProduct.get(key) || { totalValue: 0, totalCost: 0, qty: 0, name: h.name, set: h.set };
      agg.totalValue += h.totalValue || 0;
      agg.totalCost += h.totalCost || 0;
      agg.qty += h.qty || 0;
      perProduct.set(key, agg);
    }

    for (const [key, agg] of perProduct) {
      let entry = products.get(key);
      if (!entry) {
        entry = { key, name: agg.name, set: agg.set, points: [] };
        products.set(key, entry);
      }
      entry.points.push({
        date,
        totalValue: agg.totalValue,
        qty: agg.qty,
        unitValue: agg.qty > 0 ? agg.totalValue / agg.qty : null,
      });
    }
  }

  const list = [...products.values()];
  for (const p of list) {
    p.points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  list.sort((a, b) => (b.points.at(-1)?.totalValue ?? 0) - (a.points.at(-1)?.totalValue ?? 0));
  return list;
}
