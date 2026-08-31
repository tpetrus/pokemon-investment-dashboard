import React from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, AreaChart, Area, ScatterChart, Scatter, ZAxis, ReferenceLine, LabelList,
} from 'recharts';
import { money, pct, plainPct, count } from '../lib/format.js';
import { useIsNarrow } from '../lib/useMediaQuery.js';

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

  return (
    <ResponsiveContainer width="100%" height={narrow ? 220 : 280}>
      <AreaChart data={data} margin={{ left: 0, right: narrow ? 6 : 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="deployed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b4bc4" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3b4bc4" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(107,115,135,.18)" vertical={false} />
        <XAxis dataKey="date" {...axis} minTickGap={narrow ? 44 : 28} />
        <YAxis tickFormatter={shortMoney} width={narrow ? 46 : 72} {...axis} />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Box title={label} rows={[['Cumulative cost basis', money(payload[0].value)], ['Latest buy', payload[0].payload.name]]} />
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

export function VendorBars({ data }) {
  const narrow = useIsNarrow();
  const axis = axisFor(narrow);
  const rows = data.slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={Math.max(narrow ? 180 : 200, rows.length * (narrow ? 40 : 44) + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ left: narrow ? 0 : 8, right: narrow ? 40 : 46, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="rgba(107,115,135,.18)" />
        <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} {...axis} />
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
