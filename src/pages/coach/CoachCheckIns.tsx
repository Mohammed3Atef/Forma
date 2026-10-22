import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWriteGate } from '@/components/coach/CoachPlanProvider';
import { Icon } from '@/components/Icon';
import { CheckInSummary } from '@/components/CheckInSummary';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, StaleNotice, useQueryScreen } from '@/components/ui/ScreenState';
import { useSession } from '@/services/auth/sessionStore';
import { listCheckIns, requestCheckIn, reviewCheckIn, writeReviewToCache } from '@/services/platform/checkInApi';
import { alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { shortDate, today, weekRange } from '@/lib/utils';
import { Pill } from '@/components/ui/Pill';
import type { WeeklyCheckIn } from '@/types';
import { CHECKIN_TONE as TONE } from '@/lib/statusTone';
import { errorMessage } from '@/lib/errorMessage';


/** Coach weekly check-ins for one client: request, review (feedback + mark reviewed), history. */
export function CoachCheckIns() {
  const { t, i18n } = useTranslation();
  // B3.8 (P2): requests and reviews are coaching writes — off with a lapsed Forma plan.
  const gate = useWriteGate();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id) ?? '';

  const list = useQuery({ queryKey: ['checkIns', clientId], queryFn: () => listCheckIns(clientId), enabled: !!clientId });
  const checkIns = list.data ?? [];
  // B3.9 (CO-18): offline and failed reads are said — never a false "no check-ins".
  const listScreen = useQueryScreen(list);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['checkIns', clientId] });
    void qc.invalidateQueries({ queryKey: ['coachCheckInSummaries', coachId] });
    // Dashboard "to review" / needs-attention counters read these.
    void qc.invalidateQueries({ queryKey: ['coachDashboardSummaries'] });
  };
  const thisWeek = weekRange(today());
  const weekExists = checkIns.some((c) => c.weekStart === thisWeek.weekStart);

  const request = useMutation({
    mutationFn: () => requestCheckIn(coachId, clientId, thisWeek.weekStart, thisWeek.weekEnd),
    onSuccess: () => {
      invalidate();
      showToast({ title: t('workspace.summary.checkinRequested'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('checkin.request'), message: errorMessage(e, t) }),
  });

  return (
    <>
      {/* B3.9 (VS-13): inside the workspace the client's name is the page's one h1 — this is a section. */}
      {/* B3.9 (CO-13): the check-ins to review lead; requesting this week's is the section's secondary action. */}
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-3" data-testid="coach-checkins">
        <h2 className="text-[17px] font-semibold leading-tight">{t('checkin.title')}</h2>
        <button
          type="button"
          data-testid="checkin-request"
          className="btn-secondary btn-sm disabled:opacity-40"
          disabled={request.isPending || weekExists || !gate.canWrite}
          title={gate.reason}
          onClick={() => request.mutate()}
        >
          <Icon name={weekExists ? 'check' : 'plus'} size={14} /> {weekExists ? t('checkin.requestedThisWeek') : t('checkin.request')}
        </button>
      </div>

      <div className="space-y-2">
        {listScreen.stale ? <StaleNotice online={listScreen.online} /> : null}
        {listScreen.status === 'loading' ? (
          <LoadingState variant="list" count={3} />
        ) : listScreen.status === 'offline' ? (
          <OfflineState onRetry={listScreen.retry} testId="checkins-offline" />
        ) : listScreen.status === 'error' ? (
          <ErrorState onRetry={listScreen.retry} testId="checkins-error" />
        ) : checkIns.length === 0 ? (
          <EmptyState icon="calendar" title={t('checkin.noCheckins')} message={t('checkin.noCheckinsCoachMessage')} />
        ) : (
          checkIns.map((c) => (
            <CheckInRow key={c.id} checkIn={c} onReviewed={(fb) => writeReviewToCache(qc, clientId, coachId, c.id, fb)} locale={i18n.language} />
          ))
        )}
      </div>
    </>
  );
}

function CheckInRow({ checkIn, onReviewed, locale }: { checkIn: WeeklyCheckIn; onReviewed: (feedback: string) => void; locale: string }) {
  const { t } = useTranslation();
  const gate = useWriteGate();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(checkIn.coachFeedback ?? '');
  const review = useMutation({
    mutationFn: () => reviewCheckIn(checkIn.clientId, checkIn.id, feedback),
    onSuccess: () => {
      setOpen(false);
      onReviewed(feedback); // B3.9 (PF-12): the list is updated in place, not refetched
      showToast({ title: t('checkin.reviewed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('checkin.markReviewed'), message: errorMessage(e, t) }),
  });

  return (
    <div className="card" data-testid="checkin-row">
      <button type="button" className="flex w-full items-center gap-3 text-start" onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{shortDate(checkIn.weekStart, locale)} – {shortDate(checkIn.weekEnd, locale)}</span>
          {checkIn.currentWeight != null && <span className="block font-mono text-[12px] text-earth-subtle">{checkIn.currentWeight} {t('common.kg')}</span>}
        </span>
        <Pill tone={TONE[checkIn.status]}>{t(`checkin.status.${checkIn.status}`)}</Pill>
        <Icon name={open ? 'chevronDown' : 'chevron'} size={16} className="text-earth-subtle" />
      </button>

      {open && checkIn.status === 'requested' && (
        <p className="mt-3 text-sm text-earth-muted">{t('checkin.awaitingClient')}</p>
      )}

      {open && checkIn.status !== 'requested' && (
        <div className="mt-3 space-y-3 border-t border-line-soft pt-3">
          <CheckInSummary checkIn={checkIn} />
          {checkIn.status === 'reviewed' ? (
            <div>
              <p className="label">{t('checkin.coachFeedback')}</p>
              <p className="whitespace-pre-wrap text-sm" dir="auto">{checkIn.coachFeedback || '—'}</p>
            </div>
          ) : (
            <>
              <textarea
                className="input min-h-20"
                data-testid="checkin-feedback"
                aria-label={t('checkin.coachFeedback')}
                placeholder={t('checkin.coachFeedback')}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <p className="-mt-1 text-[12px] text-earth-muted">{t('trust.checkin.feedbackVisible')}</p>
              <button type="button" data-testid="checkin-mark-reviewed" className="btn-primary w-full disabled:opacity-40" disabled={review.isPending || !gate.canWrite} title={gate.reason} onClick={() => review.mutate()}>
                {t('checkin.markReviewed')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
