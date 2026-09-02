import React, { useMemo, useState } from 'react';
import { money, pct, count, shortDate, duration, tone } from '../lib/format.js';
import { useIncrementalList } from '../lib/useIncrementalList.js';
import SetIcon from './SetIcon.jsx';

/**
 * `default: true` marks the columns shown before the reader opens the column
 * picker — the ones that answer "what do I own, what did it cost, what's it worth
 * now, how's it doing". The rest (per-unit prices, dates, annualised return, the
 * portfolio bucket) are a checkbox away in the Columns menu. All thirteen at once
 * overflow even a desktop sideways, hence a lean default. `name` is always on:
 * it is the row's identity and the pinned first column on a phone.
 */
const COLUMNS = [
  { key: 'name', label: 'Product', align: 'left', default: true },
  { key: 'set', label: 'Set', align: 'left', default: true },
  { key: 'portfolio', label: 'Portfolio', align: 'left', fmt: (v) => v || '—' },
  { key: 'qty', label: 'Qty', align: 'right', fmt: count, default: true },
  { key: 'unitCost', label: 'Cost / unit', align: 'right', fmt: (v) => money(v, true) },
  { key: 'totalCost', label: 'Cost basis', align: 'right', fmt: (v) => money(v), default: true },
  { key: 'unitValue', label: 'Market / unit', align: 'right', fmt: (v) => money(v, true) },
  { key: 'totalValue', label: 'Market value', align: 'right', fmt: (v) => money(v), default: true },
  { key: 'gain', label: 'Unrealized', align: 'right', fmt: (v) => money(v), toned: true, default: true },
  { key: 'roi', label: 'Return', align: 'right', fmt: (v) => pct(v), toned: true, default: true },
  { key: 'annualized', label: 'Annualized', align: 'right', fmt: (v) => pct(v), toned: true },
  { key: 'heldDays', label: 'Held', align: 'right', fmt: duration },
  { key: 'purchaseDate', label: 'Bought', align: 'right', fmt: shortDate },
];

const DEFAULT_KEYS = COLUMNS.filter((c) => c.default).map((c) => c.key);

export default function HoldingsTable({ holdings }) {
  const [sort, setSort] = useState({ key: 'totalValue', dir: 'desc' });
  const [query, setQuery] = useState('');
  const [setFilter, setSetFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('held');
  const [shownKeys, setShownKeys] = useState(() => new Set(DEFAULT_KEYS));
  const [colMenu, setColMenu] = useState(false);

  const columns = COLUMNS.filter((c) => shownKeys.has(c.key));
  const setHidden = !shownKeys.has('set');

  const toggleColumn = (key) => {
    if (key === 'name') return; // identity column, always shown
    setShownKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const resetColumns = () => setShownKeys(new Set(DEFAULT_KEYS));

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

  // Render the result set a chunk at a time; totals below still sum every row.
  const { limit, rootRef, sentinelRef, done } = useIncrementalList(rows.length);
  const visibleRows = rows.slice(0, limit);

  const totals = rows.reduce((a, r) => ({ cost: a.cost + (r.totalCost || 0), value: a.value + (r.totalValue || 0), qty: a.qty + (r.qty || 0) }), { cost: 0, value: 0, qty: 0 });
  const totalRoi = totals.cost > 0 ? (totals.value - totals.cost) / totals.cost : null;

  // Keyed by column so the footer follows whichever columns are on screen.
  const footer = {
    name: { text: done ? `${rows.length} rows shown` : `${visibleRows.length} of ${rows.length} rows`, cls: '' },
    qty: { text: count(totals.qty), cls: 'td-right num' },
    totalCost: { text: money(totals.cost), cls: 'td-right num' },
    totalValue: { text: money(totals.value), cls: 'td-right num' },
    gain: { text: money(totals.value - totals.cost), cls: `td-right num ${tone(totals.value - totals.cost)}` },
    roi: { text: pct(totalRoi), cls: `td-right num ${tone(totalRoi)}` },
  };

  const toggle = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  // Export is always the full column set — the column picker is a viewing
  // preference, not a change to the data.
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
          <input
            id="tbl-search"
            type="search"
            placeholder="Product, set, vendor, notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            enterKeyHint="search"
          />
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

      <div className="colbar">
        <button
          type="button"
          className="btn btn--sm"
          aria-expanded={colMenu}
          aria-controls="tbl-colmenu"
          onClick={() => setColMenu((v) => !v)}
        >
          Columns · {columns.length}/{COLUMNS.length}
        </button>
        {colMenu && (
          <fieldset id="tbl-colmenu" className="colmenu">
            <legend className="sr-only">Columns to show</legend>
            {COLUMNS.map((c) => (
              <label key={c.key} className="colmenu__opt">
                <input
                  type="checkbox"
                  checked={shownKeys.has(c.key)}
                  disabled={c.key === 'name'}
                  onChange={() => toggleColumn(c.key)}
                />
                <span>{c.label}</span>
              </label>
            ))}
            <button type="button" className="btn btn--sm colmenu__reset" onClick={resetColumns}>
              Reset
            </button>
          </fieldset>
        )}
      </div>

      <div className="table-hint">
        <span>Swipe the table sideways — the product column stays put.</span>
      </div>

      <div className="table-scroll table-scroll--capped" ref={rootRef}>
        <table className="table--sticky table--virtual" style={{ '--vrow': '72px' }}>
          <caption className="sr-only">Positions, sortable by any column</caption>
          <thead>
            <tr>
              {columns.map((c) => (
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
            {visibleRows.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => {
                  const v = r[c.key];
                  const cls = [c.align === 'right' ? 'td-right num' : '', c.toned ? tone(v) : ''].filter(Boolean).join(' ');
                  return (
                    <td key={c.key} className={cls}>
                      {c.key === 'set' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <SetIcon set={v} size={18} />
                          {c.fmt ? c.fmt(v) : v}
                        </span>
                      ) : (
                        c.fmt ? c.fmt(v) : v
                      )}
                      {/* When the Set column is hidden it joins this subtitle
                          rather than disappearing from the row. */}
                      {c.key === 'name' && (r.productType !== 'Unassigned' || r.vendor || setHidden) && (
                        <span className="cell-sub">
                          {setHidden && r.set !== 'Unassigned' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <SetIcon set={r.set} size={16} />
                              <span style={{ minWidth: 0 }}>
                                {[r.set, r.productType !== 'Unassigned' ? r.productType : null, r.vendor].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          )}
                          {!(setHidden && r.set !== 'Unassigned') &&
                            [r.productType !== 'Unassigned' ? r.productType : null, r.vendor].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--ink-2)', padding: 34 }}>
                No positions match these filters. Clear the search or switch status to Everything.
              </td></tr>
            )}
            {!done && (
              <tr ref={sentinelRef} aria-hidden="true" style={{ contentVisibility: 'visible' }}>
                <td colSpan={columns.length} style={{ padding: 0, border: 0, height: 1 }} />
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                {columns.map((c) => {
                  const f = footer[c.key];
                  return <td key={c.key} className={f?.cls} style={{ fontWeight: 600 }}>{f?.text ?? ''}</td>;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
