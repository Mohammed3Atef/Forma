import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { getClientCardioPlan, getClientMealPlan, getClientWorkoutPlan } from '@/services/platform/planApi';
import { workspaceBase } from '@/lib/coachWorkspace';
import { formatNumber, formatRelative } from '@/lib/format';

type Kind = 'workout' | 'nutrition' | 'cardio';
const ICON: Record<Kind, IconName> = { workout: 'dumbbell', nutrition: 'meal', cardio: 'activity' };

/**
 * Client › Plan (B3.4 / blueprint §6.3): one card per plan — training, nutrition (with its
 * targets), cardio — with what it holds, when it last changed, Edit and History. A plan that
 * failed to load is an error with Retry, never "no plan" (C1). The editors themselves are B3.5.
 */
export function WorkspacePlan() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useGuardedNav();
  const { clientId = '' } = useParams();
  const base = workspaceBase(clientId);
  const workout = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const meal = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const cardio = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });

  // A saved plan is a plan, even with no days or meals yet — its card says so ("0 training days")
  // and opens the editor; only a missing plan reads "No … plan yet" (a failed read is an error, C1).
  const card = <T extends { updatedAt?: number } | null>(kind: Kind, q: UseQueryResult<T>, body: (d: NonNullable<T>) => ReactNode) => {
    const data = q.data as NonNullable<T> | null | undefined;
    const present = !!data;
    return (
      <section className="card flex flex-col gap-3" data-testid={`plan-card-${kind}`} data-state={q.isError ? 'error' : q.isPending ? 'loading' : present ? 'ready' : 'empty'}>
        <div className="flex items-center gap-3">
          <span className="row-av h-10 w-10 shrink-0 bg-brand/15 text-brand"><Icon name={ICON[kind]} size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">{t(`coach.kind.${kind}`)}</h2>
            {present && data?.updatedAt ? <p className="text-[12px] text-earth-subtle">{t('workspace.plan.updated', { when: formatRelative(data.updatedAt, lang) })}</p> : null}
          </div>
        </div>
        {q.isError ? (
          <div className="space-y-2" role="alert">
            <p className="text-[14px] text-danger">{t('workspace.plan.loadFailed')}</p>
            <Button variant="ghost" size="sm" onClick={() => void q.refetch()}>{t('common.retry')}</Button>
          </div>
        ) : q.isPending && q.fetchStatus === 'paused' ? (
          // B3.9 (CO-18): paused offline with nothing on this device — said, not an endless skeleton.
          <p className="text-[13px] text-earth-muted" role="status" data-testid={`plan-offline-${kind}`}>{t('states.offline')}</p>
        ) : q.isPending ? (
          <div className="sk h-12 rounded-xl" aria-busy="true" />
        ) : present ? (
          <>
            <div className="text-[14px] text-earth-muted">{body(data!)}</div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon="edit" data-testid={`plan-edit-${kind}`} onClick={() => navigate(`${base}/${kind}`)}>{t('workspace.plan.edit')}</Button>
              <Button size="sm" variant="ghost" icon="rotate" data-testid={`plan-history-${kind}`} onClick={() => navigate(`${base}/${kind}?history=1`)}>{t('workspace.plan.history')}</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[14px] text-earth-muted">{t(`workspace.plan.empty.${kind}`)}</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon="plus" data-testid={`plan-build-${kind}`} onClick={() => navigate(`${base}/${kind}`)}>{t('workspace.plan.build')}</Button>
              {kind === 'workout' ? (
                <Button size="sm" variant="ghost" icon="list" data-testid="plan-from-template" onClick={() => navigate('/coach/library?tab=programs')}>{t('workspace.plan.fromTemplate')}</Button>
              ) : null}
            </div>
          </>
        )}
      </section>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="workspace-plan">
      {card(kind('workout'), workout, (d) => (
        <>
          <p className="font-medium text-earth">{d.name || t('coach.kind.workout')}</p>
          <p>{t('workspace.plan.days', { count: d.days.length })}</p>
        </>
      ))}
      {card(kind('nutrition'), meal, (d) => (
        <>
          <p className="font-medium text-earth">{d.name || t('coach.kind.nutrition')}</p>
          <p className="tabular-nums" data-testid="plan-targets">
            <bdi dir="ltr">{formatNumber(d.targets.calories, lang)} kcal · P {formatNumber(d.targets.protein, lang)} · C {formatNumber(d.targets.carbs, lang)} · F {formatNumber(d.targets.fats, lang)}</bdi>
          </p>
          <p>{t('workspace.plan.meals', { count: d.meals.length })}</p>
        </>
      ))}
      {card(kind('cardio'), cardio, (d) => (
        <>
          <p className="font-medium text-earth">{d.name || t('coach.kind.cardio')}</p>
          <p>{t('workspace.plan.sessions', { count: d.sessions.length })}</p>
        </>
      ))}
    </div>
  );
}

const kind = (k: Kind) => k;
