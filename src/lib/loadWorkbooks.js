import * as XLSX from 'xlsx';
import { snapshotDateFrom } from './normalize.js';

const EXTS = new Set(['.xlsx', '.xlsm', '.xls', '.csv']);

/**
 * Cloudflare Workers on the Free plan cap subrequests (fetch calls, and calls
 * through bindings like R2) at 50 per invocation
 * (developers.cloudflare.com/workers/platform/limits/). A cache-miss request to
 * `loadSnapshotHistory` spends: 1 `bucket.list()` + up to N `bucket.get()` (one per
 * selected snapshot) + 1 `caches.default.put()`. With N = 40 that is at most
 * 1 + 40 + 1 = 42, comfortably under the 50 limit. A cache-hit request spends just
 * 1 `bucket.list()` (always needed to detect new uploads and build the cache key)
 * + 1 `caches.default.match()` = 2. If you ever move off the Free plan and want
 * deeper history, this constant is the only thing you need to raise — just redo
 * the arithmetic above for the new subrequest ceiling first.
 */
export const MAX_HISTORY_SNAPSHOTS = 40;

/** Cache API backstop TTL — the real invalidation is the content-derived cache key. */
const CACHE_TTL_SECONDS = 1800;

/**
 * Header rows in hand-built spreadsheets are rarely row 1 — there is usually a
 * title, a blank line, maybe a total. Pick the first row that looks like labels:
 * two or more non-empty cells, mostly text, no leading money values.
 */
function findHeaderRow(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const row = matrix[i] || [];
    const filled = row.filter((c) => String(c ?? '').trim() !== '');
    if (filled.length < 2) continue;
    const texty = filled.filter((c) => typeof c === 'string' && !/^\$?[\d.,]+$/.test(c.trim()));
    if (texty.length >= Math.ceil(filled.length * 0.6)) return i;
  }
  return 0;
}

function sheetToRows(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null, raw: true });
  if (!matrix.length) return { headers: [], rows: [] };

  const hIdx = findHeaderRow(matrix);
  const seen = new Map();
  const headers = (matrix[hIdx] || []).map((h, i) => {
    let name = String(h ?? '').trim() || `Column ${i + 1}`;
    if (seen.has(name)) {
      const n = seen.get(name) + 1;
      seen.set(name, n);
      name = `${name} (${n})`;
    } else seen.set(name, 1);
    return name;
  });

  const rows = [];
  for (let r = hIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] || [];
    if (line.every((c) => c == null || String(c).trim() === '')) continue;
    const obj = {};
    headers.forEach((h, c) => {
      const v = line[c];
      obj[h] = v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null;
    });
    rows.push(obj);
  }
  return { headers, rows };
}

/**
 * Resolve a snapshot's date without fetching its contents: prefer a date embedded
 * in the object key (e.g. `Portfolio-2026-08-28.xlsx`), falling back to the R2
 * `uploaded` timestamp when the key doesn't carry one. Reuses the same regex logic
 * `normalize.js` uses to pull a date out of a spreadsheet column header.
 */
function resolveDate(key, uploaded) {
  return snapshotDateFrom(key) || uploaded.toISOString().slice(0, 10);
}

/**
 * Fetch and parse one R2 object into its per-sheet rows.
 *
 * @param {import('@cloudflare/workers-types').R2Bucket} bucket
 * @param {{key: string, uploaded: Date, date: string}} candidate - a pre-listed,
 *   pre-dated object (see `resolveDate`); no `get()` has happened yet.
 * @returns {Promise<{key: string, uploaded: string, date: string, sheets: Array}>}
 *   Throws (with a descriptive `Error`) if the object is missing, unparsable, or
 *   parses to zero readable sheets — callers are expected to run this through
 *   `Promise.allSettled` and turn a rejection into a `{ key, reason }` skip entry.
 */
async function parseObject(bucket, candidate) {
  const { key, date } = candidate;

  const r2Object = await bucket.get(key);
  if (!r2Object) {
    throw new Error(`File ${key} not found`);
  }

  const arrayBuffer = await r2Object.arrayBuffer();

  // CSVs must go in as a decoded string — handed raw bytes, the parser assumes a
  // legacy codepage and turns apostrophes in names like "Team Rocket's" into mojibake.
  const isCsv = key.toLowerCase().endsWith('.csv');
  const wb = isCsv
    ? XLSX.read(new TextDecoder('utf-8').decode(arrayBuffer).replace(/^\uFEFF/, ''), { type: 'string', cellDates: true })
    : XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const modified = r2Object.uploaded.toISOString();
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const { headers, rows } = sheetToRows(wb.Sheets[sheetName]);
    if (!rows.length) continue;
    sheets.push({
      id: `${key}::${sheetName}`,
      file: key,
      sheet: sheetName,
      modified,
      headers,
      rows,
    });
  }

  if (!sheets.length) {
    throw new Error(`Found file ${key}, but no readable sheets inside it.`);
  }

  return { key, uploaded: modified, date, sheets };
}

