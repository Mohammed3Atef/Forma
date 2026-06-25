import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';

/**
 * Compact pager for a paginated list (pairs with `usePagination`). Renders the
 * visible range + Prev/Next; hides itself entirely when there is only one page,
 * so callers can drop it under any list unconditionally.
 */
export function Pagination({
  page,
  totalPages,
  from,
  to,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
  className = '',
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  return (
    <div data-testid="pagination" className={`flex flex-wrap items-center justify-between gap-3 pt-3 ${className}`}>
      <span className="text-[12px] text-earth-subtle">{t('common.pagination.range', { from, to, total })}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="pagination-prev"
          disabled={!canPrev}
          onClick={onPrev}
          aria-label={t('common.pagination.prev')}
          className="chip flex items-center gap-1 disabled:opacity-40"
        >
          <Icon name="chevron" size={14} className="rotate-180 rtl:rotate-0" />
          <span className="hidden sm:inline">{t('common.pagination.prev')}</span>
        </button>
        <span className="font-mono text-[12px] text-earth-muted" data-testid="pagination-status">
          {t('common.pagination.page', { page, total: totalPages })}
        </span>
        <button
          type="button"
          data-testid="pagination-next"
          disabled={!canNext}
          onClick={onNext}
          aria-label={t('common.pagination.next')}
          className="chip flex items-center gap-1 disabled:opacity-40"
        >
          <span className="hidden sm:inline">{t('common.pagination.next')}</span>
          <Icon name="chevron" size={14} className="rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}
