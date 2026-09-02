import { useEffect, useRef, useState } from 'react';

/**
 * Reveal a long list a chunk at a time as the reader scrolls, so the first paint
 * only mounts `step` rows instead of every row. Pair it with
 * `content-visibility: auto` on the rows (`.table--virtual` in global.css) so the
 * mounted-but-off-screen rows also cost nothing to lay out or paint — together
 * that is a table that stays cheap at hundreds of rows without a windowing
 * library or losing the sticky header, sticky first column, `<tfoot>` totals,
 * sort, or find-in-page.
 *
 * Returns:
 *   - `limit`       how many items to render right now (`rows.slice(0, limit)`)
 *   - `rootRef`     ref for the scroll container that actually scrolls the rows
 *                   (the capped `.table-scroll`). Put it there so the reveal
 *                   tracks that container's scroll, not the page's. Left unset it
 *                   falls back to the viewport.
 *   - `sentinelRef` ref for an element placed right after the last rendered row;
 *                   when it scrolls near the container the limit grows
 *   - `done`        `true` once every item is rendered (drop the sentinel)
 *
 * `limit` resets to `step` whenever `total` changes, i.e. a new filter or search
 * result. SSR and the first client render both produce `step` rows, so there is
 * no hydration mismatch.
 */
export function useIncrementalList(total, step = 80) {
  const [limit, setLimit] = useState(step);
  const rootRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setLimit(step);
  }, [total, step]);

  useEffect(() => {
    if (limit >= total) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setLimit(total); // no observer available — show everything rather than trap rows
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLimit((l) => Math.min(total, l + step));
        }
      },
      { root: rootRef.current ?? null, rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total, step]);

  return { limit: Math.min(limit, total), rootRef, sentinelRef, done: limit >= total };
}
