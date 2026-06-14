/** Per-muscle accent colours used for dots and the muscle-split chart. */
const MAP: Record<string, string> = {
  Chest: '#AE7E56',
  Shoulders: '#D4A46A',
  Triceps: '#C69975',
  Quads: '#BF6E4E',
  Quadriceps: '#BF6E4E',
  Hamstrings: '#8B6914',
  Calves: '#5C3A2A',
  Calf: '#5C3A2A',
  Back: '#2E5D3C',
  Lats: '#2E5D3C',
  Biceps: '#C2CCAE',
  'Rear Delts': '#E8C8B4',
  Glutes: '#BF6E4E',
  Core: '#E6E2DC',
  Abs: '#E6E2DC',
};

export function muscleColor(muscle: string | undefined | null): string {
  if (!muscle) return '#AE7E56';
  return MAP[muscle] ?? MAP[muscle.trim()] ?? '#AE7E56';
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
