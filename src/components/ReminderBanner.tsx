import { useTranslation } from 'react-i18next';
import { useReminders } from '@/services/reminders/reminderStore';
import { Icon } from './Icon';

/** In-app fallback banner shown when a reminder is due (works even without OS notifications). */
export function ReminderBanner() {
  const { t } = useTranslation();
  const due = useReminders((s) => s.due);
  const dismiss = useReminders((s) => s.dismissDue);
  if (!due) return null;

  return (
    <div className="sticky top-0 z-40 mx-2 mt-2 flex items-center gap-2 rounded-xl2 bg-accent/20 px-3 py-2 text-sm ring-1 ring-accent/40">
      <Icon name="timer" size={18} className="shrink-0 text-accent" />
      <span className="flex-1">{t('reminder.dueNow', { label: due.label })}</span>
      <button type="button" onClick={dismiss} className="icon-btn h-8 w-8" aria-label="dismiss">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
