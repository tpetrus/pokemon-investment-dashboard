import React, { useMemo, useState } from 'react';
import { Card, Empty } from './ui.jsx';
import { PortfolioHistoryChart, UnrealizedHistoryChart, ProductHistoryChart } from './Charts.jsx';
import { money, count, shortDate } from '../lib/format.js';
import SetIcon from './SetIcon.jsx';

/**
 * Parallel in structure to DataPanel.jsx: a Card per concern, the same
 * .table-scroll/.table--sticky table pattern for the status list, and a plain
 * <select> for the product picker (not a new autocomplete dependency).
 */
export default function HistoryPanel({ portfolioSeries, productSeries, snapshots, skipped }) {
  const [productKey, setProductKey] = useState(productSeries[0]?.key ?? '');
  const selected = productSeries.find((p) => p.key === productKey) ?? productSeries[0] ?? null;

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
      <Card title="Portfolio value over time" note="Market value vs. cost basis, across your snapshot history">
        {portfolioSeries.length > 1 ? (
          <PortfolioHistoryChart data={portfolioSeries} />
        ) : (
          <Empty title="Not enough dated snapshots">Upload more dated exports to R2 to chart this over time.</Empty>
        )}
      </Card>

      <Card title="Unrealized value over time" note="Gain or loss on currently-held positions, marked to market at each snapshot">
        {portfolioSeries.length > 1 ? (
          <UnrealizedHistoryChart data={portfolioSeries} />
        ) : (
          <Empty title="Not enough dated snapshots">Upload more dated exports to R2 to chart this over time.</Empty>
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
