import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog } from '@/stores/dialogStore';
import { setNavGuard } from '@/stores/navGuardStore';

export interface UnsavedGuardCopy {
  title: string;
  body: string;
  confirmLabel: string;
}

/**
 * Registers a leave-confirmation for as long as `dirty` is true. Every in-app
 * navigation trigger that respects the shared guard (`useBack`, the coach
 * workspace tab rail, the bottom nav) pauses to ask before leaving, no matter
 * which one the user tapped — so an editor's unsaved-changes prompt can't be
 * bypassed by switching tabs or hitting the bottom nav instead of the editor's
 * own back button.
 *
 * Also arms `beforeunload` while dirty, which is the only hook the browser
 * gives a page for a hard refresh or tab close (a generic, non-customizable
 * native prompt) — this app's declarative `<BrowserRouter>` has no
 * `useBlocker` (that needs a data router), so a real OS/browser Back-button
 * press cannot be intercepted the same way; it isn't guarded here.
 */
export function useUnsavedGuard(dirty: boolean, copy?: UnsavedGuardCopy, onLeave?: () => void): void {
  const { t } = useTranslation();
  // "Leave" means discard: an editor's autosaved draft must not come back on
  // the next open after the user chose to throw the changes away (NAV-K02).
  const leaveRef = useRef(onLeave);
  leaveRef.current = onLeave;

  useEffect(() => {
    if (!dirty) return;
    setNavGuard(async () => {
      const leave = await confirmDialog({
        title: copy?.title ?? t('coachEditor.unsavedTitle'),
        message: copy?.body ?? t('coachEditor.unsavedBody'),
        confirmLabel: copy?.confirmLabel ?? t('coachEditor.leave'),
        danger: true,
      });
      if (leave) leaveRef.current?.();
      return leave;
    });
    return () => setNavGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
