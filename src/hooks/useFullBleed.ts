import { useEffect } from 'react';
import { useLayoutStore } from '@/stores/layoutStore';

/**
 * Opt a Coach/Admin page into full-viewport width (drops the shell's
 * `max-w-screen-2xl` cap). Use only for data-dense pages — dashboards,
 * analytics, reports, tables, plan builder, messages split. Auto-resets on unmount.
 */
export function useFullBleed(): void {
  const setFullBleed = useLayoutStore((s) => s.setFullBleed);
  useEffect(() => {
    setFullBleed(true);
    return () => setFullBleed(false);
  }, [setFullBleed]);
}
