import { Component, type ReactNode } from 'react';

export const CHUNK_RELOAD_GUARD_KEY = 'forma:chunk-reload-attempted';

/** True for the "a lazy import 404'd" family of errors — almost always a stale
 *  chunk reference left over from before a new deployment replaced the build,
 *  never a real code bug. Browsers phrase this differently. */
function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(message);
}

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
    if (isStaleChunkError(error) && !sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)) {
      try {
        sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
      } catch {
        /* private-browsing / storage blocked — still attempt the reload */
      }
      this.setState({ recovering: true });
      window.location.reload();
      return;
    }
    console.error('[ErrorBoundary] Unhandled render error:', error);
  }

  render() {
    if (this.state.recovering) return null; // reload is already in flight
    if (this.state.hasError) {
      return (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', background: '#0C0A09', color: '#F8F4F1' }}>
          <p style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong.</p>
          <p style={{ fontSize: 14, color: '#948A83', maxWidth: 320 }}>Reloading usually fixes this. If it keeps happening, please contact support.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ background: '#FF8B02', color: '#1A0E05', fontWeight: 600, padding: '10px 24px', borderRadius: 999, border: 'none' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
