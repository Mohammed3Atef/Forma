import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialog } from '@/stores/dialogStore';

/** Renders the active confirm/alert popup. Mounted once at the app root. */
export function DialogHost() {
  const { t } = useTranslation();
  const { open, isAlert, title, message, confirmLabel, cancelLabel, danger, respond } = useDialog();
  const panelRef = useRef<HTMLDivElement>(null);

  // Accessibility: Escape cancels, body scroll is locked, and the dialog takes focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') respond(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, respond]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={() => respond(false)} />
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-w-sm rounded-xl2 bg-surface-card p-5 shadow-2xl focus:outline-none">
        <h2 className="text-lg font-bold">{title}</h2>
        {message && <p className="mt-2 text-sm text-slate-300">{message}</p>}
        <div className="mt-5 flex gap-2">
          {!isAlert && (
            <button type="button" onClick={() => respond(false)} className="btn-ghost flex-1">
              {cancelLabel ?? t('common.cancel')}
            </button>
          )}
          <button
            type="button"
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
