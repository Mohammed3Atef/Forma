import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AssessmentView } from '@/components/AssessmentView';
import { AssessmentWizard } from '@/pages/onboarding/AssessmentWizard';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyAssessment } from '@/services/platform/clientCoachApi';
import { assessmentStatus } from '@/lib/assessment';
import type { AssessmentStatus } from '@/types';
import { formatDate } from '@/lib/format';

const STATUS_CLASS: Record<AssessmentStatus, string> = {
  not_started: 'bg-white/[0.08] text-earth-muted',
  in_progress: 'bg-warn/15 text-warn',
  submitted: 'bg-info/15 text-info',
  reviewed: 'bg-success/15 text-success',
  updated_after_review: 'bg-warn/15 text-warn',
};

/*
 * COACH › MY ASSESSMENT (B2.6): the client's own answers, the review status,
 * and Edit (a living document — editing a reviewed assessment marks it
 * "updated after review" for the coach). Editing opens the full-screen
 * assessment wizard. The shell header carries Back (→ Check-ins) and the title.
 */
export function MyAssessment() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const uid = useSession((s) => s.uid) ?? '';
  const displayName = useSession((s) => s.account?.displayName) ?? '';
  const [editing, setEditing] = useState(false);

  const q = useQuery({ queryKey: ['assessment', uid], queryFn: () => fetchMyAssessment(uid), enabled: !!uid });
  const a = q.data ?? null;
  const status = assessmentStatus(a);

  if (editing && a) {
    return (
      <AssessmentWizard
        uid={uid}
        displayName={displayName}
        initial={a}
        onDone={() => {
          setEditing(false);
          void q.refetch();
        }}
      />
    );
  }

  if (q.isLoading) return <LoadingState variant="list" count={4} />;
  if (q.isError) return <ErrorState message={t('coachTab.assessmentFailed')} onRetry={() => void q.refetch()} testId="assessment-error" />;

  return (
    <div className="space-y-6" data-testid="client-assessment">
      <section className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-5">
        <span className={`inline-block rounded-ui-pill px-2.5 py-1 text-[12px] font-semibold ${STATUS_CLASS[status]}`} data-testid="assessment-status">
          {t(`assessment.status.${status}`)}
        </span>
        {a ? (
          <dl className="mt-3 space-y-1 text-[14px]">
            <div className="flex gap-2">
              <dt className="text-earth-muted">{t('assessment.lastUpdated')}</dt>
              <dd>{a.updatedAt ? formatDate(a.updatedAt, lang, 'medium') : '—'}</dd>
            </div>
            {(status === 'reviewed' || status === 'updated_after_review') && a.reviewedAt && (
              <div className="flex gap-2">
                <dt className="text-earth-muted">{t('assessment.reviewedOn')}</dt>
                <dd>{formatDate(a.reviewedAt, lang, 'medium')}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-3 text-[15px] text-earth-muted">{t('assessment.notCompleted')}</p>
        )}
        {a && (
          <Button icon="edit" className="mt-5 w-full" onClick={() => setEditing(true)} data-testid="assessment-edit">
            {t('assessment.editAssessment')}
          </Button>
        )}
      </section>

      {a && <AssessmentView assessment={a} />}
    </div>
  );
}
