import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A one-shot request carried by the URL (B3.7 "Use in a client plan": `?addExercise=<id>` /
 * `?addFood=<id>` on an editor). The value is kept in state and removed from the URL at once (a
 * replace), so Back, a reload or a later visit never repeats it. `clear` ends the request.
 */
export function useHandoffParam(param: string): [string | null, () => void] {
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState<string | null>(() => params.get(param));
  useEffect(() => {
    const v = params.get(param);
    if (!v) return;
    setPending(v);
    const next = new URLSearchParams(params);
    next.delete(param);
    setParams(next, { replace: true });
  }, [params, setParams, param]);
  return [pending, useCallback(() => setPending(null), [])];
}
