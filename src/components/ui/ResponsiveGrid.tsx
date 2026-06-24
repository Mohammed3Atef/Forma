import type { ReactNode } from 'react';

/**
 * Responsive grid wrapper. `min` controls the smallest column count growth:
 * 1 col on mobile → 2 on `sm` → `cols` on `lg`. Keeps coach dashboards/cards
 * tidy without bespoke grid classes per page.
 */
export function ResponsiveGrid({
  children,
  cols = 3,
  className = '',
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  const lg = cols === 2 ? 'lg:grid-cols-2' : cols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${lg} ${className}`}>{children}</div>;
}
