import { useTranslation } from 'react-i18next';
import { useReminders } from '@/services/reminders/reminderStore';
import { Banner } from '@/components/ui/Banner';
import { BANNER_PRIORITY, useBannerSlot } from '@/stores/bannerRegionStore';

/** In-app fallback shown when a reminder is due (works even without OS notifications) — a banner-region slot (B1.4). */
export function ReminderBanner() {
  const { t } = useTranslation();
  const due = useReminders((s) => s.due);
  const dismiss = useReminders((s) => s.dismissDue);
  const show = useBannerSlot('reminder', BANNER_PRIORITY.reminder, !!due);
  if (!show || !due) return null;
  return (
    <Banner tone="brand" icon="timer" onDismiss={dismiss} testId="reminder-banner">
      <span className="text-earth">{t('reminder.dueNow', { label: due.label })}</span>
    </Banner>
  );
}
