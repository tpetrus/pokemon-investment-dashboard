# Portfolio analytics enhancements for the Pokémon investment dashboard

> **Status (2026-08-31):** A1, A2, A3 and A4 are implemented — `src/lib/returns.js`
> (TWR index, XIRR, CAGR, drawdown), a Herfindahl concentration card on Overview, a
> "Return" KPI, "Return over time" + "Drawdown from peak" cards on History, and a
> real time-scaled x-axis (`timeAxis()` in `Charts.jsx`) on every history chart.
> C8's `shortPct` formatter landed alongside. Everything else below is still open.

Research output from the `development-research` agent, 2026-08-31. The agent read the
repo before researching; notes below are grounded in the actual code:
`src/lib/history.js`, `src/lib/normalize.js` (`computeMetrics`, `auditRows`),
`src/lib/format.js`, `src/components/Dashboard.jsx`, `src/components/Charts.jsx`,
`src/components/HistoryPanel.jsx`, `src/components/ExitCalculator.jsx`,
`src/lib/useMediaQuery.js`, `src/styles/global.css`.

## Key facts about the architecture that shape every recommendation

1. **Each snapshot is a full state export, and sold rows persist in every export**
   (documented in `history.js` header). Consequence most people miss: **the newest
   snapshot alone contains the complete cash-flow history of the portfolio** — every
   purchased lot with its `purchaseDate` and `totalCost`, every sale with `soldDate`
   and `soldPrice`, plus a terminal value (`valueHeld`). An exact money-weighted
   return (XIRR) and a daily-flow time-weighted return are computable from a **single
   bucket read**, no snapshot history required. `computeMetrics().capitalDeployed`
   already walks per-lot purchase dates, so the pattern exists.
2. **The History X axis is currently a Recharts category axis**
   (`<XAxis dataKey="date" />`, no `type`/`scale`). Snapshots are drawn evenly spaced
   regardless of real date gaps. A 1-week gap and a 6-month gap look identical. Every
   trend, slope and drawdown read off those charts is distorted.
3. **No cross-snapshot position identity except `productKey(name, set)`** (slug-based).
   Name/set drift between exports silently splits a product into two series.
   `buildProductSeries` already lives with this.
4. **Only the newest snapshot gets the user's column-mapping overrides**; older
   snapshots use `guessMapping()` only. A field the guesser misses (e.g. market value)
   makes that snapshot's point silently wrong or absent, and the Snapshots table only
   shows a binary "Read OK".
5. **No external market data, no backend state beyond `localStorage`.** Anything
   needing a benchmark series, a scheduled job, or notifications is a real infra
   change.
6. **Every user-visible number goes through `format.js`; missing renders as `—`.** New
   formatters (a percent-axis shortener, a signed delta chip) belong there.

---

## Group A — High value, good architectural fit (no new infra; computable from the bucket read)

### A1. Portfolio return metrics: time-weighted return, money-weighted return (XIRR), and portfolio CAGR

**What.** Add real return figures. On History: a "Return" chart showing a
time-weighted return (TWR) index (start = 100) alongside the existing value chart. On
Overview: a headline "Annualized return" KPI (money-weighted / XIRR since first
purchase) plus a "since last snapshot" period return.

**Why.** This is the single biggest gap between this and a real investment dashboard.
Right now History answers "what is my portfolio worth" but never "what is my return."
TWR chains sub-period returns across cash-flow dates and removes the effect of *when*
you added money, so it measures the collection's price performance; MWR/XIRR is the
discount rate that equates all cash flows to the terminal value and reflects your
timing — it answers "what annualized rate did my actual dollars earn." Standard
practice is to show both and label what each means (well-established; Wikipedia
"Time-weighted return", CFA GIPS). Per-position `annualized` already exists in
`normalize.js`, but there is no portfolio-level number.

**Fit / effort.** M. TWR between snapshot *t−1* and *t*:
`(value_t − netFlow_t) / value_{t−1}`, chained; the net external flow over the
interval is approximated by the change in cost basis
(`costHeld_t − costHeld_{t−1}` adjusted for cost basis of anything sold in the
interval — derivable from `realized`/`realizedRoi` deltas already in
`portfolioSeries`). XIRR: build a dated cash-flow vector from the newest snapshot's
held+sold rows (`−totalCost` at `purchaseDate`, `+soldPrice` at `soldDate`,
`+valueHeld` today) and solve with Newton's method plus a bisection fallback
(~30 lines, pure, in `history.js` or a new `returns.js`). No infra. Feeds Overview
KPIs and one new Area chart following the existing `useIsNarrow` pattern in
`Charts.jsx`.

