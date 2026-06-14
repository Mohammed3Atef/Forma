import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './index.css';
import { App } from './App';

/**
 * Service worker registration with automatic updates. Installed PWAs otherwise
 * keep serving the old cached build — so we poll for a new service worker
 * (on launch, when the app regains focus, and every minute) and, when a new
 * version is ready, activate it and reload. The reload is deferred until the
 * app is in the background so we never interrupt an in-progress workout.
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // New version available. Reloading immediately would yank the app out from
    // under the user mid-workout, so only reload right away if the app is
    // already backgrounded; otherwise wait for it to next go to background.
    if (document.visibilityState === 'hidden') {
      updateSW(true); // activate + reload
      return;
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        document.removeEventListener('visibilitychange', onHide);
        updateSW(true); // activate + reload
      }
    };
    document.addEventListener('visibilitychange', onHide);
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
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
