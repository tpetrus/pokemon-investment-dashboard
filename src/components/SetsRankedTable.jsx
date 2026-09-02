import React from 'react';
import { count, money, signedMoney, pct, plainPct, tone } from '../lib/format.js';
import { useIncrementalList } from '../lib/useIncrementalList.js';
import SetIcon from './SetIcon.jsx';

/**
 * "Sets ranked" on the Allocation tab. Split out of Dashboard so the
 * incremental-reveal hook only lives while the table is actually mounted; rows
 * scrolled out of view are skipped by `.table--virtual` (content-visibility).
 */
export default function SetsRankedTable({ data, valueHeld }) {
  const { limit, rootRef, sentinelRef, done } = useIncrementalList(data.length);

  return (
    <div className="table-scroll table-scroll--capped" ref={rootRef}>
      <table className="table--sticky table--virtual">
        <thead>
          <tr>
            <th>Set</th>
            <th className="th-right">Positions</th>
            <th className="th-right">Units</th>
            <th className="th-right">Cost basis</th>
            <th className="th-right">Market value</th>
            <th className="th-right">Unrealized</th>
            <th className="th-right">Return</th>
            <th className="th-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, limit).map((g) => (
            <tr key={g.key}>
              <td style={{ fontWeight: 600 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <SetIcon set={g.key} size={18} />
                  <span style={{ minWidth: 0 }}>{g.key}</span>
                </span>
              </td>
              <td className="td-right num">{count(g.count)}</td>
              <td className="td-right num">{count(g.units)}</td>
              <td className="td-right num">{money(g.cost)}</td>
              <td className="td-right num">{money(g.value)}</td>
              <td className={`td-right num ${tone(g.gain)}`}>{signedMoney(g.gain)}</td>
              <td className={`td-right num ${tone(g.roi)}`}>{pct(g.roi)}</td>
              <td className="td-right num">{valueHeld ? plainPct(g.value / valueHeld, 1) : '—'}</td>
            </tr>
          ))}
          {!done && (
            <tr ref={sentinelRef} aria-hidden="true" style={{ contentVisibility: 'visible' }}>
              <td colSpan={8} style={{ padding: 0, border: 0, height: 1 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
