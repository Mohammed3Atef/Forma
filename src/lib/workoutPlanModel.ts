import { uid } from './utils';
import { move } from './listOps';
import { copyExercise, SECTION_KINDS } from './workoutPresets';
import type { Exercise, SectionKind, WorkoutDay, WorkoutSection } from '@/types';

export { move };

/**
 * The training editor's working shape vs the stored shape (B3.5; B34-R1, O-8 — sections stay in
 * the data model, no migration).
 *
 * Stored days come in three shapes: named `sections` (the B1 builder), flat `exerciseIds` with no
 * `sections` key (seeded / imported / older plans), or `sections: []`. The editor always works on
 * sections: a day without any gets ONE implicit section — a deterministic id that encodes the
 * stored shape, no title — holding its `exerciseIds`. On save, a day whose only section is still
 * that untouched implicit section is written back in exactly the shape it came in.
 *
 * So opening an older plan changes nothing (it is not "unsaved"), and saving it without touching its
 * structure writes the same shape. Nothing here is persisted until the coach saves.
 *
 * Invariant for every edit: `day.exerciseIds` = the day's sections flattened (the client's tracker,
 * session engine and anchored notes read `exerciseIds`). Days, sections and exercises keep their ids
 * (client logs and notes are keyed on them).
 */

export interface PlanBody {
  days: WorkoutDay[];
  exercises: Record<string, Exercise>;
}

const IMPLICIT_NONE = '~none'; // stored without a `sections` key
const IMPLICIT_EMPTY = '~empty'; // stored as `sections: []`

export function isImplicitSection(day: Pick<WorkoutDay, 'id'>, s: Pick<WorkoutSection, 'id'>): boolean {
  return s.id === `${day.id}${IMPLICIT_NONE}` || s.id === `${day.id}${IMPLICIT_EMPTY}`;
}

/** The day still has only its implicit, untitled section — shown without a section header. */
export function isPlainDay(day: WorkoutDay): boolean {
  const s = day.sections ?? [];
  return s.length === 1 && isImplicitSection(day, s[0]) && !s[0].title && s[0].kind === 'normal';
}

export function normalizeDay(d: WorkoutDay): WorkoutDay {
  if (d.sections && d.sections.length > 0) {
    // Malformed stored data never breaks the editor: a section without its list reads as empty.
    return d.sections.every((s) => Array.isArray(s.exerciseIds)) ? d : { ...d, sections: d.sections.map((s) => (Array.isArray(s.exerciseIds) ? s : { ...s, exerciseIds: [] })) };
  }
  const shape = d.sections ? IMPLICIT_EMPTY : IMPLICIT_NONE;
  return { ...d, sections: [{ id: `${d.id}${shape}`, title: '', kind: 'normal', exerciseIds: [...(d.exerciseIds ?? [])] }] };
}

export function serializeDay(d: WorkoutDay): WorkoutDay {
  const sections = d.sections ?? [];
  if (sections.length === 1 && isPlainDay(d)) {
    const { sections: _s, ...rest } = d;
    const ids = sections[0].exerciseIds;
    return sections[0].id.endsWith(IMPLICIT_EMPTY) ? { ...rest, exerciseIds: ids, sections: [] } : { ...rest, exerciseIds: ids };
  }
  return d;
}

/** Working shape for the editor (idempotent; returns the same object when nothing needs it). */
export function normalizeWorkoutBody<T extends PlanBody>(p: T): T {
  const days = Array.isArray(p.days) ? p.days : [];
  const exercises = p.exercises && typeof p.exercises === 'object' ? p.exercises : {};
  const ready = days.every((d) => d.sections && d.sections.length > 0 && d.sections.every((s) => Array.isArray(s.exerciseIds)));
  if (ready && days === p.days && exercises === p.exercises) return p;
  return { ...p, days: days.map(normalizeDay), exercises };
}

/** Stored shape (inverse of `normalizeWorkoutBody` for every untouched day). */
export function serializeWorkoutBody<T extends PlanBody>(p: T): T {
  return { ...p, days: p.days.map(serializeDay) };
}

/** A kind the editor knows (stored data may carry others — e.g. `main` — shown as "Workout", never rewritten). */
export function knownKind(kind: string): SectionKind {
  return (SECTION_KINDS as string[]).includes(kind) ? (kind as SectionKind) : 'normal';
}

// ---------------------------------------------------------------------------
// Pure edits. Each returns a new body; untouched days keep their identity.

