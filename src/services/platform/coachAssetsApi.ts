import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { uid } from '@/lib/utils';
import { saveClientMealPlan, saveClientWorkoutPlan } from './planApi';
import type {
  Exercise,
  FoodGroup,
  LibraryFood,
  LibrarySupplement,
  MealPlan,
  NutritionTemplate,
  WorkoutDay,
  WorkoutPlan,
  WorkoutTemplate,
} from '@/types';

/**
 * Coach-owned reusable assets at `coachAssets/{coachId}/...`:
 *  - exercises          (Exercise library)
 *  - workoutTemplates   (WorkoutTemplate)
 *  - nutritionTemplates (NutritionTemplate)
 *
 * Assigning a template SNAPSHOTS its body into the client plan — never a live
 * link. The assigned plan is fully independent afterwards.
 */

const ASSETS = 'coachAssets';

// ---- Exercise library ------------------------------------------------------

export async function listExercises(coachId: string): Promise<Exercise[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, ASSETS, coachId, 'exercises'));
  return snap.docs.map((d) => d.data() as Exercise).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveExercise(coachId: string, exercise: Exercise): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, ASSETS, coachId, 'exercises', exercise.id), exercise);
}

export async function deleteExercise(coachId: string, exerciseId: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, ASSETS, coachId, 'exercises', exerciseId));
}

// ---- Snapshot helper -------------------------------------------------------

interface PlanBody {
  days: WorkoutDay[];
  exercises: Record<string, Exercise>;
}

/**
 * Deep-copies a workout body with FRESH ids (exercises, days, sections) so the
 * result is fully decoupled from the source. Keeps `exerciseIds` = the day's
 * sections flattened (or the existing flat list when there are no sections).
 */
export function snapshotPlanBody(body: PlanBody): PlanBody {
  const idMap: Record<string, string> = {};
  const exercises: Record<string, Exercise> = {};
  for (const [oldId, ex] of Object.entries(body.exercises)) {
    const newId = uid('ex');
    idMap[oldId] = newId;
    exercises[newId] = { ...ex, id: newId };
  }
  const days: WorkoutDay[] = body.days.map((d, i) => {
    const sections = (d.sections ?? []).map((s) => ({
      ...s,
      id: uid('sec'),
      exerciseIds: s.exerciseIds.map((x) => idMap[x]).filter(Boolean),
    }));
    const exerciseIds = sections.length
      ? sections.flatMap((s) => s.exerciseIds)
      : d.exerciseIds.map((x) => idMap[x]).filter(Boolean);
    return { ...d, id: uid('day'), dayIndex: i, exerciseIds, ...(sections.length ? { sections } : {}) };
  });
  return { days, exercises };
}

// ---- Workout templates -----------------------------------------------------

export async function listWorkoutTemplates(coachId: string): Promise<WorkoutTemplate[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, ASSETS, coachId, 'workoutTemplates'));
  return snap.docs.map((d) => d.data() as WorkoutTemplate).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getWorkoutTemplate(coachId: string, id: string): Promise<WorkoutTemplate | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, ASSETS, coachId, 'workoutTemplates', id));
  return snap.exists() ? (snap.data() as WorkoutTemplate) : null;
}

export async function saveWorkoutTemplate(template: WorkoutTemplate): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, ASSETS, template.coachId, 'workoutTemplates', template.id), { ...template, updatedAt: Date.now() });
}

export async function deleteWorkoutTemplate(coachId: string, id: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, ASSETS, coachId, 'workoutTemplates', id));
}

export async function duplicateWorkoutTemplate(template: WorkoutTemplate): Promise<WorkoutTemplate> {
  const body = snapshotPlanBody({ days: template.days, exercises: template.exercises });
  const now = Date.now();
  const copy: WorkoutTemplate = {
    ...template,
    id: uid('wtpl'),
    name: `${template.name} (copy)`,
    days: body.days,
    exercises: body.exercises,
    createdAt: now,
    updatedAt: now,
  };
  await saveWorkoutTemplate(copy);
  return copy;
}

/** Snapshot a template into a client's assigned workout plan (independent copy). */
export async function assignWorkoutTemplate(template: WorkoutTemplate, clientId: string, assignedBy: string): Promise<void> {
  const body = snapshotPlanBody({ days: template.days, exercises: template.exercises });
  const now = Date.now();
  const plan: WorkoutPlan = {
    id: uid('wplan'),
    name: template.name,
    days: body.days,
    exercises: body.exercises,
    meta: {
      sourceTemplateId: template.id,
      sourceTemplateName: template.name,
      assignedAt: now,
      assignedBy,
      isCustomized: false,
    },
    updatedAt: now,
  };
  await saveClientWorkoutPlan(clientId, plan);
}

