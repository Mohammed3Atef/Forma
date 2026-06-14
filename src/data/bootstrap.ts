import localforage from 'localforage';
import { cloudAvailable, getDataSource } from './dataSource';
import { SEED_WORKOUT_PLAN } from './seed/workoutPlan.seed';
import { SEED_MEAL_PLAN } from './seed/nutritionPlan.seed';
import { SEED_VIDEO_ASSETS } from './seed/videoAssets.seed';
import { SEED_PROFILE, SEED_SETTINGS, SEED_REMINDERS } from './seed/defaults';
import type { DailyTargets } from '@/types';

/** Forma is coach-driven: a platform client starts with NO plan/targets/demo
 * data — everything is assigned by their coach. Demo seed data is only used in
 * local-only mode (no Firebase), where the app runs as a standalone tracker. */
const EMPTY_TARGETS: DailyTargets = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
  waterMl: 0,
  steps: 0,
  cardioMinutes: 0,
};

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
  // On the platform (Firebase configured) the client is coach-driven and must
  // start empty — no demo plan/meals/videos/reminders/targets.
  const platform = cloudAvailable();

  const profile = await ds.profile.get();
  if (!profile) {
    // updatedAt stays 0: a freshly-seeded singleton must always LOSE the
    // first sync against a real cloud copy. Seeding with Date.now() used to
    // clobber the user's cloud profile/settings on every new device.
    await ds.profile.set({ ...SEED_PROFILE, createdAt: stamp, updatedAt: 0 });
  }

  const settings = await ds.settings.get();
  if (!settings) {
    // Platform clients have NO demo targets — the coach assigns them.
    await ds.settings.set({
      ...SEED_SETTINGS,
      targets: platform ? EMPTY_TARGETS : SEED_SETTINGS.targets,
      updatedAt: 0,
    });
  }

  // The standalone-tracker seed (plan, meals, videos, reminders) is local-only.
  // Platform clients receive all of this from their coach (see planApi /
  // loadCoachAssignedContent), so we never seed demo content for them.
  if (!platform) {
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
  }

  if (upgrade) await meta.setItem('seedVersion', SEED_VERSION);
}
