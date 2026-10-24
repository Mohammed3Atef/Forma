import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { capacityOf, coachPlanState, coachPlanQuery, trialDaysLeft } from '@/services/platform/coachPlanApi';
import { onPlanLapsed } from '@/services/platform/planLapseSignal';
import { showToast } from '@/stores/toastStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { CoachPlan } from '@/types';

type CoachPlanStateKey = 'trial' | 'active' | 'expired' | 'suspended' | 'none';

interface CoachPlanCtx {
  plan: CoachPlan | null;
  state: CoachPlanStateKey;
  daysLeft: number | null;
  /** False when the plan has lapsed (expired/suspended) or is known to be missing — gates write surfaces. */
  canWrite: boolean;
  loading: boolean;
}

const Ctx = createContext<CoachPlanCtx>({ plan: null, state: 'none', daysLeft: null, canWrite: true, loading: true });
export const useCoachPlan = () => useContext(Ctx);

/** The read-only sentence for a blocked plan state (expired, suspended, or no plan). */
const readOnlyKey = (state: CoachPlanStateKey) => (state === 'suspended' ? 'coachPlan.readOnlySuspended' : state === 'none' ? 'coachPlan.readOnlyNoPlan' : 'coachPlan.readOnly');

/**
 * Loads the coach's Layer-A plan once (shared React Query) and exposes its
 * lifecycle state. `canWrite` is false only on a KNOWN state that the server refuses writes for:
 * expired, suspended, or (B3.8 final, B38F-R3) no plan at all — the server answered "no plan".
 * Never mid-load and never on a failed read: the server stays the authority either way.
 */
export function CoachPlanProvider({ children }: { children: ReactNode }) {
  const coachId = useSession((s) => s.account?.id);
  const qc = useQueryClient();
  const { t } = useTranslation();
  const q = useQuery(coachPlanQuery(coachId));
  const plan = q.data ?? null;
  const [, tick] = useState(0);
  const state = coachPlanState(plan);
  const daysLeft = plan ? trialDaysLeft(plan) : null;
  const knownNoPlan = q.isSuccess && plan === null;
  const canWrite = !(state === 'expired' || state === 'suspended' || knownNoPlan);

  // B3.8 (P2): the server refused a write because the plan lapsed (another device renewed nothing,
  // the term ran out in an open tab…) — read the plan again so every screen turns read-only now.
  const lastNotice = useRef(0);
  useEffect(
    () =>
      onPlanLapsed((reason) => {
        void qc.invalidateQueries({ queryKey: ['coachPlan', coachId] });
        if (Date.now() - lastNotice.current < 15_000) return;
        lastNotice.current = Date.now();
        showToast({ title: t(reason === 'SUBSCRIPTION_SUSPENDED' ? 'coachPlan.lapsedToastSuspended' : reason === 'NO_SUBSCRIPTION' ? 'coachPlan.lapsedToastNoPlan' : 'coachPlan.lapsedToast'), variant: 'warning' });
      }),
    [qc, coachId, t],
  );
  // The term ends while the app is open: re-render at that moment (the state folds `endsAt` in).
  const endsAt = plan?.endsAt ?? null;
  useEffect(() => {
    if (endsAt == null) return;
    const wait = endsAt - Date.now();
    if (wait <= 0 || wait > 2 ** 31 - 1) return;
    const timer = setTimeout(() => tick((n) => n + 1), wait + 50);
    return () => clearTimeout(timer);
  }, [endsAt]);
  return <Ctx.Provider value={{ plan, state, daysLeft, canWrite, loading: q.isLoading }}>{children}</Ctx.Provider>;
}

/**
 * B3.8 (P2) — one gate for every coach write control: the Forma plan (lapsed / suspended = read
 * only, as the server enforces) and the connection. `reason` is the sentence to show on a disabled
 * control (title / helper text).
 */
export function useWriteGate(): { canWrite: boolean; planBlocked: boolean; online: boolean; reason: string | undefined } {
  const { t } = useTranslation();
  const { canWrite, state } = useCoachPlan();
  const online = useOnlineStatus();
  const planBlocked = !canWrite;
  const reason = planBlocked ? t(readOnlyKey(state)) : !online ? t('offline.actionDisabled') : undefined;
  return { canWrite: canWrite && online, planBlocked, online, reason };
}

/**
 * Client capacity — ONE count on every coach surface (B3.8, owner D5; CO-32 / RM-25): the server's
 * maintained counter (`activeClientCount`), the number `reserveClientSlot` gates a new client on. A
 * disabled client still holds an active relationship, so it still counts — as it does on the server.
 * `known` is false until the plan has loaded (nothing is blocked or shown as full mid-load).
 */
export function useCoachCapacity() {
  const { plan, canWrite } = useCoachPlan();
  const cap = capacityOf(plan);
  const known = !!plan;
  // Expired, suspended or (known) no plan: the server refuses a new client for each.
  const lapsed = !canWrite;
  return {
    known,
    used: cap.used,
    limit: cap.limit,
    over: known ? cap.over : 0,
    remaining: cap.remaining,
    lapsed,
    /** Adding a client is blocked: the plan lapsed, or the count reached the limit. */
    atLimit: lapsed || (known && cap.full),
    nearLimit: known && cap.used >= Math.ceil(cap.limit * 0.8),
  };
}

/**
 * The server's client count changes whenever the roster does — an assign, a claimed invite, a release, a
 * transfer, also from another device. When the roster a screen already polls changes size, the plan (and
 * with it the count) is read again, so the count never lags the list beside it (B3.8, D5).
 */
export function useCapacityFollowsRoster(rosterSize: number | null | undefined) {
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id);
  const last = useRef(rosterSize);
  useEffect(() => {
    if (rosterSize == null) return;
    if (last.current != null && last.current !== rosterSize) void qc.invalidateQueries({ queryKey: ['coachPlan', coachId] });
    last.current = rosterSize;
  }, [rosterSize, coachId, qc]);
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
      <h1 className="h1 mb-2">{t(state === 'suspended' ? 'coachPlan.lockedSuspendedTitle' : state === 'none' ? 'coachPlan.lockedNoPlanTitle' : 'coachPlan.lockedTitle')}</h1>
      <p className="mx-auto max-w-sm text-sm text-earth-muted">{t(state === 'none' ? 'coachPlan.lockedNoPlanBody' : 'coachPlan.lockedBody')}</p>
      <button type="button" className="btn-primary mt-5" onClick={() => navigate('/coach/plan')}>
        {t('coachPlan.viewPlan')}
      </button>
    </div>
  );
}

/**
 * B3.8 (P2): the one-line read-only explanation shown where a write control would be (the message
 * composer, an empty action area): what is off, that reading is not, and the way back.
 */
export function PlanReadOnlyNotice({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { state } = useCoachPlan();
  const navigate = useNavigate();
  const renewable = state === 'expired' || state === 'trial' || state === 'active';
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${className}`} role="status" data-testid="plan-read-only">
      <p className="min-w-0 flex-1 text-[13px] text-earth-muted">{t(readOnlyKey(state))}</p>
      <button type="button" className="btn-secondary btn-sm shrink-0" data-testid="plan-read-only-renew" onClick={() => navigate('/coach/plan')}>
        {t(renewable ? 'forma.renew' : 'coachPlan.viewPlan')}
      </button>
    </div>
  );
}
