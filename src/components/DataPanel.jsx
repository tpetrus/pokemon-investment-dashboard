import React from 'react';
import { Card } from './ui.jsx';
import { FIELDS } from '../lib/normalize.js';
import { count, shortDate } from '../lib/format.js';

export default function DataPanel({ sheets, enabled, onToggleSheet, mappings, onMap, audit, onReset, children }) {
  return (
    <div className="stack">
      <Card title="Sheets in play" note={`${sheets.length} found`}>
        <div className="stack" style={{ gap: 12 }}>
          {sheets.map((s) => (
            <div key={s.id} className="well" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.file}{s.sheet ? ` · ${s.sheet}` : ''}</div>
                <div className="card__note">
                  {s.readError
                    ? `Could not be read: ${s.readError}`
                    : `${count(s.rows.length)} rows · ${s.headers.length} columns${s.modified ? ` · updated ${shortDate(s.modified.slice(0, 10))}` : ''}`}
                </div>
              </div>
              {!s.readError && (
                <button className="btn btn--sm" aria-pressed={enabled[s.id] !== false} onClick={() => onToggleSheet(s.id)}>
                  {enabled[s.id] === false ? 'Excluded' : 'Included'}
                </button>
              )}
            </div>
          ))}
          {children}
        </div>
      </Card>

      {sheets.filter((s) => !s.readError && enabled[s.id] !== false).map((s) => (
        <Card key={s.id} title={`Column mapping — ${s.file}${s.sheet ? ` · ${s.sheet}` : ''}`} note="Guessed from your headers; change anything that looks wrong">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={`${s.id}-${f.key}`}>{f.label}</label>
                <select
                  id={`${s.id}-${f.key}`}
                  value={mappings[s.id]?.[f.key] ?? ''}
                  onChange={(e) => onMap(s.id, f.key, e.target.value)}
                >
                  <option value="">Not in this sheet</option>
                  {s.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                {f.hint && <span className="card__note">{f.hint}</span>}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card title="Data check" note="Gaps that would quietly skew the totals">
        {audit.length === 0 ? (
          <p style={{ color: 'var(--ink-2)' }}>Nothing missing. Every row has a cost, a value and a date.</p>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {audit.map((issue) => (
              <div key={issue.label} className="well">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 600 }}>
                  <span>{issue.label}</span>
                  <span className="num">{issue.count}</span>
                </div>
                <div className="card__note" style={{ marginTop: 6 }}>
                  {issue.rows.map((r) => r.name).join(' · ')}{issue.count > issue.rows.length ? ' …' : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div>
        <button className="btn btn--sm" onClick={onReset}>Reset mapping to the automatic guess</button>
      </div>
    </div>
  );
}
