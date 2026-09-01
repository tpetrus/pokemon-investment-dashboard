/**
 * Free-text-to-official-set matcher for the `set` field on a holding.
 *
 * Spreadsheets carry no canonical set id, just whatever string the user typed
 * or their export tool produced ("SV Paradox Rift", "Scarlet & Violet -
 * Paradox Rift", "unassigned", ...). This matches that string, on a
 * best-effort basis, against the snapshot in `src/data/tcgSets.json`
 * (refreshed manually with `npm run fetch:sets`, never at request time).
 *
 * Modeled on the synonym-table pattern in `normalize.js` — this is
 * deliberately proportionate, not a fuzzy-matching library.
 */

import sets from '../data/tcgSets.json';
import { slug } from './normalize.js';

/** The portion of a set name after the last —/-/: separator, else the full name. */
function subtitleOf(name) {
  const m = String(name).match(/[—\-:]([^—\-:]+)$/);
  return (m ? m[1] : name).trim();
}

const byFullName = new Map();
const bySubtitle = new Map();
const byId = new Map();

for (const s of sets) {
  byFullName.set(slug(s.name), s);
  byId.set(s.id, s);

  const subSlug = slug(subtitleOf(s.name));
  if (!subSlug) continue;
  const existing = bySubtitle.get(subSlug);
  if (!existing || s.releaseDate > existing.releaseDate) {
    bySubtitle.set(subSlug, s);
  }
}

// Colloquial names collectors actually use that don't reduce cleanly via
// subtitle-stripping and would otherwise collide with a fuzzy-matched
// near-neighbor (e.g. "Base Set" vs the real, separate "Base Set 2").
const COLLOQUIAL_ALIASES = {
  baseset: 'base1', // "Base Set" — the universal name for the original 1999 set, which the API itself just calls "Base"
};

// Common modern-era prefixes someone tracking a sealed portfolio would type.
// Order matters only in that longer/more-specific variants should be checked
// first where prefixes could otherwise partially overlap; slug() strips
// spaces/punctuation so "s&v"/"scarlet & violet" all reduce to the same key.
const ERA_ALIASES = [
  ['scarletviolet', ['sv', 's&v', 'scarletviolet', 'scarlet&violet']],
  ['swordshield', ['swsh', 's&s', 'swordshield', 'sword&shield']],
  ['sunmoon', ['sm', 'sunmoon', 'sun&moon']],
  ['xy', ['xy']],
];

/** Strip a leading era-alias prefix (slug-compared) from a slugged string. */
function stripEraPrefix(slugged) {
  for (const [, aliases] of ERA_ALIASES) {
    for (const alias of aliases) {
      if (slugged.startsWith(alias) && slugged.length > alias.length) {
        return slugged.slice(alias.length);
      }
    }
  }
  return null;
}

const cache = new Map();

export function matchSet(rawSetString) {
  if (!rawSetString) return null;
  if (cache.has(rawSetString)) return cache.get(rawSetString);

  const result = resolve(rawSetString);
  cache.set(rawSetString, result);
  return result;
}

function resolve(rawSetString) {
  const fullSlug = slug(rawSetString);
  if (!fullSlug) return null;
  if (String(rawSetString).trim().toLowerCase() === 'unassigned') return null;

  // 2. Exact full-name match.
  const exact = byFullName.get(fullSlug);
  if (exact) return exact;

  // 3. Era-alias prefix strip, then subtitle lookup on both the stripped
  //    remainder and the raw (unstripped) slug.
  const stripped = stripEraPrefix(fullSlug);
  if (stripped) {
    const hit = bySubtitle.get(stripped);
    if (hit) return hit;
  }
  const rawHit = bySubtitle.get(fullSlug);
  if (rawHit) return rawHit;

  // 3b. Explicit colloquial-name alias, checked before the fuzzy fallback so
  //     it takes priority over an ambiguous fuzzy near-neighbor.
  const aliasId = COLLOQUIAL_ALIASES[fullSlug];
  if (aliasId) {
    const aliasHit = byId.get(aliasId);
    if (aliasHit) return aliasHit;
  }

  // 4. Bounded fuzzy fallback over the subtitle index: only consider a
  //    candidate whose subtitle slug is at least 5 chars and is a substring
  //    of (or contains) the input slug, and whose length is close enough to
  //    the input's (within a 0.6 ratio) that the containment reflects a real
  //    near-match rather than a short generic string happening to sit inside
  //    a much longer, unrelated compound name. Resolve only an unambiguous
  //    winner.
  let best = null;
  let bestLen = -1;
  let tie = false;
  for (const [subSlug, record] of bySubtitle) {
    if (subSlug.length < 5) continue;
    if (!(fullSlug.includes(subSlug) || subSlug.includes(fullSlug))) continue;
    const ratio =
      Math.min(subSlug.length, fullSlug.length) /
      Math.max(subSlug.length, fullSlug.length);
    if (ratio < 0.6) continue;
    if (subSlug.length > bestLen) {
      best = record;
      bestLen = subSlug.length;
      tie = false;
    } else if (subSlug.length === bestLen && record !== best) {
      tie = true;
    }
  }
  if (best && !tie) return best;

  return null;
}
