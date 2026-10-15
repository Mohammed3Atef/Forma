import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconTile, ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { CoachNav } from '@/components/client/CoachNav';
import { useSession } from '@/services/auth/sessionStore';
import { listCheckIns } from '@/services/platform/checkInApi';
import { formatDate, formatNumber } from '@/lib/format';
import type { WeeklyCheckIn as CheckIn, CheckInStatus } from '@/types';

const STATUS_CLASS: Record<CheckInStatus, string> = {
  requested: 'bg-warn/15 text-warn',
  submitted: 'bg-info/15 text-info',
  reviewed: 'bg-success/15 text-success',
};

/*
 * COACH › CHECK-INS (B2.6): what the coach asked for and what came back.
 * A requested check-in is first and opens the full-screen wizard; submitted
 * and reviewed ones open read-only (with the coach's feedback). The client's
 * own assessment lives here too — it is the first thing the coach reviewed.
 */
export function CheckInHistory() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const uid = useSession((s) => s.uid) ?? '';
  const q = useQuery({ queryKey: ['checkInsHistory', uid], queryFn: () => listCheckIns(uid), enabled: !!uid });
  const items = q.data ?? [];
  const due = items.filter((c) => c.status === 'requested');
  const past = items.filter((c) => c.status !== 'requested');

  const row = (c: CheckIn) => (
    <ListRow
      key={c.id}
      to={`/check-in/${c.id}`}
      testId="checkin-history-row"
      leading={<IconTile icon="calendar" tone={c.status === 'requested' ? 'brand' : 'neutral'} />}
      title={`${formatDate(c.weekStart, lang, 'short')} – ${formatDate(c.weekEnd, lang, 'short')}`}
      meta={c.currentWeight != null ? `${formatNumber(c.currentWeight, lang)} ${t('common.kg')}` : c.status === 'requested' ? t('coachTab.checkinDueMeta') : undefined}
      trailing={<span className={`rounded-ui-pill px-2.5 py-1 text-[12px] font-semibold ${STATUS_CLASS[c.status]}`}>{t(`checkin.status.${c.status}`)}</span>}
      chevron
    />
  );

  return (
    <div className="space-y-7" data-testid="client-checkins">
      <CoachNav />

      {q.isLoading ? (
        <LoadingState variant="list" count={3} />
      ) : q.isError ? (
        <ErrorState message={t('coachTab.checkinsFailed')} onRetry={() => void q.refetch()} testId="checkins-error" />
      ) : (
        <>
          {due.length > 0 && (
            <Section title={t('coachTab.checkinDue')}>
              <ListGroup>{due.map(row)}</ListGroup>
            </Section>
          )}
          <Section title={t('coachTab.checkinPast')}>
            {past.length === 0 ? <p className="text-[15px] text-earth-muted">{t('coachTab.noCheckins')}</p> : <ListGroup>{past.map(row)}</ListGroup>}
          </Section>
        </>
      )}

      <ListGroup>
        <ListRow to="/assessment" leading={<IconTile icon="clip" tone="neutral" />} title={t('nav.assessment')} meta={t('coachTab.assessmentMeta')} chevron testId="open-assessment" />
      </ListGroup>
    </div>
  );
}
