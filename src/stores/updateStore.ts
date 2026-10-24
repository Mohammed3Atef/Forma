import { create } from 'zustand';
import { hasNavGuard } from './navGuardStore';
import { onCriticalWorkChange, registeredCriticalWork } from '@/lib/criticalWork';

/**
 * "A new version is ready" (B0 / B0.7, PWA-09). The app never reloads itself
 * in the middle of critical work: it installs the update only at a SAFE POINT
 * (the app is hidden and nothing critical is running) or when the user taps
 * "Update" — and a tap during critical work asks first.
 */
interface UpdateState {
  ready: boolean;
  apply: (() => void) | null;
  setReady: (apply: () => void) => void;
}

export const useUpdate = create<UpdateState>((set) => ({
  ready: false,
  apply: null,
  setReady: (apply) => set({ ready: true, apply }),
}));

/**
 * Work a reload must never interrupt — the reason, or null when it is safe:
 * a live workout / cardio / rest timer or an upload in flight (registered by
 * their stores, see lib/criticalWork), or a dirty editor / check-in in progress.
 */
export function criticalWork(): string | null {
  return registeredCriticalWork() ?? (hasNavGuard() ? 'unsaved-or-task' : null);
}

export function isCriticalWorkActive(): boolean {
  return criticalWork() != null;
}

/*
 * Cross-tab coordination (B1.13 / PWA-10). Activating a new service worker
 * reloads EVERY open tab, not just the one that applied it — so a tab must not
 * auto-install while another tab is mid-workout. Each tab publishes a
 * heartbeat in localStorage while it has critical work; a stale heartbeat
 * (a crashed tab) expires.
 */
const BEACON_PREFIX = 'forma-busy-tab:';
const BEACON_EVERY_MS = 5_000;
export const BEACON_TTL_MS = 15_000;
const TAB_ID = Math.random().toString(36).slice(2, 10);
let lastBeacon = 0;

/** Publish (or clear) this tab's heartbeat. Cheap; safe to call often. */
export function publishTabBusy(now = Date.now()): void {
  try {
    const key = BEACON_PREFIX + TAB_ID;
    if (criticalWork()) {
      if (now - lastBeacon < BEACON_EVERY_MS) return;
      lastBeacon = now;
      localStorage.setItem(key, String(now));
    } else if (lastBeacon) {
      lastBeacon = 0;
      localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable — this tab simply isn't visible to the others */
  }
}

/** Another open tab of this app has critical work right now. */
export function otherTabBusy(now = Date.now()): boolean {
  try {
    const own = BEACON_PREFIX + TAB_ID;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === own || !k.startsWith(BEACON_PREFIX)) continue;
      const at = Number(localStorage.getItem(k));
      if (Number.isFinite(at) && now - at < BEACON_TTL_MS) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Start this tab's heartbeat; retries a deferred install when another tab finishes. */
export function startTabBeacon(): () => void {
  const tick = () => publishTabBusy();
  const id = setInterval(tick, BEACON_EVERY_MS);
  const offChange = onCriticalWorkChange(tick);
  const clear = () => {
    lastBeacon = 0;
    try {
      localStorage.removeItem(BEACON_PREFIX + TAB_ID);
    } catch {
      /* ignore */
    }
  };
  const onStorage = (e: StorageEvent) => {
    // Another tab's work ended (or it closed) — a deferred update may go now.
    if (e.key?.startsWith(BEACON_PREFIX) && e.newValue == null) applyUpdateAtSafePoint();
  };
  window.addEventListener('pagehide', clear);
  window.addEventListener('storage', onStorage);
  tick();
  return () => {
    clearInterval(id);
    offChange();
    window.removeEventListener('pagehide', clear);
    window.removeEventListener('storage', onStorage);
    clear();
  };
}

/** Install the update now if — and only if — this is a safe point. Returns true when applied. */
export function applyUpdateAtSafePoint(): boolean {
  const { ready, apply } = useUpdate.getState();
  if (!ready || !apply) return false;
  if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') return false;
  const busy = criticalWork() ?? (otherTabBusy() ? 'another-tab' : null);
  if (busy) {
    console.info(`[update] deferred: ${busy} in progress`);
    return false;
  }
  apply();
  return true;
}
