import { useEffect, useState } from 'react';

/**
 * Breakpoints shared between JS and CSS. Keep these in step with the media
 * queries in src/styles/global.css — anything Recharts sizes in JS has to agree
 * with what the stylesheet is doing at the same width, or a chart ends up laid
 * out for one breakpoint inside a card sized for another.
 */
export const BP = {
  narrow: '(max-width: 640px)',   // phone
  tablet: '(max-width: 860px)',   // where tables start scrolling sideways
  coarse: '(pointer: coarse)',    // touch input, any width
};

/**
 * Server render always reports false, so the desktop layout is what ships in
 * the HTML; the first effect corrects it on mount. Charts re-measure on mount
 * regardless, so there is no visible reflow — but never gate *content* on this,
 * only presentation, or the markup a crawler sees differs from what a phone
 * gets. Prefer a CSS media query whenever the change can be expressed in CSS.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

export const useIsNarrow = () => useMediaQuery(BP.narrow);
export const useIsTablet = () => useMediaQuery(BP.tablet);
