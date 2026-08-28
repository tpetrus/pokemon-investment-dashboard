const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-US');

export const money = (n, cents = false) =>
  n == null || Number.isNaN(n) ? '—' : (cents ? usdCents : usd).format(n);

export const signedMoney = (n, cents = false) => {
  if (n == null || Number.isNaN(n)) return '—';
  const s = money(Math.abs(n), cents);
  return n < 0 ? `−${s}` : `+${s}`;
};

export const pct = (n, digits = 1) =>
  n == null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : '−'}${(Math.abs(n) * 100).toFixed(digits)}%`;

export const plainPct = (n, digits = 1) =>
  n == null || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(digits)}%`;

export const count = (n) => (n == null ? '—' : num.format(n));

export const shortDate = (iso) =>
  !iso ? '—' : new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const duration = (days) => {
  if (days == null) return '—';
  if (days < 45) return `${days}d`;
  if (days < 550) return `${Math.round(days / 30.4)}mo`;
  return `${(days / 365).toFixed(1)}y`;
};

export const tone = (n) => (n == null ? 'flat' : n > 0.0001 ? 'up' : n < -0.0001 ? 'down' : 'flat');