**Risks / caveats.**
- XIRR needs an iterative solver; non-convergence (e.g. all cash flows same sign) must
  render `—`, not a wrong number.
- Snapshot-interval TWR is *approximate* — you only see net position state between
  snapshots, not individual buys/sells. The one-snapshot XIRR is exact only where
  `purchaseDate`/`soldDate` are present (the audit already flags missing purchase
  dates) and breaks on partial-lot sales (a row flips entirely to `sold` in
  `normalize.js` today). State these limits in a card note.
- "Returns for periods of less than one year must not be annualized" (GIPS). For a
  young portfolio, show the period return un-annualized and label it.

### A2. Concentration done properly: HHI and effective number of positions

**What.** Replace the ad-hoc "top three positions = X%" in the Overview Concentration
card with the Herfindahl-Hirschman Index over position weights, plus its reciprocal:
"your concentration is equivalent to ~6 equal-weight positions." Add HHI by set and by
product type. Optionally surface HHI in the allocation donut legend.

**Why.** HHI = Σ(weightᵢ²) is the standard concentration measure; 1/HHI is the
"effective number of holdings" — a genuinely intuitive diversification read
(well-established; Wikipedia "Herfindahl–Hirschman index", DOJ merger thresholds:
<0.15 unconcentrated, >0.25 highly concentrated). The current top-3 metric is
arbitrary and doesn't move smoothly as the portfolio rebalances.

**Fit / effort.** S. One pure helper over `topByValue` / `bySet` / `byType`, all
already computed in `Dashboard.jsx`. No infra, no new chart. Format via `plainPct` and
`count`.

**Risks / caveats.** With very few positions HHI is naturally high — pair it with the
effective-N framing so it reads as information, not alarm. Keep the DOJ thresholds as a
footnote, not a verdict.

### A3. Drawdown / underwater view on History

**What.** A running-peak decline chart: track the historical peak of the return index,
plot the percentage decline from that peak as a filled area below zero, and show "max
drawdown" and "current drawdown" as stat tiles.

**Why.** Drawdown is the standard downside-risk view (well-established; Wikipedia
"Drawdown (economics)"; it underlies the Calmar/Sterling/Burke ratios). "How far down
from the top did this ever go, and where am I now" is a question a value chart alone
doesn't answer.

**Fit / effort.** S–M once A1 exists. Running peak over a series is trivial. **Compute
it on the TWR index from A1, not on raw `valueHeld`** — raw value rises mechanically
when you buy more, so a naive underwater chart on value conflates deposits with
losses. This is why A3 should follow A1. One more Area chart with
`ReferenceLine y={0}` on the established mobile pattern.

**Risks / caveats.** Sparse, irregular snapshots understate the true maximum
drawdown — you miss troughs between uploads. Caption it: "based on snapshot dates;
lows between snapshots are not captured."

### A4. Time-scaled X axis on every History chart (correctness fix)

**What.** Switch the History charts from a category axis to a real time scale:
`type="number"`, `scale="time"`, `domain` from timestamps, ticks formatted by
`useIsNarrow` (fewer, shorter on phones).

**Why.** Best practice for any irregular-interval series: distance on the X axis must
equal elapsed time, or slope and trend are meaningless (dataviz fundamentals; the
current code plots snapshots equidistantly). The History tab is still uncommitted, so
fixing it now costs almost nothing and avoids baking the distortion into everything
built on top (A1's TWR line, A3's underwater, C2 annotations all render on this axis).

**Fit / effort.** M. Touches `PortfolioHistoryChart`, `UnrealizedHistoryChart`,
`ProductHistoryChart` and their tooltip label formatting in `Charts.jsx`. No infra.

**Risks / caveats.** Recharts time-axis tick formatting at 320px is fiddly — cap tick
count and use a short format (`MMM ’YY`) when `useIsNarrow`. Points can crowd near the
right edge if you upload frequently for a stretch; a min tick gap handles it (the code
already uses `minTickGap`).

### A5. Per-snapshot health column in the History status table

**What.** For each row in the Snapshots table, show which key fields `guessMapping`
resolved for that older snapshot (cost / value / qty / date, as ✓/✗) and flag a
snapshot whose `costHeld` or `valueHeld` deviates sharply from its neighbours or whose
value column is unmapped.

**Why.** This is the "reconciliation / provenance" data-trust pattern, aimed squarely
at the model's known weak spot: older snapshots don't get the user's overrides, so a
missed column produces a silently wrong or missing point on the value line. Turning
"Read OK" into "read OK, but no market-value column matched" is the difference between
a trustworthy history and a plausible-looking wrong one.

