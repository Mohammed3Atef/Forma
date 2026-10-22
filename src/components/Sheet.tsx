import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export type SheetSize = 'sm' | 'md' | 'lg' | 'xl' | 'wizard';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /**
   * Desktop width. Mobile is always the thumb-friendly bottom sheet (max-w-md).
   * sm→md · md→2xl · lg→4xl · xl/wizard→5xl. Defaults to `sm` so existing
   * callers keep the exact mobile experience until they opt into a wider size.
   */
  size?: SheetSize;
  /**
   * When provided, renders a SINGLE leading back chevron in the header for
   * step navigation. Keep this OR a wizard footer Back — never both.
   */
  onBack?: () => void;
  backTestId?: string;
  /** Fixed footer (e.g. wizard actions) pinned below the scrollable body. */
  footer?: ReactNode;
  children: ReactNode;
}

// Desktop (md+) max-width per size; mobile stays max-w-md regardless.
const SIZE_MD: Record<SheetSize, string> = {
  sm: 'md:max-w-md',
  md: 'md:max-w-2xl',
  lg: 'md:max-w-4xl',
  xl: 'md:max-w-5xl',
  wizard: 'md:max-w-5xl',
};

/**
 * Responsive overlay. Mobile (< md): bottom sheet that slides up for
 * thumb-friendly forms. Tablet/desktop (≥ md): a centered modal sized to its
 * content (see `size`), capped at 85vh with the body scrolling internally so
 * the header (and optional footer) stay fixed.
 *
 * Rendered through a portal to <body> so it pins to the viewport even when an
 * ancestor establishes a containing block (e.g. a transformed page wrapper).
 */
export function Sheet({ open, onClose, title, size = 'sm', onBack, backTestId, footer, children }: SheetProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Keep the latest onClose in a ref so the effect below depends ONLY on
  // `open`. Depending on `onClose` (usually an inline arrow, new identity on
  // every parent render) made the effect re-run on each keystroke and
  // `panelRef.focus()` stole focus from whatever input the user was typing in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Accessibility (B3.9: the shared trap): Escape closes the top layer only, Tab/Shift+Tab cycle the
  // sheet's enabled controls, the page behind is inert. Declared before the effect below so the page is
  // live again when focus returns to the opener.
  useFocusTrap(panelRef, { active: open, onEscape: () => onCloseRef.current() });
  // Body scroll is locked, the sheet takes focus once when it opens, and focus returns to whatever
  // triggered it once it closes.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  const hasHeader = !!title || !!onBack;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      data-testid="sheet">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="sheet-panel"
        data-sheet-size={size}
        className={`relative flex max-h-[88%] w-full max-w-md flex-col overflow-hidden rounded-t-sheet border-t border-line bg-surface-card shadow-deep [animation:sheetRise_0.35s_var(--ease-card)] motion-reduce:animate-none focus:outline-none md:max-h-[85vh] md:rounded-2xl md:border ${SIZE_MD[size]}`}>
        {/* Grab handle — mobile bottom-sheet affordance only. */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/20 md:hidden" />
        {hasHeader && (
          <div className="flex shrink-0 items-center gap-2 px-5 pb-3 pt-3 md:px-6 md:pt-5">
            {onBack && (
              <button type="button" onClick={onBack} className="icon-btn h-9 w-9" aria-label={t('common.back')} data-testid={backTestId}>
                <Icon name="chevronLeft" size={18} />
              </button>
            )}
            {title && <h2 id={titleId} className="h2 min-w-0 flex-1 truncate">{title}</h2>}
            <button type="button" onClick={onClose} data-testid="sheet-close" className="icon-btn ms-auto h-9 w-9" aria-label={t('common.close')}>
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-8 md:px-6 md:pb-6 ${hasHeader ? '' : 'pt-2 md:pt-5'}`}>
          {children}
        </div>
        {footer && <div className="shrink-0 border-t border-line bg-surface-card px-5 py-4 md:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

