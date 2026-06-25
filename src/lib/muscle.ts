/** Per-muscle accent colours used for dots and the muscle-split chart. */
const MAP: Record<string, string> = {
  Chest: '#E5520F',
  Shoulders: '#FFB627',
  Triceps: '#FF8A3D',
  Quads: '#C8440A',
  Quadriceps: '#C8440A',
  Hamstrings: '#8B6914',
  Calves: '#5C3A2A',
  Calf: '#5C3A2A',
  Back: '#2E5D3C',
  Lats: '#2E5D3C',
  Biceps: '#C2CCAE',
  'Rear Delts': '#E8C8B4',
  Glutes: '#C8440A',
  Core: '#E6E2DC',
  Abs: '#E6E2DC',
};

export function muscleColor(muscle: string | undefined | null): string {
  if (!muscle) return '#E5520F';
  return MAP[muscle] ?? MAP[muscle.trim()] ?? '#E5520F';
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
