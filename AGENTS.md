# Pokémon investment dashboard — working notes

> **`CLAUDE.md` and `AGENTS.md` are 1:1.** They are the same document under two
> names so that every coding agent reads the same instructions — Claude Code picks
> up `CLAUDE.md`, opencode and most others pick up `AGENTS.md`. Any edit to one
> must be copied verbatim to the other in the same commit; never let them drift,
> and never split them into "the Claude one" and "the other one".
>
> ```bash
> cp CLAUDE.md AGENTS.md   # after editing CLAUDE.md
> ```

Astro 7 + React 18 on Cloudflare Workers. Spreadsheets are read from R2 at request
time (`src/lib/loadWorkbooks.js`), normalised in `src/lib/normalize.js`, and rendered
by a single client-side island: `<Dashboard client:load>` in `src/pages/index.astro`.
There is no build step for data and no database — a page load is a bucket read.

`Dashboard.jsx` applies two app-wide scope filters to `allHoldings` before anything
else sees the data (every tab, KPI, chart, and the History-tab series): the
sub-portfolio switch (`Portfolio Name` → `portfolio` field in `normalize.js`; All /
Cards / Sealed, shown only when more than one bucket is present) and an
"Include no-cost items" checkbox that is **off by default**, so rows with no recorded
cost (`!(h.totalCost > 0)`) are excluded until it's ticked. The masthead shows an
"N items with no cost hidden" line while that filter is biting.

Both controls plus the tab strip share one sticky bar (`.toolbar`, full-bleed via a
negative margin equal to the shell gutter; scope controls in `.toolbar__scope`). A
`ResizeObserver` in `Dashboard.jsx` publishes its height as `--toolbar-h`; non-capped
sticky table headers pin at that offset so they sit *below* the bar, not behind it.
An `IntersectionObserver` on a zero-height sentinel just above the bar toggles
`data-stuck`, which is what gates the notch inset (`env(safe-area-inset-top)`) and the
drop shadow — neither shows while the bar is still in normal flow. The bar goes
`position: static` on short landscape screens.

```
src/lib/loadWorkbooks.js   fetch + parse up to MAX_HISTORY_SNAPSHOTS recent objects from R2
src/lib/normalize.js       synonym-based column mapping, coercion, P/L math
src/lib/history.js         pure aggregation of per-snapshot holdings into portfolio/product series
src/lib/returns.js         pure return math — chained time-weighted return index, XIRR
                            (money-weighted) from one snapshot's dated cash flows, CAGR, drawdown
src/lib/format.js          every user-visible number goes through here
src/lib/useMediaQuery.js   JS-side breakpoints, kept in step with global.css
src/lib/useIncrementalList.js  reveal a long list in chunks on scroll (IntersectionObserver,
                            no deps); pair with `.table--virtual` (content-visibility) on rows
src/data/tcgSets.json      one-off snapshot of the Pokémon TCG API's /v2/sets — refresh with
                            `npm run fetch:sets`, never at build or request time
src/lib/tcgSets.js         slug-based matching from a holding's free-text `set` string to a
                            tcgSets.json entry; unmatched (including 'Unassigned') resolves to null
src/components/SetIcon.jsx small symbol icon or wide logo image, hotlinked straight from the CDN
                            URL in tcgSets.json; renders nothing if the set doesn't match
src/components/            Dashboard, Charts, HoldingsTable, SetsRankedTable, ExitCalculator, HistoryPanel, ui
src/styles/global.css      the whole design system; there is no CSS-in-JS layer
```

The History tab (`HistoryPanel.jsx`) charts portfolio value/cost basis, a time-weighted
return index (base 100) with its drawdown-from-peak, and per-product price over time
from that snapshot history, plus a combined read/skip status table. Time-series charts
use a real time-scaled x-axis (`timeAxis()` in `Charts.jsx`) — a 6-month gap between
snapshots is drawn six times wider than a 1-month gap, never equidistant. Every
snapshot, newest included, is column-mapped by `guessMapping()` alone — there is no
manual column-mapping UI.

