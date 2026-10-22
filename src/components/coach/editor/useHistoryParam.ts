import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * The editor's History sheet state, opened by `?history=1` (B3.9, owner D10): the old version-history
 * page's URL and the workspace Plan's "History" link land in the editor with its History sheet open.
 * The parameter is read once and dropped from the URL (replace — before any edit, so no unsaved-work
 * prompt), so closing the sheet or reloading never re-opens it.
 */
export function useHistoryParam(): [boolean, (open: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(() => params.get('history') === '1');
  useEffect(() => {
    if (!params.has('history')) return;
    setParams(
      (cur) => {
        const next = new URLSearchParams(cur);
        next.delete('history');
        return next;
      },
      { replace: true },
    );
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [open, setOpen];
}
