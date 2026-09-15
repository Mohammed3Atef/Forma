import { colors } from '@/theme/colors';

/** Per-muscle accent colours used for dots and the muscle-split chart. */
const MAP: Record<string, string> = {
  Chest: colors.brandOrange,
  Shoulders: colors.brandGold,
  Triceps: colors.brandOrangeHover,
  Quads: colors.brandOrangeDark,
  Quadriceps: colors.brandOrangeDark,
  Hamstrings: '#8B6914',
  Calves: '#5C3A2A',
  Calf: '#5C3A2A',
  Back: colors.teal,
  Lats: colors.teal,
  Biceps: colors.violet,
  'Rear Delts': '#E8C8B4',
  Glutes: colors.brandOrangeDark,
  Core: '#E6E2DC',
  Abs: '#E6E2DC',
};

export function muscleColor(muscle: string | undefined | null): string {
  if (!muscle) return colors.brandOrange;
  return MAP[muscle] ?? MAP[muscle.trim()] ?? colors.brandOrange;
}

/**
 * Localize a muscle / target name. Falls back to the raw (English) seed value
 * for freeform descriptors that have no translation key (e.g. "Shoulder mobility").
 */
export function muscleLabel(
  muscle: string | undefined | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!muscle) return '';
  const key = muscle.trim().toLowerCase();
  return t(`muscles.${key}`, { defaultValue: muscle });
}
