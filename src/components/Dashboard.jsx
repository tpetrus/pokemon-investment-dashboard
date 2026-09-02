import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Kpi, Tabs, Segmented, SpreadRail, Empty } from './ui.jsx';
import { AllocationDonut, CostVsValueBars, CapitalDeployed, HoldVsReturn, VendorBars } from './Charts.jsx';
import HoldingsTable from './HoldingsTable.jsx';
import SetsRankedTable from './SetsRankedTable.jsx';
import ExitCalculator from './ExitCalculator.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import SetIcon from './SetIcon.jsx';
import { guessMapping, normalizeRows, computeMetrics, groupBy, herfindahl, snapshotDateFrom } from '../lib/normalize.js';
import { buildPortfolioSeries, buildProductSeries } from '../lib/history.js';
import { buildReturnSeries, buildDrawdownSeries, xirr, cashflowsFromHoldings } from '../lib/returns.js';
import { money, signedMoney, pct, count, plainPct, duration, tone, shortDate } from '../lib/format.js';

const STORE_KEY = 'pokemon-dashboard-v1';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'History' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'performance', label: 'Performance' },
  { id: 'positions', label: 'Positions' },
  { id: 'exit', label: 'Exit math' },
];

export default function Dashboard({ initialSheets = [], loadError = null, snapshots = [], skipped = [] }) {
  const [tab, setTab] = useState('overview');
  const [portfolio, setPortfolio] = useState('all');
  const [showUncosted, setShowUncosted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const sheets = initialSheets;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (saved.tab && TABS.some((t) => t.id === saved.tab)) setTab(saved.tab);
      if (saved.portfolio) setPortfolio(saved.portfolio);
      if (typeof saved.showUncosted === 'boolean') setShowUncosted(saved.showUncosted);
    } catch { /* first run */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORE_KEY, JSON.stringify({ tab, portfolio, showUncosted }));
  }, [tab, portfolio, showUncosted, hydrated]);

  // Publish the sticky toolbar's height so non-capped sticky table headers can
  // pin *below* it rather than behind it. Height shifts with the breakpoint and
  // with whether the portfolio row is present, so track it live.
  const toolbarRef = useRef(null);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--toolbar-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--toolbar-h'); };
  }, [sheets.length]);

  // "Is the toolbar stuck?" via a zero-height sentinel just above it — no scroll
  // handler. Drives `data-stuck`, which gates the notch inset + drop shadow so
  // neither shows while the bar is still in normal flow.
  const sentinelRef = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: [0] });
    io.observe(el);
    return () => io.disconnect();
  }, [sheets.length]);

  const mappings = useMemo(() => {
    const out = {};
    for (const s of sheets) {
      if (s.readError) continue;
      out[s.id] = guessMapping(s.headers, s.rows);
    }
    return out;
  }, [sheets]);

  const allHoldings = useMemo(() => {
    const rows = [];
    for (const s of sheets) {
      if (s.readError) continue;
      rows.push(...normalizeRows(s.rows, mappings[s.id] || {}, s.sheet || s.file));
    }
    return rows;
  }, [sheets, mappings]);

  // The exports now carry a "Portfolio Name" column (Cards vs. Sealed). Offer a
  // switch only when more than one bucket actually shows up in the data.
  const portfolios = useMemo(() => {
    const seen = new Set();
    for (const h of allHoldings) if (h.portfolio) seen.add(h.portfolio);
    return [...seen].sort();
  }, [allHoldings]);

  // `portfolio` persists from localStorage and may name a bucket that isn't in
  // the current data — fall back to the unfiltered book when so.
  const activePortfolio = portfolios.includes(portfolio) ? portfolio : null;

  // App-wide scope: the sub-portfolio switch, plus (off by default) whether rows
  // with no recorded cost are in play at all. Both feed every tab and the
  // History-tab series, so a row that survives here is a row the whole app sees.
  const holdings = useMemo(
    () => allHoldings.filter((h) => {
      if (activePortfolio && h.portfolio !== activePortfolio) return false;
      if (!showUncosted && !(h.totalCost > 0)) return false;
      return true;
    }),
    [allHoldings, activePortfolio, showUncosted],
  );

  // How many rows the "no cost" toggle is currently hiding (within the active
  // portfolio) — surfaced in the masthead so the filter is never invisible.
  const hiddenNoCost = useMemo(
    () => (showUncosted ? 0 : allHoldings.filter((h) => (!activePortfolio || h.portfolio === activePortfolio) && !(h.totalCost > 0)).length),
    [allHoldings, activePortfolio, showUncosted],
  );

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

  // Normalize every older snapshot once — guessMapping() only, since a saved
  // override is literal header text that may not exist in an older file. Keyed on
  // `snapshots` alone, so toggling a scope control below never re-parses these.
  const olderSnapshots = useMemo(() => {
    return snapshots.slice(0, -1).map((snap) => {
      const rows = [];
      for (const s of snap.sheets) {
        rows.push(...normalizeRows(s.rows, guessMapping(s.headers, s.rows), s.sheet || s.file));
      }
      return { date: snap.date, rows };
    });
  }, [snapshots]);

  // Apply the app-wide scope to each snapshot: the newest one reuses the already-
  // scoped `holdings`; the rest are just a cheap filter over the rows above.
  const dailyHoldings = useMemo(() => {
    if (!snapshots.length) return [];
    const inScope = (h) => {
      if (activePortfolio && h.portfolio !== activePortfolio) return false;
      if (!showUncosted && !(h.totalCost > 0)) return false;
      return true;
    };
    return [
      ...olderSnapshots.map((s) => ({ date: s.date, holdings: s.rows.filter(inScope) })),
      { date: snapshots.at(-1).date, holdings },
    ];
  }, [olderSnapshots, snapshots, holdings, activePortfolio, showUncosted]);

  const portfolioSeries = useMemo(() => buildPortfolioSeries(dailyHoldings), [dailyHoldings]);
  const productSeries = useMemo(() => buildProductSeries(dailyHoldings), [dailyHoldings]);
  const returnSeries = useMemo(() => buildReturnSeries(portfolioSeries), [portfolioSeries]);
  const drawdownSeries = useMemo(() => buildDrawdownSeries(returnSeries), [returnSeries]);

  // The file currently driving `initialSheets` (and so the rest of the
  // dashboard) is only ever a fallback if the true most-recent candidate — by
  // date, across both successfully-parsed snapshots and skipped ones — turned
  // out to be unreadable.
  const latestFailed = useMemo(() => {
    const all = [
      ...snapshots.map((s) => ({ date: s.date, key: s.key, ok: true })),
      ...skipped.map((s) => ({ date: s.date, key: s.key, ok: false, reason: s.reason })),
    ];
    if (!all.length) return null;
    all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const mostRecent = all.at(-1);
    return mostRecent.ok ? null : mostRecent;
  }, [snapshots, skipped]);

  const m = useMemo(() => computeMetrics(holdings), [holdings]);

  const bySet = useMemo(() => groupBy(m.held, 'set'), [m.held]);
  const byType = useMemo(() => groupBy(m.held, 'productType'), [m.held]);
  const byVendor = useMemo(() => groupBy(m.held.filter((h) => h.vendor), 'vendor'), [m.held]);

  const topByValue = useMemo(() => [...m.held].sort((a, b) => b.totalValue - a.totalValue), [m.held]);
  const biggestSet = bySet[0];

  // Concentration: Herfindahl index (Σ of squared value shares) with its
  // reciprocal read as "as concentrated as N equal-weight holdings".
  const hhiPosition = useMemo(() => herfindahl(m.held.map((h) => h.totalValue)), [m.held]);
  const hhiSet = useMemo(() => herfindahl(bySet.map((g) => g.value)), [bySet]);
  const hhiType = useMemo(() => herfindahl(byType.map((g) => g.value)), [byType]);

  // Portfolio return. XIRR (money-weighted) from this snapshot's dated cash
  // flows; falls back to a plain since-inception return, and stays un-annualized
  // for a portfolio under a year old (GIPS: short periods must not be annualized).
  const firstBuy = useMemo(
    () => m.held.concat(m.sold).map((h) => h.purchaseDate).filter(Boolean).sort()[0] ?? null,
    [m.held, m.sold],
  );
  const spanYears = firstBuy
    ? (Date.now() - Date.parse(`${firstBuy}T12:00:00Z`)) / (365 * 86400000)
    : null;
  const mwr = useMemo(() => xirr(cashflowsFromHoldings(holdings)), [holdings]);
  const totalReturn = (m.costHeld + m.costSold) > 0
    ? (m.valueHeld + m.proceeds) / (m.costHeld + m.costSold) - 1
    : null;
  const returnValue = spanYears != null && spanYears >= 1 ? (mwr ?? totalReturn) : totalReturn;
  const returnFoot = spanYears == null
    ? 'Add purchase dates for a return figure'
    : spanYears < 1
      ? 'Since first buy · not annualized (under a year)'
      : mwr != null
        ? 'Annualized · money-weighted (XIRR)'
        : 'Total return · XIRR needs dated buys and sales';

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

  return (
    <>
      <header className="masthead">
        <div>
          <p className="eyebrow" style={{ margin: '0 0 10px' }}>
            {portfolios.length > 1
              ? (activePortfolio ? `${activePortfolio} portfolio` : 'Full portfolio')
              : 'Sealed portfolio'}
          </p>
          <h1>Pokémon investments</h1>
        </div>
        <div className="masthead__meta">
          <div>{count(m.positions)} open positions · {count(m.units)} units</div>
          {hiddenNoCost > 0 && (
            <div>{count(hiddenNoCost)} {hiddenNoCost === 1 ? 'item' : 'items'} with no cost hidden</div>
          )}
          {snapshot && (
            <div style={{ color: snapshotAge > 60 ? 'var(--warn)' : undefined }}>
              Prices as of {shortDate(snapshot)}{snapshotAge > 60 ? ` · ${count(snapshotAge)} days old` : ''}
            </div>
          )}
          {latestFailed && (
            <div style={{ color: 'var(--warn)' }}>
              Most recent upload ({latestFailed.key}) could not be read: {latestFailed.reason}. Showing {shortDate(snapshots.at(-1)?.date)} instead.
            </div>
          )}
        </div>
      </header>

      {loadError && !sheets.length && (
        <div className="stack" style={{ marginBottom: 26 }}>
          <Card title="No spreadsheets loaded">
            <p style={{ color: 'var(--ink-2)' }}>{loadError}</p>
          </Card>
        </div>
      )}

      {sheets.length > 0 && (
        <>
          <div ref={sentinelRef} aria-hidden="true" style={{ height: 0 }} />
          <div className="toolbar" ref={toolbarRef} data-stuck={stuck || undefined}>
            <div className="toolbar__scope">
              {portfolios.length > 1 && (
                <Segmented
                  label="Portfolio"
                  value={activePortfolio ?? 'all'}
                  onChange={setPortfolio}
                  options={[
                    { value: 'all', label: 'All' },
                    ...portfolios.map((p) => ({ value: p, label: p })),
                  ]}
                />
              )}
              <label className="toolbar__check">
                <input
                  type="checkbox"
                  checked={showUncosted}
                  onChange={(e) => setShowUncosted(e.target.checked)}
                />
                <span>Include no-cost items</span>
              </label>
            </div>
            <Tabs tabs={TABS} active={tab} onChange={setTab} />
          </div>

          {/* Nothing in scope — every tab but History reads `holdings`, so say
              why rather than showing a blank. History has its own gate below
              since it depends on snapshot count, not this. */}
          {!hasData && tab !== 'history' && (
            <Empty title="Nothing to show">
              {hiddenNoCost > 0
                ? 'Every position in scope has no recorded cost. Tick "Include no-cost items" in the bar above to see them.'
                : 'No rows have a cost or value to work with yet — check the source spreadsheet in R2.'}
            </Empty>
          )}

          {tab === 'history' && (
            snapshots.length > 1 ? (
              <HistoryPanel
                portfolioSeries={portfolioSeries}
                productSeries={productSeries}
                returnSeries={returnSeries}
                drawdownSeries={drawdownSeries}
                snapshots={snapshots}
                skipped={skipped}
              />
            ) : (
              <Empty title="Not enough history yet">
                Need at least two readable snapshots to chart portfolio value over time. Upload more dated exports to R2.
              </Empty>
            )
          )}

          {hasData && tab === 'overview' && (
            <div className="stack">
              <div className="grid grid--kpi">
                <Kpi
                  label="Market value"
                  value={money(m.valueHeld)}
                  foot={snapshot ? `${count(m.positions)} positions · priced ${shortDate(snapshot)}` : `${count(m.positions)} positions still held`}
                />
                <Kpi
                  label="Cost basis"
                  value={money(m.costHeld)}
                  foot={m.avgHoldDays ? `Average hold ${duration(m.avgHoldDays)}` : 'Add purchase dates for hold length'}
                  info={
                    <p>
                      <strong>Cost basis</strong> is the total you paid for the positions you still hold.
                      Every profit and return figure on this page is measured against it.
                    </p>
                  }
                />
                <Kpi
                  label="Unrealized"
                  value={signedMoney(m.unrealized)}
                  valueTone={tone(m.unrealized)}
                  foot={`${pct(m.roiHeld)} on cost`}
                  info={
                    <p>
                      <strong>Unrealized profit / loss</strong> is what you'd make or lose if you sold
                      everything you hold right now at market value. It moves with prices every day and
                      isn't locked in until you actually sell.
                    </p>
                  }
                />
                <Kpi
                  label="Realized"
                  value={m.soldCount ? signedMoney(m.realized) : '—'}
                  valueTone={tone(m.realized)}
                  foot={m.soldCount ? `${count(m.soldCount)} sold · ${pct(m.realizedRoi)}` : 'Nothing sold yet'}
                  info={
                    <p>
                      <strong>Realized profit / loss</strong> is what you've actually banked on positions
                      you've already sold — proceeds minus what those items cost you. Unlike unrealized
                      P/L it doesn't change once the sale is done.
                    </p>
                  }
                />
                <Kpi
                  label="Return"
                  value={pct(returnValue)}
                  valueTone={tone(returnValue)}
                  foot={returnFoot}
                  info={
                    <>
                      <p>
                        <strong>Money-weighted return (XIRR).</strong> The one annual growth rate that,
                        applied to every dollar from the day you spent it, lands on today's value. It
                        reflects your timing — adding money just before a run-up lifts it, and the reverse.
                      </p>
                      <p>
                        Annualized once your first purchase is over a year old. Before that it's the plain
                        gain since you started, <em>not</em> annualized — stretching a few months into a
                        yearly rate would overstate it.
                      </p>
                    </>
                  }
                />
              </div>

              <div className="grid grid--2">
                <Card title="Position spread" note="Your nine largest positions by market value">
                  {gainers.length ? (
                    <SpreadRail items={topByValue.filter((h) => h.roi != null).slice(0, 9)} domain={railDomain} />
                  ) : (
                    <Empty title="No returns to plot">Add a market value column to the source sheet and these fill in.</Empty>
                  )}
                </Card>

                <div className="stack">
                  <Card
                    title="Concentration"
                    note="Herfindahl index — lower is more spread out"
                    info={
                      <>
                        <p>
                          <strong>Herfindahl index (HHI).</strong> Square each position's share of your
                          total value, then add them up. Many positions of similar size give a low
                          number; most of your money in one gives a number near 1. Rough scale: below
                          ~0.15 is well spread, above ~0.25 is concentrated.
                        </p>
                        <p>
                          <strong>Equal-weight positions</strong> is just 1 ÷ HHI. An HHI of 0.20 carries
                          the same concentration risk as five positions of identical size — however many
                          you actually hold. "By set" and "by type" run the same math on those groupings.
                        </p>
                      </>
                    }
                  >
                    <div className="stack" style={{ gap: 14 }}>
                      <div className="well">
                        <div className="kpi__label">By position (HHI)</div>
                        <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>
                          {hhiPosition ? hhiPosition.hhi.toFixed(2) : '—'}
                        </div>
                        <div className="kpi__foot">
                          {hhiPosition
                            ? `as concentrated as ${hhiPosition.effectiveN.toFixed(1)} equal-weight positions · by set ${hhiSet ? hhiSet.hhi.toFixed(2) : '—'} · by type ${hhiType ? hhiType.hhi.toFixed(2) : '—'}`
                            : 'Map a market value column to see concentration.'}
                        </div>
                      </div>
                      <div className="well" style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline' }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="kpi__label">Largest set exposure</div>
                          <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>
                            {biggestSet ? plainPct(biggestSet.value / m.valueHeld, 0) : '—'}
                          </div>
                          <div className="kpi__foot">{biggestSet ? `${biggestSet.key} · ${money(biggestSet.value)} across ${count(biggestSet.count)} positions` : '—'}</div>
                        </div>
                        {biggestSet && <SetIcon set={biggestSet.key} variant="logo" />}
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

          {hasData && tab === 'allocation' && (
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
                <SetsRankedTable data={bySet} valueHeld={m.valueHeld} />
              </Card>
            </div>
          )}

          {hasData && tab === 'performance' && (
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

          {hasData && tab === 'positions' && (
            <Card
              title="Every position"
              note={`${count(m.held.length)} held${m.sold.length ? ` · ${count(m.sold.length)} sold` : ''}`}
            >
              <HoldingsTable holdings={holdings} />
            </Card>
          )}

          {hasData && tab === 'exit' && <ExitCalculator holdings={holdings} />}
        </>
      )}
    </>
  );
}
