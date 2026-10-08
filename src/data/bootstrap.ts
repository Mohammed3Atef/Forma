import { getDataSource } from './dataSource';
import { SEED_PROFILE, SEED_SETTINGS } from './seed/defaults';
import { deviceLocale } from '@/i18n';

/**
 * Forma is coach-driven: an account's local database starts with NO plan,
 * targets or demo data — the coach assigns all of it (see planApi /
 * loadCoachAssignedContent). Only the profile + settings singletons are
 * created, idempotently.
 *
 * (The standalone-tracker seed — demo plan, meals, video library, reminders,
 * SEED_VERSION upgrades — only ever ran in the removed local-only mode;
 * deleted in B0 / RM-02, RM-60.)
 */
export async function bootstrapData(): Promise<void> {
  const ds = getDataSource();
  const stamp = Date.now();

  const profile = await ds.profile.get();
  if (!profile) {
    // updatedAt stays 0: a freshly-seeded singleton must always LOSE the
    // first sync against a real cloud copy. Seeding with Date.now() used to
    // clobber the user's cloud profile/settings on every new device.
    // A new account database starts in the language the device is already using.
    await ds.profile.set({ ...SEED_PROFILE, locale: deviceLocale() ?? SEED_PROFILE.locale, createdAt: stamp, updatedAt: 0 });
  }

  const settings = await ds.settings.get();
  if (!settings) {
    await ds.settings.set({ ...SEED_SETTINGS, locale: deviceLocale() ?? SEED_SETTINGS.locale, updatedAt: 0 });
  }
}
