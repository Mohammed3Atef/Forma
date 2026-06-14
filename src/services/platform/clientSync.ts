import localforage from 'localforage';
import { getDataSource } from '@/data/dataSource';
import { SEED_PROFILE, SEED_SETTINGS } from '@/data/seed/defaults';
import { getClientMealPlan, getClientWorkoutPlan } from './planApi';
import { fetchMyCoachTargets } from './clientCoachApi';
import type { DailyTargets } from '@/types';

const meta = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });

const ZERO_TARGETS: DailyTargets = { calories: 0, protein: 0, carbs: 0, fats: 0, waterMl: 0, steps: 0, cardioMinutes: 0 };

async function clearRepo(repo: { getAll: () => Promise<{ id: string }[]>; remove: (id: string) => Promise<void> }): Promise<void> {
  const all = await repo.getAll();
  await Promise.all(all.map((r) => repo.remove(r.id)));
}

/**
 * Local-store data is shared per-DEVICE (one IndexedDB), so switching accounts
 * on the same device would otherwise show the previous user's logs, plan,
 * profile and PRs. When the signed-in uid differs from the device's recorded
 * owner, wipe all local fitness data and reset the profile/targets so each
 * account starts clean; their own cloud data is then pulled by the SyncEngine.
 * Returns true if a reset happened.
 */
export async function scopeLocalToUser(uid: string, displayName: string): Promise<boolean> {
  const owner = await meta.getItem<string>('localOwnerUid');
  if (owner === uid) return false;
  const ds = getDataSource();
  await Promise.all([
    clearRepo(ds.workoutLogs),
    clearRepo(ds.nutritionLogs),
    clearRepo(ds.cardioLogs),
    clearRepo(ds.weightLogs),
    clearRepo(ds.measurementLogs),
    clearRepo(ds.progressPhotos),
    clearRepo(ds.dailyChecklists),
    clearRepo(ds.reminders),
    clearRepo(ds.workoutPlans),
    clearRepo(ds.mealPlans),
    clearRepo(ds.videoAssets),
  ]);
  await ds.profile.set({ ...SEED_PROFILE, name: displayName || '', createdAt: 0, updatedAt: 0 });
  await ds.settings.set({ ...SEED_SETTINGS, targets: ZERO_TARGETS, updatedAt: 0 });
  // Reset sync state so we cleanly re-pull THIS user's data.
  await meta.removeItem(`pullCursorV2:${uid}`);
  await meta.removeItem(`clientDataMigrated:${uid}`);
  await meta.setItem('localOwnerUid', uid);
  return true;
}

/**
 * Pulls the signed-in client's coach-authored content (workout plan, meal plan,
 * daily targets) from Firestore and mirrors it into the local store so the
 * existing tracker screens render it. If the coach has assigned nothing, local
 * plans are cleared so the client genuinely starts empty (the UI then shows the
 * "waiting for your coach" state). The client's own LOGS are untouched.
 */
export async function loadCoachAssignedContent(uid: string): Promise<void> {
  const ds = getDataSource();
  const [wp, mp, ct] = await Promise.all([
    getClientWorkoutPlan(uid),
    getClientMealPlan(uid),
    fetchMyCoachTargets(uid),
  ]);

  // Workout plan — mirror the coach's plan, or clear local plans if none.
  const localPlans = await ds.workoutPlans.getAll();
  if (wp) {
    await ds.workoutPlans.put(wp);
    await Promise.all(localPlans.filter((p) => p.id !== wp.id).map((p) => ds.workoutPlans.remove(p.id)));
  } else {
    await Promise.all(localPlans.map((p) => ds.workoutPlans.remove(p.id)));
  }

  // Meal plan — same.
  const localMeals = await ds.mealPlans.getAll();
  if (mp) {
    await ds.mealPlans.put(mp);
    await Promise.all(localMeals.filter((p) => p.id !== mp.id).map((p) => ds.mealPlans.remove(p.id)));
  } else {
    await Promise.all(localMeals.map((p) => ds.mealPlans.remove(p.id)));
  }

  // Daily targets — derived from the meal-plan macros + coach cardio/water/steps.
  // Patched into settings WITHOUT bumping updatedAt so it never fights the
  // settings singleton sync.
  const settings = await ds.settings.get();
  if (settings) {
    const targets: DailyTargets = {
      calories: mp?.targets.calories ?? 0,
      protein: mp?.targets.protein ?? 0,
      carbs: mp?.targets.carbs ?? 0,
      fats: mp?.targets.fats ?? 0,
      waterMl: ct?.waterMl ?? mp?.waterTargetMl ?? 0,
      steps: ct?.steps ?? 0,
      cardioMinutes: ct?.cardioMin ?? 0,
    };
    await ds.settings.set({ ...settings, targets });
  }
}
