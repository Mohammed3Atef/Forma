import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { listVersions, restoreVersion } from '@/services/platform/planVersionsApi';
import { getClientCardioPlan, getClientMealPlan, getClientWorkoutPlan } from '@/services/platform/planApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { CardioPlan, MealPlan, PlanVersion, PlanVersionKind, WorkoutPlan } from '@/types';

type AnyPlan = WorkoutPlan | MealPlan | CardioPlan;
const KINDS: PlanVersionKind[] = ['workout', 'nutrition', 'cardio'];

function isKind(v: string): v is PlanVersionKind {
  return (KINDS as string[]).includes(v);
}

/** A short, kind-specific summary line for the compare view. */
function summarize(kind: PlanVersionKind, plan: AnyPlan | null | undefined, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!plan) return t('planVersions.noPlan');
  if (kind === 'workout') {
    const p = plan as WorkoutPlan;
    return `${t('coachEditor.dayCount', { n: p.days.length })} · ${t('coachEditor.exerciseCount', { n: Object.keys(p.exercises ?? {}).length })}`;
  }
  if (kind === 'nutrition') {
    const p = plan as MealPlan;
    return `${p.targets?.calories ?? 0} kcal · P${p.targets?.protein ?? 0} · ${t('planVersions.mealCount', { n: p.meals?.length ?? 0 })}`;
  }
  const p = plan as CardioPlan;
  return t('planVersions.sessionCount', { n: p.sessions?.length ?? 0 });
}

/** Coach view of a plan's version history: list, compare summary, and restore. */
export function PlanVersionHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = '', kind: kindParam = 'workout' } = useParams();
  const kind: PlanVersionKind = isKind(kindParam) ? kindParam : 'workout';

  const versions = useQuery({ queryKey: ['planVersions', clientId, kind], queryFn: () => listVersions(clientId, kind), enabled: !!clientId });
  const current = useQuery<AnyPlan | null>({
    queryKey: [kind === 'workout' ? 'clientWorkoutPlan' : kind === 'nutrition' ? 'clientMealPlan' : 'clientCardioPlan', clientId],
    queryFn: (): Promise<AnyPlan | null> =>
      kind === 'workout' ? getClientWorkoutPlan(clientId) : kind === 'nutrition' ? getClientMealPlan(clientId) : getClientCardioPlan(clientId),
    enabled: !!clientId,
  });

  const restore = useMutation({
    mutationFn: (v: PlanVersion) => restoreVersion(clientId, v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planVersions', clientId, kind] });
      void qc.invalidateQueries({ queryKey: ['clientWorkoutPlan', clientId] });
      void qc.invalidateQueries({ queryKey: ['clientMealPlan', clientId] });
      void qc.invalidateQueries({ queryKey: ['clientCardioPlan', clientId] });
    },
  });

  const doRestore = async (v: PlanVersion) => {
    if (await confirmDialog({ title: t('planVersions.restore'), message: t('planVersions.confirmRestore', { n: v.versionNumber }) })) restore.mutate(v);
  };

  return (
    <>
      <TopBar
        testId="plan-version-history"
        title={t('planVersions.title')}
        eyebrow={t(`coach.kind.${kind === 'cardio' ? 'cardio' : kind === 'nutrition' ? 'nutrition' : 'workout'}`)}
        onBack={() => navigate(`/coach/client/${clientId}`)}
      />

      <div className="card mb-4">
        <div className="stat-label mb-1">{t('planVersions.current')}</div>
        <div className="text-sm font-medium">{summarize(kind, current.data, t)}</div>
      </div>

      {versions.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : versions.data?.length ? (
        <div className="space-y-2">
          {versions.data.map((v) => (
            <div key={v.id} className="card" data-testid="version-row" data-version={v.versionNumber} data-active={v.active}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t('planVersions.version')} {v.versionNumber}</span>
                    {v.active && <span className="chip border-success/50 text-success" data-testid="version-active">{t('planVersions.active')}</span>}
                  </div>
                  <div className="truncate text-[13px] text-earth-muted">{v.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-earth-subtle">{summarize(kind, v.snapshot, t)}</div>
                  {v.reason && <div className="mt-1 text-[12px] text-earth-subtle">“{v.reason}”</div>}
                  <div className="mt-0.5 font-mono text-[10.5px] text-earth-subtle">{new Date(v.createdAt).toLocaleDateString()}</div>
                </div>
                {!v.active && (
                  <button type="button" data-testid={`version-restore-${v.versionNumber}`} className="btn-ghost h-9 shrink-0 px-3 text-xs" disabled={restore.isPending} onClick={() => void doRestore(v)}>
                    {t('planVersions.restore')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card py-10 text-center text-sm text-earth-muted">
          <Icon name="list" size={22} className="mx-auto mb-2 text-earth-subtle" />
          {t('planVersions.noVersions')}
        </div>
      )}
    </>
  );
}
