import { trpc } from '@/services/trpc';

/**
 * A coach's daily targets for a client (B3.5, owner decision O-11): steps and cardio minutes —
 * clients already see them (`clientSync`), coaches set them in the cardio editor.
 *
 * Owner review (B35-R2): writes go through `coachTargets.update`, a per-field compare-and-set on
 * the server — the changed fields plus the values they were edited from. A stale editor gets
 * `CONFLICT` (`TARGETS_CONFLICT`) instead of overwriting a newer save; fields not sent (water,
 * calories, protein) are kept and never conflict.
 */
const FIELDS = ['waterMl', 'steps', 'cardioMin', 'calories', 'protein'] as const;
type Field = (typeof FIELDS)[number];
export type ClientTargets = Partial<Record<Field, number>> & { updatedAt?: number };
export type TargetsPatch = Partial<Record<Field, number | null>>;

function toTargets(doc: Record<string, unknown> | null | undefined): ClientTargets | null {
  if (!doc) return null;
  const out: ClientTargets = { updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : undefined };
  for (const k of FIELDS) if (typeof doc[k] === 'number') out[k] = doc[k] as number;
  return out;
}

export async function getClientTargets(clientId: string): Promise<ClientTargets | null> {
  return toTargets(await trpc.coachTargets.get.query({ clientId }));
}

/** `patch`: new values (`null` clears); `expected`: each patched field's value the edit started from (`null` = not set). */
export async function updateClientTargets(clientId: string, patch: TargetsPatch, expected: TargetsPatch): Promise<ClientTargets> {
  return toTargets(await trpc.coachTargets.update.mutate({ clientId, patch, expected }))!;
}

export function isTargetsConflict(e: unknown): boolean {
  const data = (e as { data?: { code?: string; reason?: string } } | null)?.data;
  return data?.reason === 'TARGETS_CONFLICT' || (data?.code === 'CONFLICT' && /TARGETS_CONFLICT/.test(String((e as Error)?.message ?? '')));
}
