import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextAreaField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckInSummary } from '@/components/CheckInSummary';
import { ClientContextPanel } from '@/components/coach/ClientContextPanel';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import { listCheckInsForCoachClients, requestCheckIn, reviewCheckIn } from '@/services/platform/checkInApi';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { shortDate, today, weekRange } from '@/lib/utils';
import type { CheckInStatus, UserRecord, WeeklyCheckIn } from '@/types';

type Status = CheckInStatus | 'none';
interface CheckInRow {
  client: UserRecord;
  latest: WeeklyCheckIn | null;
  previous: WeeklyCheckIn | null;
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
  // One batched request for every client's latest+previous check-in, instead
  // of one `checkIns.list` request per client — see
  // `checkIns.listForCoachClients`' doc comment.
  const checkIns = useQuery({
    queryKey: ['coachCheckInSummaries', coachId],
    queryFn: () => listCheckInsForCoachClients(coachId),
    enabled: !!coachId,
  });

  const rows: CheckInRow[] = useMemo(() => {
    const byClient = new Map((checkIns.data ?? []).map((s) => [s.clientId, s]));
    return list
      .map((client): CheckInRow => {
        const s = byClient.get(client.id);
        const latest = s?.latest ?? null;
        const previous = s?.previous ?? null;
        const status: Status = latest?.status ?? 'none';
        return { client, latest, previous, status };
      })
      .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]);
  }, [list, checkIns.data]);
  const needReview = rows.filter((r) => r.status === 'submitted').length;
  const missing = rows.filter((r) => r.status === 'none');
  const awaiting = rows.filter((r) => r.status === 'requested');
  const reviewed = rows.filter((r) => r.status === 'reviewed');

  // Review queue — walk every "needs review" client sequentially without
  // returning to this list between each one. `reviewedIds` advances the
  // queue immediately on each save, without waiting on the refetch that
  // eventually moves that client out of the `submitted` bucket for real.
  const [queueOpen, setQueueOpen] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState('');
  const queue = rows.filter((r) => r.status === 'submitted' && !reviewedIds.has(r.client.id));
  const current = queueOpen ? queue[0] ?? null : null;
  const review = useMutation({
    mutationFn: () => reviewCheckIn(current!.client.id, current!.latest!.weekStart, feedback),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checkIns', current!.client.id] });
      void qc.invalidateQueries({ queryKey: ['coachCheckInSummaries', coachId] });
      showToast({ title: t('checkin.reviewed'), variant: 'success' });
      setReviewedIds((prev) => new Set(prev).add(current!.client.id));
      setFeedback('');
      if (queue.length <= 1) setQueueOpen(false);
    },
    onError: (e) => void alertDialog({ title: t('checkin.reviewed'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const startQueue = () => {
    setReviewedIds(new Set());
    setFeedback('');
    setQueueOpen(true);
  };

  const thisWeek = weekRange(today());
  const remind = useMutation({
    mutationFn: async () => {
      await Promise.all(missing.map((r) => requestCheckIn(coachId, r.client.id, thisWeek.weekStart, thisWeek.weekEnd)));
    },
    onSuccess: () => {
      void Promise.all(missing.map((r) => qc.invalidateQueries({ queryKey: ['checkIns', r.client.id] })));
      void qc.invalidateQueries({ queryKey: ['coachCheckInSummaries', coachId] });
      showToast({ title: t('coachDash.remindersSent', { n: missing.length }), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('coachDash.sendRemindersTitle'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const askAndRemind = async () => {
    const ok = await confirmDialog({
      title: t('coachDash.sendRemindersTitle'),
      message: t('coachDash.confirmSendReminders', { n: missing.length }),
    });
    if (ok) remind.mutate();
  };

  return (
    <div className="anim-rise" data-testid="coach-checkins-overview">
      <TopBar
        title={t('nav.coachCheckins')}
        eyebrow={t('platform.coachPortal')}
        sub={rows.length ? t('coachDash.checkinsSub', { review: needReview, requested: rows.filter((r) => r.status === 'requested').length }) : undefined}
        right={
          needReview > 0 || missing.length > 0 ? (
            <div className="flex gap-2">
              {needReview > 0 && (
                <button type="button" data-testid="start-review-queue" className="btn-primary btn-sm" onClick={startQueue}>
                  <Icon name="check" size={14} /> {t('checkin.startReview', { n: needReview })}
                </button>
              )}
              {missing.length > 0 && (
                <button type="button" className="btn-secondary btn-sm" disabled={remind.isPending} onClick={() => void askAndRemind()}>
                  <Icon name="bell" size={14} /> {t('coachDash.sendReminders', { n: missing.length })}
                </button>
              )}
            </div>
          ) : undefined
        }
      />
      {clients.isLoading ? (
        <LoadingState variant="list" count={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="user"
          title={t('coachDash.noClients')}
          message={t('coachDash.noClientsCheckinsMessage')}
          action={<button type="button" className="btn-primary btn-sm" onClick={() => navigate('/coach/clients')}>{t('coach.addClient')}</button>}
        />
      ) : (
        <div className="space-y-5">
          {([
            ['submitted', t('checkin.sectionNeedsReview'), rows.filter((r) => r.status === 'submitted')],
            ['requested', t('checkin.sectionAwaiting'), awaiting],
            ['reviewed', t('checkin.sectionReviewed'), reviewed],
            ['none', t('checkin.sectionNotRequested'), missing],
          ] as const).map(([key, label, sectionRows]) =>
            sectionRows.length === 0 ? null : (
              <section key={key}>
                <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-earth-subtle">{label} · {sectionRows.length}</h2>
                <div className="card divide-y divide-line-soft">
                  {sectionRows.map(({ client, latest, status }) => {
                    const overdue = status === 'requested' && latest && latest.weekEnd < today();
                    return (
                      <button
                        key={client.id}
                        type="button"
                        data-testid="checkins-overview-row"
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
                        {overdue && <Pill tone="bad">{t('checkin.overdue')}</Pill>}
                        <Pill tone={TONE[status]}>{t(`checkin.status.${status}`, { defaultValue: t('checkin.none') })}</Pill>
                        <Icon name="chevron" size={16} className="text-earth-subtle rtl:rotate-180" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ),
          )}
        </div>
      )}

      <Sheet open={queueOpen} onClose={() => setQueueOpen(false)} size="lg" title={current ? (current.client.displayName || current.client.email) : t('checkin.startReview', { n: needReview })}>
        {current && current.latest && (
          <div className="space-y-4" data-testid="review-queue-panel">
            <p className="text-[12px] text-earth-subtle" data-testid="review-queue-progress">
              {t('checkin.queueProgress', { n: reviewedIds.size + 1, total: reviewedIds.size + queue.length })}
            </p>
            <ClientContextPanel clientId={current.client.id} />
            <div>
              <p className="mb-1 text-[12px] uppercase tracking-wide text-earth-subtle">{shortDate(current.latest.weekStart, i18n.language)}</p>
              <CheckInSummary checkIn={current.latest} />
            </div>
            {current.previous && (
              <div className="rounded-xl border border-line-soft p-3 text-[13px]">
                <p className="mb-1 font-medium">{t('checkin.vsLastCheckin', { date: shortDate(current.previous.weekStart, i18n.language) })}</p>
                <div className="flex flex-wrap gap-4">
                  {current.latest.currentWeight != null && current.previous.currentWeight != null && (
                    <span>{t('checkin.weight')}: {current.previous.currentWeight}{t('common.kg')} → {current.latest.currentWeight}{t('common.kg')} ({current.latest.currentWeight - current.previous.currentWeight > 0 ? '+' : ''}{(current.latest.currentWeight - current.previous.currentWeight).toFixed(1)})</span>
                  )}
                  {current.latest.adherenceTraining != null && current.previous.adherenceTraining != null && (
                    <span>{t('checkin.trainingAdherence')}: {current.previous.adherenceTraining}% → {current.latest.adherenceTraining}%</span>
                  )}
                </div>
              </div>
            )}
            <TextAreaField label={t('checkin.coachFeedback')} className="min-h-24" data-testid="review-feedback" placeholder={t('checkin.coachFeedback')} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" data-testid="review-skip" onClick={() => setReviewedIds((prev) => new Set(prev).add(current.client.id))}>
                {t('checkin.skipForNow')}
              </button>
              <SubmitButton type="button" className="flex-1" data-testid="review-mark-next" pending={review.isPending} onClick={() => review.mutate()}>
                {queue.length > 1 ? t('checkin.markReviewedNext') : t('checkin.markReviewed')}
              </SubmitButton>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
