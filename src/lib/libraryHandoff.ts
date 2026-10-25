import { addDay, addExercises, isPlainDay, type PlanBody } from './workoutPlanModel';
import { pickFromLibrary } from './workoutPresets';
import type { Exercise } from '@/types';

/**
 * "Use in a client plan" (B3.7, blueprint §6.6; owner decisions 2026-10-20): the Library hands one
 * exercise (or food) to the client's EXISTING plan editor, which adds it to the plan as an unsaved
 * change. Nothing is written here or on arrival — the coach saves through the editor (compare-and-
 * set, drafts, conflict handling: `usePlanEditor`). The copy is made exactly as the editors' own
 * pickers make it, so a plan never gets a different shape depending on how the item was added:
 *  - an exercise: `pickFromLibrary` (a new plan id, library-linked, every field and language kept);
 *  - a food: `foodHandoff` (B4.3: its own module, so the nutrition editor loads no training code).
 */

export { ADD_EXERCISE_PARAM, ADD_FOOD_PARAM, useInPlanPath } from './handoffParams';

// ---- training ----------------------------------------------------------------------------------

/** Where an exercise can go: a plain day (no section headers) or one named section of a day. */
export interface DayTarget {
  dayId: string;
  sectionId: string;
  dayTitle: string;
  /** null on a plain day; the section's title ('' = untitled) otherwise. */
  sectionTitle: string | null;
  sectionKind: string;
  /** Exercises already there. */
  count: number;
}

export function exerciseTargets(body: PlanBody): DayTarget[] {
  return body.days.flatMap((d): DayTarget[] => {
    const sections = d.sections ?? [];
    if (sections.length === 0) return [];
    if (isPlainDay(d)) return [{ dayId: d.id, sectionId: sections[0].id, dayTitle: d.title, sectionTitle: null, sectionKind: sections[0].kind, count: sections[0].exerciseIds.length }];
    return sections.map((s) => ({ dayId: d.id, sectionId: s.id, dayTitle: d.title, sectionTitle: s.title, sectionKind: s.kind, count: s.exerciseIds.length }));
  });
}

/**
 * Adds a library-linked copy of `libEx` to the end of a day / section — or to a new day at the end
 * of the plan. Returns the new body (working shape) and where it went; the input is not changed.
 * `linked: false` (B4.3): `libEx` is already the plan's copy — a Forma exercise's snapshot.
 */
export function addLibraryExercise(
  body: PlanBody,
  target: { dayId: string; sectionId: string } | { newDayTitle: string },
  libEx: Exercise,
  linked = true,
): { body: PlanBody; dayId: string; exerciseId: string } {
  let next = body;
  let dayId: string;
  let sectionId: string;
  if ('newDayTitle' in target) {
    const added = addDay(body, target.newDayTitle);
    next = added.body;
    dayId = added.dayId;
    sectionId = next.days.find((d) => d.id === dayId)!.sections![0].id;
  } else {
    dayId = target.dayId;
    sectionId = target.sectionId;
  }
  const copy = linked ? pickFromLibrary(libEx) : libEx;
  return { body: addExercises(next, dayId, sectionId, [copy]), dayId, exerciseId: copy.id };
}
