/**
 * One underlying poller per key, fanned out to every subscriber (B0 / RM-82).
 * The responsive shells mount chrome for both breakpoints (two bells, two nav
 * badges) and closed sheets stay mounted — each used to start its OWN poll
 * loop for the same data. Subscribers now share one loop; a late subscriber
 * immediately gets the last value; the loop stops when the last one leaves.
 */
interface Entry<T> {
  subs: Set<(v: T) => void>;
  last: { v: T } | null;
  stop: () => void;
}

const entries = new Map<string, Entry<unknown>>();

export function shareSubscription<T>(key: string, start: (emit: (v: T) => void) => () => void, cb: (v: T) => void): () => void {
  let entry = entries.get(key) as Entry<T> | undefined;
  if (!entry) {
    const created: Entry<T> = { subs: new Set(), last: null, stop: () => undefined };
    entries.set(key, created as Entry<unknown>);
    created.stop = start((v) => {
      created.last = { v };
      created.subs.forEach((s) => s(v));
    });
    entry = created;
  }
  const e = entry;
  e.subs.add(cb);
  if (e.last) cb(e.last.v);
  return () => {
    e.subs.delete(cb);
    if (e.subs.size === 0 && entries.get(key) === e) {
      entries.delete(key);
      e.stop();
    }
  };
}

/** Test helper: number of live underlying pollers. */
export function activeSharedSubscriptions(): number {
  return entries.size;
}
