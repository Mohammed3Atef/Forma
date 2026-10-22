/**
 * B3.8 (P2): the server refused a coach write because the coach's Forma plan has lapsed, was
 * suspended or does not exist (B3.8 final, B38F-R3: no plan = read-only too). Raised by the tRPC link and the media uploader for EVERY such refusal (React Query
 * mutation or not — the offline queue, broadcasts, editors), so the coach app re-reads the plan at
 * once and every write surface turns read-only, instead of each screen discovering it on its own.
 */
export type PlanLapseReason = 'SUBSCRIPTION_EXPIRED' | 'SUBSCRIPTION_SUSPENDED' | 'NO_SUBSCRIPTION';
export const PLAN_LAPSE_REASONS: ReadonlySet<string> = new Set<PlanLapseReason>(['SUBSCRIPTION_EXPIRED', 'SUBSCRIPTION_SUSPENDED', 'NO_SUBSCRIPTION']);

type Listener = (reason: PlanLapseReason) => void;
const listeners = new Set<Listener>();

export function onPlanLapsed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPlanLapsed(reason: string | undefined): void {
  if (!reason || !PLAN_LAPSE_REASONS.has(reason)) return;
  for (const l of listeners) l(reason as PlanLapseReason);
}
