/**
 * Return math that turns the History tab from "here is your value" into "here is
 * your return". Two views, deliberately separate:
 *
 *  - `buildReturnSeries` chains a **time-weighted return** (TWR) across the
 *    snapshot history. TWR removes the effect of *when* money went in or out, so
 *    the index measures how the collection itself performed. It is approximate
 *    here: between two snapshots we only see the net change in position state,
 *    not the individual buys and sells, so `netFlow` is inferred from the change
 *    in cost basis and cumulative proceeds (both carried on `portfolioSeries`).
 *
 *  - `xirr` solves the **money-weighted return** from a single snapshot's dated
 *    cash flows (every lot's purchase, every sale, plus today's held value as a
 *    terminal inflow). This one reflects your timing. It is exact only where the
 *    sheet actually carries `purchaseDate` / `soldDate`.
 *
 * Pure. No React, no I/O. `Dashboard.jsx` assembles the inputs.
 */

const MS_PER_DAY = 86400000;
const DAYS_PER_YEAR = 365;

/** Noon UTC, matching the rest of the app's ISO-date handling. */
const toTime = (iso) => Date.parse(`${iso}T12:00:00Z`);

/** Fractional years between two ISO dates, or null if either is unparseable. */
export function yearsBetween(startIso, endIso) {
  const a = toTime(startIso);
  const b = toTime(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return (b - a) / (DAYS_PER_YEAR * MS_PER_DAY);
}

/** Compound annual growth rate from a start value to an end value over `years`. */
export function cagr(startValue, endValue, years) {
  if (!(startValue > 0) || !(endValue > 0) || !(years > 0)) return null;
  return endValue / startValue >= 0 ? Math.pow(endValue / startValue, 1 / years) - 1 : null;
}

/**
 * Chained time-weighted return index, base 100 at the first snapshot.
 *
 * For each consecutive pair the external cash flow over the interval is
 *   buys  = ΔcostHeld + ΔcostSold      (cost basis added, minus basis that left via a sale)
 *   sales = Δproceeds                  (gross cash taken out)
 *   netFlow = buys − sales
 * and the sub-period growth factor is (valueHeld_t − netFlow) / valueHeld_{t−1},
 * i.e. contributions/withdrawals are treated as happening at period end.
 *
 * @param {Array<{date, valueHeld, costHeld, costSold, proceeds}>} portfolioSeries ascending by date
 * @returns {Array<{date, index, periodReturn}>} `[]` if fewer than two usable points
 */
export function buildReturnSeries(portfolioSeries) {
  const pts = (portfolioSeries || []).filter((p) => Number.isFinite(p.valueHeld));
  if (pts.length < 2) return [];

  const out = [{ date: pts[0].date, index: 100, periodReturn: null }];
  let index = 100;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const buys = (b.costHeld - a.costHeld) + ((b.costSold ?? 0) - (a.costSold ?? 0));
    const sales = (b.proceeds ?? 0) - (a.proceeds ?? 0);
    const netFlow = buys - sales;

    let periodReturn = null;
    if (a.valueHeld > 0) {
      const factor = (b.valueHeld - netFlow) / a.valueHeld;
      if (Number.isFinite(factor) && factor > 0) {
        periodReturn = factor - 1;
        index *= factor;
      }
    }
    out.push({ date: b.date, index, periodReturn });
  }
  return out;
}

/**
 * Running decline from the highest prior value of the return index, as a
 * non-positive fraction (−0.12 = 12% below the earlier peak). Built on the TWR
 * index rather than raw market value, so buying more never registers as a loss.
 *
 * @param {Array<{date, index}>} returnSeries output of `buildReturnSeries`
 * @returns {Array<{date, drawdown}>}
 */
export function buildDrawdownSeries(returnSeries) {
  let peak = -Infinity;
  return (returnSeries || []).map((p) => {
    if (p.index > peak) peak = p.index;
    return { date: p.date, drawdown: peak > 0 ? p.index / peak - 1 : 0 };
  });
}

/** Largest single drawdown in the series (a non-positive number), or null. */
export function maxDrawdown(drawdownSeries) {
  const vals = (drawdownSeries || []).map((p) => p.drawdown).filter(Number.isFinite);
  return vals.length ? Math.min(...vals) : null;
}

/**
 * Internal rate of return for an irregular dated cash-flow vector, annualized.
 * Outflows (money you put in) are negative, inflows positive. Newton's method
 * from a sensible guess, then a bracketed bisection fallback; returns null rather
 * than a misleading number when it cannot converge or the flows are degenerate
 * (all one sign, fewer than two dates).
 *
 * @param {Array<{date: string, amount: number}>} flows
 * @returns {number|null} annualized rate, e.g. 0.18 for +18%/yr
 */
export function xirr(flows, guess = 0.1) {
  const cf = (flows || [])
    .map((f) => ({ t: toTime(f.date), amount: Number(f.amount) }))
    .filter((f) => Number.isFinite(f.t) && Number.isFinite(f.amount) && f.amount !== 0)
    .sort((a, b) => a.t - b.t);

  if (cf.length < 2) return null;
  if (!cf.some((f) => f.amount < 0) || !cf.some((f) => f.amount > 0)) return null;

  const t0 = cf[0].t;
  const yf = (t) => (t - t0) / (DAYS_PER_YEAR * MS_PER_DAY);
  const npv = (rate) => cf.reduce((acc, f) => acc + f.amount / (1 + rate) ** yf(f.t), 0);
  const dNpv = (rate) =>
    cf.reduce((acc, f) => acc - (yf(f.t) * f.amount) / (1 + rate) ** (yf(f.t) + 1), 0);

  const ok = (r) => (Number.isFinite(r) && r > -0.9999 && r < 1e6 ? r : null);

  let rate = guess;
  for (let i = 0; i < 80; i++) {
    const v = npv(rate);
    const d = dNpv(rate);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = rate - v / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - rate) < 1e-7) return ok(next);
    rate = next;
  }

  // Bisection over a wide bracket if Newton wandered off.
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid);
    if (!Number.isFinite(fmid)) return null;
    if (Math.abs(fmid) < 1e-7 || (hi - lo) / 2 < 1e-8) return ok(mid);
    if (flo * fmid < 0) { hi = mid; fhi = fmid; } else { lo = mid; flo = fmid; }
  }
  return null;
}

/**
 * Cash-flow vector for `xirr` from one snapshot's normalized holdings: a negative
 * flow at each lot's purchase date, a positive flow at each sale, and one
 * positive terminal flow today for everything still held.
 */
export function cashflowsFromHoldings(holdings, asOf = new Date().toISOString().slice(0, 10)) {
  const flows = [];
  let terminal = 0;
  for (const h of holdings || []) {
    if (h.purchaseDate && h.totalCost > 0) flows.push({ date: h.purchaseDate, amount: -h.totalCost });
    if (h.status === 'sold') {
      if (h.soldDate && h.totalValue) flows.push({ date: h.soldDate, amount: h.totalValue });
    } else {
      terminal += h.totalValue || 0;
    }
  }
  if (terminal > 0) flows.push({ date: asOf, amount: terminal });
  return flows;
}
