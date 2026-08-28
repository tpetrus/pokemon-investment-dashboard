# Pokémon investments dashboard

Astro + React dashboard for your sealed portfolio. It reads the spreadsheets in
`C:\Users\trevo\Google Drive\Pokemon Investments` directly off disk — no upload, no copy step.
Edit a sheet, save it, refresh the page.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:4321.

To preview with the included sample workbook instead of your real folder, copy `.env.example`
to `.env` and set `POKEMON_DATA_DIR=./data`.

If Google Drive for desktop mounts as a drive letter on your machine (`G:\My Drive\...`), put
that path in `.env` instead. The default path is used when no `.env` exists.

## How it reads your sheets

Your column names are not assumed. On load, every `.xlsx`, `.xlsm`, `.xls` and `.csv` in the
folder is parsed, the header row is detected (title rows and blank rows above it are skipped),
and headers are matched to fields by synonym — `Price Paid`, `Cost Each` and `Purchase Price`
all resolve to cost per unit, and so on.

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

## Files

```
src/lib/loadWorkbooks.js   reads and parses the folder (Node)
src/lib/normalize.js       synonym mapping, type coercion, P/L math, data audit
src/components/            Dashboard, charts, table, exit calculator, data panel
src/styles/global.css      the design system
```
