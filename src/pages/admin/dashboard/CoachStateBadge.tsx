import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';

type CoachState = 'trial' | 'active' | 'expired' | 'suspended' | 'none';

const META: Record<CoachState, { icon: IconName; cls: string }> = {
  trial: { icon: 'timer', cls: 'pill-brand' },
  active: { icon: 'check', cls: 'pill-ok' },
  expired: { icon: 'info', cls: 'pill-bad' },
  suspended: { icon: 'pause', cls: 'pill-bad' },
  none: { icon: 'minus', cls: 'pill-mute' },
};

/** Coach plan state as colour + icon + text (never colour alone — a11y). */
export function CoachStateBadge({ state }: { state: CoachState }) {
  const { t } = useTranslation();
  const m = META[state] ?? META.none;
  return (
    <span className={`pill ${m.cls}`}>
      <Icon name={m.icon} size={12} />
      {t(`adminCoaches.state.${state}`)}
    </span>
  );
}
