import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { coachPlanState, getCoachPlan, trialDaysLeft } from '@/services/platform/coachPlanApi';
import type { CoachPlan } from '@/types';

type CoachPlanStateKey = 'trial' | 'active' | 'expired' | 'suspended' | 'none';

interface CoachPlanCtx {
  plan: CoachPlan | null;
  state: CoachPlanStateKey;
  daysLeft: number | null;
  /** False only when the plan has lapsed (expired/suspended) — gates write surfaces. */
  canWrite: boolean;
  loading: boolean;
}

const Ctx = createContext<CoachPlanCtx>({ plan: null, state: 'none', daysLeft: null, canWrite: true, loading: true });
export const useCoachPlan = () => useContext(Ctx);

/**
 * Loads the coach's Layer-A plan once (shared React Query) and exposes its
 * lifecycle state. `canWrite` is false only on a KNOWN lapsed state, so a coach
 * is never locked out mid-load or because they have no plan doc yet.
 */
export function CoachPlanProvider({ children }: { children: ReactNode }) {
  const coachId = useSession((s) => s.account?.id);
  const q = useQuery({ queryKey: ['coachPlan', coachId], queryFn: () => getCoachPlan(coachId!), enabled: !!coachId, staleTime: 60_000 });
  const plan = q.data ?? null;
  const state = coachPlanState(plan);
  const daysLeft = plan ? trialDaysLeft(plan) : null;
  const canWrite = !(state === 'expired' || state === 'suspended');
  return <Ctx.Provider value={{ plan, state, daysLeft, canWrite, loading: q.isLoading }}>{children}</Ctx.Provider>;
}

/**
 * Soft read-only gate for write/edit surfaces (plan editors, template builder).
 * When the coach's plan has lapsed it renders a "renew to edit" notice instead of
 * the editor; viewing/messaging routes stay open. Mirrors the client SubscriptionGate.
 */
export function CoachPlanGate({ children }: { children: ReactNode }) {
  const { canWrite, state, loading } = useCoachPlan();
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (loading || canWrite) return <>{children}</>;
  return (
    <div className="anim-rise py-12 text-center" data-testid="coach-plan-locked">
      <h1 className="h1 mb-2">{t(state === 'suspended' ? 'coachPlan.lockedSuspendedTitle' : 'coachPlan.lockedTitle')}</h1>
      <p className="mx-auto max-w-sm text-sm text-earth-muted">{t('coachPlan.lockedBody')}</p>
      <button type="button" className="btn-primary mt-5" onClick={() => navigate('/coach/plan')}>
        {t('coachPlan.viewPlan')}
      </button>
    </div>
  );
}
