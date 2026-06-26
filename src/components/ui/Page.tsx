import type { ReactNode } from 'react';

/**
 * Coach/Admin layout helpers. The page-level container/width is handled once by
 * ResponsiveShell (full width on desktop, capped + centered at max-w-screen-2xl),
 * so these only standardise INNER rhythm and form/section structure — there is no
 * separate CoachPage/AdminPage wrapper because the shell already wraps both portals.
 */

/** Vertical rhythm wrapper for a page's stacked sections. */
export function PageContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-6 ${className}`}>{children}</div>;
}

/**
 * Responsive form/card grid: 1 column on mobile, `cols` columns from `md`.
 * Use for 2-column desktop forms; for dashboard KPI grids use ResponsiveGrid.
 */
export function PageGrid({
  children,
  cols = 2,
  className = '',
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}) {
  const md = cols === 1 ? '' : cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return <div className={`grid grid-cols-1 gap-4 ${md} ${className}`}>{children}</div>;
}

/**
 * A titled form section. `columns` lays the body out as a responsive 2-column
 * grid on desktop (fields stack on mobile); otherwise the body is a single
 * stacked column. Span a field across both columns with `className="md:col-span-2"`.
 */
export function FormSection({
  title,
  description,
  columns = false,
  children,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  columns?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-4 ${className}`}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h2 className="h2">{title}</h2>}
          {description && <p className="text-[13px] text-earth-muted">{description}</p>}
        </div>
      )}
      {columns ? <PageGrid cols={2}>{children}</PageGrid> : <div className="space-y-4">{children}</div>}
    </section>
  );
}
