import React from 'react';
import { matchSet } from '../lib/tcgSets.js';

/**
 * Small symbol icon or wide logo image for a holding's `set` string, hotlinked
 * straight from the CDN URL in `src/data/tcgSets.json`. Renders nothing —
 * never a placeholder or broken-image icon — when there is no confident match
 * or the matched record lacks the requested image, so a missing/unmatched set
 * never shifts layout or shows a broken-link icon.
 */
export default function SetIcon({ set, variant = 'symbol', size = 18 }) {
  const record = matchSet(set);
  const src = record ? (variant === 'logo' ? record.logo : record.symbol) : null;
  if (!src) return null;

  if (variant === 'logo') {
    return (
      <img
        src={src}
        width={128}
        height={40}
        style={{ objectFit: 'contain', flexShrink: 0 }}
        loading="lazy"
        decoding="async"
        alt=""
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
      loading="lazy"
      decoding="async"
      alt=""
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
