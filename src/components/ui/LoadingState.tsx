import { useTranslation } from 'react-i18next';
import { Skeleton, SkeletonCard } from './Skeleton';

/**
 * Accessible loading placeholder. Announces politely to screen readers and
 * shows skeletons that mirror the eventual layout (no plain "Working…" text).
 *  - `cards`: a grid of metric-card skeletons (dashboards)
 *  - `list`:  stacked row skeletons inside a card (lists/tables)
 */
export function LoadingState({
  variant = 'list',
  count = 4,
  label,
  className = '',
}: {
  variant?: 'cards' | 'list';
  count?: number;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {variant === 'cards' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: count }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="card space-y-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
