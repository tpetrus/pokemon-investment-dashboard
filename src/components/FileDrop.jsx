import React, { useRef, useState } from 'react';

/** Fallback path: parse spreadsheets in the browser when the data folder is unreachable. */
export default function FileDrop({ onSheets }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);

  const read = async (files) => {
    setBusy(true);
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const sheets = [];
      for (const file of files) {
        const isCsv = /\.csv$/i.test(file.name);
        const wb = isCsv
          ? XLSX.read((await file.text()).replace(/^\uFEFF/, ''), { type: 'string', cellDates: true })
          : XLSX.read(await file.arrayBuffer(), { cellDates: true });
        for (const name of wb.SheetNames) {
          const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: null, raw: true });
          if (matrix.length < 2) continue;
          const headers = (matrix[0] || []).map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
          const rows = matrix.slice(1)
            .filter((line) => line.some((c) => c != null && String(c).trim() !== ''))
            .map((line) => Object.fromEntries(headers.map((h, c) => [h, line[c] instanceof Date ? line[c].toISOString().slice(0, 10) : line[c] ?? null])));
          if (rows.length) sheets.push({ id: `upload:${file.name}::${name}`, file: file.name, sheet: name, headers, rows, modified: null });
        }
      }
      if (!sheets.length) throw new Error('No rows found in those files.');
      onSheets(sheets);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dropzone"
      data-over={over}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); read([...e.dataTransfer.files]); }}
    >
      <p style={{ margin: '0 0 14px', maxWidth: 'none' }}>
        {busy ? 'Reading your spreadsheets…' : 'Drop .xlsx or .csv files here to load them for this session.'}
      </p>
      <button className="btn btn--sm" onClick={() => input.current?.click()}>Choose files</button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".xlsx,.xlsm,.xls,.csv"
        className="sr-only"
        onChange={(e) => read([...e.target.files])}
      />
      {error && <p className="down" style={{ marginTop: 14, maxWidth: 'none' }}>{error}</p>}
    </div>
  );
}
