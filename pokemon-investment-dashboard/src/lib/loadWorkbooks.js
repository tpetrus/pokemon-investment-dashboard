import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The data folder that ships with the project: <project root>/data */
export const DEFAULT_DATA_DIR = path.resolve(here, '..', '..', 'data');

const EXTS = new Set(['.csv', '.xlsx', '.xlsm', '.xls']);

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n) => String(n).padStart(2, '0');
const valid = (y, m, d) => y > 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

/**
 * Each export is a snapshot and the date lives in the file name. Recognised:
 * 2026-02-01, 2026_02_01, 20260201, 02-01-2026, 2026-02, Feb 2026, 1 Feb 2026.
 * A month with no day resolves to the first of that month.
 */
export function dateFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '');

  let m = base.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (m && valid(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  m = base.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (m && valid(+m[1], +m[2], +m[3])) return `${m[1]}-${m[2]}-${m[3]}`;

  m = base.match(/(?<!\d)(\d{1,2})[-_./](\d{1,2})[-_./](20\d{2}|\d{2})(?!\d)/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (valid(y, +m[1], +m[2])) return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }

  m = base.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ ,]*(\d{1,2})[-_ ,]+(20\d{2})/i);
  if (m) return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`;

  m = base.match(/(\d{1,2})?\s*[-_ ]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ ,]*(20\d{2})/i);
  if (m) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1] ? +m[1] : 1)}`;

  m = base.match(/(20\d{2})[-_.](\d{1,2})(?!\d)/);
  if (m && valid(+m[1], +m[2], 1)) return `${m[1]}-${pad(m[2])}-01`;

  return null;
}

/** Header rows are rarely row 1 in a hand-built sheet — find the row that looks like labels. */
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

const headerDate = (headers) => {
  for (const h of headers) {
    const m = String(h).match(/(20\d{2}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return null;
};

export function loadWorkbooks(dir = process.env.POKEMON_DATA_DIR || DEFAULT_DATA_DIR) {
  const result = { dir, sheets: [], error: null };

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    result.error =
      err.code === 'ENOENT'
        ? `No folder at ${dir}. Create it and drop your exports in, or point POKEMON_DATA_DIR at another folder.`
        : `Could not read ${dir}: ${err.message}`;
    return result;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTS.has(ext)) continue;

    const full = path.join(dir, entry.name);
    try {
      // CSVs must go in as a decoded string — handed raw bytes the parser assumes a
      // legacy codepage and turns apostrophes in names like "Team Rocket's" into mojibake.
      const wb = ext === '.csv'
        ? XLSX.read(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''), { type: 'string', cellDates: true })
        : XLSX.read(fs.readFileSync(full), { type: 'buffer', cellDates: true });

      const stat = fs.statSync(full);
      const fromName = dateFromFilename(entry.name);

      for (const sheetName of wb.SheetNames) {
        const { headers, rows } = sheetToRows(wb.Sheets[sheetName]);
        if (!rows.length) continue;

        const fromHeader = headerDate(headers);
        const snapshot = fromName || fromHeader || stat.mtime.toISOString().slice(0, 10);
        const dateSource = fromName ? 'file name' : fromHeader ? 'column header' : 'file date';

        result.sheets.push({
          id: `${entry.name}::${sheetName}`,
          file: entry.name,
          sheet: wb.SheetNames.length > 1 ? sheetName : null,
          modified: stat.mtime.toISOString(),
          snapshot,
          dateSource,
          headers,
          rows,
        });
      }
    } catch (err) {
      result.sheets.push({ id: entry.name, file: entry.name, sheet: null, headers: [], rows: [], readError: err.message });
    }
  }

  result.sheets.sort((a, b) => String(a.snapshot).localeCompare(String(b.snapshot)));

  if (!result.error && !result.sheets.length) {
    result.error = `Found ${dir}, but there are no readable .csv or .xlsx files in it.`;
  }
  return result;
}
