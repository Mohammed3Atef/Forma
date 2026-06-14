import { create } from 'zustand';
import type { AppSettings, DailyTargets, Locale, UserProfile } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { applyLocale } from '@/i18n';

interface SettingsState {
  profile: UserProfile | null;
  settings: AppSettings | null;
  loaded: boolean;
  load: () => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updateTargets: (patch: Partial<DailyTargets>) => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
  addMeasurementPart: (label: string) => Promise<void>;
  removeMeasurementPart: (key: string) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  profile: null,
  settings: null,
  loaded: false,

  async load() {
    const ds = getDataSource();
    const [profile, raw] = await Promise.all([
      ds.profile.get(),
      ds.settings.get(),
    ]);
    // Backfill fields added after a settings doc was first created.
    const settings = raw ? { ...raw, customMeasurements: raw.customMeasurements ?? [] } : null;
    if (settings) applyLocale(settings.locale);
    set({ profile, settings, loaded: true });
  },

  async updateProfile(patch) {
    const cur = get().profile;
    if (!cur) return;
    const next: UserProfile = { ...cur, ...patch, updatedAt: Date.now() };
    set({ profile: next });
    await getDataSource().profile.set(next);
  },

  async updateSettings(patch) {
    const cur = get().settings;
    if (!cur) return;
    const next: AppSettings = { ...cur, ...patch, updatedAt: Date.now() };
    set({ settings: next });
    await getDataSource().settings.set(next);
  },

  async updateTargets(patch) {
    const cur = get().settings;
    if (!cur) return;
    await get().updateSettings({ targets: { ...cur.targets, ...patch } });
  },

  async setLocale(locale) {
    applyLocale(locale);
    await get().updateSettings({ locale });
    await get().updateProfile({ locale });
  },

  async addMeasurementPart(label) {
    const cur = get().settings;
    const name = label.trim();
    if (!cur || !name) return;
    const list = cur.customMeasurements ?? [];
    const key = `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await get().updateSettings({ customMeasurements: [...list, { key, label: name }] });
  },

  async removeMeasurementPart(key) {
    const cur = get().settings;
    if (!cur) return;
    await get().updateSettings({
      customMeasurements: (cur.customMeasurements ?? []).filter((m) => m.key !== key),
    });
  },
}));
