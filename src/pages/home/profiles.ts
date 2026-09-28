/**
 * The saved kundlis, remembered between visits to Home.
 *
 * Home is now two screens — the phone's and the desktop's — and they must not
 * each keep their own copy: the list would refetch on every resize and the
 * "create your first kundli" state would flash between them. One cache, both
 * screens, cleared by whoever creates or deletes a chart.
 */
let cache: any[] | null = null;

export const cachedProfiles = () => cache;
export const setCachedProfiles = (list: any[]) => { cache = list; };

/** Drop the cached list after a create or delete. */
export function invalidateProfiles() {
  cache = null;
}