const synced = (d: WorkoutDay): WorkoutDay => ({ ...d, exerciseIds: (d.sections ?? []).flatMap((s) => s.exerciseIds) });
const reindex = (days: WorkoutDay[]): WorkoutDay[] => days.map((d, i) => (d.dayIndex === i ? d : { ...d, dayIndex: i }));
function mapDay(p: PlanBody, dayId: string, fn: (d: WorkoutDay) => WorkoutDay): PlanBody {
  return { ...p, days: p.days.map((d) => (d.id === dayId ? synced(fn(d)) : d)) };
}
function mapSections(p: PlanBody, dayId: string, fn: (s: WorkoutSection[], d: WorkoutDay) => WorkoutSection[]): PlanBody {
  return mapDay(p, dayId, (d) => ({ ...d, sections: fn(d.sections ?? [], d) }));
}
function dropExercises(exercises: Record<string, Exercise>, ids: string[]): Record<string, Exercise> {
  if (!ids.length) return exercises;
  const next = { ...exercises };
  for (const id of ids) delete next[id];
  return next;
}

/** A new day: plain (one implicit section), stored flat like any older day until it gets named sections. */
export function addDay(p: PlanBody, title: string): { body: PlanBody; dayId: string } {
  const id = uid('day');
  const day: WorkoutDay = { id, dayIndex: p.days.length, title, focus: '', exerciseIds: [], sections: [{ id: `${id}${IMPLICIT_NONE}`, title: '', kind: 'normal', exerciseIds: [] }] };
  return { body: { ...p, days: [...p.days, day] }, dayId: id };
}

export function patchDay(p: PlanBody, dayId: string, patch: Partial<Pick<WorkoutDay, 'title' | 'focus'>>): PlanBody {
  return { ...p, days: p.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) };
}

export function removeDay(p: PlanBody, dayId: string): PlanBody {
  const day = p.days.find((d) => d.id === dayId);
  if (!day) return p;
  return { days: reindex(p.days.filter((d) => d.id !== dayId)), exercises: dropExercises(p.exercises, (day.sections ?? []).flatMap((s) => s.exerciseIds)) };
}

export function moveDay(p: PlanBody, dayId: string, dir: -1 | 1): PlanBody {
  const i = p.days.findIndex((d) => d.id === dayId);
  return { ...p, days: reindex(move(p.days, i, dir)) };
}

/** Copy of a day right after it: new ids for the day, its sections and its exercises. */
export function duplicateDay(p: PlanBody, dayId: string, title: string): { body: PlanBody; dayId: string } {
  const i = p.days.findIndex((d) => d.id === dayId);
  if (i < 0) return { body: p, dayId };
  const src = p.days[i];
  const exercises = { ...p.exercises };
  const newId = uid('day');
  const sections = (src.sections ?? []).map((s) => {
    const exerciseIds = s.exerciseIds.flatMap((id) => {
      const ex = p.exercises[id];
      if (!ex) return [];
      const c = copyExercise(ex);
      exercises[c.id] = c;
      return [c.id];
    });
    return { ...s, id: isImplicitSection(src, s) ? s.id.replace(src.id, newId) : uid('sec'), exerciseIds };
  });
  const copy = synced({ ...src, id: newId, title, sections });
  const days = [...p.days];
  days.splice(i + 1, 0, copy);
  return { body: { days: reindex(days), exercises }, dayId: newId };
}

/**
 * A named section. On a plain day with no exercises the implicit section becomes it (one group,
 * nothing empty left behind); with exercises the implicit section stays as the first group.
 */
export function addSection(p: PlanBody, dayId: string, kind: SectionKind = 'normal'): { body: PlanBody; sectionId: string } {
  const id = uid('sec');
  const body = mapSections(p, dayId, (s, d) => {
    const fresh: WorkoutSection = { id, title: '', kind, exerciseIds: [] };
    if (isPlainDay(d) && s[0].exerciseIds.length === 0) return [fresh];
    return [...s, fresh];
  });
  return { body, sectionId: id };
}

export function patchSection(p: PlanBody, dayId: string, sectionId: string, patch: Partial<Pick<WorkoutSection, 'title' | 'kind'>>): PlanBody {
  return mapSections(p, dayId, (s) => s.map((x) => (x.id === sectionId ? { ...x, ...patch } : x)));
}

