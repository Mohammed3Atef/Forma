import { Component, type ReactNode } from 'react';
import { reloadOnceForStaleChunk } from '@/lib/staleChunk';
import i18n from '@/i18n';

export { CHUNK_RELOAD_GUARD_KEY } from '@/lib/staleChunk';

interface State {
  hasError: boolean;
  recovering: boolean;
}

/**
 * Last-resort top-level boundary. A stale lazy-loaded chunk (the running page
 * requesting a JS file whose hash no longer exists because a new deployment
 * replaced it) used to be an unrecoverable blank screen — this catches it,
 * reloads ONCE automatically (guarded via sessionStorage so a genuinely broken
 * chunk can't loop forever), and otherwise shows a plain "something broke"
 * screen with a manual reload instead of a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, recovering: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (reloadOnceForStaleChunk(error)) {
      this.setState({ recovering: true });
      return;
    }
    console.error('[ErrorBoundary] Unhandled render error:', error);
  }

  render() {
    if (this.state.recovering) return null; // reload is already in flight
    if (this.state.hasError) {
      // B3.9 (RTL-09): in the user's language, with English as the safe fallback (i18n may be what broke).
      const tr = (key: string, fallback: string) => {
        try {
          return i18n.t(key, { defaultValue: fallback });
        } catch {
          return fallback;
        }
      };
      const rtl = (i18n.language ?? '').startsWith('ar');
      return (
        <div data-testid="error-boundary" dir={rtl ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', background: '#0C0A09', color: '#F8F4F1' }}>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{tr('errorBoundary.title', 'Something went wrong.')}</p>
          <p style={{ fontSize: 14, color: '#948A83', maxWidth: 320 }}>{tr('errorBoundary.body', 'Reloading usually fixes this. If it keeps happening, please contact support.')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ background: '#FF8B02', color: '#1A0E05', fontWeight: 600, padding: '10px 24px', borderRadius: 999, border: 'none' }}
          >
            {tr('errorBoundary.reload', 'Reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