**Fit / effort.** M. `Dashboard.jsx` already builds each older snapshot's mapping via
`guessMapping`; expose which fields came back and pass it to `HistoryPanel`. Deviation
check is an extension of `auditRows` into the time dimension. Reuse `.table-scroll` /
`.table--sticky` / `.table-hint`; register any new flex/grid children in the
`min-width: 0` list in `global.css` per the house rule.

**Risks / caveats.** Don't overwhelm the table on mobile — the health detail can be a
single summary cell ("cost ✓ value ✗") with the full breakdown behind a tap, or in the
non-essential column set.

### A6. Overview trend: value sparkline + "since last snapshot" delta chip on the KPIs

**What.** Add a small sparkline of recent `portfolioSeries.valueHeld` to the "Market
value" KPI and a delta chip to the value/unrealized KPIs
("▲ +$1,240 · +4.1% since Jul 3").

**Why.** Overview-first: the most important thing on a portfolio landing view is "am I
up, and is the line going up" (Shneiderman's "overview first, then details on demand";
NN/g dashboard guidance: make the primary signal glanceable with a linear encoding).
Today the trend lives one tab away and Overview is entirely point-in-time.

**Fit / effort.** S–M. Sparkline = a tiny `AreaChart` with axes/tooltip stripped, in
`Charts.jsx`. Delta = last two `portfolioSeries` entries. New signed/delta formatter
through `format.js`.

**Risks / caveats.** Degrade cleanly with <2 snapshots (no sparkline, no chip — `—`).
Keep the sparkline under ~40px tall so KPI tiles don't grow on a phone.

### A7. Realizable (net-of-fees) portfolio value beside market value

**What.** Show, next to "Market value", an estimated liquidation value: apply the
ExitCalculator's default platform rate to `valueHeld` — "sell everything on eBay today
≈ $X (−$Y fees, before shipping)".

**Why.** For collectibles the quoted "market value" ignores a 10–13% transaction cost
that an investor actually eats on exit. Serious collectible tools present value net of
fees / with a liquidity discount. This is also a small integration win: it ties the
already-built `PLATFORMS` table in `ExitCalculator.jsx` into the headline number.

**Fit / effort.** S–M. Reuse `PLATFORMS[0]` (or a user-chosen default persisted to
`localStorage`). No infra.

**Risks / caveats.** Don't imply instant liquidation — label "before shipping and
time-to-sell." Sealed cases and boxes carry a wider spread and longer sale time than
the flat fee rate implies; note it.

### A8. Contribution since last snapshot: what moved the portfolio

**What.** Between the two most recent snapshots, rank products (and sets) by value
change net of cost-basis change — "Charizard UPC +$180, Surging Sparks booster box
−$60" — so the user sees what drove the period.

**Why.** Attribution / contribution analysis is a standard portfolio view: it
decomposes the total move into per-holding drivers. "What happened last month" is a
question the value line raises but doesn't answer.

**Fit / effort.** M. Per-`productKey` deltas across the last two entries of
`buildProductSeries` output; net out quantity/cost changes so a mid-period purchase
doesn't read as appreciation (`ProductHistoryChart` already makes this distinction for
unit price). New card, optionally a small diverging bar chart.

**Risks / caveats.** Name/set drift splits a product into two keys and produces a
spurious "−100% / +100%" pair; detect an unmatched residual and show it as
"unattributed" rather than hiding it.

---

## Group B — Valuable but needs new infra or data

### B1. Benchmark comparison, indexed to 100

**What.** Overlay portfolio TWR against a reference series (a sealed-Pokémon index, the
S&P 500, or CPI), all rebased to 100 at the common start date.

**Why.** "Did I beat just holding an index fund / just leaving it in cash" is the
question that makes a return number meaningful. Indexed-to-100 overlay is the standard
multi-series comparison (dataviz convention; also handles different absolute scales).

**Fit / effort.** M **plus ongoing data maintenance**. Lowest-infra path: a
hand-maintained monthly JSON committed to the repo, updated the same way the fee
presets in `ExitCalculator.jsx` are — say so explicitly in the UI. A live feed would
need an external API and a scheduled fetch (real infra).

**Risks / caveats.** A stale or cherry-picked benchmark is worse than none.
Date-stamp the series and show its last-updated date. Monthly granularity won't line up
with irregular snapshot dates — interpolate and disclose it.

### B2. Grading support for singles

