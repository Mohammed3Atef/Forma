import { useCoachContentSync } from '@/stores/coachContentStore';
import { getDataSource } from '@/data/dataSource';
import { currentLocalOwner } from '@/data/localScope';
import { getClientMealPlan, getClientWorkoutPlan } from './planApi';
import { fetchMyCoachTargets, fetchMyProfile } from './clientCoachApi';
import type { DailyTargets } from '@/types';


/**
 * Pulls the signed-in client's coach-authored content (workout plan, meal plan,
 * daily targets) from Firestore and mirrors it into the local store so the
 * existing tracker screens render it. If the coach has assigned nothing, local
 * plans are cleared so the client genuinely starts empty (the UI then shows the
 * "waiting for your coach" state). The client's own LOGS are untouched.
 */
export async function loadCoachAssignedContent(uid: string): Promise<void> {
  const ds = getDataSource();
  // These are network reads. Offline (or on a transient error) we must NOT throw
  // — the caller still needs to load the local stores from IndexedDB, and the
  // last-synced plan/profile/targets already live there. Degrade gracefully.
  let wp, mp, ct, remoteProfile;
  try {
    [wp, mp, ct, remoteProfile] = await Promise.all([
      getClientWorkoutPlan(uid),
      getClientMealPlan(uid),
      fetchMyCoachTargets(uid),
      fetchMyProfile(uid),
    ]);
  } catch {
    useCoachContentSync.getState().setStatus('failed');
    return; // keep whatever is already mirrored locally
  }
  // The account may have changed while the reads were in flight: never mirror
  // one account's coach content into another account's database.
  if (currentLocalOwner() !== uid) return;
  useCoachContentSync.getState().setStatus('ok');

  // Apply the client's own profile deterministically (last-write-wins) so the
  // profile-completion gate reflects real values right after the account's database opens
  // reset it — without waiting for the next background sync tick.
  if (remoteProfile) {
    const localProfile = await ds.profile.get();
    if (!localProfile || remoteProfile.updatedAt >= (localProfile.updatedAt ?? 0)) {
      await ds.profile.set(remoteProfile);
    }
  }

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
