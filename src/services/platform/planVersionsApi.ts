import { trpc } from '@/services/trpc';
import type { PlanVersion, PlanVersionKind } from '@/types';

/**
 * Plan version history over the tRPC `planVersions.*` procedures (port of
 * `clientData/{clientId}/planVersions/{versionId}`, then the Mongo-backed
 * `/api/client/plan-versions` REST route). Coach-owned (client read-only).
 * The assigned singleton `plan/{kind}` doc always mirrors the `active`
 * version's snapshot — the backend handles that mirror write itself on both
 * save and restore, so this file no longer needs to.
 */

/** Mongo docs come back as `{_id, clientId, ...}`; the frontend type wants `{id, ...}` (no clientId). */
function toVersion(doc: Record<string, unknown>): PlanVersion {
  const { _id, clientId: _clientId, ...rest } = doc;
  return { ...rest, id: _id as string } as unknown as PlanVersion;
}

export async function listVersions(clientId: string, kind: PlanVersionKind): Promise<PlanVersion[]> {
  const list = await trpc.planVersions.list.query({ clientId, kind });
  return list.map((d) => toVersion(d));
}

/** Make an older version active again and restore it into the assigned plan — both done server-side. */
export async function restoreVersion(clientId: string, version: PlanVersion): Promise<void> {
  await trpc.planVersions.restore.mutate({ clientId, versionId: version.id });
}
