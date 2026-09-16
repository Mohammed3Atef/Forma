import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import type { ClientDashboardRow } from '@/services/platform/coachDashboardApi';
import { shortDate } from '@/lib/utils';

export function firstName(name: string): string {
  return (name || '?').trim().split(/\s+/)[0].slice(0, 12);
}

/** Greeting key by local hour. */
export function greetingKey(hour: number): 'coachDash.goodMorning' | 'coachDash.goodAfternoon' | 'coachDash.goodEvening' {
  if (hour < 12) return 'coachDash.goodMorning';
  if (hour < 18) return 'coachDash.goodAfternoon';
  return 'coachDash.goodEvening';
}

/** Quick-action tile used on the Overview / Content tabs. */
export function QuickAction({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card card-hover flex items-center gap-3 text-start">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
    </button>
  );
}

/** The real reason a client is flagged in `needsAttention`, most-urgent first. */
export function attentionReason(row: ClientDashboardRow, t: (k: string, o?: Record<string, unknown>) => string, locale: string): string {
  if (row.toReview) return t('coachDash.reasonCheckin');
  if (row.assessment === 'submitted' || row.assessment === 'updated_after_review') return t('coachDash.reasonAssessment');
  if (row.workouts7d === 0) {
    return row.lastActivity
      ? t('coachDash.reasonInactiveSince', { date: shortDate(row.lastActivity, locale) })
      : t('coachDash.reasonNeverActive');
  }
  return t('coachDash.reasonGeneric');
}

/** What tapping the CTA on an attention row should do. */
export function attentionAction(row: ClientDashboardRow): { labelKey: string; to: string } {
  if (row.toReview) return { labelKey: 'coachDash.review', to: `/coach/client/${row.client.id}/checkins` };
  if (row.assessment === 'submitted' || row.assessment === 'updated_after_review') {
    return { labelKey: 'coachDash.review', to: `/coach/client/${row.client.id}/assessment` };
  }
  return { labelKey: 'coachDash.message', to: `/coach/messages/${row.client.id}` };
}

/** Dense action-required row: avatar/name/real reason + a per-item CTA button (design's `.rowline` + `.tk-ic`). */
export function AttentionRow({ row, onOpen, onAction }: { row: ClientDashboardRow; onOpen: () => void; onAction: () => void }) {
  const { t, i18n } = useTranslation();
  const name = row.client.displayName || row.client.email;
  const action = attentionAction(row);
  return (
    <div className="rowline">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
        <Avatar name={name} photoUrl={row.client.photoUrl} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{name}</span>
          <span className="block truncate text-[12px] text-earth-subtle">{attentionReason(row, t, i18n.language)}</span>
        </span>
      </button>
      <button type="button" onClick={onAction} className="btn-tonal btn-sm shrink-0">
        {t(action.labelKey)}
      </button>
    </div>
  );
}

/** A clickable client row (avatar + name + last-active + 7-day workouts). */
export function ClientRow({ row, onOpen }: { row: ClientDashboardRow; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const name = row.client.displayName || row.client.email;
  return (
    <button type="button" onClick={onOpen} className="row w-full text-start transition-colors hover:bg-white/5 motion-reduce:transition-none">
      <Avatar name={name} photoUrl={row.client.photoUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block truncate text-[12px] text-earth-subtle">
          {row.lastActivity ? t('coachDash.lastActive', { date: shortDate(row.lastActivity, i18n.language) }) : t('coachDash.neverActive')}
        </span>
      </span>
      <span className="font-mono text-xs text-earth-subtle">{t('coachDash.workoutsThisWeek', { n: row.workouts7d })}</span>
      <Icon name="chevron" size={16} className="text-earth-subtle rtl:rotate-180" />
    </button>
  );
}
