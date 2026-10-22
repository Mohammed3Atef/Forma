import type { ReactNode } from 'react';

/**
 * The one app header (B2, doc 17 "MobileHeader": merges BrandBar + TopBar).
 * 56px, sticky, solid; start slot (Back on sub-screens, the wordmark on a tab
 * root), a title, and ≤2 end actions. The notch is covered once: the body
 * already pads the top inset, so the header pulls itself up by it (B1 §10).
 */
export function AppHeader({
  start,
  title,
  end,
  testId = 'app-header',
  className = '',
  innerClassName = 'md:px-4',
}: {
  start?: ReactNode;
  title?: ReactNode;
  end?: ReactNode;
  testId?: string;
  className?: string;
  /** B3.8: the content row's width / padding — a shell aligns it with its main column. */
  innerClassName?: string;
}) {
  return (
    <header
      data-testid={testId}
      className={`sticky top-0 z-ui-header border-b border-white/[0.06] bg-surface/95 backdrop-blur-md ${className}`}
      style={{ paddingTop: 'var(--shell-safe-top)', marginTop: 'calc(-1 * var(--shell-safe-top))' }}
    >
      <div className={`mx-auto flex h-14 w-full items-center gap-2 px-2 ${innerClassName}`}>
        {start ? <div className="flex shrink-0 items-center">{start}</div> : <span className="w-2" />}
        <div className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-tight">{title}</div>
        {end ? <div className="flex shrink-0 items-center gap-1">{end}</div> : null}
      </div>
    </header>
  );
}