/**
 * Build a stable Cache API key from the *content* of a selection of R2 objects
 * (all of their key+uploaded pairs, not just the latest), so an addition,
 * removal, or in-place overwrite of any snapshot in the window invalidates the
 * cache. Hashed to keep the synthetic URL short; SHA-256 via the platform's Web
 * Crypto (no new dependency).
 */
async function buildCacheKey(selected) {
  const material = selected.map((c) => `${c.key}@${c.uploaded.toISOString()}`).join('|');
  const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  const hex = [...new Uint8Array(digestBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // Cache API keys must be valid Request URLs; the host is never actually fetched.
  return new Request(`https://cache.pokemon-investment-dashboard.internal/snapshot-history/${hex}`);
}

/**
 * Load snapshot history from Cloudflare R2 storage, up to `MAX_HISTORY_SNAPSHOTS`
 * of the most recent dated snapshot files, with an edge-cached result so most
 * requests avoid re-fetching and re-parsing every snapshot.
 *
 * @param {import('@cloudflare/workers-types').R2Bucket} bucket - The R2 bucket binding
 * @returns {Promise<{
 *   dir: string,
 *   snapshots: Array<{key: string, date: string, uploaded: string, sheets: Array}>,
 *   skipped: Array<{key: string, date: string, reason: string}>,
 *   error: string|null,
 * }>}
 */
export async function loadSnapshotHistory(bucket) {
  const result = { dir: 'R2 storage', snapshots: [], skipped: [], error: null };

  if (!bucket) {
    result.error = 'R2 storage not configured. Check your wrangler.jsonc configuration.';
    return result;
  }

  // List all objects, following pagination defensively — bucket contents are
  // expected to be well under R2's 1000-per-call max, so this should rarely if
  // ever loop more than once.
  const objects = [];
  try {
    let cursor;
    do {
      const listResult = await bucket.list(cursor ? { cursor } : undefined);
      objects.push(...listResult.objects);
      cursor = listResult.truncated ? listResult.cursor : undefined;
    } while (cursor);
  } catch (err) {
    result.error = `Could not read from R2 storage: ${err.message}`;
    return result;
  }

  const candidates = objects
    .filter((obj) => {
      const key = obj.key.toLowerCase();
      return EXTS.has(key.slice(key.lastIndexOf('.')));
    })
    .map((obj) => ({ key: obj.key, uploaded: obj.uploaded, date: resolveDate(obj.key, obj.uploaded) }))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.uploaded - b.uploaded; // tie-break: earlier upload first
    });

  if (candidates.length === 0) {
    result.error = 'No spreadsheets found in R2 bucket. Upload .xlsx or .csv files to get started.';
    return result;
  }

  // Most recent MAX_HISTORY_SNAPSHOTS by resolved date, ascending.
  const selected = candidates.slice(-MAX_HISTORY_SNAPSHOTS);

  // Cache lookup, keyed off the selected window's content. Cache API is per-colo
  // and known not to work in some environments (e.g. bare *.workers.dev preview
  // domains, and it may behave differently under astro dev / local wrangler dev)
  // — any failure here is treated as a cache miss, never a hard error.
  let cacheKeyRequest = null;
  try {
    cacheKeyRequest = await buildCacheKey(selected);
    const cached = await caches.default.match(cacheKeyRequest);
    if (cached) {
      return await cached.json();
    }
  } catch {
    // Unsupported or erroring Cache API — fall through to a live fetch.
  }

  const settled = await Promise.allSettled(selected.map((candidate) => parseObject(bucket, candidate)));
  const snapshots = [];
  const skipped = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      snapshots.push(outcome.value);
    } else {
      skipped.push({ key: selected[i].key, date: selected[i].date, reason: outcome.reason?.message || String(outcome.reason) });
    }
  });
  snapshots.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  result.snapshots = snapshots;
  result.skipped = skipped;

  // Every candidate was selected but every single one failed to parse — mirrors
  // the safety net the original single-file loadWorkbooks had.
  if (!snapshots.length && selected.length) {
    const lastSkip = skipped.at(-1);
    result.error = `Found ${selected.length} recent file(s) in R2, but none could be read. Most recent attempt (${lastSkip?.key}): ${lastSkip?.reason ?? 'unknown error'}.`;
  }

  if (cacheKeyRequest) {
    try {
      const body = new Response(JSON.stringify(result), {
        headers: {
          'content-type': 'application/json',
          'Cache-Control': `max-age=${CACHE_TTL_SECONDS}`,
        },
      });
      await caches.default.put(cacheKeyRequest, body);
    } catch {
      // Ignore cache write failures — the response itself is unaffected.
    }
  }

  return result;
}
