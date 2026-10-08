import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './index.css';
import { App } from './App';
import { CHUNK_RELOAD_GUARD_KEY, ErrorBoundary } from './components/ErrorBoundary';
import { applyUpdateAtSafePoint, useUpdate } from './stores/updateStore';

/**
 * Service worker registration with update checks (on launch, when the app
 * regains focus, and every minute). A ready update is NEVER applied in the
 * middle of critical work (B0 / B0.7): it shows an "Update available" pill and
 * installs itself only at a safe point — the app is in the background and no
 * workout / timer / check-in / unsaved edit is running — or when the user
 * taps the pill.
 */
/**
 * Activate the waiting service worker and reload once it takes control. We
 * reload on `controllerchange` ourselves: vite-plugin-pwa only reloads when
 * workbox flags the change as an "update", which it doesn't for a page that
 * wasn't controlled when it registered (e.g. the first visit after install) —
 * found in the B0 prod-build check. Only an update WE applied triggers it.
 */
let applying = false;
function applyUpdate(): void {
  if (applying) return;
  applying = true;
  console.info('[update] installing the new version');
  navigator.serviceWorker?.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  void updateSW(true);
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    useUpdate.getState().setReady(applyUpdate);
    if (applyUpdateAtSafePoint()) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') applyUpdateAtSafePoint();
    });
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => undefined);
    };
    setInterval(check, 60_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

// The render above didn't throw synchronously — clear the stale-chunk reload
// guard shortly after so a LATER deploy's stale-chunk error (same tab, still
// open hours/days from now) also gets its one automatic recovery reload,
// instead of being silently suppressed by a guard flag from a past incident.
setTimeout(() => {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
  } catch {
    /* ignore */
  }
}, 10_000);
