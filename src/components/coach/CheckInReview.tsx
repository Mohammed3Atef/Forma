import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckInSummary } from '@/components/CheckInSummary';
import { ClientContextPanel } from '@/components/coach/ClientContextPanel';
import { TextAreaField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { reviewCheckIn } from '@/services/platform/checkInApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { shortDate } from '@/lib/utils';
import type { WeeklyCheckIn } from '@/types';

/** "vs last check-in": weight and training adherence, only when both weeks have them. */
export function CheckInComparison({ latest, previous }: { latest: WeeklyCheckIn; previous: WeeklyCheckIn | null | undefined }) {
  const { t, i18n } = useTranslation();
  if (!previous) return null;
  const w = latest.currentWeight != null && previous.currentWeight != null ? latest.currentWeight - previous.currentWeight : null;
  const a = latest.adherenceTraining != null && previous.adherenceTraining != null;
  if (w === null && !a) return null;
  return (
    <div className="rounded-xl border border-line-soft p-3 text-[13px]" data-testid="checkin-comparison">
      <p className="mb-1 font-medium">{t('checkin.vsLastCheckin', { date: shortDate(previous.weekStart, i18n.language) })}</p>
      <div className="flex flex-wrap gap-4">
        {w !== null && (
          <span>
            {t('checkin.weight')}: {previous.currentWeight}
            {t('common.kg')} → {latest.currentWeight}
            {t('common.kg')} <span dir="ltr">({w > 0 ? '+' : ''}{w.toFixed(1)})</span>
          </span>
        )}
        {a && (
          <span>
            {t('checkin.trainingAdherence')}: {previous.adherenceTraining}% → {latest.adherenceTraining}%
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Review one submitted check-in in place (B3.2): the client's context, the
 * check-in, the change since the previous one, and feedback the client will
 * see. Shared by Today (sheet on phones, side panel on desktop) and the
 * check-ins review queue. Marking reviewed with empty feedback asks first
 * (CO-13). The server resolves the coach's `checkin_submitted` task.
 */
export function CheckInReviewForm({
  clientId,
  coachId,
  checkIn,
  previous,
  onReviewed,
  onSkip,
  primaryLabel,
  showContext = true,
}: {
  clientId: string;
  coachId: string;
  checkIn: WeeklyCheckIn;
  previous?: WeeklyCheckIn | null;
  onReviewed: () => void;
  onSkip?: () => void;
  primaryLabel?: string;
  showContext?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState(checkIn.coachFeedback ?? '');

  const review = useMutation({
    mutationFn: () => reviewCheckIn(clientId, checkIn.weekStart, feedback.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checkIns', clientId] });
      void qc.invalidateQueries({ queryKey: ['coachCheckInSummaries', coachId] });
      void qc.invalidateQueries({ queryKey: ['coachDashboard'] });
      void qc.invalidateQueries({ queryKey: ['coachDashboardSummaries'] });
      showToast({ title: t('checkin.reviewed'), variant: 'success' });
      onReviewed();
    },
    onError: (e) => void alertDialog({ title: t('checkin.reviewed'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });

  const submit = async () => {
    if (!feedback.trim()) {
      const ok = await confirmDialog({ title: t('checkin.noFeedbackTitle'), message: t('checkin.noFeedbackMessage'), confirmLabel: t('checkin.markReviewed') });
      if (!ok) return;
    }
    review.mutate();
  };

  return (
    <div className="space-y-4" data-testid="checkin-review">
      {showContext ? <ClientContextPanel clientId={clientId} /> : null}
      <div>
        <p className="mb-1 text-[12px] uppercase tracking-wide text-earth-subtle">{shortDate(checkIn.weekStart, i18n.language)}</p>
        <CheckInSummary checkIn={checkIn} />
      </div>
      <CheckInComparison latest={checkIn} previous={previous} />
      <div>
        <TextAreaField
          label={t('checkin.coachFeedback')}
          className="min-h-24"
          data-testid="review-feedback"
          placeholder={t('checkin.coachFeedback')}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <p className="mt-1 text-[12px] text-earth-muted">{t('trust.checkin.feedbackVisible')}</p>
      </div>
      <div className="flex gap-2">
        {onSkip ? (
          <button type="button" className="btn-ghost flex-1" data-testid="review-skip" onClick={onSkip}>
            {t('checkin.skipForNow')}
          </button>
        ) : null}
        <SubmitButton type="button" className="flex-1" data-testid="review-mark-next" pending={review.isPending} onClick={() => void submit()}>
          {primaryLabel ?? t('checkin.markReviewed')}
        </SubmitButton>
      </div>
    </div>
  );
}
