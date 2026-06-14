import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { fetchUser } from '@/services/platform/accountsApi';
import { getClientCardioPlan, getClientMealPlan, getClientWorkoutPlan } from '@/services/platform/planApi';
import { getCoachTargets } from '@/services/platform/coachApi';
import { ClientActivityView } from '@/pages/coach/ClientActivityView';

/** Read-only client detail for admins/super-admins — plans + day-by-day logs. */
export function AdminClientDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId = '' } = useParams();

  const user = useQuery({ queryKey: ['user', clientId], queryFn: () => fetchUser(clientId), enabled: !!clientId });
  const wPlan = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const mPlan = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const cPlan = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });
  const targets = useQuery({ queryKey: ['coachTargets', clientId], queryFn: () => getCoachTargets(clientId), enabled: !!clientId });

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
        <Target label={t('coach.water')} value={targets.data?.waterMl} unit="ml" />
        <Target label={t('coach.steps')} value={targets.data?.steps} />
        <Target label={t('coach.cardio')} value={targets.data?.cardioMin} unit={t('common.min')} />
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
