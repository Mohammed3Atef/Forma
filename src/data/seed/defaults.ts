import type { AppSettings, UserProfile } from '@/types';

/**
 * Blank default profile. A fresh install must NOT carry anyone's personal
 * data — the first-launch onboarding asks for name/weight, or the user signs
 * in and their cloud profile is pulled. Everything is editable in Settings.
 * (0 = "not set"; the UI treats falsy values as missing.)
 */
export const SEED_PROFILE: UserProfile = {
  id: 'local-user',
  name: '',
  age: 0,
  weightKg: 0,
  heightCm: 0,
  goal: 'recomp',
  activityLevel: 'moderate',
  locale: 'en',
  createdAt: 0,
  updatedAt: 0,
};

export const SEED_SETTINGS: AppSettings = {
  locale: 'en',
  theme: 'dark',
  restDefaultSec: 90,
  weeklyWorkoutGoal: 5,
  keepAwakeDuringWorkout: true,
  vibrationEnabled: true,
  notificationsEnabled: false,
  // No targets until the coach assigns them (Forma is coach-driven).
  targets: { calories: 0, protein: 0, carbs: 0, fats: 0, waterMl: 0, steps: 0, cardioMinutes: 0 },
  customMeasurements: [],
  updatedAt: 0,
};
