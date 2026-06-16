import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { AssessmentView } from '@/components/AssessmentView';
import { useSession } from '@/services/auth/sessionStore';
import {
  getClientAssessment,
  markAssessmentReviewed,
  resetAssessment,
  setAssessmentCoachNotes,
} from '@/services/platform/coachApi';
import { confirmDialog } from '@/stores/dialogStore';
import { assessmentStatus } from '@/lib/assessment';
import type { AssessmentStatus } from '@/types';

const PILL: Record<AssessmentStatus, string> = {
  not_started: 'border-line text-earth-subtle',
  in_progress: 'border-warn/50 text-warn',
  submitted: 'border-brand/50 text-brand',
  reviewed: 'border-success/50 text-success',
};

/** Coach review of a client's onboarding assessment: read answers, add notes, mark reviewed / reset, build plans. */
export function CoachClientAssessment() {
  const { t } = useTranslation();
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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clientAssessment', clientId] });
  const saveNotes = useMutation({ mutationFn: () => setAssessmentCoachNotes(clientId, notes.trim()), onSuccess: invalidate });
  const review = useMutation({ mutationFn: () => markAssessmentReviewed(clientId, reviewerId), onSuccess: invalidate });
  const reopen = useMutation({ mutationFn: () => resetAssessment(clientId), onSuccess: invalidate });

  const doReset = async () => {
    if (await confirmDialog({ title: t('assessment.reset'), message: t('assessment.confirmReset'), danger: true })) reopen.mutate();
  };

  const hasData = !!q.data;
  const buildLinks: { kind: string; key: string }[] = [
    { kind: 'workout', key: 'buildWorkout' },
    { kind: 'nutrition', key: 'buildNutrition' },
    { kind: 'cardio', key: 'buildCardio' },
  ];

  return (
    <>
      <TopBar
        testId="coach-client-assessment"
        title={t('assessment.title')}
        eyebrow={t('platform.coachPortal')}
        onBack={() => navigate(`/coach/client/${clientId}`)}
        right={<span data-testid="assessment-status" className={`chip ${PILL[status]}`}>{t(`assessment.status.${status}`)}</span>}
      />

      {q.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : (
        <div className="space-y-5">
          <AssessmentView assessment={q.data ?? null} />

          {hasData && (
            <>
              {/* Coach review notes */}
              <section>
                <h2 className="h2 mb-2">{t('assessment.coachNotes')}</h2>
                <textarea
                  className="input min-h-24"
                  data-testid="assessment-coach-notes"
                  placeholder={t('assessment.coachNotesPlaceholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <button
                  type="button"
                  data-testid="assessment-save-notes"
                  className="btn-ghost mt-2 w-full disabled:opacity-40"
                  disabled={saveNotes.isPending || notes.trim() === (q.data?.coachNotes ?? '').trim()}
                  onClick={() => saveNotes.mutate()}
                >
                  {t('common.save')}
                </button>
              </section>

              {/* Review actions */}
              <div className="grid grid-cols-2 gap-2.5">
                {status === 'reviewed' ? (
                  <button type="button" data-testid="assessment-reset" className="btn-ghost" disabled={reopen.isPending} onClick={() => void doReset()}>
                    {t('assessment.reset')}
                  </button>
                ) : (
                  <button type="button" data-testid="assessment-mark-reviewed" className="btn-primary" disabled={review.isPending} onClick={() => review.mutate()}>
                    {t('assessment.markReviewed')}
                  </button>
                )}
                {status === 'reviewed' && (
                  <span className="flex items-center justify-center gap-1.5 text-sm text-success">
                    <Icon name="check" size={16} /> {t('assessment.reviewed')}
                  </span>
                )}
              </div>

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
            </>
          )}
        </div>
      )}
    </>
  );
}
