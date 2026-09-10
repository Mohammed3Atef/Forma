import { ApiError, apiDelete, apiGet, apiPost } from '@/services/platformApi';
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
 * Coach-owned reusable assets, now backed by the Mongo `/api/coach-assets/*`
 * routes (was `coachAssets/{coachId}/...` in Firestore):
 *  - exercises          (Exercise library)
 *  - workoutTemplates   (WorkoutTemplate)
 *  - nutritionTemplates (NutritionTemplate)
 *
 * Writes always land on the CALLING coach's own collection — the backend
 * derives `coachId` from the authenticated user for every write route, so a
 * `coachId` parameter kept here purely for read routes / call-site
 * compatibility is intentionally unused on writes.
 *
 * Assigning a template SNAPSHOTS its body into the client plan — never a live
 * link. The assigned plan is fully independent afterwards.
 */

// ---- Exercise library ------------------------------------------------------

export async function listExercises(coachId: string): Promise<Exercise[]> {
  const list = await apiGet<Exercise[]>(`/coach-assets/exercises?coachId=${encodeURIComponent(coachId)}`);
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveExercise(_coachId: string, exercise: Exercise): Promise<void> {
  await apiPost<Exercise>('/coach-assets/exercises', exercise);
}

export async function deleteExercise(_coachId: string, exerciseId: string): Promise<void> {
  await apiDelete<void>(`/coach-assets/exercises/${encodeURIComponent(exerciseId)}`);
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
  return apiGet<WorkoutTemplate[]>(`/coach-assets/workout-templates?coachId=${encodeURIComponent(coachId)}`);
}

export async function getWorkoutTemplate(_coachId: string, id: string): Promise<WorkoutTemplate | null> {
  try {
    return await apiGet<WorkoutTemplate>(`/coach-assets/workout-templates/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function saveWorkoutTemplate(template: WorkoutTemplate): Promise<void> {
  await apiPost<WorkoutTemplate>('/coach-assets/workout-templates', template);
}

export async function deleteWorkoutTemplate(_coachId: string, id: string): Promise<void> {
  await apiDelete<void>(`/coach-assets/workout-templates/${encodeURIComponent(id)}`);
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
  const list = await apiGet<LibraryFood[]>(`/coach-assets/foods?coachId=${encodeURIComponent(coachId)}`);
  return [...list].sort((a, b) => a.name.en.localeCompare(b.name.en));
}

export async function saveFood(_coachId: string, food: LibraryFood): Promise<void> {
  await apiPost<LibraryFood>('/coach-assets/foods', food);
}

export async function deleteFood(_coachId: string, foodId: string): Promise<void> {
  await apiDelete<void>(`/coach-assets/foods/${encodeURIComponent(foodId)}`);
}

export async function listFoodGroups(coachId: string): Promise<FoodGroup[]> {
  return apiGet<FoodGroup[]>(`/coach-assets/food-groups?coachId=${encodeURIComponent(coachId)}`);
}

export async function saveFoodGroup(group: FoodGroup): Promise<void> {
  await apiPost<FoodGroup>('/coach-assets/food-groups', group);
}

export async function deleteFoodGroup(_coachId: string, groupId: string): Promise<void> {
  await apiDelete<void>(`/coach-assets/food-groups/${encodeURIComponent(groupId)}`);
}

// ---- Supplement library -----------------------------------------------------

export async function listSupplements(coachId: string): Promise<LibrarySupplement[]> {
  const list = await apiGet<LibrarySupplement[]>(`/coach-assets/supplements?coachId=${encodeURIComponent(coachId)}`);
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSupplement(_coachId: string, supp: LibrarySupplement): Promise<void> {
  await apiPost<LibrarySupplement>('/coach-assets/supplements', supp);
}

export async function deleteSupplement(_coachId: string, suppId: string): Promise<void> {
  await apiDelete<void>(`/coach-assets/supplements/${encodeURIComponent(suppId)}`);
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
  return apiGet<NutritionTemplate[]>(`/coach-assets/nutrition-templates?coachId=${encodeURIComponent(coachId)}`);
}

export async function saveNutritionTemplate(template: NutritionTemplate): Promise<void> {
  await apiPost<NutritionTemplate>('/coach-assets/nutrition-templates', template);
}

export async function deleteNutritionTemplate(_coachId: string, id: string): Promise<void> {
  await apiDelete<void>(`/coach-assets/nutrition-templates/${encodeURIComponent(id)}`);
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
