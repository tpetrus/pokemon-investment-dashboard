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

```
src/lib/loadWorkbooks.js   fetch + parse up to MAX_HISTORY_SNAPSHOTS recent objects from R2
src/lib/normalize.js       synonym-based column mapping, coercion, P/L math, audit
src/lib/history.js         pure aggregation of per-snapshot holdings into portfolio/product series
src/lib/format.js          every user-visible number goes through here
src/lib/useMediaQuery.js   JS-side breakpoints, kept in step with global.css
src/data/tcgSets.json      one-off snapshot of the Pokémon TCG API's /v2/sets — refresh with
                            `npm run fetch:sets`, never at build or request time
src/lib/tcgSets.js         slug-based matching from a holding's free-text `set` string to a
                            tcgSets.json entry; unmatched (including 'Unassigned') resolves to null
src/components/SetIcon.jsx small symbol icon or wide logo image, hotlinked straight from the CDN
                            URL in tcgSets.json; renders nothing if the set doesn't match
src/components/            Dashboard, Charts, HoldingsTable, ExitCalculator, DataPanel, HistoryPanel, ui
src/styles/global.css      the whole design system; there is no CSS-in-JS layer
```

The History tab (`HistoryPanel.jsx`) charts portfolio value/cost basis and per-product
price over time from that snapshot history, plus a combined read/skip status table.
Only the newest snapshot uses the user's saved column-mapping overrides — older
snapshots use `guessMapping()` only, since a manual override is stored as literal
header text that may not exist in an older file.

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
For anything past ~6 columns, mark the essential ones as in `HoldingsTable.jsx`
(`essential: true`) and render `compact ? COLUMNS.filter(...) : COLUMNS`; put a "Show
all columns" toggle next to it so nothing is unreachable. Build table footers from the
visible column list — never hard-code `colSpan`.

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
- User corrections (column mappings, excluded sheets, active tab) persist to
  `localStorage` under `pokemon-dashboard-v1`. Bump the key if the shape changes.
- Preset marketplace fee rates in `ExitCalculator.jsx` are editable on purpose —
  they change, and they depend on seller tier. Don't present them as authoritative.
