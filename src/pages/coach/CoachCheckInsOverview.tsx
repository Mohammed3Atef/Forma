import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import { listCheckIns, requestCheckIn } from '@/services/platform/checkInApi';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { shortDate, today, weekRange } from '@/lib/utils';
import type { CheckInStatus, UserRecord, WeeklyCheckIn } from '@/types';

type Status = CheckInStatus | 'none';
interface CheckInRow {
  client: UserRecord;
  latest: WeeklyCheckIn | null;
  status: Status;
}
const TONE: Record<Status, PillTone> = { requested: 'warn', submitted: 'brand', reviewed: 'ok', none: 'mute' };
// Submitted (needs review) floats to the top, then requested (awaiting the client), then not-yet-requested.
const PRIORITY: Record<Status, number> = { submitted: 0, requested: 1, none: 2, reviewed: 3 };

/**
 * Coach-wide check-ins: every client's latest check-in status in one list,
 * matching the design's `checkins()` screen exactly — the real app previously
 * only had this per-client. "Send reminders" bulk-requests this week's
 * check-in for every client who doesn't have one yet (reuses the same
 * `requestCheckIn` mutation the per-client screen already uses, just looped).
 */
export function CoachCheckInsOverview() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id) ?? '';

  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: !!coachId });
  const list = clients.data ?? [];
  const checkIns = useQueries({
    queries: list.map((c) => ({ queryKey: ['checkIns', c.id], queryFn: () => listCheckIns(c.id), enabled: !!coachId })),
  });

  const rows: CheckInRow[] = useMemo(
    () =>
      list
        .map((client, i): CheckInRow => {
          const all = checkIns[i]?.data ?? [];
          const latest = [...all].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0] ?? null;
          const status: Status = latest?.status ?? 'none';
          return { client, latest, status };
        })
        .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]),
    [list, checkIns],
  );
  const needReview = rows.filter((r) => r.status === 'submitted').length;
  const missing = rows.filter((r) => r.status === 'none');

  const thisWeek = weekRange(today());
  const remind = useMutation({
    mutationFn: async () => {
      await Promise.all(missing.map((r) => requestCheckIn(coachId, r.client.id, thisWeek.weekStart, thisWeek.weekEnd)));
    },
    onSuccess: () => {
      void Promise.all(missing.map((r) => qc.invalidateQueries({ queryKey: ['checkIns', r.client.id] })));
    },
  });

  return (
    <div className="anim-rise" data-testid="coach-checkins-overview">
      <TopBar
        title={t('nav.coachCheckins')}
        eyebrow={t('platform.coachPortal')}
        sub={rows.length ? t('coachDash.checkinsSub', { review: needReview, requested: rows.filter((r) => r.status === 'requested').length }) : undefined}
        right={
          missing.length > 0 ? (
            <button type="button" className="btn-secondary btn-sm" disabled={remind.isPending} onClick={() => remind.mutate()}>
              <Icon name="bell" size={14} /> {t('coachDash.sendReminders')}
            </button>
          ) : undefined
        }
      />
      {clients.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : rows.length === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('coachDash.noClients')}</div>
      ) : (
        <div className="card divide-y divide-line-soft">
          {rows.map(({ client, latest, status }) => (
            <button
              key={client.id}
              type="button"
              onClick={() => navigate(`/coach/client/${client.id}/checkins`)}
              className="row w-full text-start"
            >
              <Avatar name={client.displayName || client.email} photoUrl={client.photoUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{client.displayName || client.email}</span>
                <span className="block truncate text-[12px] text-earth-subtle">
                  {latest ? shortDate(latest.weekStart, i18n.language) : t('checkin.noneYet')}
                </span>
              </span>
              <Pill tone={TONE[status]}>{t(`checkin.status.${status}`, { defaultValue: t('checkin.none') })}</Pill>
              <Icon name="chevron" size={16} className="text-earth-subtle rtl:rotate-180" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
