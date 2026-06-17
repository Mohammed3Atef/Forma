import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { fetchUser } from '@/services/platform/accountsApi';
import { getClientCardioPlan, getClientMealPlan, getClientWorkoutPlan } from '@/services/platform/planApi';
import { getClientAssessment } from '@/services/platform/coachApi';
import { ClientActivityView } from '@/pages/coach/ClientActivityView';
import { AssessmentView } from '@/components/AssessmentView';

/** Read-only client detail for admins/super-admins — plans + day-by-day logs. */
export function AdminClientDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId = '' } = useParams();

  const user = useQuery({ queryKey: ['user', clientId], queryFn: () => fetchUser(clientId), enabled: !!clientId });
  const wPlan = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const mPlan = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const cPlan = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });
  const assessment = useQuery({ queryKey: ['clientAssessment', clientId], queryFn: () => getClientAssessment(clientId), enabled: !!clientId });

  const name = user.data?.displayName || user.data?.email || t('coach.client');
  const planRow = (label: string, assigned: boolean, detail: string) => (
    <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
      <span className="text-sm font-medium">{label}</span>
      <span className="font-mono text-[11px] text-earth-subtle">{assigned ? detail : t('coach.noPlanAssigned')}</span>
    </div>
  );

  return (
    <>
      <TopBar title={name} eyebrow={t('admin.clientDetail')} onBack={() => navigate('/admin/accounts')} />

      {/* Plan summary (read-only) */}
      <h2 className="h2 mb-2">{t('coach.plans')}</h2>
      <div className="card mb-2 divide-y divide-line-soft">
        {planRow(t('coach.kind.workout'), !!wPlan.data, wPlan.data?.name || t('coach.planEdit'))}
        {planRow(t('coach.kind.nutrition'), !!mPlan.data, mPlan.data?.name || t('coach.planEdit'))}
        {planRow(t('coach.kind.cardio'), !!cPlan.data, t('coach.sessionsCount', { n: cPlan.data?.sessions.length ?? 0 }))}
      </div>
      <div className="card mb-6 grid grid-cols-3 gap-3 text-center">
        <Target label={t('nutrition.calories')} value={mPlan.data?.targets.calories} />
        <Target label={t('nutrition.protein')} value={mPlan.data?.targets.protein} unit="g" />
        <Target label={t('coach.water')} value={mPlan.data?.waterTargetMl} unit="ml" />
      </div>

      <h2 className="h2 mb-2">{t('assessment.title')}</h2>
      <div className="mb-6">
        <AssessmentView assessment={assessment.data ?? null} />
      </div>

      <h2 className="h2 mb-2">{t('activity.title')}</h2>
      <ClientActivityView clientId={clientId} />
    </>
  );
}

function Target({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  return (
    <div>
      <div className="stat-num text-2xl">
        {value ?? '—'}
        {value != null && unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
