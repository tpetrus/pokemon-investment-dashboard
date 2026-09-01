import React, { useMemo, useState } from 'react';
import { Card, Empty, InfoBtn } from './ui.jsx';
import {
  PortfolioHistoryChart, UnrealizedHistoryChart, ProductHistoryChart,
  ReturnHistoryChart, DrawdownChart,
} from './Charts.jsx';
import { money, count, pct, shortDate } from '../lib/format.js';
import { cagr, yearsBetween, maxDrawdown } from '../lib/returns.js';
import SetIcon from './SetIcon.jsx';

/** Small labelled figure, matching the `.well` blocks on the Overview tab. */
function Stat({ label, value, foot, info }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="well">
      <div className="kpi__label">
        <span>{label}</span>
        {info && <InfoBtn open={open} onToggle={() => setOpen((v) => !v)} label={label} />}
      </div>
      {info && open && <div className="infobox" role="note">{info}</div>}
      <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>{value}</div>
      {foot && <div className="kpi__foot">{foot}</div>}
    </div>
  );
}

/**
 * Parallel in structure to DataPanel.jsx: a Card per concern, the same
 * .table-scroll/.table--sticky table pattern for the status list, and a plain
 * <select> for the product picker (not a new autocomplete dependency).
 */
export default function HistoryPanel({ portfolioSeries, productSeries, returnSeries = [], drawdownSeries = [], snapshots, skipped }) {
  const [productKey, setProductKey] = useState(productSeries[0]?.key ?? '');
  const selected = productSeries.find((p) => p.key === productKey) ?? productSeries[0] ?? null;

  const returnStats = useMemo(() => {
    if (returnSeries.length < 2) return null;
    const first = returnSeries[0];
    const last = returnSeries.at(-1);
    const years = yearsBetween(first.date, last.date);
    return {
      cumulative: last.index / 100 - 1,
      annualized: years && years >= 1 ? cagr(100, last.index, years) : null,
      years,
      maxDd: maxDrawdown(drawdownSeries),
      currentDd: drawdownSeries.at(-1)?.drawdown ?? null,
    };
  }, [returnSeries, drawdownSeries]);

  // Every attempted snapshot — both successfully-read and skipped — merged and
  // sorted by date, most recent first, so a status log reads the way a log does.
  const statusRows = useMemo(() => {
    const byDate = new Map(portfolioSeries.map((p) => [p.date, p]));
    const ok = snapshots.map((s) => ({
      key: s.key,
      date: s.date,
      ok: true,
      reason: null,
      positions: byDate.get(s.date)?.positions ?? null,
      valueHeld: byDate.get(s.date)?.valueHeld ?? null,
    }));
    const failed = skipped.map((s) => ({
      key: s.key,
      date: s.date,
      ok: false,
      reason: s.reason,
      positions: null,
      valueHeld: null,
    }));
    return [...ok, ...failed].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [snapshots, skipped, portfolioSeries]);

  return (
    <div className="stack">
      <Card
        title="Portfolio value over time"
        note="Market value vs. cost basis, across your snapshot history"
        info={
          <p>
            <strong>Cost basis</strong> is what you paid; <strong>market value</strong> is what those
            positions are worth at each snapshot's prices. The gap between the two lines is your
            unrealized gain or loss on the day of that snapshot.
          </p>
        }
      >
        {portfolioSeries.length > 1 ? (
          <PortfolioHistoryChart data={portfolioSeries} />
        ) : (
          <Empty title="Not enough dated snapshots">Upload more dated exports to R2 to chart this over time.</Empty>
        )}
      </Card>

      <Card
        title="Unrealized value over time"
        note="Gain or loss on currently-held positions, marked to market at each snapshot"
        info={
          <p>
            <strong>Unrealized profit / loss</strong> is what you'd make or lose if you sold everything
            you were holding at that snapshot, valued at that snapshot's prices. It's on paper — nothing
            is locked in until a sale. Below zero means the held book was underwater on that date.
          </p>
        }
      >
        {portfolioSeries.length > 1 ? (
          <UnrealizedHistoryChart data={portfolioSeries} />
        ) : (
          <Empty title="Not enough dated snapshots">Upload more dated exports to R2 to chart this over time.</Empty>
        )}
      </Card>

      <Card
        title="Return over time"
        note="Time-weighted index, base 100. Deposits and sales chained out, so it moves only on price — approximate, since buys and sells between snapshots aren't visible."
        info={
          <>
            <p>
              <strong>Time-weighted return (TWR) index.</strong> Starts at 100 on your first snapshot and
              compounds each snapshot-to-snapshot percent change with your deposits and sales stripped
              out. It isolates how the collection itself performed from when you happened to add money —
              the way funds quote performance.
            </p>
            <p>
              Approximate here: only your position totals at each snapshot are known, not the individual
              trades between them.
            </p>
          </>
        }
      >
        {returnStats ? (
          <div className="stack" style={{ gap: 16 }}>
            <ReturnHistoryChart data={returnSeries} />
            <div className="grid grid--3">
              <Stat
                label="Cumulative return"
                value={pct(returnStats.cumulative)}
                foot="Time-weighted, whole history"
                info={
                  <p>
                    How far the return index has moved from its starting 100, as a percent — the total
                    time-weighted gain across every snapshot you've uploaded.
                  </p>
                }
              />
              <Stat
                label="Annualized (TWR)"
                value={returnStats.annualized == null ? '—' : pct(returnStats.annualized)}
                foot={returnStats.annualized == null ? 'History under a year — not annualized' : 'Per year, compounded'}
                info={
                  <p>
                    The cumulative return restated as a steady per-year rate, compounded. Hidden until
                    your history spans at least a year — annualizing a short stretch badly overstates it.
                  </p>
                }
              />
              <Stat label="Snapshots" value={count(returnSeries.length)} foot="Points in the chain" />
            </div>
          </div>
        ) : (
          <Empty title="Not enough dated snapshots">Need at least two readable snapshots to chain a return.</Empty>
        )}
      </Card>

      <Card
        title="Drawdown from peak"
        note="How far the return index sits below its highest earlier value. Based on snapshot dates — lows between snapshots are not captured."
        info={
          <>
            <p>
              <strong>Drawdown</strong> is how far the return index sits below the highest level it had
              already reached, as a negative percent. At a fresh all-time high it's 0%; −15% means the
              collection is 15% below its best prior mark.
            </p>
            <p>
              <strong>Max drawdown</strong> is the deepest such fall in your history — a feel for the
              worst stretch you've sat through. <strong>Current drawdown</strong> is where you stand now.
            </p>
          </>
        }
      >
        {returnStats && drawdownSeries.length > 1 ? (
          <div className="stack" style={{ gap: 16 }}>
            <DrawdownChart data={drawdownSeries} />
            <div className="grid grid--2">
              <Stat label="Max drawdown" value={returnStats.maxDd == null ? '—' : pct(returnStats.maxDd)} foot="Worst peak-to-trough in the history" />
              <Stat label="Current drawdown" value={returnStats.currentDd == null ? '—' : pct(returnStats.currentDd)} foot="Below the all-time peak right now" />
            </div>
          </div>
        ) : (
          <Empty title="Not enough dated snapshots">Need at least two readable snapshots to measure a drawdown.</Empty>
        )}
      </Card>

      <Card title="Snapshots" note={`${count(statusRows.length)} attempted`}>
        <p className="table-hint" style={{ marginBottom: 12 }}>Swipe sideways for the rest of the columns.</p>
        <div className="table-scroll">
          <table className="table--sticky">
            <thead>
              <tr>
                <th>Date</th>
                <th>File</th>
                <th>Status</th>
                <th className="th-right">Positions</th>
                <th className="th-right">Market value</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((r) => (
                <tr key={r.key}>
                  <td style={{ fontWeight: 600 }}>{shortDate(r.date)}</td>
                  <td>{r.key}</td>
                  <td className={r.ok ? '' : 'down'}>{r.ok ? 'Read OK' : `Could not be read: ${r.reason}`}</td>
                  <td className="td-right num">{r.ok ? count(r.positions ?? 0) : '—'}</td>
                  <td className="td-right num">{r.ok ? money(r.valueHeld) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Product price history" note="One product at a time — pick the one you want to trace">
        {productSeries.length ? (
          <div className="stack" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="history-product-picker">Product</label>
              <select
                id="history-product-picker"
                value={selected?.key ?? ''}
                onChange={(e) => setProductKey(e.target.value)}
              >
                {productSeries.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}{p.set && p.set !== 'Unassigned' ? ` · ${p.set}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selected && selected.set && selected.set !== 'Unassigned' && (
              <div className="card__note" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <SetIcon set={selected.set} size={18} />
                <span>{selected.set}</span>
              </div>
            )}
            {selected && selected.points.length > 1 ? (
              <ProductHistoryChart points={selected.points} />
            ) : (
              <Empty title="Not enough history for this product">It only appears as a held position in one snapshot so far.</Empty>
            )}
          </div>
        ) : (
          <Empty title="Nothing held across your history">No product appears as a held position in more than one snapshot yet.</Empty>
        )}
      </Card>
    </div>
  );
}
