import React, { useMemo, useState } from 'react';
import { Card } from './ui.jsx';
import { money, pct, plainPct, tone } from '../lib/format.js';

/**
 * Rates are the published headline numbers for collectibles/TCG categories and
 * change often — each one is editable so you can match what you actually pay.
 */
const PLATFORMS = [
  { id: 'ebay', label: 'eBay (no store)', rate: 0.1325, flat: 0.4, note: 'Final value fee on item + shipping' },
  { id: 'ebay-store', label: 'eBay (Basic store)', rate: 0.1235, flat: 0.4, note: 'Lower rate, monthly subscription not counted' },
  { id: 'tcg', label: 'TCGplayer', rate: 0.1275, flat: 0.3, note: 'Marketplace fee plus payment processing' },
  { id: 'whatnot', label: 'Whatnot', rate: 0.109, flat: 0.3, note: 'Commission plus processing' },
  { id: 'mercari', label: 'Mercari', rate: 0.129, flat: 0.5, note: 'Selling fee plus processing' },
  { id: 'local', label: 'Local / cash', rate: 0, flat: 0, note: 'No platform cut, no shipping' },
];

export default function ExitCalculator({ holdings }) {
  const [holdingId, setHoldingId] = useState('manual');
  const [platformId, setPlatformId] = useState('ebay');
  const [price, setPrice] = useState(400);
  const [cost, setCost] = useState(300);
  const [shipping, setShipping] = useState(18);
  const [supplies, setSupplies] = useState(4);
  const [adRate, setAdRate] = useState(0);
  const [buyerPaysShipping, setBuyerPaysShipping] = useState(true);
  const [targetRoi, setTargetRoi] = useState(50);

  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  const [rate, setRate] = useState(platform.rate * 100);
  const [flat, setFlat] = useState(platform.flat);

  const choosePlatform = (id) => {
    const p = PLATFORMS.find((x) => x.id === id) ?? PLATFORMS[0];
    setPlatformId(id);
    setRate(p.rate * 100);
    setFlat(p.flat);
    if (p.id === 'local') setShipping(0);
  };

  const chooseHolding = (id) => {
    setHoldingId(id);
    const h = holdings.find((x) => x.id === id);
    if (!h) return;
    if (h.unitCost != null) setCost(Number(h.unitCost.toFixed(2)));
    if (h.unitValue != null) setPrice(Number(h.unitValue.toFixed(2)));
  };

  const r = useMemo(() => {
    const feeBase = price + (buyerPaysShipping ? shipping : 0);
    const platformFee = feeBase * (rate / 100) + Number(flat || 0);
    const adFee = price * (adRate / 100);
    const shipCost = buyerPaysShipping ? 0 : shipping;
    const net = price - platformFee - adFee - shipCost - supplies;
    const profit = net - cost;
    const roi = cost > 0 ? profit / cost : null;
    const takeRate = price > 0 ? (platformFee + adFee + shipCost + supplies) / price : 0;

    // Solve list price for break-even and for the target return.
    const solve = (targetProfit) => {
      const k = rate / 100;
      const shipInFeeBase = buyerPaysShipping ? shipping : 0;
      const a = 1 - k - adRate / 100;
      const b = cost + targetProfit + Number(flat || 0) + k * shipInFeeBase + supplies + (buyerPaysShipping ? 0 : shipping);
      return a > 0 ? b / a : null;
    };

    return {
      platformFee, adFee, shipCost, net, profit, roi, takeRate,
      breakeven: solve(0),
      targetPrice: solve(cost * (targetRoi / 100)),
    };
  }, [price, cost, shipping, supplies, rate, flat, adRate, buyerPaysShipping, targetRoi]);

  const held = holdings.filter((h) => h.status === 'held');

  return (
    <div className="grid grid--2">
      <Card title="Sale details" note="Per unit">
        <div className="stack" style={{ gap: 16 }}>
          <div className="field">
            <label htmlFor="ec-holding">Start from a position</label>
            <select id="ec-holding" value={holdingId} onChange={(e) => chooseHolding(e.target.value)}>
              <option value="manual">Enter numbers by hand</option>
              {held.map((h) => (
                <option key={h.id} value={h.id}>{h.name}{h.set !== 'Unassigned' ? ` — ${h.set}` : ''}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="ec-platform">Where you are selling</label>
            <select id="ec-platform" value={platformId} onChange={(e) => choosePlatform(e.target.value)}>
              {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className="card__note">{platform.note}</span>
          </div>

          <div className="inputs">
            <div className="field">
              <label htmlFor="ec-price">Sale price</label>
              <input id="ec-price" type="number" min="0" step="1" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ec-cost">Your cost</label>
              <input id="ec-cost" type="number" min="0" step="1" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ec-rate">Fee rate (%)</label>
              <input id="ec-rate" type="number" min="0" step="0.05" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ec-flat">Fixed fee per order</label>
              <input id="ec-flat" type="number" min="0" step="0.05" value={flat} onChange={(e) => setFlat(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ec-ship">Shipping</label>
              <input id="ec-ship" type="number" min="0" step="1" value={shipping} onChange={(e) => setShipping(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ec-supplies">Packing supplies</label>
              <input id="ec-supplies" type="number" min="0" step="0.5" value={supplies} onChange={(e) => setSupplies(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ec-ads">Promoted listing (%)</label>
              <input id="ec-ads" type="number" min="0" step="0.5" value={adRate} onChange={(e) => setAdRate(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ec-target">Target return (%)</label>
              <input id="ec-target" type="number" min="0" step="5" value={targetRoi} onChange={(e) => setTargetRoi(Number(e.target.value))} />
            </div>
          </div>

          <button className="btn btn--sm" aria-pressed={buyerPaysShipping} onClick={() => setBuyerPaysShipping((v) => !v)}>
            {buyerPaysShipping ? 'Buyer pays shipping (fees apply to it)' : 'You pay shipping'}
          </button>
        </div>
      </Card>

      <div className="stack">
        <Card title="What you keep">
          <div className="well" style={{ display: 'grid', gap: 12 }}>
            <Line label="Sale price" value={money(price, true)} />
            <Line label={`Platform fee (${plainPct(rate / 100, 2)} + ${money(flat, true)})`} value={`− ${money(r.platformFee, true)}`} />
            {adRate > 0 && <Line label={`Promoted listing (${plainPct(adRate / 100, 1)})`} value={`− ${money(r.adFee, true)}`} />}
            {r.shipCost > 0 && <Line label="Shipping you cover" value={`− ${money(r.shipCost, true)}`} />}
            {supplies > 0 && <Line label="Packing supplies" value={`− ${money(supplies, true)}`} />}
            <div style={{ borderTop: '1px solid rgba(140,150,172,.35)', paddingTop: 12 }}>
              <Line label="Net proceeds" value={money(r.net, true)} strong />
              <Line label="Cost basis" value={`− ${money(cost, true)}`} />
            </div>
            <div style={{ borderTop: '1px solid rgba(140,150,172,.35)', paddingTop: 12 }}>
              <Line label="Profit" value={money(r.profit, true)} strong toneClass={tone(r.profit)} />
              <Line label="Return on cost" value={pct(r.roi)} strong toneClass={tone(r.roi)} />
            </div>
          </div>
          <p className="card__note" style={{ marginTop: 14 }}>
            All-in costs eat {plainPct(r.takeRate, 1)} of the sale price. Rates are editable — check your current
            seller tier before trusting the preset.
          </p>
        </Card>

        <Card title="Prices that matter">
          <div className="inputs">
            <div className="well">
              <div className="kpi__label">Break even at</div>
              <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>{r.breakeven == null ? '—' : money(r.breakeven, true)}</div>
              <div className="kpi__foot">Sale price that returns your cost after every fee</div>
            </div>
            <div className="well">
              <div className="kpi__label">{targetRoi}% net return at</div>
              <div className="kpi__value num" style={{ fontSize: 'var(--step-2)' }}>{r.targetPrice == null ? '—' : money(r.targetPrice, true)}</div>
              <div className="kpi__foot">List here to clear {money(cost * (targetRoi / 100))} profit per unit</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Line({ label, value, strong, toneClass }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2px 16px', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--ink-2)', fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span className={`num ${toneClass || ''}`} style={{ fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}