Portfolio return figures come from `src/lib/returns.js`: the time-weighted index is
chained across snapshots (between-snapshot flows inferred from the change in cost basis
and cumulative proceeds — approximate, since individual buys/sells inside an interval
are invisible); XIRR is solved from the newest snapshot's dated per-lot cash flows and
is only as complete as the sheet's purchase/sold dates. The Overview "Return" KPI shows
XIRR annualized once the portfolio is over a year old, and an un-annualized
since-inception return before that (GIPS: short periods must not be annualized).

`npm run dev` needs `wrangler login` — the dev R2 binding has `"remote": true`, so
local dev talks to the real `pokemon-data-dev` bucket rather than an empty simulated
one. `/` is behind a password check in `src/middleware.ts`.

## Mobile is the default target, not an afterthought

This dashboard is read on a phone as often as on a desktop — checking a position in a
card shop is the whole point. **Every new view, card, table, chart, or control must
work at 320px wide before it is considered done.** The rules below are not style
preferences; each one is a bug that was actually shipped here and fixed.

### The rules

**1. Never let anything widen the document.** Horizontal page scroll is the failure
mode to watch for. The two causes, both live in this codebase:

- `repeat(auto-fit, minmax(380px, 1fr))` lays a 380px track inside a 320px container.
  Always write `minmax(min(380px, 100%), 1fr)`.
- Grid and flex children are `min-width: auto`, so they refuse to shrink below their
  own content. `global.css` sets `min-width: 0` on the children of `.grid`, `.stack`,
  `.filters`, `.inputs`, `.masthead`, `.card__head` and `.rail__label`. **Any new
  grid or flex container needs its children added to that list**, or one long product
  name will drag the whole page sideways.

Overflow belongs to a named scroll container — `.table-scroll`, `.tabs` — never to
`<body>`. Do not paper over a leak with `overflow-x: hidden`; find the element.

**2. Wide tables scroll inside `.table-scroll` with `.table--sticky` on the table.**
Under 860px the first column pins to the left so a row never loses the product it
belongs to. Pair it with a `.table-hint` line, which is `display: none` above 860px.
For anything past ~6 columns, flag the interesting ones as in `HoldingsTable.jsx`
(`default: true`), render `COLUMNS.filter((c) => shownKeys.has(c.key))`, and give the
reader a `.colmenu` checklist (the "Columns" button) to add the rest back — the full
set overflows even a desktop sideways, so the lean default is what avoids a horizontal
scroll. Build table footers from the visible column list — never hard-code `colSpan`.

Long tables (Positions, Sets ranked) add `.table--virtual` to the table so the browser
skips layout/paint for off-screen body rows (`content-visibility`, `--vrow` seeds the
row height), and drive the row list through `useIncrementalList` so the first paint only
mounts ~80 rows. Their rows scroll *inside* the container, not the page: the wrapping
`.table-scroll` also takes `.table-scroll--capped` (adds `overflow-y` + a `dvh` max
height) and carries the hook's `rootRef`, so the sticky `<thead>` pins to the box and
the reveal tracks that scroll rather than the window's. No windowing library — sticky
header, sticky first column, `<tfoot>` totals, sort and find-in-page all keep working.
Put the hook in a component that mounts only with the table (see `SetsRankedTable.jsx`),
and give the scroll sentinel row `contentVisibility: 'visible'` so it isn't itself skipped.

**3. Recharts sizes in pixels, so charts take the breakpoint as an argument.** Import
`useIsNarrow` from `src/lib/useMediaQuery.js` and shrink `height`, `margin`, and
especially `YAxis width` — a 140px category axis is a third of a phone screen. Shorten
the *labels* too, not just the type: `shortMoney` and `clip` in `Charts.jsx`. Keep
tooltips under `max-width: min(78vw, 280px)`.

**4. There is no hover on touch.** Any state or figure that only appears on hover has
to be reachable another way — the allocation donut carries its numbers in the legend
for exactly this reason. Wrap decorative `:hover` rules in `@media (hover: hover)`, or
they latch on after a tap and stay.

**5. Touch targets are 44px minimum**, including table sort buttons and icon-only
controls. `.btn`, `.tab`, and inputs already clear it; check anything new.

