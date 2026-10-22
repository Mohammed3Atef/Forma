import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui/Pill';
import type { DirectoryRow } from '@/lib/coachDirectory';
import { CLIENT_STATE_TONE as STATE_TONE, ACCOUNT_TONE as ACCT_TONE } from '@/lib/statusTone';
import { useTodayReason } from '@/pages/coach/today/TodayRow';


/** The package state; unknown (its source failed) renders nothing — never a guess. */
export function StatePill({ row }: { row: DirectoryRow }) {
  const { t } = useTranslation();
  if (!row.state) return null;
  return (
    <Pill testId="client-coaching-state" tone={STATE_TONE[row.state]}>
      {row.state === 'expiring' && row.daysLeft != null ? t('coachClients.endsIn', { count: row.daysLeft }) : t(`coachClients.state.${row.state}`)}
    </Pill>
  );
}

/**
 * The account state, only when it actually blocks the client (owner, B3.3): "Account pending /
 * frozen / trashed" — worded as the ACCOUNT so it is never read as a paused package.
 */
export function AccountPill({ row }: { row: DirectoryRow }) {
  const { t } = useTranslation();
  if (row.accountStatus === 'active') return null;
  return (
    <Pill testId="client-account-warning" tone={ACCT_TONE[row.accountStatus] ?? 'warn'}>
      {t(`coachClients.account.${row.accountStatus}`, { defaultValue: t(`subscription.acct.${row.accountStatus}`) })}
    </Pill>
  );
}

/**
 * "Last workout 3 days ago" — from the client's own finished workouts; "—" when that source didn't load.
 * `short` ("3 days ago") is for the table, whose column header already says "Last workout".
 */
export function useActivityText(short = false) {
  const { t } = useTranslation();
  const ns = short ? 'coachClients.activityShort' : 'coachClients.activity';
  return (r: DirectoryRow): string => {
    if (r.lastWorkout === undefined) return '—';
    if (r.lastWorkout === null || r.daysSinceWorkout === null) return t(`${ns}.never`);
    if (r.daysSinceWorkout === 0) return t(`${ns}.today`);
    if (r.daysSinceWorkout === 1) return t(`${ns}.yesterday`);
    return t(`${ns}.days`, { count: r.daysSinceWorkout });
  };
}

/** The row's reason: the first queue item (exactly Today's wording), else the client's activity. */
export function useRowReason() {
  const reason = useTodayReason();
  const activity = useActivityText();
  return (r: DirectoryRow, now: number): { text: string; needs: boolean } =>
    r.needs[0] ? { text: reason(r.needs[0], now), needs: true } : { text: activity(r), needs: false };
}

/**
 * One client in the phone / tablet list: avatar, name, the reason (or last
 * workout), the package state. The whole row opens the client. No contact
 * details in the list (blueprint §6.2 privacy) — they live in Profile.
 */
export function ClientRow({ row, reason }: { row: DirectoryRow; reason: { text: string; needs: boolean } }) {
  return (
    <Link
      to={`/coach/client/${encodeURIComponent(row.id)}`}
      data-testid="coach-client-row"
      data-client-id={row.id}
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-white/[0.03]"
    >
      <Avatar name={row.name} photoUrl={row.photoUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug">{row.name}</span>
        <span className={`mt-0.5 line-clamp-2 text-[13px] leading-snug ${reason.needs ? 'text-earth' : 'text-earth-muted'}`}>{reason.text}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatePill row={row} />
        <AccountPill row={row} />
      </span>
      <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
    </Link>
  );
}
