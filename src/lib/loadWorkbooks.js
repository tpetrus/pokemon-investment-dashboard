import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

export const DEFAULT_DATA_DIR = 'C:\\Users\\trevo\\Google Drive\\Pokemon Investments';

const EXTS = new Set(['.xlsx', '.xlsm', '.xls', '.csv']);

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

export function loadWorkbooks(dir = process.env.POKEMON_DATA_DIR || DEFAULT_DATA_DIR) {
  const result = { dir, sheets: [], error: null };

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    result.error =
      err.code === 'ENOENT'
        ? `No folder at ${dir}. Set POKEMON_DATA_DIR in .env to the folder holding your spreadsheets, or drop files onto the dashboard.`
        : `Could not read ${dir}: ${err.message}`;
    return result;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
    if (!EXTS.has(path.extname(entry.name).toLowerCase())) continue;

    const full = path.join(dir, entry.name);
    try {
      // XLSX.readFile relies on the Node-only fs shim, which the bundler strips.
      // Reading the bytes ourselves keeps this working in dev and in a built server.
      // CSVs must go in as a decoded string — handed raw bytes, the parser assumes a
      // legacy codepage and turns apostrophes in names like "Team Rocket's" into mojibake.
      const isCsv = path.extname(entry.name).toLowerCase() === '.csv';
      const wb = isCsv
        ? XLSX.read(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''), { type: 'string', cellDates: true })
        : XLSX.read(fs.readFileSync(full), { type: 'buffer', cellDates: true });
      const stat = fs.statSync(full);
      for (const sheetName of wb.SheetNames) {
        const { headers, rows } = sheetToRows(wb.Sheets[sheetName]);
        if (!rows.length) continue;
        result.sheets.push({
          id: `${entry.name}::${sheetName}`,
          file: entry.name,
          sheet: sheetName,
          modified: stat.mtime.toISOString(),
          headers,
          rows,
        });
      }
    } catch (err) {
      result.sheets.push({ id: entry.name, file: entry.name, sheet: null, headers: [], rows: [], readError: err.message });
    }
  }

  if (!result.error && !result.sheets.length) {
    result.error = `Found ${dir}, but no readable .xlsx/.xls/.csv files inside it.`;
  }
  return result;
}
