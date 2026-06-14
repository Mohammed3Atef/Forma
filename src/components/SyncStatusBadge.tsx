import { useTranslation } from 'react-i18next';
import { useCloud, cloudStatus, type CloudStatus } from '@/services/auth/cloudStore';
import { Icon, type IconName } from './Icon';

const STYLE: Record<CloudStatus, { color: string; icon: IconName; pulse?: boolean }> = {
  local: { color: 'bg-surface-raised text-slate-300', icon: 'scale' },
  signedIn: { color: 'bg-accent/20 text-accent', icon: 'check' },
  syncing: { color: 'bg-accent/20 text-accent', icon: 'timer', pulse: true },
  synced: { color: 'bg-brand/20 text-brand-light', icon: 'check' },
  error: { color: 'bg-danger/20 text-danger', icon: 'close' },
};

/** Compact badge showing the current cloud sync state. */
export function SyncStatusBadge({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const status = useCloud((s) => cloudStatus(s));
  const { color, icon, pulse } = STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${color} ${className}`}>
      <Icon name={icon} size={12} className={pulse ? 'animate-spin' : ''} />
      {t(`cloudState.${status}`)}
    </span>
  );
}
