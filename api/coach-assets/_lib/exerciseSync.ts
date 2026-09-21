import { coachWorkoutTemplatesCol } from './db.js';
import type { CoachExerciseDoc, CoachWorkoutTemplateDoc, TemplateExercise } from './types.js';

/**
 * Fields that auto-sync from a coach's library exercise into every template
 * exercise linked to it. Mirrors `SYNCED_EXERCISE_FIELDS` in
 * `src/lib/workoutPresets.ts` — keep both in sync by hand (the `@/*` alias
 * isn't resolvable from Vercel's per-function bundler, so this can't just
 * import that one).
 */
export const SYNCED_EXERCISE_FIELDS = [
  'name',
  'notes',
  'videoUrl',
  'imageUrl',
  'images',
  'targetMuscle',
  'category',
  'equipment',
  'muscles',
  'secondaryMuscles',
  'equipmentList',
  'sourceCategory',
] as const satisfies readonly (keyof TemplateExercise)[];

export interface PropagateResult {
  status: 'success' | 'failed';
  affectedTemplates: number;
  error?: string;
}

/**
 * After a coach edits an EXISTING library exercise, push its identity/media
 * fields into every one of the coach's own templates that has an embedded
 * copy linked to it (`libraryExerciseId` match + `librarySyncEnabled` !==
 * false — a coach's manual override of a synced field on an embedded copy
 * flips that flag off, see `PlanBuilder.tsx`'s `updateExercise`). A
 * brand-new exercise (`existing` null) is a no-op: nothing can reference it
 * yet.
 *
 * Deliberately idempotent: always re-asserts the CURRENT field values rather
 * than diffing against `existing`, so a failed/retried propagation is
 * self-healing on the next save instead of being permanently missed (a
 * diff-based version would see "no change" on retry, because `existing` is
 * already the new value by then, and silently skip the fix-up forever).
 *
 * `exercises` is a map (`Record<id, TemplateExercise>`), not an array, so a
 * plain dot-notation/`$elemMatch` filter can't express "any value in this
 * object matches" — `$objectToArray` + `$filter` inside `$expr` converts it
 * to `{k,v}` pairs at query time so that predicate becomes expressible,
 * still scoped by the leading `coachId` equality (never crosses coaches).
 * One `find` narrows to affected templates, one `bulkWrite` applies the
 * writes — a single `updateMany` can't work here since each matched
 * template has different embedded-exercise keys to `$set`.
 */
export async function propagateExerciseToTemplates(doc: CoachExerciseDoc, existing: CoachExerciseDoc | null): Promise<PropagateResult> {
  if (!existing) return { status: 'success', affectedTemplates: 0 };
  try {
    const col = await coachWorkoutTemplatesCol();
    const candidates = await col
      .find({
        coachId: doc.coachId,
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $objectToArray: '$exercises' },
                  as: 'e',
                  cond: {
                    $and: [{ $eq: ['$$e.v.libraryExerciseId', doc.id] }, { $ne: ['$$e.v.librarySyncEnabled', false] }],
                  },
                },
              },
            },
            0,
          ],
        },
      } as unknown as Parameters<typeof col.find>[0])
      .toArray();

    if (!candidates.length) return { status: 'success', affectedTemplates: 0 };

    const ops = candidates.map((tpl: CoachWorkoutTemplateDoc) => {
      const set: Record<string, unknown> = { updatedAt: Date.now() };
      for (const [exId, ex] of Object.entries(tpl.exercises)) {
        if (ex.libraryExerciseId !== doc.id || ex.librarySyncEnabled === false) continue;
        for (const f of SYNCED_EXERCISE_FIELDS) set[`exercises.${exId}.${f}`] = doc[f];
      }
      return { updateOne: { filter: { _id: tpl._id }, update: { $set: set } } };
    });
    await col.bulkWrite(ops);
    return { status: 'success', affectedTemplates: candidates.length };
  } catch (err) {
    return { status: 'failed', affectedTemplates: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
