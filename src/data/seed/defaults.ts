import type { AppSettings, Reminder, UserProfile } from '@/types';

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
  targets: {
    calories: 1815,
    protein: 158,
    carbs: 180,
    fats: 53,
    waterMl: 4000,
    steps: 10000,
    cardioMinutes: 40,
  },
  customMeasurements: [],
  updatedAt: 0,
};

/** Sensible default reminders (disabled until the user opts in). */
const rem = (
  id: string,
  kind: Reminder['kind'],
  label: string,
  time: string,
): Reminder => ({ id, kind, label, time, enabled: false, repeatDays: [], updatedAt: 0, dirty: false });

export const SEED_REMINDERS: Reminder[] = [
  rem('rem_meal1', 'meal', 'Meal 1 (breakfast)', '08:00'),
  rem('rem_meal2', 'meal', 'Meal 2 (lunch)', '12:30'),
  rem('rem_meal3', 'meal', 'Meal 3 (dinner)', '16:30'),
  rem('rem_meal4', 'meal', 'Meal 4 (snack)', '20:00'),
  rem('rem_supps', 'supplements', 'Vitamins after breakfast', '08:30'),
  rem('rem_mag', 'supplements', 'Mag White before sleep', '23:15'),
  rem('rem_creatine', 'creatine', 'Creatine', '17:00'),
  rem('rem_water', 'water', 'Drink water', '14:00'),
  rem('rem_workout', 'workout', 'Workout time', '18:00'),
  rem('rem_cardio', 'cardio', 'Cardio / walk', '19:00'),
];
