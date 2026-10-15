/**
 * "Your coach updated your plan" (B2 / D11), grounded in real data: the
 * mirrored plan's `updatedAt` is newer than the version this client last
 * opened on this device. The first plan ever seen counts as seen (no false
 * alarm on first run). Per user, per plan kind; storage failures fail quiet.
 */
export type PlanKind = 'workout' | 'nutrition';

const key = (uid: string, kind: PlanKind) => `forma.planSeen.v1.${uid}.${kind}`;

function read(uid: string, kind: PlanKind): number | null {
  try {
    const v = localStorage.getItem(key(uid, kind));
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

/** Record that this client has now seen the plan as of `updatedAt`. */
export function markPlanSeen(uid: string, kind: PlanKind, updatedAt: number | undefined): void {
  if (!uid || !updatedAt) return;
  try {
    const prev = read(uid, kind);
    if (prev == null || updatedAt > prev) localStorage.setItem(key(uid, kind), String(updatedAt));
  } catch {
    /* storage unavailable */
  }
}

/** True when the plan changed since the client last opened it here. */
export function isPlanUpdated(uid: string, kind: PlanKind, updatedAt: number | undefined): boolean {
  if (!uid || !updatedAt) return false;
  const prev = read(uid, kind);
  if (prev == null || Number.isNaN(prev)) {
    markPlanSeen(uid, kind, updatedAt);
    return false;
  }
  return updatedAt > prev;
}
