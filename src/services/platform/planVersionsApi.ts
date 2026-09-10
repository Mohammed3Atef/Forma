import { apiGet, apiPost } from '@/services/platformApi';
import type { CardioPlan, MealPlan, PlanVersion, PlanVersionKind, WorkoutPlan } from '@/types';

/**
 * Plan version history over the Mongo-backed `/api/client/plan-versions`
 * route (port of `clientData/{clientId}/planVersions/{versionId}`). Coach-
 * owned (client read-only). The assigned singleton `plan/{kind}` doc always
 * mirrors the `active` version's snapshot — the backend handles that mirror
 * write itself on both save and restore, so this file no longer needs to.
 */

type AnyPlan = WorkoutPlan | MealPlan | CardioPlan;

/** Builds a `?a=1&b=2` query string, skipping undefined values. */
function qs(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, String(v));
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** Mongo docs come back as `{_id, clientId, ...}`; the frontend type wants `{id, ...}` (no clientId). */
function toVersion(doc: Record<string, unknown>): PlanVersion {
  const { _id, clientId: _clientId, ...rest } = doc;
  return { ...rest, id: _id as string } as unknown as PlanVersion;
}

export async function listVersions(clientId: string, kind: PlanVersionKind): Promise<PlanVersion[]> {
  const list = await apiGet<Record<string, unknown>[]>(`/client/plan-versions${qs({ clientId, kind })}`);
  return list.map(toVersion);
}

/**
 * Snapshot the current plan as a new active version (deactivating the previous
 * active one) and mirror it into the assigned `plan/{kind}` doc — both done
 * server-side.
 */
export async function saveAsNewVersion(
  clientId: string,
  kind: PlanVersionKind,
  plan: AnyPlan,
  createdBy: string,
  reason?: string,
): Promise<PlanVersion> {
  const doc = await apiPost<Record<string, unknown>>(`/client/plan-versions${qs({ action: 'save', clientId })}`, {
    clientId,
    kind,
    plan,
    reason,
    createdBy,
  });
  return toVersion(doc);
}

/** Make an older version active again and restore it into the assigned plan — both done server-side. */
export async function restoreVersion(clientId: string, version: PlanVersion): Promise<void> {
  await apiPost(`/client/plan-versions${qs({ action: 'restore', clientId })}`, { clientId, versionId: version.id });
}