/** Removes a section and its exercises. The last section of a day leaves an empty plain day. */
export function removeSection(p: PlanBody, dayId: string, sectionId: string): PlanBody {
  const day = p.days.find((d) => d.id === dayId);
  const sec = day?.sections?.find((s) => s.id === sectionId);
  if (!day || !sec) return p;
  const next = mapSections(p, dayId, (s, d) => {
    const rest = s.filter((x) => x.id !== sectionId);
    return rest.length ? rest : [{ id: `${d.id}${IMPLICIT_NONE}`, title: '', kind: 'normal', exerciseIds: [] }];
  });
  return { ...next, exercises: dropExercises(p.exercises, sec.exerciseIds) };
}

export function moveSection(p: PlanBody, dayId: string, sectionId: string, dir: -1 | 1): PlanBody {
  return mapSections(p, dayId, (s) => move(s, s.findIndex((x) => x.id === sectionId), dir));
}

export function addExercises(p: PlanBody, dayId: string, sectionId: string, exs: Exercise[]): PlanBody {
  if (!exs.length) return p;
  const exercises = { ...p.exercises };
  for (const ex of exs) exercises[ex.id] = ex;
  return { ...mapSections(p, dayId, (s) => s.map((x) => (x.id === sectionId ? { ...x, exerciseIds: [...x.exerciseIds, ...exs.map((e) => e.id)] } : x))), exercises };
}

export function updateExercise(p: PlanBody, ex: Exercise): PlanBody {
  return { ...p, exercises: { ...p.exercises, [ex.id]: ex } };
}

export function removeExercise(p: PlanBody, dayId: string, exId: string): PlanBody {
  const next = mapSections(p, dayId, (s) => s.map((x) => (x.exerciseIds.includes(exId) ? { ...x, exerciseIds: x.exerciseIds.filter((id) => id !== exId) } : x)));
  return { ...next, exercises: dropExercises(p.exercises, [exId]) };
}

export function duplicateExercise(p: PlanBody, dayId: string, exId: string): PlanBody {
  const ex = p.exercises[exId];
  if (!ex) return p;
  const c = copyExercise(ex);
  const next = mapSections(p, dayId, (s) =>
    s.map((x) => {
      const i = x.exerciseIds.indexOf(exId);
      if (i < 0) return x;
      const ids = [...x.exerciseIds];
      ids.splice(i + 1, 0, c.id);
      return { ...x, exerciseIds: ids };
    }),
  );
  return { ...next, exercises: { ...p.exercises, [c.id]: c } };
}

/**
 * Moves an exercise one place up / down through the whole day: within its section, then across
 * into the neighbouring section (end of the previous / start of the next).
 */
export function moveExercise(p: PlanBody, dayId: string, exId: string, dir: -1 | 1): PlanBody {
  return mapSections(p, dayId, (sections) => {
    const si = sections.findIndex((s) => s.exerciseIds.includes(exId));
    if (si < 0) return sections;
    const ids = sections[si].exerciseIds;
    const i = ids.indexOf(exId);
    const j = i + dir;
    const next = sections.map((s) => ({ ...s, exerciseIds: [...s.exerciseIds] }));
    if (j >= 0 && j < ids.length) {
      next[si].exerciseIds = move(ids, i, dir);
      return next;
    }
    const ti = si + dir;
    if (ti < 0 || ti >= sections.length) return sections;
    next[si].exerciseIds = ids.filter((id) => id !== exId);
    next[ti].exerciseIds = dir < 0 ? [...next[ti].exerciseIds, exId] : [exId, ...next[ti].exerciseIds];
    return next;
  });
}

export function moveExerciseToSection(p: PlanBody, dayId: string, exId: string, toSectionId: string): PlanBody {
  return mapSections(p, dayId, (s) => {
    if (!s.some((x) => x.id === toSectionId)) return s;
    return s.map((x) => {
      const without = x.exerciseIds.filter((id) => id !== exId);
      return x.id === toSectionId ? { ...x, exerciseIds: [...without, exId] } : { ...x, exerciseIds: without };
    });
  });
}

/** Where an exercise sits in its day: for move-button enablement. */
export function exercisePosition(day: WorkoutDay, exId: string): { first: boolean; last: boolean } {
  const flat = (day.sections ?? []).flatMap((s) => s.exerciseIds);
  const i = flat.indexOf(exId);
  return { first: i <= 0, last: i === flat.length - 1 };
}

/** Total working sets of a day (for summaries). */
export function daySets(day: WorkoutDay, exercises: Record<string, Exercise>): number {
  return (day.sections ?? []).flatMap((s) => s.exerciseIds).reduce((n, id) => n + (exercises[id]?.workingSets ?? 0), 0);
}
