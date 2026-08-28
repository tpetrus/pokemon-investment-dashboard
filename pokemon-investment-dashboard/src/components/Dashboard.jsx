import React, { useEffect, useMemo, useState } from 'react';
import { Card, Kpi, Tabs, SpreadRail, Empty } from './ui.jsx';
import { AllocationDonut, CostVsValueBars, CapitalDeployed, HoldVsReturn, VendorBars } from './Charts.jsx';
import HoldingsTable from './HoldingsTable.jsx';
import ExitCalculator from './ExitCalculator.jsx';
import DataPanel from './DataPanel.jsx';
import FileDrop from './FileDrop.jsx';
import Progress from './Progress.jsx';
import {
  guessMapping, normalizeRows, computeMetrics, groupBy, auditRows,
  buildTimeline, compareSnapshots, setTrends,
} from '../lib/normalize.js';
import { money, signedMoney, pct, count, plainPct, duration, tone, shortDate } from '../lib/format.js';

const STORE_KEY = 'pokemon-dashboard-v2';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'progress', label: 'Progress' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'performance', label: 'Performance' },
  { id: 'positions', label: 'Positions' },
  { id: 'exit', label: 'Exit math' },
  { id: 'data', label: 'Data' },
];

export default function Dashboard({ initialSheets = [], dir = '', loadError = null }) {
  const [uploaded, setUploaded] = useState([]);
  const [tab, setTab] = useState('overview');
  const [enabled, setEnabled] = useState({});
  const [overrides, setOverrides] = useState({});
  const [activeDate, setActiveDate] = useState(null);
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const sheets = useMemo(() => [...initialSheets, ...uploaded], [initialSheets, uploaded]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (saved.enabled) setEnabled(saved.enabled);
      if (saved.overrides) setOverrides(saved.overrides);
      if (saved.tab) setTab(saved.tab);
    } catch { /* first run */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORE_KEY, JSON.stringify({ enabled, overrides, tab }));
  }, [enabled, overrides, tab, hydrated]);

  const mappings = useMemo(() => {
    const out = {};
    for (const s of sheets) {
      if (s.readError) continue;
      out[s.id] = { ...guessMapping(s.headers, s.rows), ...(overrides[s.id] || {}) };
    }
    return out;
  }, [sheets, overrides]);

  // One dated export is one observation of the whole portfolio. Files sharing a
  // date merge into a single snapshot; the newest one drives the standard views.
  const snapshots = useMemo(() => {
    const byDate = new Map();
    for (const s of sheets) {
      if (s.readError || enabled[s.id] === false) continue;
      const date = s.snapshot || 'undated';
      const rows = normalizeRows(s.rows, mappings[s.id] || {}, s.sheet || s.file);
      const g = byDate.get(date) || { date, holdings: [], files: [] };
      g.holdings.push(...rows);
      g.files.push(s.file);
      byDate.set(date, g);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [sheets, mappings, enabled]);

  const dates = useMemo(() => snapshots.map((s) => s.date), [snapshots]);
  const latest = dates[dates.length - 1] ?? null;

  useEffect(() => {
    if (!dates.length) return;
    if (!activeDate || !dates.includes(activeDate)) setActiveDate(latest);
    if (!to || !dates.includes(to)) setTo(latest);
    if (!from || !dates.includes(from)) setFrom(dates.length > 1 ? dates[dates.length - 2] : dates[0]);
  }, [dates, latest]);

  const active = snapshots.find((s) => s.date === activeDate) ?? snapshots[snapshots.length - 1];
  const holdings = active?.holdings ?? [];

  const m = useMemo(() => computeMetrics(holdings), [holdings]);
  const audit = useMemo(() => auditRows(holdings), [holdings]);
  const timeline = useMemo(() => buildTimeline(snapshots), [snapshots]);
  const trends = useMemo(() => setTrends(snapshots), [snapshots]);

  const comparison = useMemo(() => {
    if (snapshots.length < 2) return null;
    const a = snapshots.find((s) => s.date === from) ?? snapshots[0];
    const b = snapshots.find((s) => s.date === to) ?? snapshots[snapshots.length - 1];
    return compareSnapshots(a, b);
  }, [snapshots, from, to]);

  // Change since the snapshot before the one being viewed, for the overview KPIs.
  const priorToActive = useMemo(() => {
    const i = snapshots.findIndex((s) => s.date === active?.date);
    return i > 0 ? snapshots[i - 1] : null;
  }, [snapshots, active]);

  const sincePrior = useMemo(
    () => (priorToActive ? compareSnapshots(priorToActive, active) : null),
    [priorToActive, active],
  );

  const bySet = useMemo(() => groupBy(m.held, 'set'), [m.held]);
  const byType = useMemo(() => groupBy(m.held, 'productType'), [m.held]);
  const byVendor = useMemo(() => groupBy(m.held.filter((h) => h.vendor), 'vendor'), [m.held]);

  const topByValue = useMemo(() => [...m.held].sort((a, b) => b.totalValue - a.totalValue), [m.held]);
  const concentration = m.valueHeld > 0 ? topByValue.slice(0, 3).reduce((a, h) => a + h.totalValue, 0) / m.valueHeld : null;
  const biggestSet = bySet[0];

  const railDomain = useMemo(() => {
    const rois = (m.ranked.length ? m.ranked : m.held).map((h) => h.roi).filter((r) => r != null);
    if (!rois.length) return [-0.5, 1.5];
    return [Math.min(-0.25, Math.floor(Math.min(...rois) * 4) / 4), Math.max(0.5, Math.ceil(Math.max(...rois) * 4) / 4)];
  }, [m]);

  const hasData = holdings.length > 0;
  const readable = sheets.filter((s) => !s.readError).length;
  const undated = sheets.filter((s) => !s.readError && s.dateSource !== 'file name').length;

  const toggleSheet = (id) => setEnabled((e) => ({ ...e, [id]: e[id] === false }));
  const setMap = (sheetId, field, header) =>
    setOverrides((o) => ({ ...o, [sheetId]: { ...(o[sheetId] || {}), [field]: header } }));
  const resetMaps = () => setOverrides({});

  return (
    <>
      <header className="masthead">
        <div>
          <p className="eyebrow" style={{ margin: '0 0 10px' }}>Sealed portfolio</p>
          <h1>Pokémon investments</h1>
        </div>
        <div className="masthead__meta">
          <div>{count(m.positions)} positions · {count(m.units)} units</div>
          <div>{count(readable)} {readable === 1 ? 'file' : 'files'} · {count(snapshots.length)} {snapshots.length === 1 ? 'snapshot' : 'snapshots'}</div>
          {dates.length > 1 ? (
            <div className="field" style={{ marginTop: 10, minWidth: 190 }}>
              <label htmlFor="snapshot">Viewing snapshot</label>
              <select id="snapshot" value={activeDate ?? ''} onChange={(e) => setActiveDate(e.target.value)}>
                {[...dates].reverse().map((d) => (
                  <option key={d} value={d}>{shortDate(d)}{d === latest ? ' (latest)' : ''}</option>
                ))}
              </select>
            </div>
          ) : (
            active && <div>Priced {shortDate(active.date)}</div>
          )}
        </div>
      </header>

      {loadError && !hasData && (
        <div className="stack" style={{ marginBottom: 26 }}>
          <Card title="No exports loaded">
            <p style={{ color: 'var(--ink-2)' }}>{loadError}</p>
            <FileDrop onSheets={(s) => setUploaded((u) => [...u, ...s])} />
          </Card>
        </div>
      )}

      {hasData && (
        <>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />

          {tab === 'overview' && (
            <div className="stack">
              <div className="grid grid--kpi">
                <Kpi
                  label="Market value"
                  value={money(m.valueHeld)}
                  foot={`${count(m.positions)} positions · priced ${shortDate(active.date)}`}
                />
                <Kpi
                  label="Cost basis"
                  value={money(m.costHeld)}
                  foot={m.avgHoldDays ? `Average hold ${duration(m.avgHoldDays)}` : 'Add purchase dates for hold length'}
                />
                <Kpi
                  label="Unrealized"
                  value={signedMoney(m.unrealized)}
                  valueTone={tone(m.unrealized)}
                  foot={`${pct(m.roiHeld)} on cost`}
                />
                {sincePrior ? (
                  <Kpi
                    label={`Since ${shortDate(sincePrior.from)}`}
                    value={signedMoney(sincePrior.valueDelta)}
                    valueTone={tone(sincePrior.valueDelta)}
                    foot={`${signedMoney(sincePrior.priceEffect)} of it price movement`}
                  />
                ) : (
                  <Kpi
                    label="Realized"
                    value={m.soldCount ? signedMoney(m.realized) : '—'}
                    valueTone={tone(m.realized)}
                    foot={m.soldCount ? `${count(m.soldCount)} sold · ${pct(m.realizedRoi)}` : 'Nothing sold yet'}
                  />
                )}
              </div>

              <div className="grid grid--2">
                <Card title="Position spread" note="Your nine largest positions by market value">
                  {m.held.length ? (
                    <SpreadRail items={topByValue.filter((h) => h.roi != null).slice(0, 9)} domain={railDomain} />
                  ) : (
                    <Empty title="No returns to plot">Map a market value column in the Data tab and these fill in.</Empty>
                  )}
                </Card>

                <div className="stack">
                  <Card title="Concentration">
                    <div className="stack" style={{ gap: 14 }}>
                      <div className="well">
                        <div className="kpi__label">Top three positions</div>
                        <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>{concentration == null ? '—' : plainPct(concentration, 0)}</div>
                        <div className="kpi__foot">of total market value — {topByValue.slice(0, 3).map((h) => h.name).join(', ') || '—'}</div>
                      </div>
                      <div className="well">
                        <div className="kpi__label">Largest set exposure</div>
                        <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>
                          {biggestSet ? plainPct(biggestSet.value / m.valueHeld, 0) : '—'}
                        </div>
                        <div className="kpi__foot">{biggestSet ? `${biggestSet.key} · ${money(biggestSet.value)} across ${count(biggestSet.count)} positions` : '—'}</div>
                      </div>
                    </div>
                  </Card>

                  <Card title="Best and worst" note={m.materialFloor ? `Cost basis over ${money(m.materialFloor)}` : 'Held positions'}>
                    <div className="stack" style={{ gap: 12 }}>
                      {[['Leading', m.best], ['Lagging', m.worst]].map(([label, h]) => (
                        <div key={label} className="well" style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline' }}>
                          <div>
                            <div className="kpi__label">{label}</div>
                            <div style={{ fontWeight: 600, marginTop: 4 }}>{h ? h.name : '—'}</div>
                            <div className="card__note">{h ? `${money(h.totalCost)} → ${money(h.totalValue)}` : ''}</div>
                          </div>
                          <div className={`num ${tone(h?.roi)}`} style={{ fontSize: 'var(--step-2)', fontWeight: 700 }}>{pct(h?.roi)}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>

              <Card title="Capital deployed over time" note="Cumulative cost basis by purchase date">
                {m.capitalDeployed.length > 1 ? (
                  <CapitalDeployed data={m.capitalDeployed} />
                ) : (
                  <Empty title="Not enough dated buys">Map a purchase date column to see how your basis has built up.</Empty>
                )}
              </Card>
            </div>
          )}

          {tab === 'progress' && (
            <Progress
              timeline={timeline}
              trends={trends}
              comparison={comparison}
              dates={dates}
              from={from ?? dates[0]}
              to={to ?? latest}
              onFrom={setFrom}
              onTo={setTo}
            />
          )}

          {tab === 'allocation' && (
            <div className="stack">
              <div className="grid grid--2">
                <Card title="Where the value sits" note="By set">
                  <AllocationDonut data={bySet} />
                </Card>
                <Card title="Cost basis against market value" note="By product type">
                  <CostVsValueBars data={byType} />
                </Card>
              </div>
              <Card title="Sets ranked" note={`Priced ${shortDate(active.date)}`}>
                <div className="table-scroll">
                  <table>
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
                      {bySet.map((g) => (
                        <tr key={g.key}>
                          <td style={{ fontWeight: 600 }}>{g.key}</td>
                          <td className="td-right num">{count(g.count)}</td>
                          <td className="td-right num">{count(g.units)}</td>
                          <td className="td-right num">{money(g.cost)}</td>
                          <td className="td-right num">{money(g.value)}</td>
                          <td className={`td-right num ${tone(g.gain)}`}>{signedMoney(g.gain)}</td>
                          <td className={`td-right num ${tone(g.roi)}`}>{pct(g.roi)}</td>
                          <td className="td-right num">{m.valueHeld ? plainPct(g.value / m.valueHeld, 1) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === 'performance' && (
            <div className="stack">
              <div className="grid grid--2">
                <Card title="Strongest positions" note={m.materialFloor ? `Cost basis over ${money(m.materialFloor)}` : 'Return on cost'}>
                  {m.ranked.length ? <SpreadRail items={m.ranked.slice(0, 6)} domain={railDomain} /> : <Empty title="Nothing to rank">Map a market value column first.</Empty>}
                </Card>
                <Card title="Weakest positions" note={m.materialFloor ? `Cost basis over ${money(m.materialFloor)}` : 'Return on cost'}>
                  {m.ranked.length ? <SpreadRail items={m.ranked.slice(-6).reverse()} domain={railDomain} /> : <Empty title="Nothing to rank">Map a market value column first.</Empty>}
                </Card>
              </div>

              <Card title="Hold length against return" note="Bubble size is cost basis">
                <HoldVsReturn data={m.held} />
              </Card>

              {byVendor.length > 0 && (
                <Card title="Return by source" note="Where you bought it">
                  <VendorBars data={byVendor} />
                </Card>
              )}

              {m.sold.length > 0 && (
                <Card title="Closed positions">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Set</th>
                          <th className="th-right">Cost</th>
                          <th className="th-right">Gross proceeds</th>
                          <th className="th-right">Profit</th>
                          <th className="th-right">Return</th>
                          <th className="th-right">Held</th>
                          <th className="th-right">Sold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.sold.map((h) => (
                          <tr key={h.id}>
                            <td style={{ fontWeight: 600 }}>{h.name}</td>
                            <td>{h.set}</td>
                            <td className="td-right num">{money(h.totalCost)}</td>
                            <td className="td-right num">{money(h.totalValue)}</td>
                            <td className={`td-right num ${tone(h.gain)}`}>{signedMoney(h.gain)}</td>
                            <td className={`td-right num ${tone(h.roi)}`}>{pct(h.roi)}</td>
                            <td className="td-right num">{duration(h.heldDays)}</td>
                            <td className="td-right num">{shortDate(h.soldDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="card__note" style={{ marginTop: 12 }}>
                    Proceeds are gross unless your sheet already nets out fees. Model the fee drag in Exit math.
                  </p>
                </Card>
              )}
            </div>
          )}

          {tab === 'positions' && (
            <Card title="Every position" note={`${count(holdings.length)} rows · ${shortDate(active.date)}`}>
              <HoldingsTable holdings={holdings} />
            </Card>
          )}

          {tab === 'exit' && <ExitCalculator holdings={holdings} />}

          {tab === 'data' && (
            <DataPanel
              sheets={sheets}
              enabled={enabled}
              onToggleSheet={toggleSheet}
              mappings={mappings}
              onMap={setMap}
              audit={audit}
              onReset={resetMaps}
              undated={undated}
            >
              <FileDrop onSheets={(s) => setUploaded((u) => [...u, ...s])} />
            </DataPanel>
          )}
        </>
      )}
    </>
  );
}
