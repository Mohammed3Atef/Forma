import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Bottom sheet / modal. Slides up from the bottom for thumb-friendly forms.
 * Rendered through a portal to <body> so it pins to the viewport even when an
 * ancestor establishes a containing block (e.g. a transformed page wrapper).
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Keep the latest onClose in a ref so the effect below depends ONLY on
  // `open`. Depending on `onClose` (usually an inline arrow, new identity on
  // every parent render) made the effect re-run on each keystroke and
  // `panelRef.focus()` stole focus from whatever input the user was typing in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Accessibility: Escape closes, body scroll is locked, and the sheet takes
  // focus once, when it opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative max-h-[88%] w-full max-w-md overflow-y-auto rounded-t-sheet border-t border-line bg-[#0c0c0c] px-5 pb-8 pt-2 shadow-deep [animation:sheetRise_0.35s_var(--ease-card)] motion-reduce:animate-none focus:outline-none">
        <div className="mx-auto mb-4 mt-2 h-1 w-10 rounded-full bg-white/20" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="h2">{title}</h2>
            <button type="button" onClick={onClose} className="icon-btn h-9 w-9" aria-label="close">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
