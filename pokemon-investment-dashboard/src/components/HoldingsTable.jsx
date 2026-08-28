import React, { useMemo, useState } from 'react';
import { money, pct, count, shortDate, duration, tone } from '../lib/format.js';

const COLUMNS = [
  { key: 'name', label: 'Product', align: 'left' },
  { key: 'set', label: 'Set', align: 'left' },
  { key: 'qty', label: 'Qty', align: 'right', fmt: count },
  { key: 'unitCost', label: 'Cost / unit', align: 'right', fmt: (v) => money(v, true) },
  { key: 'totalCost', label: 'Cost basis', align: 'right', fmt: (v) => money(v) },
  { key: 'unitValue', label: 'Market / unit', align: 'right', fmt: (v) => money(v, true) },
  { key: 'totalValue', label: 'Market value', align: 'right', fmt: (v) => money(v) },
  { key: 'gain', label: 'Unrealized', align: 'right', fmt: (v) => money(v), toned: true },
  { key: 'roi', label: 'Return', align: 'right', fmt: (v) => pct(v), toned: true },
  { key: 'annualized', label: 'Annualized', align: 'right', fmt: (v) => pct(v), toned: true },
  { key: 'heldDays', label: 'Held', align: 'right', fmt: duration },
  { key: 'purchaseDate', label: 'Bought', align: 'right', fmt: shortDate },
];

export default function HoldingsTable({ holdings }) {
  const [sort, setSort] = useState({ key: 'totalValue', dir: 'desc' });
  const [query, setQuery] = useState('');
  const [setFilter, setSetFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('held');

  const sets = useMemo(() => [...new Set(holdings.map((h) => h.set))].sort(), [holdings]);
  const types = useMemo(() => [...new Set(holdings.map((h) => h.productType))].sort(), [holdings]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = holdings.filter((h) => {
      if (statusFilter !== 'all' && h.status !== statusFilter) return false;
      if (setFilter !== 'all' && h.set !== setFilter) return false;
      if (typeFilter !== 'all' && h.productType !== typeFilter) return false;
      if (!q) return true;
      return [h.name, h.set, h.productType, h.vendor, h.notes].filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    });

    const { key, dir } = sort;
    return filtered.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [holdings, sort, query, setFilter, typeFilter, statusFilter]);

  const totals = rows.reduce((a, r) => ({ cost: a.cost + (r.totalCost || 0), value: a.value + (r.totalValue || 0), qty: a.qty + (r.qty || 0) }), { cost: 0, value: 0, qty: 0 });
  const totalRoi = totals.cost > 0 ? (totals.value - totals.cost) / totals.cost : null;

  const toggle = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const exportCsv = () => {
    const head = COLUMNS.map((c) => c.label).join(',');
    const body = rows
      .map((r) => COLUMNS.map((c) => {
        const v = r[c.key];
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pokemon-holdings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="filters">
        <div className="field filters__search">
          <label htmlFor="tbl-search">Search</label>
          <input id="tbl-search" type="search" placeholder="Product, set, vendor, notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tbl-status">Status</label>
          <select id="tbl-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="held">Still held</option>
            <option value="sold">Sold</option>
            <option value="all">Everything</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tbl-set">Set</label>
          <select id="tbl-set" value={setFilter} onChange={(e) => setSetFilter(e.target.value)}>
            <option value="all">All sets</option>
            {sets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tbl-type">Product type</label>
          <select id="tbl-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {types.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn--sm" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="table-scroll">
        <table>
          <caption className="sr-only">Positions, sortable by any column</caption>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.align === 'right' ? 'th-right' : ''} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button onClick={() => toggle(c.key)}>
                    {c.label}
                    <span aria-hidden="true" style={{ opacity: sort.key === c.key ? 1 : 0.25 }}>
                      {sort.key === c.key && sort.dir === 'asc' ? '▲' : '▼'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {COLUMNS.map((c) => {
                  const v = r[c.key];
                  const cls = [c.align === 'right' ? 'td-right num' : '', c.toned ? tone(v) : ''].filter(Boolean).join(' ');
                  return (
                    <td key={c.key} className={cls}>
                      {c.fmt ? c.fmt(v) : v}
                      {c.key === 'name' && (r.productType !== 'Unassigned' || r.vendor) && (
                        <span className="cell-sub">{[r.productType !== 'Unassigned' ? r.productType : null, r.vendor].filter(Boolean).join(' · ')}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={COLUMNS.length} style={{ textAlign: 'center', color: 'var(--ink-2)', padding: 34 }}>
                No positions match these filters. Clear the search or switch status to Everything.
              </td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight: 600 }}>{rows.length} rows shown</td>
                <td className="td-right num" style={{ fontWeight: 600 }}>{count(totals.qty)}</td>
                <td />
                <td className="td-right num" style={{ fontWeight: 600 }}>{money(totals.cost)}</td>
                <td />
                <td className="td-right num" style={{ fontWeight: 600 }}>{money(totals.value)}</td>
                <td className={`td-right num ${tone(totals.value - totals.cost)}`} style={{ fontWeight: 600 }}>{money(totals.value - totals.cost)}</td>
                <td className={`td-right num ${tone(totalRoi)}`} style={{ fontWeight: 600 }}>{pct(totalRoi)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
