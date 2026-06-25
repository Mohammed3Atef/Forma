import { useCallback, useMemo, useState } from 'react';

export interface Selection {
  selected: Set<string>;
  ids: string[];
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Add/remove a batch (e.g. select-all over the current page). */
  setMany: (ids: string[], on: boolean) => void;
  /** True when every id in `ids` is currently selected (and `ids` is non-empty). */
  allSelected: (ids: string[]) => boolean;
  clear: () => void;
}

/**
 * Tracks a set of selected row ids for bulk actions. Selection is by id (not by
 * object), so it survives re-fetches / re-sorts of the underlying list. Pair
 * with `<BulkActionBar>` (shown when `count > 0`).
 */
export function useSelection(): Selection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((batch: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of batch) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);
  const has = useCallback((id: string) => selected.has(id), [selected]);
  const allSelected = useCallback((ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id)), [selected]);
  const ids = useMemo(() => [...selected], [selected]);

  return { selected, ids, count: selected.size, has, toggle, setMany, allSelected, clear };
}
