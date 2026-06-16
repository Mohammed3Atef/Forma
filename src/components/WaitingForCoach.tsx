import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** Empty state shown to a client whose coach hasn't assigned content yet. */
export function WaitingForCoach({ messageKey = 'clientCoach.waiting' }: { messageKey?: string }) {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center gap-3 py-12 text-center" data-testid="waiting-for-coach">
      <span className="text-brand">
        <Icon name="timer" size={32} />
      </span>
      <p className="max-w-xs text-sm text-earth-muted">{t(messageKey)}</p>
    </div>
  );
}
