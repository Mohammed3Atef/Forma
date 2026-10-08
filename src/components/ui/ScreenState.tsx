import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

/**
 * Screen-state model (B1.5). One rule for what a data-backed screen shows,
 * so screens stop inventing their own:
 *  - data on screen is NEVER replaced by an error or a spinner — a failed
 *    refresh or going offline only marks it `stale`;
 *  - no data + offline is `offline`, never a false "empty" (AR-01) or a
 *    generic error;
 *  - no data + error is `error` (with Retry); no data yet is `loading`;
 *  - loaded and genuinely nothing there is `empty`.
 */
export type ScreenStatus = 'loading' | 'offline' | 'error' | 'empty' | 'ready';

export interface ScreenStateInput {
  loading: boolean;
  error?: boolean;
  /** Something has loaded (possibly from cache). */
  hasData: boolean;
  /** What loaded is an empty list / nothing to show. */
  empty?: boolean;
  online: boolean;
}

export function screenStatus({ loading, error = false, hasData, empty = false, online }: ScreenStateInput): { status: ScreenStatus; stale: boolean } {
  if (hasData) return { status: empty ? 'empty' : 'ready', stale: !online || error };
  if (!online) return { status: 'offline', stale: false };
  if (error) return { status: 'error', stale: false };
  if (loading) return { status: 'loading', stale: false };
  return { status: 'empty', stale: false };
}

/** No data on this device and no connection — says so, instead of "nothing here". */
export function OfflineState({ message, onRetry, className = '', testId = 'offline-state' }: { message?: string; onRetry?: () => void; className?: string; testId?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`card flex flex-col items-center gap-3 py-10 text-center ${className}`} role="status" data-testid={testId}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-raised text-earth-muted">
        <Icon name="cloud" size={26} />
      </span>
      <p className="max-w-sm text-sm text-earth-muted">{message ?? t('states.offline')}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-ghost">
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}

/** Shown above data that may be out of date (offline, or the last refresh failed). */
export function StaleNotice({ online, className = '' }: { online: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={`flex items-center gap-1.5 text-[12px] text-earth-subtle ${className}`} role="status" data-testid="stale-notice">
      <Icon name={online ? 'info' : 'cloud'} size={13} />
      {online ? t('states.staleFailed') : t('states.staleOffline')}
    </p>
  );
}

/**
 * Composes the states for a screen section. Pass the query facts; children
 * render only when there is data. Every state is overridable.
 */
export function ScreenState({
  loading,
  error,
  hasData,
  empty,
  onRetry,
  emptyTitle,
  emptyMessage,
  emptyIcon,
  emptyAction,
  loadingVariant = 'list',
  loadingCount,
  testId,
  children,
}: Omit<ScreenStateInput, 'online'> & {
  onRetry?: () => void;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyIcon?: IconName;
  emptyAction?: ReactNode;
  loadingVariant?: 'cards' | 'list';
  loadingCount?: number;
  testId?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const { status, stale } = screenStatus({ loading, error, hasData, empty, online });
  const id = (s: string) => (testId ? `${testId}-${s}` : undefined);
  if (status === 'loading') return <LoadingState variant={loadingVariant} count={loadingCount} />;
  if (status === 'offline') return <OfflineState onRetry={onRetry} testId={id('offline')} />;
  if (status === 'error') return <ErrorState onRetry={onRetry} testId={id('error')} />;
  return (
    <div data-testid={testId} data-screen-state={status}>
      {stale ? <StaleNotice online={online} className="mb-2" /> : null}
      {status === 'empty' ? <EmptyState icon={emptyIcon} title={emptyTitle ?? t('states.emptyTitle')} message={emptyMessage} action={emptyAction} testId={id('empty')} /> : children}
    </div>
  );
}
