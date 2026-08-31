# Pokémon investments dashboard

Astro + React dashboard for your sealed portfolio. It reads your spreadsheets from
Cloudflare R2 storage, loading the most recent file automatically.

## Run it

**Prerequisites:**
- R2 buckets created and configured (see R2 Setup below)
- At least one spreadsheet uploaded to your R2 bucket

```bash
npm install
npm run dev
```

Then open http://localhost:4321.

## R2 Setup

### Create R2 buckets

Create two R2 buckets in the Cloudflare dashboard:
- `pokemon-data-dev` — for local development
- `pokemon-data-prod` — for production

Navigate to **R2** in your Cloudflare dashboard, click **Create bucket**, and create each bucket.

### Configure bindings

The R2 bindings are already configured in `wrangler.jsonc`. The dev environment uses
`pokemon-data-dev`, and production uses `pokemon-data-prod`.

### Upload files

Upload your spreadsheets to the appropriate bucket via the Cloudflare dashboard or wrangler CLI.

**Via Cloudflare dashboard:**
1. Navigate to your bucket
2. Click **Upload**
3. Select your spreadsheet file

**Via wrangler CLI:**
```bash
wrangler r2 object put pokemon-data-dev/Portfolio-2026-08-28.xlsx --file=./Portfolio-2026-08-28.xlsx
```

### File naming

Use date-based naming (e.g., `Portfolio-YYYY-MM-DD.xlsx`) to keep files organized. The app
automatically loads the most recent file in the bucket based on the last modified timestamp.

### Local development

When running `npm run dev`, the app connects to the `pokemon-data-dev` bucket. Upload test
files there to avoid affecting your production data.

## How it reads your sheets

Your column names are not assumed. On load, the most recent file in the R2 bucket is fetched
and parsed. The header row is detected (title rows and blank rows above it are skipped), and
headers are matched to fields by synonym — `Price Paid`, `Cost Each` and `Purchase Price` all
resolve to cost per unit, and so on.

Anything guessed wrong is fixable in the **Data** tab, where every field has a dropdown of your
actual column names. Corrections are saved in the browser, so they stick between sessions.
Sheets you don't want counted (scratch tabs, wishlists) can be excluded there too.

A row counts as **sold** when it has a sold date or sold price; everything else is **held**.
Totals are derived where possible: cost basis falls back to quantity × cost per unit, market
value to quantity × market value per unit.

## Collectr exports

Your `Sealed.csv` export maps cleanly, with three quirks handled automatically:

- `Portfolio Name` and `Category` hold one value on every row, so they are skipped rather
  than mistaken for the product name and the product type.
- There is no product type column — the format is read off the product name instead
  (elite trainer box, booster box, booster bundle, blister, tin, premium collection, and so on),
  which is what the allocation-by-type chart groups on.
- The snapshot date in `Market Price (As of ...)` is parsed and shown next to the value, in
  amber once it is more than 60 days old. The February pull is 208 days stale as of today.

`Date Added` is used as the purchase date. If that drifts from when you actually bought
something, remap it in the Data tab.

## What's in it

- **Overview** — market value, cost basis, unrealized and realized P/L, the position spread
  rail, concentration in your top three positions and largest set, and cumulative capital
  deployed by purchase date.
- **Allocation** — value by set, cost basis against market value by product type, and a ranked
  set table with portfolio share.
- **Performance** — strongest and weakest positions, hold length against return (bubble size is
  cost basis), return by where you bought it, and closed positions with realized profit.
- **Positions** — every row, sortable and filterable, with column totals and CSV export.
- **Exit math** — platform fees, promoted listing rate, shipping and supplies against a sale
  price, with net proceeds, break-even price, and the list price needed for a target return.
  Preset rates are editable because they change and depend on your seller tier.
- **Data** — sheet inclusion, column mapping, and a data check that flags rows missing a cost,
  a value or a date before those gaps skew a total.

## Design notes

Light neumorphic surface: one continuous background with paired shadows for depth instead of
borders and fills. The usual accessibility trap in this style is low contrast, so body text sits
at 13.4:1 and secondary text at 6.6:1 against the surface, focus rings are solid 3px outlines
rather than soft shadows, controls are at least 44px tall, and every figure is set in tabular
numerals so columns align. Reduced motion and print are both handled.

## Mobile

The dashboard is built to be read on a phone, and every view has to hold up at 320px wide.
Grids collapse to a single column, the tab strip becomes a swipeable rail, wide tables scroll
sideways with the product column pinned in place, the positions table drops to six essential
columns with a toggle for the rest, and charts shrink their axes and shorten their labels rather
than just their type. Touch targets clear 44px, hover-only affordances have a tap equivalent,
inputs stay at 16px so iOS does not zoom on focus, and page padding respects the notch.

If you are adding a feature, the rules and the checks that keep this working are in
[CLAUDE.md](CLAUDE.md) — the short version is that nothing may widen the document, and
`min-width: 0` belongs on the children of every new grid or flex container.

## Files

```
src/lib/loadWorkbooks.js   fetches and parses from R2
src/lib/useMediaQuery.js   JS-side breakpoints, kept in step with global.css
src/lib/normalize.js       synonym mapping, type coercion, P/L math, data audit
src/components/            Dashboard, charts, table, exit calculator, data panel
src/styles/global.css      the design system
```
