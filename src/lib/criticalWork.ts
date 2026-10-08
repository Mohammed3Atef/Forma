/**
 * Work a reload must never interrupt (B0 / B0.7): a live workout, cardio or
 * rest timer, an upload in flight. Each piece of work is REGISTERED by the
 * module that owns it, so the update logic in the root bundle doesn't have to
 * import the client stores (B1.13 / AR-02) — a coach or admin session simply
 * has nothing registered.
 */
type Probe = () => boolean;
type Subscribe = (listener: () => void) => () => void;

const probes = new Map<string, Probe>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Register a reason, its probe and (optionally) the store whose changes may flip it. */
export function registerCriticalWork(reason: string, probe: Probe, subscribe?: Subscribe): void {
  const first = !probes.has(reason);
  probes.set(reason, probe);
  if (first && subscribe) subscribe(notify);
  notify();
}

/** The first registered work in progress, or null when a reload is safe. */
export function registeredCriticalWork(): string | null {
  for (const [reason, probe] of probes) {
    try {
      if (probe()) return reason;
    } catch {
      /* a broken probe never blocks — nor fakes — an update */
    }
  }
  return null;
}

/** Called whenever registered work may have started or stopped. */
export function onCriticalWorkChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
