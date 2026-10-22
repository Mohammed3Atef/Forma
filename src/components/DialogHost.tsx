import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialog } from '@/stores/dialogStore';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/** Renders the active confirm/alert popup. Mounted once at the app root. */
export function DialogHost() {
  const { t } = useTranslation();
  const { open, isAlert, title, message, confirmLabel, cancelLabel, danger, respond } = useDialog();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Accessibility: Escape cancels, Tab/Shift+Tab stay inside the dialog, body
  // scroll is locked, initial focus goes to the least-destructive action
  // (Cancel, or Accept when there isn't one), and focus returns to whatever
  // triggered the dialog once it closes.
  // B3.9: the shared trap — over a sheet, Escape cancels only this dialog.
  useFocusTrap(panelRef, { active: open, onEscape: () => respond(false) });
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (cancelRef.current ?? acceptRef.current)?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={message ? descId : undefined}
      data-testid="confirm-dialog"
    >
      <div className="absolute inset-0 bg-black/60" onClick={() => respond(false)} />
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-w-sm rounded-xl2 bg-surface-card p-5 shadow-2xl focus:outline-none">
        <h2 id={titleId} className="text-lg font-bold">{title}</h2>
        {message && <p id={descId} className="mt-2 whitespace-pre-line text-sm text-earth-muted">{message}</p>}
        <div className="mt-5 flex gap-2">
          {!isAlert && (
            <button ref={cancelRef} type="button" data-testid="confirm-cancel" onClick={() => respond(false)} className="btn-ghost flex-1">
              {cancelLabel ?? t('common.cancel')}
            </button>
          )}
          <button
            ref={acceptRef}
            type="button"
            data-testid="confirm-accept"
            onClick={() => respond(true)}
            className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`}
          >
            {confirmLabel ?? (isAlert ? t('common.close') : t('common.yes'))}
          </button>
        </div>
      </div>
    </div>
  );
}
