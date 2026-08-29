import * as XLSX from 'xlsx';

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

/**
 * Load workbooks from Cloudflare R2 storage.
 * 
 * @param {import('@cloudflare/workers-types').R2Bucket} bucket - The R2 bucket binding
 * @returns {Promise<{dir: string, sheets: Array, error: string|null}>}
 */
export async function loadWorkbooks(bucket) {
  const result = { dir: 'R2 storage', sheets: [], error: null };

  // Check if bucket binding exists
  if (!bucket) {
    result.error = 'R2 storage not configured. Check your wrangler.jsonc configuration.';
    return result;
  }

  // List all objects in the bucket
  let listResult;
  try {
    listResult = await bucket.list();
  } catch (err) {
    result.error = `Could not read from R2 storage: ${err.message}`;
    return result;
  }

  // Filter by supported extensions and sort by key (filename) descending
  const validFiles = listResult.objects
    .filter((obj) => {
      const key = obj.key.toLowerCase();
      return EXTS.has(key.slice(key.lastIndexOf('.')));
    })
    .sort((a, b) => b.key.localeCompare(a.key)); // Sort descending to get most recent first

  if (validFiles.length === 0) {
    result.error = 'No spreadsheets found in R2 bucket. Upload .xlsx or .csv files to get started.';
    return result;
  }

  // Take only the most recent file
  const mostRecent = validFiles[0];
  const key = mostRecent.key;

  try {
    // Fetch the file from R2
    const r2Object = await bucket.get(key);
    
    if (!r2Object) {
      result.error = `Could not read from R2 storage: File ${key} not found`;
      return result;
    }

    // Get file contents as ArrayBuffer
    const arrayBuffer = await r2Object.arrayBuffer();
    
    // Determine if it's a CSV based on extension
    const isCsv = key.toLowerCase().endsWith('.csv');
    
    // Parse the file with XLSX
    // CSVs must go in as a decoded string — handed raw bytes, the parser assumes a
    // legacy codepage and turns apostrophes in names like "Team Rocket's" into mojibake.
    const wb = isCsv
      ? XLSX.read(new TextDecoder('utf-8').decode(arrayBuffer).replace(/^\uFEFF/, ''), { type: 'string', cellDates: true })
      : XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    
    // Get the uploaded timestamp from R2 metadata
    const modified = r2Object.uploaded.toISOString();
    
    // Process each sheet in the workbook
    for (const sheetName of wb.SheetNames) {
      const { headers, rows } = sheetToRows(wb.Sheets[sheetName]);
      if (!rows.length) continue;
      result.sheets.push({
        id: `${key}::${sheetName}`,
        file: key,
        sheet: sheetName,
        modified,
        headers,
        rows,
      });
    }
  } catch (err) {
    result.sheets.push({ 
      id: key, 
      file: key, 
      sheet: null, 
      headers: [], 
      rows: [], 
      readError: err.message 
    });
  }

  if (!result.error && !result.sheets.length) {
    result.error = `Found file ${mostRecent.key}, but no readable sheets inside it.`;
  }
  
  return result;
}