/** Save a (possibly customized) client workout plan back as a new reusable template. */
export async function saveClientPlanAsTemplate(
  coachId: string,
  plan: WorkoutPlan,
  name: string,
  goal: WorkoutTemplate['goal'],
  splitType: WorkoutTemplate['splitType'],
): Promise<WorkoutTemplate> {
  const body = snapshotPlanBody({ days: plan.days, exercises: plan.exercises });
  const now = Date.now();
  const template: WorkoutTemplate = {
    id: uid('wtpl'),
    coachId,
    name,
    goal,
    splitType,
    days: body.days,
    exercises: body.exercises,
    createdAt: now,
    updatedAt: now,
  };
  await saveWorkoutTemplate(template);
  return template;
}

// ---- Food library + alternative groups -------------------------------------

export async function listFoods(coachId: string): Promise<LibraryFood[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, ASSETS, coachId, 'foods'));
  return snap.docs.map((d) => d.data() as LibraryFood).sort((a, b) => a.name.en.localeCompare(b.name.en));
}

export async function saveFood(coachId: string, food: LibraryFood): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, ASSETS, coachId, 'foods', food.id), food);
}

export async function deleteFood(coachId: string, foodId: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, ASSETS, coachId, 'foods', foodId));
}

export async function listFoodGroups(coachId: string): Promise<FoodGroup[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, ASSETS, coachId, 'foodGroups'));
  return snap.docs.map((d) => d.data() as FoodGroup).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveFoodGroup(group: FoodGroup): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, ASSETS, group.coachId, 'foodGroups', group.id), { ...group, updatedAt: Date.now() });
}

export async function deleteFoodGroup(coachId: string, groupId: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, ASSETS, coachId, 'foodGroups', groupId));
}

// ---- Supplement library ----------------------------------------------------

export async function listSupplements(coachId: string): Promise<LibrarySupplement[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, ASSETS, coachId, 'supplements'));
  return snap.docs.map((d) => d.data() as LibrarySupplement).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSupplement(coachId: string, supp: LibrarySupplement): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, ASSETS, coachId, 'supplements', supp.id), supp);
}

export async function deleteSupplement(coachId: string, suppId: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, ASSETS, coachId, 'supplements', suppId));
}

// ---- Bulk delete (selection → batch removal) -------------------------------
// Each delete is independent; a single failure never aborts the rest. Returns
// how many succeeded so the UI can surface partial failures.

export interface BulkResult {
  ok: number;
  failed: number;
}

async function settle(promises: Promise<unknown>[]): Promise<BulkResult> {
  const results = await Promise.allSettled(promises);
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { ok: results.length - failed, failed };
}

export function bulkDeleteExercises(coachId: string, ids: string[]): Promise<BulkResult> {
  return settle(ids.map((id) => deleteExercise(coachId, id)));
}
export function bulkDeleteFoods(coachId: string, ids: string[]): Promise<BulkResult> {
  return settle(ids.map((id) => deleteFood(coachId, id)));
}
export function bulkDeleteFoodGroups(coachId: string, ids: string[]): Promise<BulkResult> {
  return settle(ids.map((id) => deleteFoodGroup(coachId, id)));
}
export function bulkDeleteSupplements(coachId: string, ids: string[]): Promise<BulkResult> {
  return settle(ids.map((id) => deleteSupplement(coachId, id)));
}
export function bulkDeleteWorkoutTemplates(coachId: string, ids: string[]): Promise<BulkResult> {
  return settle(ids.map((id) => deleteWorkoutTemplate(coachId, id)));
}

// ---- Nutrition templates (architecture; assign reuses MealPlan) ------------

export async function listNutritionTemplates(coachId: string): Promise<NutritionTemplate[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, ASSETS, coachId, 'nutritionTemplates'));
  return snap.docs.map((d) => d.data() as NutritionTemplate).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveNutritionTemplate(template: NutritionTemplate): Promise<void> {
  const { db } = ensureFirebase();
  await setDoc(doc(db, ASSETS, template.coachId, 'nutritionTemplates', template.id), { ...template, updatedAt: Date.now() });
}

export async function deleteNutritionTemplate(coachId: string, id: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, ASSETS, coachId, 'nutritionTemplates', id));
}

/** Snapshot a nutrition template into a client's assigned meal plan (independent copy). */
export async function assignNutritionTemplate(template: NutritionTemplate, clientId: string, assignedBy: string): Promise<void> {
  const now = Date.now();
  const plan: MealPlan = {
    id: uid('mplan'),
    name: template.name,
    meals: template.meals.map((m) => ({ ...m, id: uid('meal'), items: m.items.map((it) => ({ ...it, id: uid('food') })) })),
    targets: { ...template.targets },
    supplements: template.supplements.map((s) => ({ ...s, id: uid('supp') })),
    waterTargetMl: template.waterTargetMl,
    beverageNotes: [],
    generalNotes: [],
    meta: { sourceTemplateId: template.id, sourceTemplateName: template.name, assignedAt: now, assignedBy, isCustomized: false },
    updatedAt: now,
  };
  await saveClientMealPlan(clientId, plan);
}
