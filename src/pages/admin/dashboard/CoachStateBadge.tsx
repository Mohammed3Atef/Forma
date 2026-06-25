import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';

type CoachState = 'trial' | 'active' | 'expired' | 'suspended' | 'none';

const META: Record<CoachState, { icon: IconName; cls: string }> = {
  trial: { icon: 'timer', cls: 'border-brand/50 text-brand' },
  active: { icon: 'check', cls: 'border-success-light/50 text-success-light' },
  expired: { icon: 'info', cls: 'border-danger/50 text-danger' },
  suspended: { icon: 'pause', cls: 'border-danger/50 text-danger' },
  none: { icon: 'minus', cls: 'border-line text-earth-subtle' },
};

/** Coach plan state as colour + icon + text (never colour alone — a11y). */
export function CoachStateBadge({ state }: { state: CoachState }) {
  const { t } = useTranslation();
  const m = META[state] ?? META.none;
  return (
    <span className={`chip inline-flex shrink-0 items-center gap-1 text-[11px] ${m.cls}`}>
      <Icon name={m.icon} size={12} />
      {t(`adminCoaches.state.${state}`)}
    </span>
  );
}
