import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { useCloud, cloudStatus, type CloudStatus } from '@/services/auth/cloudStore';

const STYLE: Record<CloudStatus, { color: string; icon: IconName; pulse?: boolean }> = {
  local: { color: 'text-earth-subtle', icon: 'scale' },
  signedIn: { color: 'text-earth-muted', icon: 'check' },
  syncing: { color: 'text-brand', icon: 'timer', pulse: true },
  synced: { color: 'text-success-light', icon: 'check' },
  error: { color: 'text-danger', icon: 'close' },
};

/**
 * Compact cloud-sync indicator for the Coach/Admin DesktopTopBar. Reuses the
 * shared cloud status; on `error` it becomes a retry button (syncNow). Hidden
 * in local-only mode (no cloud account) to avoid noise.
 */
export function SyncStatusIndicator({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const status = useCloud((s) => cloudStatus(s));
  const syncNow = useCloud((s) => s.syncNow);
  if (status === 'local') return null;
  const { color, icon, pulse } = STYLE[status];
  const isError = status === 'error';
  const label = t(`cloudState.${status}`);
  const content = (
    <>
      <Icon name={icon} size={14} className={pulse ? 'animate-spin' : ''} />
      <span className="hidden lg:inline">{isError ? t('sync.retry') : label}</span>
    </>
  );
  const base = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${color} ${className}`;
  return isError ? (
    <button type="button" data-testid="sync-indicator" aria-label={t('sync.retry')} className={`${base} hover:bg-white/5`} onClick={() => void syncNow(true)}>
      {content}
    </button>
  ) : (
    <span data-testid="sync-indicator" className={base} title={label}>
      {content}
    </span>
  );
}
