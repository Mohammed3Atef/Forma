import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import { formatDate, formatRelative } from '@/lib/format';
import type { TodayItem, TodayKind, TodaySection } from '@/lib/coachToday';

export interface TodayPerson {
  name: string;
  photoUrl?: string;
}

export const SECTION_ICON: Record<TodaySection, IconName> = {
  reviews: 'check',
  requests: 'alert',
  messages: 'chat',
  subscriptions: 'calendar',
  coaching: 'dumbbell',
};

/** Kinds whose action is a decision the client is waiting on — their label reads in brand. */
const URGENT: ReadonlySet<TodayKind> = new Set(['checkin', 'assessment', 'freeze', 'transfer', 'message']);

/**
 * The client's own words, isolated (U+2068 … U+2069) so an English line can't
 * reorder the Arabic sentence around it (or the reverse) — RTL-safe quoting.
 */
const isolate = (s: string) => `\u2068${s}\u2069`;

/** The reason line: what happened, with its evidence (a week, a date, a count, the client's words). */
export function useTodayReason() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const day = (ts: number | string) => formatDate(ts, lang, 'weekdayDayMonth');
  return (it: TodayItem, now: number): string => {
    switch (it.kind) {
      case 'checkin': {
        const week = it.dayKey ? formatDate(it.dayKey, lang, 'dayMonth') : '';
        const base = (it.count ?? 1) > 1 ? t('coachToday.reason.checkinMany', { count: it.count, date: week }) : t('coachToday.reason.checkin', { date: week });
        return it.at ? `${base} · ${t('coachToday.reason.submitted', { ago: formatRelative(it.at, lang, now) })}` : base;
      }
      case 'assessment':
        return t(it.flag === 'updated' ? 'coachToday.reason.assessmentUpdated' : 'coachToday.reason.assessment');
      case 'freeze': {
        const r = it.range;
        if (it.text && r?.from && r?.until) {
          return t('coachToday.reason.freezeRange', { from: formatDate(r.from, lang, 'dayMonth'), until: formatDate(r.until, lang, 'dayMonth'), text: isolate(it.text) });
        }
        return it.text ? t('coachToday.reason.freeze', { text: isolate(it.text) }) : t('coachToday.reason.freezeNoReason');
      }
      case 'transfer':
        return it.text ? t('coachToday.reason.transferReason', { text: isolate(it.text) }) : t('coachToday.reason.transfer');
      case 'message': {
        const n = t('coachToday.reason.message', { count: it.count ?? 1 });
        return it.text ? t('coachToday.reason.messageWithText', { n, text: isolate(it.text) }) : n;
      }
      case 'renewal':
        return t(it.flag === 'trial' ? 'coachToday.reason.trialEnds' : 'coachToday.reason.renewal', { count: it.days ?? 0, date: it.at ? day(it.at) : '' });
      case 'lapsed':
        return it.days ? t('coachToday.reason.lapsed', { count: it.days }) : t('coachToday.reason.lapsedToday');
      case 'noPlan':
        return t('coachToday.reason.noPlan');
      case 'inactive':
        return it.dayKey && it.days != null ? t('coachToday.reason.inactive', { count: it.days, date: formatDate(it.dayKey, lang, 'dayMonth') }) : t('coachToday.reason.inactiveNever');
    }
  };
}

/**
 * One queue row: who · why · the one action. Phones: the row IS the action
 * (it opens the exact place, or the review / decision sheet). Desktop: the
 * row selects the item for the side panel, where the action lives.
 */
export function TodayRow({
  item,
  person,
  reason,
  selected,
  onActivate,
}: {
  item: TodayItem;
  person: TodayPerson;
  reason: string;
  selected?: boolean;
  onActivate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onActivate}
      data-testid="today-item"
      data-kind={item.kind}
      data-client-id={item.clientId}
      aria-current={selected ? 'true' : undefined}
      className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start transition-colors ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
    >
      <Avatar name={person.name} photoUrl={person.photoUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug">{person.name}</span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-earth-muted">{reason}</span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${URGENT.has(item.kind) ? 'bg-brand/[0.14] text-brand-hover' : 'bg-white/[0.06] text-earth'}`}
        data-testid="today-item-action"
      >
        {t(`coachToday.action.${item.kind}`)}
      </span>
      <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle lg:hidden" />
    </button>
  );
}
