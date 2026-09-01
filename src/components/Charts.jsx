import React from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, AreaChart, Area, ScatterChart, Scatter, ZAxis, ReferenceLine, LabelList, Legend,
} from 'recharts';
import { money, signedMoney, pct, plainPct, shortPct, count, shortDate } from '../lib/format.js';
import { useIsNarrow } from '../lib/useMediaQuery.js';
import SetIcon from './SetIcon.jsx';

export const SERIES = ['#3b4bc4', '#0f7b8a', '#146b46', '#8a5416', '#6d3f9d', '#ab2a20', '#2f6fb0', '#4d566b'];

/* Recharts sizes its axes in pixels, so every chart takes the breakpoint as an
   argument rather than leaving it to CSS. A 140px category axis is a third of a
   phone screen; a 72px money axis is a fifth. Both have to shrink, and the
   labels in them have to get shorter, not just smaller. */

const axisFor = (narrow) => ({
  stroke: 'rgba(107,115,135,.4)',
  tick: { fill: '#4d566b', fontSize: narrow ? 10 : 12 },
});

/** $12,400 is unreadable in a 48px axis gutter; $12.4k is not. */
const shortMoney = (v) => {
  const n = Math.abs(v);
  if (n >= 1000) return `${v < 0 ? '−' : ''}$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${v < 0 ? '−' : ''}$${Math.round(n)}`;
};

const clip = (s, max) => (String(s).length > max ? `${String(s).slice(0, max - 1)}…` : String(s));

/* Time-series charts get a real time axis, not a category axis: a 6-month gap
   between two snapshots has to look six times wider than a one-month gap, or
   every slope on the chart is a lie. Each series row carries `date` (ISO); `t`
   is the millisecond timestamp the axis actually positions on. */
const toTime = (iso) => Date.parse(`${iso}T12:00:00Z`);
const withTime = (rows) => rows.map((d) => ({ ...d, t: toTime(d.date) }));

const tickDate = (t, long) => {
  const d = new Date(t);
  return long
    ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Shared X-axis props for a time series. `long` (month + year ticks) kicks in
    past ~7 months of span, and always on a phone where "Feb 12" won't fit. */
const timeAxis = (narrow, rows) => {
  const ts = rows.map((r) => r.t).filter(Number.isFinite);
  const spanDays = ts.length > 1 ? (Math.max(...ts) - Math.min(...ts)) / 86400000 : 0;
  const long = narrow || spanDays > 210;
  return {
    dataKey: 't',
    type: 'number',
    scale: 'time',
    domain: ['dataMin', 'dataMax'],
    tickFormatter: (t) => tickDate(t, long),
    tickCount: narrow ? 4 : 6,
    minTickGap: narrow ? 24 : 20,
    ...axisFor(narrow),
  };
};

const panel = {
  background: '#e9edf4',
  border: '1px solid rgba(255,255,255,.8)',
  borderRadius: 14,
  boxShadow: '6px 6px 14px #c3cad9, -6px -6px 14px #ffffff',
  padding: '12px 14px',
  fontSize: 13,
  lineHeight: 1.5,
  color: '#1e2536',
  maxWidth: 'min(78vw, 280px)',   /* a tooltip must never overflow the viewport */
};

function Box({ title, rows }) {
  return (
    <div style={panel}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 18, justifyContent: 'space-between' }}>
          <span style={{ color: '#4d566b' }}>{k}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

const groupTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  return (
    <Box
      title={g.key}
      rows={[
        ['Market value', money(g.value)],
        ['Cost basis', money(g.cost)],
        ['Unrealized', money(g.gain)],
        ['Return', pct(g.roi)],
        ['Positions', count(g.count)],
      ]}
    />
  );
};