**6. Inputs stay at 16px** (`--step-0`). Anything smaller makes iOS Safari zoom the
viewport on focus and it never zooms back. Set `inputMode`/`enterKeyHint`/
`autoCapitalize` on text fields so the right keyboard opens.

**7. Respect the notch and the browser chrome.** Page padding goes through
`max(var(--gutter), env(safe-area-inset-*))`; both pages ship
`viewport-fit=cover`. Use `dvh`, not `vh`, for anything full-height — `100vh` sits
under mobile browser chrome.

**8. Prefer CSS to JS for responsiveness.** `useMediaQuery` returns `false` during SSR
and corrects on mount, so it is safe for *presentation* only. Never gate content or
data on it, or the HTML a phone receives differs from the HTML that was rendered.

### Breakpoints

Defined once in `global.css` and mirrored in `src/lib/useMediaQuery.js` — change both
together.

| Width      | Name     | What changes |
|------------|----------|--------------|
| ≤ 860px    | `tablet` | Tables scroll with a pinned first column; `HoldingsTable` goes compact; tab strip becomes a swipeable rail |
| ≤ 640px    | `narrow` | Chart dimensions shrink; padding, gaps and KPI type step down; masthead left-aligns |
| ≤ 560px    | —        | Spread-rail labels stack |
| ≤ 400px    | —        | Tightest padding |
| ≤ 480px tall, landscape | — | Vertical spacing only |

### Checking it before you call it done

The app needs a Cloudflare login and the site password to run, which makes quick
layout checks awkward. The reliable shortcut is to render the real stylesheet against
representative markup and measure:

```js
// in the browser console, at 320px and 375px wide
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

That must be `true`. Then list anything sticking out:

```js
[...document.querySelectorAll('main *')]
  .filter(e => e.getBoundingClientRect().right > innerWidth + 1)
  .filter(e => !e.closest('.table-scroll') && !e.closest('.tabs'))
```

That must be empty. Check 320, 375, 768 and a desktop width, and confirm the desktop
layout did not change.

## Set images

`npm run fetch:sets` re-runs `scripts/fetch-tcg-sets.mjs`, which pages through the public
Pokémon TCG API (`api.pokemontcg.io/v2/sets`, no key needed — 1,000 requests/day keyless is
plenty for an occasional manual run) and overwrites `src/data/tcgSets.json` with id/name/series/
releaseDate and the `images.symbol`/`images.logo` URLs *verbatim* from the API response. Never
reconstruct an image URL from a set id — a growing subset of sets (the newest ones, since a 2026
migration toward a paid successor called Scrydex) resolve to images.scrydex.com instead of
images.pokemontcg.io, and the API response is the only reliable source for which. Images are
hotlinked at render time, never re-hosted — there is no Cloudflare Images binding in this app.
`src/lib/tcgSets.js` matches a holding's free-text `set` field (there is no canonical set ID in
the source spreadsheets) by exact name, then a small era-alias table plus subtitle stripping,
then bounded substring matching; an unmatched set (including the 'Unassigned' sentinel) returns
null and `SetIcon` renders nothing rather than a broken-image icon. Re-run `npm run fetch:sets`
periodically to pick up newly released sets — the legacy pokemontcg.io API has an announced but
undated end-of-life, so if the script starts failing outright rather than intermittently, that
migration is the likely cause and the fetch URL/schema will need revisiting.

## Other conventions

- Every number rendered to a user goes through `src/lib/format.js`. Missing values
  render as `—`, never `0`, `null` or `NaN`.
- Contrast is part of the design, not a nice-to-have: this is a light neumorphic
  surface, where low contrast is the usual failure. Body text sits at 13.4:1,
  secondary at 6.6:1, and `--ink-3` is for labels only. Focus rings are solid 3px
  outlines — never a soft shadow, which is invisible in sunlight.
- The active tab, the selected sub-portfolio, and the "include no-cost items"
  toggle persist to `localStorage` under `pokemon-dashboard-v1`. Bump the key if
  the shape changes.
- Preset marketplace fee rates in `ExitCalculator.jsx` are editable on purpose —
  they change, and they depend on seller tier. Don't present them as authoritative.
