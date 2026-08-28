import React from 'react';
import { Card, Kpi, Empty } from './ui.jsx';
import { ValueOverTime, SetTrends, MoverBars } from './Charts.jsx';
import { money, signedMoney, pct, count, shortDate, tone, duration } from '../lib/format.js';

export default function Progress({ timeline, trends, comparison, dates, from, to, onFrom, onTo }) {
  if (timeline.length < 2) {
    return (
      <Card title="One snapshot so far">
        <p style={{ color: 'var(--ink-2)' }}>
          Progress needs at least two dated exports. Drop another CSV in the data folder with its
          date in the name — <code>Sealed 2026-06-01.csv</code> — and this fills in with value over
          time, per-set trends, and what moved between any two dates.
        </p>
      </Card>
    );
  }

  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const prior = timeline[timeline.length - 2];
  const c = comparison;

  // Price appreciation annualized over the compared window, ignoring money added.
  const priceRoi = c.prevValue > 0 ? c.priceEffect / c.prevValue : null;
  const annualized = priceRoi != null && c.days > 20 ? Math.pow(1 + priceRoi, 365 / c.days) - 1 : null;

  const movers = [...c.movers].filter((m) => Math.abs(m.valueDelta) >= 1);
  const top = movers.slice(0, 6);
  const bottom = movers.slice(-6).reverse().filter((m) => m.valueDelta < 0);
  const chartData = [...top, ...bottom]
    .filter((m, i, arr) => arr.findIndex((x) => x.key === m.key) === i)
    .map((m) => ({ ...m, label: m.name.length > 30 ? `${m.name.slice(0, 29)}…` : m.name }))
    .sort((a, b) => b.valueDelta - a.valueDelta);

  return (
    <div className="stack">
      <div className="grid grid--kpi">
        <Kpi label="Market value now" value={money(last.value)} foot={`Priced ${shortDate(last.date)}`} />
        <Kpi
          label="Since previous snapshot"
          value={signedMoney(last.value - prior.value)}
          valueTone={tone(last.value - prior.value)}
          foot={`${shortDate(prior.date)} → ${shortDate(last.date)}`}
        />
        <Kpi
          label={`Since ${shortDate(first.date)}`}
          value={signedMoney(last.value - first.value)}
          valueTone={tone(last.value - first.value)}
          foot={`${count(timeline.length)} snapshots over ${duration(Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86400000))}`}
        />
        <Kpi
          label="Return on cost"
          value={pct(last.roi)}
          valueTone={tone(last.roi)}
          foot={`Was ${pct(first.roi)} at the start`}
        />
      </div>

      <Card title="Market value and cost basis over time" note="Every dated export">
        <ValueOverTime data={timeline} />
        <p className="card__note" style={{ marginTop: 12 }}>
          The gap between the two lines is your unrealized gain. Cost basis stepping up means new
          buying, not appreciation.
        </p>
      </Card>

      <Card title="Compare two snapshots" note={`${c.days} days apart`}>
        <div className="filters" style={{ marginBottom: 20 }}>
          <div className="field">
            <label htmlFor="cmp-from">From</label>
            <select id="cmp-from" value={from} onChange={(e) => onFrom(e.target.value)}>
              {dates.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cmp-to">To</label>
            <select id="cmp-to" value={to} onChange={(e) => onTo(e.target.value)}>
              {dates.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid--kpi" style={{ gap: 16 }}>
          <div className="well">
            <div className="kpi__label">Value change</div>
            <div className={`kpi__value num ${tone(c.valueDelta)}`} style={{ fontSize: 'var(--step-2)' }}>{signedMoney(c.valueDelta)}</div>
            <div className="kpi__foot">{money(c.prevValue)} → {money(c.currValue)}</div>
          </div>
          <div className="well">
            <div className="kpi__label">Price appreciation</div>
            <div className={`kpi__value num ${tone(c.priceEffect)}`} style={{ fontSize: 'var(--step-2)' }}>{signedMoney(c.priceEffect)}</div>
            <div className="kpi__foot">
              {pct(priceRoi)} on what you already held{annualized != null ? ` · ${pct(annualized)} annualized` : ''}
            </div>
          </div>
          <div className="well">
            <div className="kpi__label">New positions</div>
            <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>{money(c.addedValue)}</div>
            <div className="kpi__foot">{count(c.added.length)} added · {money(c.costDelta)} more cost basis</div>
          </div>
          <div className="well">
            <div className="kpi__label">Positions gone</div>
            <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>{money(Math.abs(c.removedValue))}</div>
            <div className="kpi__foot">{count(c.removed.length)} no longer listed{c.quantityEffect ? ` · ${signedMoney(c.quantityEffect)} from quantity changes` : ''}</div>
          </div>
        </div>
      </Card>

      {chartData.length > 0 && (
        <Card title="What moved" note="Value change on positions held at both dates">
          <MoverBars data={chartData} />
        </Card>
      )}

      <Card title="Set values over time" note="Your six largest sets">
        <SetTrends rows={trends.rows} keys={trends.keys} />
      </Card>

      {(c.added.length > 0 || c.removed.length > 0) && (
        <div className="grid grid--2">
          {c.added.length > 0 && (
            <Card title="Added" note={`Between ${shortDate(c.from)} and ${shortDate(c.to)}`}>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Product</th><th className="th-right">Units</th><th className="th-right">Value</th></tr></thead>
                  <tbody>
                    {c.added.slice(0, 12).map((g) => (
                      <tr key={g.key}>
                        <td>{g.name}<span className="cell-sub">{g.set}</span></td>
                        <td className="td-right num">{count(g.qty)}</td>
                        <td className="td-right num">{money(g.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {c.removed.length > 0 && (
            <Card title="No longer listed" note="Sold, or dropped from the export">
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Product</th><th className="th-right">Units</th><th className="th-right">Last value</th></tr></thead>
                  <tbody>
                    {c.removed.slice(0, 12).map((g) => (
                      <tr key={g.key}>
                        <td>{g.name}<span className="cell-sub">{g.set}</span></td>
                        <td className="td-right num">{count(g.qty)}</td>
                        <td className="td-right num">{money(g.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      <Card title="Every snapshot">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="th-right">Positions</th>
                <th className="th-right">Units</th>
                <th className="th-right">Cost basis</th>
                <th className="th-right">Market value</th>
                <th className="th-right">Unrealized</th>
                <th className="th-right">Return</th>
                <th className="th-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((t, i) => {
                const delta = i ? t.value - timeline[i - 1].value : null;
                return (
                  <tr key={t.date}>
                    <td style={{ fontWeight: 600 }}>{shortDate(t.date)}</td>
                    <td className="td-right num">{count(t.positions)}</td>
                    <td className="td-right num">{count(t.units)}</td>
                    <td className="td-right num">{money(t.cost)}</td>
                    <td className="td-right num">{money(t.value)}</td>
                    <td className={`td-right num ${tone(t.gain)}`}>{signedMoney(t.gain)}</td>
                    <td className={`td-right num ${tone(t.roi)}`}>{pct(t.roi)}</td>
                    <td className={`td-right num ${tone(delta)}`}>{delta == null ? '—' : signedMoney(delta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
