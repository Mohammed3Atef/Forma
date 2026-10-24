import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWriteGate } from '@/components/coach/CoachPlanProvider';
import { Icon } from '@/components/Icon';
import { AssessmentView } from '@/components/AssessmentView';
import { useSession } from '@/services/auth/sessionStore';
import {
  getClientAssessment,
  markAssessmentReviewed,
  resetAssessment,
  setAssessmentCoachNotes,
} from '@/services/platform/coachApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { assessmentStatus } from '@/lib/assessment';
import { Pill } from '@/components/ui/Pill';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, StaleNotice, useQueryScreen } from '@/components/ui/ScreenState';
import { ASSESSMENT_TONE as TONE } from '@/lib/statusTone';
import { errorMessage } from '@/lib/errorMessage';


/** Coach review of a client's onboarding assessment: read answers, add notes, mark reviewed / reset, build plans. */
export function CoachClientAssessment() {
  const { t } = useTranslation();
  // B3.8 (P2): notes and review are coaching writes — off with a lapsed Forma plan.
  const gate = useWriteGate();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const reviewerId = useSession((s) => s.account?.id ?? 'self');

  const q = useQuery({ queryKey: ['clientAssessment', clientId], queryFn: () => getClientAssessment(clientId), enabled: !!clientId });
  const status = assessmentStatus(q.data);

  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (q.data) setNotes(q.data.coachNotes ?? '');
  }, [q.data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['clientAssessment', clientId] });
    // The Assessments list + dashboard "pending assessments" read the summaries.
    void qc.invalidateQueries({ queryKey: ['coachDashboardSummaries'] });
  };
  const onErr = (title: string) => (e: unknown) => void alertDialog({ title, message: errorMessage(e, t) });
  const saveNotes = useMutation({ mutationFn: () => setAssessmentCoachNotes(clientId, notes.trim()), onSuccess: invalidate, onError: onErr(t('assessment.title')) });
  // B3.4 (CO-38): marking reviewed also keeps a changed private note — no separate save step to forget.
  const notesDirty = notes.trim() !== (q.data?.coachNotes ?? '').trim();
  const review = useMutation({
    mutationFn: async () => {
      if (notesDirty) await setAssessmentCoachNotes(clientId, notes.trim());
      await markAssessmentReviewed(clientId, reviewerId);
    },
    onSuccess: invalidate,
    onError: onErr(t('assessment.title')),
  });
  const reopen = useMutation({ mutationFn: () => resetAssessment(clientId), onSuccess: invalidate, onError: onErr(t('assessment.reset')) });

  const doReset = async () => {
    if (await confirmDialog({ title: t('assessment.reset'), message: t('assessment.confirmReset'), danger: true })) reopen.mutate();
  };

  const hasData = !!q.data;
  // B3.9 (CO-18): a failed or offline read is said — never shown as an empty assessment.
  const screen = useQueryScreen(q);
  const buildLinks: { kind: string; key: string }[] = [
    { kind: 'workout', key: 'buildWorkout' },
    { kind: 'nutrition', key: 'buildNutrition' },
    { kind: 'cardio', key: 'buildCardio' },
  ];

  return (
    <>
      {/* B3.9 (VS-13): inside the workspace the client's name is the page's one h1 — this is a section. */}
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3" data-testid="coach-client-assessment">
        <h2 className="text-[17px] font-semibold leading-tight">{t('assessment.title')}</h2>
        <Pill testId="assessment-status" tone={TONE[status]}>{t(`assessment.status.${status}`)}</Pill>
      </div>

      {screen.stale ? <StaleNotice online={screen.online} className="mb-2" /> : null}
      {screen.status === 'loading' ? (
        <div className="sk h-40 rounded-ui-surface" aria-busy="true" />
      ) : screen.status === 'offline' ? (
        <OfflineState onRetry={screen.retry} testId="assessment-offline" />
      ) : screen.status === 'error' ? (
        <ErrorState onRetry={screen.retry} testId="assessment-error" />
      ) : (
        // B3.4 (CO-38): on phones the review (private note + Mark reviewed) comes before the long answers;
        // on desktop it sits beside them. Building plans comes after the answers.
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6">
          <div className="order-2 min-w-0 lg:order-none lg:row-span-2">
            <AssessmentView assessment={q.data ?? null} />
          </div>

          {hasData && (
            <div className="order-1 space-y-5 lg:order-none">
              {/* Coach review notes */}
              <section>
                <h2 className="h2 mb-1">{t('trust.assessment.privateNotesTitle')}</h2>
                <p className="mb-2 text-[12px] text-earth-muted" id="assessment-notes-private-hint" data-testid="assessment-notes-private-hint">{t('trust.assessment.privateNotesHint')}</p>
                <textarea
                  className="input min-h-24"
                  data-testid="assessment-coach-notes"
                  aria-label={t('trust.assessment.privateNotesTitle')}
                  aria-describedby="assessment-notes-private-hint"
                  placeholder={t('assessment.coachNotesPlaceholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <button
                  type="button"
                  data-testid="assessment-save-notes"
                  className="btn-ghost mt-2 w-full disabled:opacity-40"
                  disabled={saveNotes.isPending || !notesDirty || !gate.canWrite}
                  title={gate.reason}
                  onClick={() => saveNotes.mutate()}
                >
                  {t('common.save')}
                </button>
              </section>

              {/* Review actions */}
              <div className="grid grid-cols-2 gap-2.5">
                {status === 'reviewed' ? (
                  <button type="button" data-testid="assessment-reset" className="btn-ghost disabled:opacity-40" disabled={reopen.isPending || !gate.canWrite} title={gate.reason} onClick={() => void doReset()}>
                    {t('assessment.reset')}
                  </button>
                ) : status === 'submitted' || status === 'updated_after_review' ? (
                  <button type="button" data-testid="assessment-mark-reviewed" className="btn-primary disabled:opacity-40" disabled={review.isPending || !gate.canWrite} title={gate.reason} onClick={() => review.mutate()}>
                    {t('assessment.markReviewed')}
                  </button>
                ) : (
                  // B3.9 (B3-S09): a draft, or no assessment, cannot be reviewed — the server refuses it too.
                  <p className="col-span-2 text-[13px] text-earth-muted" data-testid="assessment-not-submitted">{t('assessment.notSubmittedYet')}</p>
                )}
                {status === 'reviewed' && (
                  <span className="flex items-center justify-center gap-1.5 text-sm text-success">
                    <Icon name="check" size={16} /> {t('assessment.reviewed')}
                  </span>
                )}
              </div>
            </div>
          )}

          {hasData && (
            <div className="order-3 lg:order-none">
              {/* Build plans from the assessment */}
              <section>
                <h2 className="h2 mb-2">{t('assessment.buildPlan')}</h2>
                <div className="card divide-y divide-line-soft">
                  {buildLinks.map((b) => (
                    <button
                      key={b.kind}
                      type="button"
                      data-testid={`assessment-build-${b.kind}`}
                      className="row w-full text-start"
                      onClick={() => navigate(`/coach/client/${clientId}/${b.kind}`)}
                    >
                      <span className="row-av bg-brand/15 text-brand">
                        <Icon name={b.kind === 'workout' ? 'dumbbell' : b.kind === 'nutrition' ? 'meal' : 'activity'} size={18} />
                      </span>
                      <span className="min-w-0 flex-1 font-medium">{t(`assessment.${b.key}`)}</span>
                      <Icon name="chevron" size={18} />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </>
  );
}