export function AllocationDonut({ data }) {
  const narrow = useIsNarrow();
  const top = data.slice(0, 7);
  const rest = data.slice(7);
  const slices = rest.length
    ? [...top, rest.reduce((a, g) => ({ key: `${rest.length} smaller sets`, value: a.value + g.value, cost: a.cost + g.cost, gain: a.gain + g.gain, count: a.count + g.count, roi: null }), { value: 0, cost: 0, gain: 0, count: 0 })]
    : top;
  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <>
      <ResponsiveContainer width="100%" height={narrow ? 210 : 280}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="key"
            innerRadius={narrow ? 52 : 72}
            outerRadius={narrow ? 84 : 112}
            paddingAngle={2}
            stroke="#e9edf4"
            strokeWidth={3}
          >
            {slices.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
          </Pie>
          <Tooltip content={groupTip} />
        </PieChart>
      </ResponsiveContainer>
      {/* The legend is the only way to read this chart on touch, where there is
          no hover — so it carries the same figures the tooltip does. */}
      <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 10 }}>
        {slices.map((s, i) => (
          <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <i style={{ width: 12, height: 12, borderRadius: 4, background: SERIES[i % SERIES.length], flex: '0 0 auto' }} />
            <SetIcon set={s.key} size={16} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.key}</span>
            <span className="num" style={{ color: '#4d566b', flex: '0 0 auto' }}>{total ? plainPct(s.value / total, 0) : '—'}</span>
            <span className="num" style={{ minWidth: 68, textAlign: 'right', flex: '0 0 auto' }}>{money(s.value)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CostVsValueBars({ data }) {
  const narrow = useIsNarrow();
  const axis = axisFor(narrow);
  const rows = data.slice(0, 9);

  return (
    <ResponsiveContainer width="100%" height={Math.max(narrow ? 200 : 240, rows.length * (narrow ? 40 : 46) + 40)}>
      <BarChart data={rows} layout="vertical" margin={{ left: narrow ? 0 : 8, right: narrow ? 8 : 24, top: 4, bottom: 4 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke="rgba(107,115,135,.18)" />
        <XAxis type="number" tickFormatter={shortMoney} {...axis} />
        <YAxis
          type="category"
          dataKey="key"
          width={narrow ? 88 : 140}
          tickFormatter={(v) => clip(v, narrow ? 12 : 20)}
          {...axis}
        />
        <Tooltip content={groupTip} cursor={{ fill: 'rgba(255,255,255,.5)' }} />
        <Bar dataKey="cost" name="Cost basis" fill="#a8b0c4" radius={[0, 6, 6, 0]} />
        <Bar dataKey="value" name="Market value" fill="#3b4bc4" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CapitalDeployed({ data }) {
  const narrow = useIsNarrow();
  const axis = axisFor(narrow);
  const rows = withTime(data);

  return (
    <ResponsiveContainer width="100%" height={narrow ? 220 : 280}>
      <AreaChart data={rows} margin={{ left: 0, right: narrow ? 6 : 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="deployed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b4bc4" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3b4bc4" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(107,115,135,.18)" vertical={false} />
        <XAxis {...timeAxis(narrow, rows)} />
        <YAxis tickFormatter={shortMoney} width={narrow ? 46 : 72} {...axis} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <Box title={shortDate(payload[0].payload.date)} rows={[['Cumulative cost basis', money(payload[0].value)], ['Latest buy', payload[0].payload.name]]} />
            ) : null
          }
        />
        <Area type="stepAfter" dataKey="costBasis" stroke="#3b4bc4" strokeWidth={2.5} fill="url(#deployed)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HoldVsReturn({ data }) {
  const narrow = useIsNarrow();
  const axis = axisFor(narrow);
  const points = data
    .filter((h) => h.heldDays != null && h.roi != null)
    .map((h) => ({ x: h.heldDays, y: h.roi * 100, z: Math.max(h.totalCost, 20), name: h.name, set: h.set, cost: h.totalCost, value: h.totalValue }));

  return (
    <ResponsiveContainer width="100%" height={narrow ? 240 : 300}>
      <ScatterChart margin={{ left: 0, right: narrow ? 10 : 16, top: 12, bottom: 12 }}>
        <CartesianGrid stroke="rgba(107,115,135,.18)" />
        <XAxis type="number" dataKey="x" name="Days held" unit="d" {...axis} />
        <YAxis type="number" dataKey="y" name="Return" unit="%" width={narrow ? 44 : 64} {...axis} />
        {/* Bubbles have to stay tappable: a 60px² dot is under the 44px target. */}
        <ZAxis type="number" dataKey="z" range={narrow ? [110, 460] : [60, 620]} />
        <ReferenceLine y={0} stroke="#4d566b" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ strokeDasharray: '4 4' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return <Box title={p.name} rows={[['Set', p.set], ['Held', `${p.x} days`], ['Return', `${p.y.toFixed(1)}%`], ['Cost → value', `${money(p.cost)} → ${money(p.value)}`]]} />;
          }}
        />
        <Scatter data={points} fill="#3b4bc4" fillOpacity={0.55} stroke="#3b4bc4" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/**
 * Portfolio value over time, from the snapshot-history aggregation in
 * `src/lib/history.js`. Market value and cost basis are the pairing (rather
 * than value vs. unrealized) so both series stay on the same, always-positive
 * scale — legible next to each other on a phone-width y-axis. Unrealized and
 * realized P/L still surface in the tooltip.
 */
export function PortfolioHistoryChart({ data }) {
  const narrow = useIsNarrow();
  const axis = axisFor(narrow);
  const rows = withTime(data);

  return (
    <ResponsiveContainer width="100%" height={narrow ? 240 : 300}>
      <AreaChart data={rows} margin={{ left: 0, right: narrow ? 6 : 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="portfolioValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b4bc4" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3b4bc4" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(107,115,135,.18)" vertical={false} />
        <XAxis {...timeAxis(narrow, rows)} />
        <YAxis tickFormatter={shortMoney} width={narrow ? 46 : 72} {...axis} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <Box
                title={shortDate(p.date)}
                rows={[
                  ['Market value', money(p.valueHeld)],
                  ['Cost basis', money(p.costHeld)],
                  ['Unrealized', signedMoney(p.unrealized)],
                  ['Realized', signedMoney(p.realized)],
                ]}
              />
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: narrow ? 11 : 12, color: '#4d566b' }} iconSize={10} iconType="circle" />
        <Area type="monotone" dataKey="valueHeld" name="Market value" stroke="#3b4bc4" strokeWidth={2.5} fill="url(#portfolioValue)" />
        <Area type="monotone" dataKey="costHeld" name="Cost basis" stroke="#4d566b" strokeWidth={2} strokeDasharray="4 4" fill="none" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Unrealized P/L on its own axis, isolated from market-value/cost-basis so
 * the gain-or-loss trend is legible directly rather than read as the gap
 * between two other lines (which `PortfolioHistoryChart`'s tooltip already
 * surfaces). Colored by its latest sign — same red/green semantics as
 * `VendorBars` — with a zero reference line since this series can cross it.
 */
export function UnrealizedHistoryChart({ data }) {
  const narrow = useIsNarrow();
  const axis = axisFor(narrow);
  const rows = withTime(data);
  const latest = data.at(-1)?.unrealized ?? 0;
  const color = latest >= 0 ? '#146b46' : '#ab2a20';
  const gradientId = latest >= 0 ? 'unrealizedGain' : 'unrealizedLoss';

  return (
    <ResponsiveContainer width="100%" height={narrow ? 220 : 280}>
      <AreaChart data={rows} margin={{ left: 0, right: narrow ? 6 : 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(107,115,135,.18)" vertical={false} />
        <XAxis {...timeAxis(narrow, rows)} />
        <YAxis tickFormatter={shortMoney} width={narrow ? 50 : 76} {...axis} />
        <ReferenceLine y={0} stroke="#4d566b" strokeDasharray="4 4" />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <Box
                title={shortDate(p.date)}
                rows={[
                  ['Unrealized', signedMoney(p.unrealized)],
                  ['Return', pct(p.roiHeld)],
                  ['Market value', money(p.valueHeld)],
                  ['Cost basis', money(p.costHeld)],
                ]}
              />
            );
          }}
        />
        <Area type="monotone" dataKey="unrealized" stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Single-product price history — deliberately one series, one product at a
 * time (see the picker in `HistoryPanel.jsx`), not a multi-line chart of
 * many products. Plots unit market price rather than total position value,
 * so a mid-period purchase (which jumps total value mechanically) doesn't
 * read as a price move.
 */
export function ProductHistoryChart({ points }) {
  const narrow = useIsNarrow();
  const axis = axisFor(narrow);
  const rows = withTime(points);

  return (
    <ResponsiveContainer width="100%" height={narrow ? 200 : 260}>
      <AreaChart data={rows} margin={{ left: 0, right: narrow ? 6 : 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="productPrice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f7b8a" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#0f7b8a" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(107,115,135,.18)" vertical={false} />
        <XAxis {...timeAxis(narrow, rows)} />
        <YAxis tickFormatter={shortMoney} width={narrow ? 46 : 72} {...axis} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return <Box title={shortDate(p.date)} rows={[['Price per unit', money(p.unitValue)]]} />;
          }}
        />
        <Area type="monotone" dataKey="unitValue" stroke="#0f7b8a" strokeWidth={2.5} fill="url(#productPrice)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Time-weighted return index, base 100 at the first snapshot (see
 * `src/lib/returns.js`). This is the "how did the collection perform" line —
 * deposits and withdrawals are chained out, so it moves only on price. The
 * y-axis is index points, not dollars; 100 (break-even) gets a reference line.
 */
export function ReturnHistoryChart({ data }) {
  const narrow = useIsNarrow();
  const rows = withTime(data);

  return (
    <ResponsiveContainer width="100%" height={narrow ? 220 : 280}>
      <AreaChart data={rows} margin={{ left: 0, right: narrow ? 6 : 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="twrIndex" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b4bc4" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b4bc4" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(107,115,135,.18)" vertical={false} />
        <XAxis {...timeAxis(narrow, rows)} />
        <YAxis
          tickFormatter={(v) => `${Math.round(v)}`}
          width={narrow ? 34 : 46}
          domain={[(min) => Math.min(100, Math.floor(min)), (max) => Math.max(100, Math.ceil(max))]}
          {...axisFor(narrow)}
        />
        <ReferenceLine y={100} stroke="#4d566b" strokeDasharray="4 4" />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <Box
                title={shortDate(p.date)}
                rows={[
                  ['Return index', p.index.toFixed(1)],
                  ['Cumulative', pct(p.index / 100 - 1)],
                  ['This period', p.periodReturn == null ? '—' : pct(p.periodReturn)],
                ]}
              />
            );
          }}
        />
        <Area type="monotone" dataKey="index" name="Return index (start = 100)" stroke="#3b4bc4" strokeWidth={2.5} fill="url(#twrIndex)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Underwater chart: how far the return index sits below its own earlier peak, as
 * a negative percentage. Built on the TWR index rather than raw market value, so
 * adding capital never shows up here as a loss.
 */
export function DrawdownChart({ data }) {
  const narrow = useIsNarrow();
  const rows = withTime(data);

  return (
    <ResponsiveContainer width="100%" height={narrow ? 190 : 230}>
      <AreaChart data={rows} margin={{ left: 0, right: narrow ? 6 : 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="drawdown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ab2a20" stopOpacity={0.05} />
            <stop offset="100%" stopColor="#ab2a20" stopOpacity={0.32} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(107,115,135,.18)" vertical={false} />
        <XAxis {...timeAxis(narrow, rows)} />
        <YAxis
          tickFormatter={shortPct}
          width={narrow ? 40 : 52}
          domain={[(min) => Math.min(min, -0.01), 0]}
          {...axisFor(narrow)}
        />
        <ReferenceLine y={0} stroke="#4d566b" />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return <Box title={shortDate(p.date)} rows={[['Drawdown from peak', pct(p.drawdown)]]} />;
          }}
        />
        <Area type="monotone" dataKey="drawdown" stroke="#ab2a20" strokeWidth={2} fill="url(#drawdown)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VendorBars({ data }) {
  const narrow = useIsNarrow();
  const axis = axisFor(narrow);
  const rows = data.slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={Math.max(narrow ? 180 : 200, rows.length * (narrow ? 40 : 44) + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ left: narrow ? 0 : 8, right: narrow ? 40 : 46, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="rgba(107,115,135,.18)" />
        <XAxis type="number" tickFormatter={shortPct} {...axis} />
        <YAxis
          type="category"
          dataKey="key"
          width={narrow ? 84 : 130}
          tickFormatter={(v) => clip(v, narrow ? 11 : 18)}
          {...axis}
        />
        <ReferenceLine x={0} stroke="#4d566b" />
        <Tooltip content={groupTip} cursor={{ fill: 'rgba(255,255,255,.5)' }} />
        <Bar dataKey="roi" name="Return" radius={6}>
          {rows.map((g, i) => (
            <Cell key={i} fill={(g.roi ?? 0) >= 0 ? '#146b46' : '#ab2a20'} />
          ))}
          <LabelList dataKey="roi" position="right" formatter={(v) => pct(v, 0)} style={{ fill: '#4d566b', fontSize: narrow ? 11 : 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
