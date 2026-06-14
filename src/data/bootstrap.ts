import localforage from 'localforage';
import { getDataSource } from './dataSource';
import { SEED_WORKOUT_PLAN } from './seed/workoutPlan.seed';
import { SEED_MEAL_PLAN } from './seed/nutritionPlan.seed';
import { SEED_VIDEO_ASSETS } from './seed/videoAssets.seed';
import { SEED_PROFILE, SEED_SETTINGS, SEED_REMINDERS } from './seed/defaults';

/**
 * Bump this when the seed plan / nutrition / video links change so existing
 * installs pick up the new data on next launch. User logs are never touched.
 *  v2: real 5-day split (Push/Pull/Legs/Push/Pull) + real YouTube video links.
 *  v3: switch videos to local offline files in public/exercise_videos/.
 *  v4: connect every exercise to its local file by name.
 *  v5: collapse to a 3-day Push/Pull/Legs split (drop duplicate Push B/Pull B).
 */
const SEED_VERSION = 5;

const meta = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });

/**
 * Idempotently seed the local store. New records are created on first launch;
 * when SEED_VERSION increases, the *plan*, *nutrition plan*, and *video links*
 * are refreshed (logs, weights, photos, checklists are preserved).
 */
export async function bootstrapData(): Promise<void> {
  const ds = getDataSource();
  const stamp = Date.now();
  const prevVersion = (await meta.getItem<number>('seedVersion')) ?? 0;
  const upgrade = prevVersion < SEED_VERSION;

  const profile = await ds.profile.get();
  if (!profile) {
    // updatedAt stays 0: a freshly-seeded singleton must always LOSE the
    // first sync against a real cloud copy. Seeding with Date.now() used to
    // clobber the user's cloud profile/settings on every new device.
    await ds.profile.set({ ...SEED_PROFILE, createdAt: stamp, updatedAt: 0 });
  }

  const settings = await ds.settings.get();
  if (!settings) {
    await ds.settings.set({ ...SEED_SETTINGS, updatedAt: 0 });
  }

  // Workout plan: seed if missing, or refresh on version upgrade.
  const plan = await ds.workoutPlans.get(SEED_WORKOUT_PLAN.id);
  if (!plan || upgrade) {
    await ds.workoutPlans.put({ ...SEED_WORKOUT_PLAN, updatedAt: stamp });
  }

  // Nutrition plan: seed if missing, or refresh on version upgrade.
  const meal = await ds.mealPlans.get(SEED_MEAL_PLAN.id);
  if (!meal || upgrade) {
    await ds.mealPlans.put({ ...SEED_MEAL_PLAN, updatedAt: stamp });
  }

  // Video assets: seed if missing. On upgrade, fill in the real URL for any
  // asset the user hasn't already customised (keeps user-pasted links).
  const existingVideos = await ds.videoAssets.getAll();
  if (existingVideos.length === 0) {
    await ds.videoAssets.putMany(SEED_VIDEO_ASSETS.map((v) => ({ ...v, updatedAt: stamp })));
  } else if (upgrade) {
    const byId = new Map(existingVideos.map((v) => [v.id, v]));
    const merged = SEED_VIDEO_ASSETS.map((seed) => {
      const cur = byId.get(seed.id);
      // Keep a genuinely downloaded offline copy AND any user-pasted link
      // (userEdited) — even if not downloaded yet; otherwise take the new
      // seed URL (so the v3 local-file links replace the old YouTube ones).
      if (cur && (cur.status === 'downloaded' || cur.userEdited)) return cur;
      return { ...seed, updatedAt: stamp };
    });
    await ds.videoAssets.putMany(merged);
  }

  const existingReminders = await ds.reminders.getAll();
  if (existingReminders.length === 0) {
    await ds.reminders.putMany(SEED_REMINDERS);
  }

  if (upgrade) await meta.setItem('seedVersion', SEED_VERSION);
}
