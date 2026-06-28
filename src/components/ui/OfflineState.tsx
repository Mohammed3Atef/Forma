import { useTranslation } from 'react-i18next';
import { EmptyState } from './EmptyState';

/**
 * Standard "this needs a connection" state — for Coach/Admin views that can't
 * render offline (they read live data). The global OfflineBanner stays visible;
 * this replaces an endless spinner with a clear message + optional retry.
 */
export function OfflineState({ onRetry, testId = 'offline-state' }: { onRetry?: () => void; testId?: string }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="info"
      title={t('state.offlineTitle')}
      message={t('state.offlineBody')}
      action={
        onRetry ? (
          <button type="button" className="btn-ghost" onClick={onRetry}>
            {t('sync.retry')}
          </button>
        ) : undefined
      }
      testId={testId}
    />
  );
}