**What.** Add a `grade` field (PSA/BGS/CGC + numeric) to `FIELDS`/`SYNONYMS` in
`normalize.js` and the mapping UI, and let it disambiguate otherwise-identical
`productKey`s.

**Why.** For singles, grade is most of the value; a raw and a PSA 10 of the same card
are different assets. Standard in collectible trackers.

**Fit / effort.** M. Schema + mapping UI + `productKey` extension. No external infra,
but it's **new data the user must put in the sheet**.

**Risks / caveats.** The masthead says "Sealed portfolio" — this may be low value for
this user specifically. Confirm before building.

### B3. Price-source disclosure / value range

**What.** Present market value as a band rather than a point — either from multiple
mapped source columns (TCG market vs eBay last-sold vs manual override) or a user-set
uncertainty percentage.

**Why.** Illiquid assets with wide bid/ask are conventionally quoted as ranges, not
single figures. A single "market value" implies a precision the underlying data
doesn't have.

**Fit / effort.** M. Multiple sources need new mapping slots and the sheet to carry
them; a flat user-set ± is cheaper but cruder. Charts would need a range area (`Area`
between two dataKeys).

**Risks / caveats.** Bands widen every chart visually — test hard at 320px. Don't let
the range become noise that hides the trend.

### B4. True lot-matched realized gains with FIFO/LIFO/avg toggle

**What.** A cost-basis engine that matches sales to purchase lots by a selectable
method.

**Why.** Standard for tax and for honest realized-P/L reporting when lots were bought
at different prices.

**Fit / effort.** L. Only meaningful if the sheet stops pre-matching sales to their
lot cost (it currently supplies `totalCost` per row). Needs per-transaction data the
"full state export" model doesn't really provide.

**Risks / caveats.** Probably not worth it given the data source. If added, it must
not silently disagree with the sheet's own numbers — show both.

### B5. Staleness / big-move alerting

**What.** Notify (email/push) when the newest snapshot is older than N days or a
position moved more than X%.

**Why.** The dashboard is checked in a card shop; a stale price is a real risk and the
passive in-app banner is easy to miss.

**Fit / effort.** M–L **plus infra**: a Cloudflare Cron Trigger, a notification
channel, and durable "last notified" state (KV or D1) — genuinely beyond
`localStorage`.

**Risks / caveats.** Alert fatigue; needs thresholds and a snooze. Scope creep from a
read-only dashboard into a stateful service.

---

## Group C — Nice-to-have / polish

1. **Time-range presets on History (1M / 3M / 6M / 1Y / All).** S. Marginal with ≤40
   snapshots but scopes the drawdown and return stats and matches user expectation.
2. **Event annotations on the value chart.** S–M. `ReferenceDot` at large buys/sells
   (from `purchaseDate`/`soldDate` + amount) explains the mechanical jumps in the
   value line. Depends on A4.
3. **Log-scale toggle on the portfolio value chart.** S. Pays off only once the
   horizon is long; standard for growth series.
4. **Rebased multi-product overlay** (compare 2–3 products indexed to 100). M.
   Deliberate scope increase over the current one-at-a-time picker in
   `HistoryPanel.jsx`.
5. **Returns histogram** (distribution of snapshot-to-snapshot returns). S–M. Needs
   ~10+ snapshots to mean anything.
6. **Rolling N-snapshot return.** S. Same data-density caveat.
7. **Product age vs return** using `releaseDate` (already in the schema, currently
   unused in analytics). S–M. Sealed product tends to appreciate after the print run
   stops; "days since release vs return" is a collectibles-specific lens.
8. **Factor `shortPct` into `format.js`** and give every percent axis the same
   shortening `shortMoney` gets in `Charts.jsx` (VendorBars inlines
   `(v*100).toFixed(0)+'%'`). S. Consistency + mobile legibility; prerequisite for
   A1/A3 percent axes.
9. **Sealed / singles / slabs split** as an Overview KPI or filter, from the
   `inferProductType` output. S.
10. **Export the computed time series** (`portfolioSeries`, per-product series) as
    CSV/JSON. S. Mirrors the existing "Export CSV" in `HoldingsTable.jsx`; lets power
    users reconcile in their own spreadsheet.
