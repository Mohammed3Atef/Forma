import localforage from 'localforage';
import { getDataSource } from './dataSource';
import { blobStore } from './blobStore';
import { recordDeletion, recordDeletions } from './sync/tombstones';

/** All localForage object stores used by the app (kept in sync with adapters). */
const STORES = [
  'profile',
  'settings',
  'workoutPlans',
  'workoutLogs',
  'mealPlans',
  'nutritionLogs',
  'cardioLogs',
  'weightLogs',
  'measurementLogs',
  'videoAssets',
  'progressPhotos',
  'dailyChecklists',
  'reminders',
  'blobs',
  'meta',
  'deletions',
];

/**
 * Wipe ALL local data (logs, plans, profile, settings, downloaded videos,
 * photos, seed marker). The next launch re-seeds the defaults from scratch.
 */
export async function clearAllLocalData(): Promise<void> {
  await Promise.all(
    STORES.map((storeName) =>
      localforage.createInstance({ name: 'gym-tracker', storeName }).clear(),
    ),
  );
}

/**
 * Delete every record logged for a single calendar day: workout, nutrition,
 * weight, cardio/steps, the daily checklist, and that day's progress photos.
 * Plans and settings are left untouched.
 */
export async function clearDayData(date: string): Promise<void> {
  const ds = getDataSource();
  await ds.workoutLogs.remove(date);
  await ds.nutritionLogs.remove(date);
  await ds.weightLogs.remove(date);
  await ds.measurementLogs.remove(date);
  await ds.dailyChecklists.remove(date);
  // Tombstones so these deletions reach the cloud (date-keyed docs use the date).
  await recordDeletion('workoutLogs', date);
  await recordDeletion('nutritionLogs', date);
  await recordDeletion('weightLogs', date);
  await recordDeletion('measurementLogs', date);
  await recordDeletion('dailyChecklists', date);

  const cardio = await ds.cardioLogs.getAll();
  const cardioIds = cardio.filter((c) => c.date === date).map((c) => c.id);
  await Promise.all(cardioIds.map((id) => ds.cardioLogs.remove(id)));
  await recordDeletions('cardioLogs', cardioIds);

  const photos = await ds.progressPhotos.getAll();
  const dayPhotos = photos.filter((p) => p.date === date);
  await Promise.all(
    dayPhotos.map(async (p) => {
      await blobStore.remove(p.localKey);
      await ds.progressPhotos.remove(p.id);
    }),
  );
  await recordDeletions('progressPhotos', dayPhotos.map((p) => p.id));
}
