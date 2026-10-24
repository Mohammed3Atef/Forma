import { useEffect, useState } from 'react';

/** `value`, but only after it stopped changing for `ms` — for search-as-you-type against the server. */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
