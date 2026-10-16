import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { useSyncState } from '@/hooks/useSyncState';
import type { SyncTruthState } from '@/data/sync/syncTruth';
import { formatRelative } from '@/lib/format';

/**
 * The ONE sync indicator (B1.7 / PWA-11) — replaces `SyncStatusBadge` and
 * `SyncStatusIndicator`. It reads `useSyncState()`, so it can never claim
 * "Synced" while anything is unacknowledged.
 *
 *  - `inline` (headers): SILENT when healthy (synced) — healthy sync is not
 *    news. Otherwise a quiet chip; "Sync failed" is a button that retries.
 *  - `detail` (Settings): always shows the state, what is pending and when the
 *    device last synced.
 *
 * Accessibility: `role="status"` (polite live region); the chip carries its
 * full meaning in text (never colour only); 44px hit area on the retry button.
 */
const LOOK: Record<SyncTruthState, { icon: IconName; tone: string; spin?: boolean }> = {
  synced: { icon: 'check', tone: 'text-ui-success' },
  syncing: { icon: 'rotate', tone: 'text-ui-syncing', spin: true },
  waiting: { icon: 'timer', tone: 'text-ui-secondary' },
  saved_on_device: { icon: 'download', tone: 'text-ui-offline' },
  failed: { icon: 'close', tone: 'text-ui-error' },
  conflict: { icon: 'info', tone: 'text-ui-conflict' },
};

export function SyncStatus({ variant = 'inline', className = '' }: { variant?: 'inline' | 'detail'; className?: string }) {
  const { t, i18n } = useTranslation();
  const s = useSyncState();
  const look = LOOK[s.state];
  const label = t(`trust.syncState.${s.state}`);
  const icon = <Icon name={look.icon} size={14} className={`shrink-0 ${look.spin ? 'animate-spin motion-reduce:animate-none' : ''}`} />;

  if (variant === 'inline') {
    if (s.state === 'synced') return null;
    const chip = `inline-flex min-h-8 items-center gap-1.5 rounded-ui-pill bg-ui-raised px-2.5 t-caption font-medium ${look.tone} ${className}`;
    if (s.state === 'failed' && s.online) {
      return (
        <button type="button" className={`${chip} relative before:absolute before:-inset-1.5 hover:bg-ui-interactive`} onClick={s.syncNow} data-testid="sync-status" data-sync-state={s.state} aria-label={`${label} — ${t('trust.syncState.retry')}`}>
          {icon}
          <span>{label}</span>
        </button>
      );
    }
    return (
      <span role="status" className={chip} data-testid="sync-status" data-sync-state={s.state}>
        {icon}
        <span>{label}</span>
      </span>
    );
  }

  const detailLine =
    s.state === 'conflict'
      ? t('trust.syncState.conflictDetail')
      : s.failed > 0
        ? t('trust.syncState.failedDetail', { count: s.failed })
        : s.pending > 0
          ? t('trust.syncState.pending', { count: s.pending })
          : s.lastSync
            ? t('trust.syncState.lastSynced', { when: formatRelative(s.lastSync, i18n.language) })
            : null;
  return (
    <div role="status" className={`flex items-start gap-2 ${className}`} data-testid="sync-status" data-sync-state={s.state}>
      <span className={`mt-0.5 ${look.tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className={`block t-label ${look.tone}`}>{label}</span>
        {detailLine && <span className="block t-caption text-ui-muted">{detailLine}</span>}
        {/* B3.0.1: logs refused because their day was outside the coaching subscription — say why, and that they are kept. */}
        {s.failedReadOnly > 0 && (
          <span className="block t-caption text-ui-muted" data-testid="sync-readonly-detail">
            {t('trust.syncState.readOnlyDetail', { count: s.failedReadOnly })}
          </span>
        )}
      </span>
    </div>
  );
}
