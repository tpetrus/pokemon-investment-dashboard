import React, { useEffect, useRef } from 'react';
import { money, pct, tone } from '../lib/format.js';

export function Card({ title, note, children, flush = false, className = '', ...rest }) {
  return (
    <section className={`card ${flush ? 'card--flush' : ''} ${className}`} {...rest}>
      {(title || note) && (
        <header className="card__head" style={flush ? { padding: '24px 24px 0' } : undefined}>
          {title && <h3 className="card__title">{title}</h3>}
          {note && <span className="card__note">{note}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, foot, valueTone }) {
  return (
    <div className="card">
      <div className="kpi__label">{label}</div>
      <div className={`kpi__value ${valueTone || ''}`}>{value}</div>
      {foot && <div className="kpi__foot">{foot}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  const rail = useRef(null);

  // Below 860px the tab strip is a horizontal scroller (see global.css). A tab
  // restored from localStorage can start off-screen, so pull it into view — and
  // only along the x axis, since scrollIntoView would otherwise jump the page.
  useEffect(() => {
    const el = rail.current?.querySelector('[aria-selected="true"]');
    if (!el || !rail.current || rail.current.scrollWidth <= rail.current.clientWidth) return;
    const strip = rail.current.getBoundingClientRect();
    const tab = el.getBoundingClientRect();
    rail.current.scrollBy({
      left: tab.left - strip.left - (strip.width - tab.width) / 2,
      behavior: 'smooth',
    });
  }, [active]);

  return (
    <div className="tabs" role="tablist" aria-label="Dashboard sections" ref={rail}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          className="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Signature element. Each position gets an inset groove; the pill lands where the
 * position's return sits on a scale shared across the whole list, so relative
 * performance is legible without reading a single number.
 */
export function SpreadRail({ items, domain }) {
  const lo = domain?.[0] ?? -0.5;
  const hi = domain?.[1] ?? 1.5;
  const place = (v) => {
    const clamped = Math.min(hi, Math.max(lo, v ?? 0));
    return ((clamped - lo) / (hi - lo)) * 100;
  };
  const zero = place(0);

  return (
    <div className="stack" style={{ gap: 18 }}>
      {items.map((it) => {
        const x = place(it.roi);
        const t = tone(it.roi);
        const color = t === 'up' ? 'var(--up)' : t === 'down' ? 'var(--down)' : 'var(--ink-2)';
        const left = Math.min(x, zero);
        const width = Math.abs(x - zero);
        return (
          <div className="rail" key={it.id}>
            <div className="rail__label">
              <span>
                <strong>{it.name}</strong>
                {it.set && it.set !== 'Unassigned' && <span style={{ color: 'var(--ink-3)' }}> · {it.set}</span>}
              </span>
              <span className="num">
                {money(it.totalCost)} → {money(it.totalValue)}
              </span>
            </div>
            <div
              className="rail__track"
              role="img"
              aria-label={`${it.name}: cost ${money(it.totalCost)}, now ${money(it.totalValue)}, return ${pct(it.roi)}`}
            >
              <div className="rail__zero" style={{ left: `calc(${zero}% - 1px)` }} />
              <div className="rail__fill" style={{ left: `${left}%`, width: `${width}%`, color }} />
              <div className="rail__pill" style={{ left: `${x}%`, color }}>
                {pct(it.roi, 0)}
              </div>
            </div>
          </div>
        );
      })}
      <div className="rail__scale" aria-hidden="true">
        <span>{pct(lo, 0)}</span>
        <span className="rail__scale-zero" style={{ left: `${zero}%` }}>break even</span>
        <span>{pct(hi, 0)}</span>
      </div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="notice">
      <strong>{title}</strong>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}