11. **Snapshot cadence line** near the History charts ("snapshots every ~14 days;
    largest gap 63 days"). S. A trust signal that tells the user how much to lean on
    the trend.

---

## The three to do first

1. **A2 — HHI concentration.** Smallest effort, pure function over data already
   assembled in `Dashboard.jsx`, a well-established metric, and it upgrades a card that
   currently shows an arbitrary top-3 number. Zero risk to the mobile constraints or
   the architecture. Good momentum.
2. **A4 — time-scaled X axis on History.** This is a correctness bug, not a feature.
   Every History chart currently misrepresents elapsed time. The History tab is still
   uncommitted, so fixing it now is cheap, and A1 (TWR line), A3 (underwater), and C2
   (annotations) all render on this axis — fix the foundation before building on it.
3. **A1 — portfolio return metrics (TWR + XIRR + CAGR).** The biggest gap between this
   and a real investment dashboard, and the data model supports an *exact* computation
   from a single bucket read. Higher effort, but it turns the History tab from "here's
   your value" into "here's your return," which is the whole point of calling it an
   *investment* dashboard.

Order rationale: A2 is a safe quick win that doesn't collide with the History work; A4
must precede A1 and A3 because they draw on the axis it fixes; A1 must precede a
correct A3 because drawdown belongs on the contribution-neutral TWR index, not on raw
value.

---

## Evidence

- **Time-weighted vs money-weighted return** — Wikipedia, "Time-weighted return"
  (fetched 2026): TWR chains sub-period growth factors across cash-flow dates and
  neutralizes deposit/withdrawal timing; MWR/IRR is the discount rate equating
  external flows and terminal value to the initial investment and penalizes poor
  timing. Use TWR to judge the assets, MWR to judge your dollars. Well-established;
  consistent with CFA Institute GIPS.
- **CAGR / annualization** — Wikipedia, "Rate of return" (fetched 2026):
  `r = (1+R)^(1/t) − 1`; geometric ≤ arithmetic average, gap widens with volatility;
  GIPS: "Returns for periods of less than one year must not be annualized."
  Well-established.
- **Herfindahl-Hirschman Index** — Wikipedia, "Herfindahl–Hirschman index"
  (fetched 2026): `HHI = Σ(shareᵢ²)`; DOJ thresholds <0.15 unconcentrated /
  0.15–0.25 moderate / >0.25 highly concentrated; `1/HHI` = effective number of
  equal-weight holdings. Well-established.
- **Drawdown / maximum drawdown** — Wikipedia, "Drawdown (economics)" (fetched 2026):
  running-peak method, `DD = (peak − value)/peak`; underwater visualization; basis of
  Calmar/Sterling/Burke ratios. Well-established.
- **Dashboard design** — NN/g, "Using Preattentive Attributes in Dashboards"
  (fetched 2026): lead with linear encodings (length, 2D position), make the primary
  signal glanceable, avoid pie/gauge/3D, use grouping for categories. Widely
  practiced.
- **Overview-first, then detail** — Shneiderman's Visual Information-Seeking Mantra
  ("overview first, zoom and filter, details on demand"). Well-established HCI
  principle; cited from memory, not re-fetched this session.
- **Indexed-to-100 comparison, time-proportional axes, log scale for growth series** —
  standard dataviz conventions (e.g. FT/Economist chart practice). General knowledge,
  not a single fetched source.
- **Collectibles valuation as ranges / net of transaction cost** — judgment from how
  price guides (TCGplayer "market price" as a rolling average, eBay sold comps) and
  collectible trackers present value; not from a fetched authoritative source. Treat
  as reasoned inference.
- **Codebase facts** — read directly from the files listed at the top.

Failed fetches: `bogleheads.org/wiki/Calculating_personal_returns` (HTTP 402) and
`investopedia.com` (blocked). Wikipedia substituted, which covers the same ground; the
Bogleheads unitized-return method is another route to TWR if you want a second
source — verify it directly.

## Caveats & uncertainty

- **XIRR / exact-flow claims depend on data completeness.** They hold only where
  `purchaseDate`/`soldDate` and per-lot costs are present (the audit already flags
  gaps) and where sales aren't partial-lot (a row currently flips wholly to `sold` in
  `normalize.js`). Verify against a real export before committing to "exact."
- **Snapshot-interval TWR is approximate** — between snapshots you see net state, not
  individual transactions. Disclose it.
- **Drawdown and any period return understate risk** on sparse, irregular snapshots:
  troughs between uploads are invisible.
- **`productKey` drift** (name/set spelling changes between exports) affects A8, B2,
  and any per-product history. It's a pre-existing limitation of `buildProductSeries`,
  not new.
- **Recharts time-axis behaviour at 320px** (tick density, label collision) is
  version-sensitive and needs testing in the real stylesheet per the CLAUDE.md
  checklist; not run here.
- **Benchmark data (B1)** has no good no-infra source — a hand-maintained series is
  the honest option and must be dated in the UI.
- Effort sizes (S/M/L) are rough estimates from reading the code, not from
  implementing anything.
