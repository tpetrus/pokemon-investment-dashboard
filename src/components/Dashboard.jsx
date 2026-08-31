import React, { useEffect, useMemo, useState } from 'react';
import { Card, Kpi, Tabs, SpreadRail, Empty } from './ui.jsx';
import { AllocationDonut, CostVsValueBars, CapitalDeployed, HoldVsReturn, VendorBars } from './Charts.jsx';
import HoldingsTable from './HoldingsTable.jsx';
import ExitCalculator from './ExitCalculator.jsx';
import DataPanel from './DataPanel.jsx';
import { guessMapping, normalizeRows, computeMetrics, groupBy, auditRows, snapshotDateFrom } from '../lib/normalize.js';
import { money, signedMoney, pct, count, plainPct, duration, tone, shortDate } from '../lib/format.js';

const STORE_KEY = 'pokemon-dashboard-v1';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'performance', label: 'Performance' },
  { id: 'positions', label: 'Positions' },
  { id: 'exit', label: 'Exit math' },
  { id: 'data', label: 'Data' },
];

export default function Dashboard({ initialSheets = [], dir = '', loadError = null }) {
  const [tab, setTab] = useState('overview');
  const [enabled, setEnabled] = useState({});
  const [overrides, setOverrides] = useState({});
  const [hydrated, setHydrated] = useState(false);

  const sheets = initialSheets;

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

  const holdings = useMemo(() => {
    const rows = [];
    for (const s of sheets) {
      if (s.readError || enabled[s.id] === false) continue;
      rows.push(...normalizeRows(s.rows, mappings[s.id] || {}, s.sheet || s.file));
    }
    return rows;
  }, [sheets, mappings, enabled]);

  // Collectr and PriceCharting exports stamp the pull date into the value column
  // header. Surfacing it keeps a stale snapshot from reading as today's market.
  const snapshot = useMemo(() => {
    for (const s of sheets) {
      const d = snapshotDateFrom(mappings[s.id]?.unitValue);
      if (d) return d;
    }
    return null;
  }, [sheets, mappings]);

  const snapshotAge = snapshot ? Math.round((Date.now() - Date.parse(`${snapshot}T12:00:00`)) / 86400000) : null;

  const m = useMemo(() => computeMetrics(holdings), [holdings]);
  const audit = useMemo(() => auditRows(holdings), [holdings]);

  const bySet = useMemo(() => groupBy(m.held, 'set'), [m.held]);
  const byType = useMemo(() => groupBy(m.held, 'productType'), [m.held]);
  const byVendor = useMemo(() => groupBy(m.held.filter((h) => h.vendor), 'vendor'), [m.held]);

  const topByValue = useMemo(() => [...m.held].sort((a, b) => b.totalValue - a.totalValue), [m.held]);
  const concentration = m.valueHeld > 0 ? topByValue.slice(0, 3).reduce((a, h) => a + h.totalValue, 0) / m.valueHeld : null;
  const biggestSet = bySet[0];

  const gainers = useMemo(
    () => [...m.held].filter((h) => h.roi != null).sort((a, b) => b.roi - a.roi),
    [m.held],
  );

  const railDomain = useMemo(() => {
    const rois = (m.ranked.length ? m.ranked : gainers).map((h) => h.roi);
    if (!rois.length) return [-0.5, 1.5];
    const lo = Math.min(-0.25, Math.floor(Math.min(...rois) * 4) / 4);
    const hi = Math.max(0.5, Math.ceil(Math.max(...rois) * 4) / 4);
    return [lo, hi];
  }, [gainers, m.ranked]);

  const hasData = holdings.length > 0;
  const readable = sheets.filter((s) => !s.readError).length;

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
          <div>{count(m.positions)} open positions · {count(m.units)} units</div>
          <div>
            {count(readable)} {readable === 1 ? 'sheet' : 'sheets'} from {dir || 'your uploads'}
          </div>
          {snapshot && (
            <div style={{ color: snapshotAge > 60 ? 'var(--warn)' : undefined }}>
              Prices as of {shortDate(snapshot)}{snapshotAge > 60 ? ` · ${count(snapshotAge)} days old` : ''}
            </div>
          )}
        </div>
      </header>

      {loadError && !hasData && (
        <div className="stack" style={{ marginBottom: 26 }}>
          <Card title="No spreadsheets loaded">
            <p style={{ color: 'var(--ink-2)' }}>{loadError}</p>
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
                  foot={snapshot ? `${count(m.positions)} positions · priced ${shortDate(snapshot)}` : `${count(m.positions)} positions still held`}
                />
                <Kpi label="Cost basis" value={money(m.costHeld)} foot={m.avgHoldDays ? `Average hold ${duration(m.avgHoldDays)}` : 'Add purchase dates for hold length'} />
                <Kpi label="Unrealized" value={signedMoney(m.unrealized)} valueTone={tone(m.unrealized)} foot={`${pct(m.roiHeld)} on cost`} />
                <Kpi
                  label="Realized"
                  value={m.soldCount ? signedMoney(m.realized) : '—'}
                  valueTone={tone(m.realized)}
                  foot={m.soldCount ? `${count(m.soldCount)} sold · ${pct(m.realizedRoi)}` : 'Nothing sold yet'}
                />
              </div>

              <div className="grid grid--2">
                <Card title="Position spread" note="Your nine largest positions by market value">
                  {gainers.length ? (
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

                  <Card title="Best and worst" note="Held positions">
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
              <Card title="Sets ranked" note="Held positions only">
                <p className="table-hint" style={{ marginBottom: 12 }}>Swipe sideways for the rest of the columns.</p>
                <div className="table-scroll">
                  <table className="table--sticky">
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
                  <p className="table-hint" style={{ marginBottom: 12 }}>Swipe sideways for the rest of the columns.</p>
                  <div className="table-scroll">
                    <table className="table--sticky">
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
            <Card title="Every position" note={`${count(holdings.length)} rows loaded`}>
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
            />
          )}
        </>
      )}
    </>
  );
}
