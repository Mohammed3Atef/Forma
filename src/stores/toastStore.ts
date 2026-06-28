import { create } from 'zustand';

/**
 * Transient toast notifications (top-of-screen popups) used to grab the user's
 * attention for real-time events — e.g. a new in-app notification arriving.
 * Call `showToast(...)`; the <ToastHost> at the app root renders + auto-dismisses
 * them. Pass a stable `key` (e.g. a notification id) to dedupe: the same key is
 * only ever toasted once per session, even if two subscribers fire it.
 */
export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

/** Optional sender chip — renders an avatar (photo/initials) instead of the
 *  variant icon, e.g. for a "new message from <person>" toast. */
export interface ToastAvatar {
  name: string;
  photoUrl?: string;
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  variant: ToastVariant;
  avatar?: ToastAvatar;
  /** Optional action run when the toast is clicked (the host dismisses after). */
  onClick?: () => void;
}

export interface ToastInput {
  title: string;
  body?: string;
  variant?: ToastVariant;
  avatar?: ToastAvatar;
  onClick?: () => void;
  /** Stable dedupe key — a key already shown this session is ignored. */
  key?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: ToastInput) => void;
  dismiss: (id: string) => void;
}

// Module-level so dedupe survives across the (possibly multiple) callers that
// share one store. Bounded by the number of distinct notifications per session.
const shownKeys = new Set<string>();
let seq = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push(t) {
    if (t.key) {
      if (shownKeys.has(t.key)) return;
      shownKeys.add(t.key);
    }
    const toast: Toast = {
      id: `toast-${++seq}`,
      title: t.title,
      body: t.body,
      variant: t.variant ?? 'info',
      avatar: t.avatar,
      onClick: t.onClick,
    };
    // Cap the visible stack so a burst can't fill the screen.
    set((s) => ({ toasts: [...s.toasts, toast].slice(-4) }));
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
  },
}));

export const showToast = (t: ToastInput) => useToasts.getState().push(t);
