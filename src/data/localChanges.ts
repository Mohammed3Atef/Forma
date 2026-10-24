/**
 * A tiny "something changed in the local database" signal (B1.7). The local
 * repository fires it on every app write/delete so status surfaces (the
 * pending-changes count behind the sync status) stay live without polling
 * IndexedDB. Listeners must be cheap; heavy work is debounced by the listener.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyLocalChange(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch (e) {
      console.error('[localChanges] listener failed:', e);
    }
  }
}
