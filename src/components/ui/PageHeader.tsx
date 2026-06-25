import type { ReactNode } from 'react';

/**
 * Premium page header for the Coach/Admin dashboards: an eyebrow + title (or a
 * greeting), with optional quick-stat chips, a search slot and action buttons.
 * Renders a real <h1>. Stacks cleanly on mobile.
 */
export function PageHeader({
  eyebrow,
  title,
  greeting,
  stats,
  search,
  actions,
  className = '',
  testId,
}: {
  eyebrow?: string;
  title: string;
  greeting?: string;
  /** Inline quick-stat chips shown under the title (e.g. "12 active clients"). */
  stats?: ReactNode;
  search?: ReactNode;
  actions?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <header className={`mb-5 ${className}`} data-testid={testId}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="mt-1 truncate font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">{title}</h1>
          {greeting ? <p className="mt-1 text-sm text-earth-muted">{greeting}</p> : null}
        </div>
        {search || actions ? (
          <div className="flex items-center gap-2">
            {search}
            {actions}
          </div>
        ) : null}
      </div>
      {stats ? <div className="mt-4 flex flex-wrap items-center gap-2">{stats}</div> : null}
    </header>
  );
}
