import { uid } from '@/lib/utils';
import type { Exercise, SectionKind } from '@/types';

/** Quick set/rep/rest presets the coach can apply to an exercise. */
export interface ExercisePreset {
  key: string;
  warmupSetCount: number;
  workingSets: number;
  repRange: string;
  restSec: number;
}

export const EXERCISE_PRESETS: ExercisePreset[] = [
  { key: 'hypertrophy', warmupSetCount: 1, workingSets: 3, repRange: '8-12', restSec: 90 },
  { key: 'strength', warmupSetCount: 2, workingSets: 4, repRange: '3-6', restSec: 150 },
  { key: 'pump', warmupSetCount: 0, workingSets: 3, repRange: '12-20', restSec: 60 },
  { key: 'mobility', warmupSetCount: 1, workingSets: 0, repRange: '10-15', restSec: 30 },
  { key: 'finisher', warmupSetCount: 0, workingSets: 2, repRange: '15-30', restSec: 45 },
];

export const SECTION_KINDS: SectionKind[] = ['normal', 'warmup', 'working', 'mobility', 'finisher'];

/** A blank exercise with sensible (hypertrophy) defaults. */
export function blankExercise(): Exercise {
  return {
    id: uid('ex'),
    name: '',
    targetMuscle: '',
    warmupSets: '1',
    warmupSetCount: 1,
    workingSets: 3,
    repRange: '8-12',
    rir: '',
    tempo: '',
    notes: { en: '', ar: '' },
    restSec: 90,
    videoId: null,
    videoUrl: null,
    category: '',
    equipment: '',
    tags: [],
    progressionNotes: '',
  };
}

/**
 * Deep-copy an exercise with a fresh id (for library → plan, or duplicate).
 * Deliberately does NOT stamp `libraryExerciseId` — this is also used to clone
 * an already-embedded exercise (duplicate-in-place/day/section, template
 * duplication, template assignment), where it must carry an EXISTING link
 * through unchanged. Use `pickFromLibrary` when picking straight from the
 * coach's library instead.
 */
export function copyExercise(ex: Exercise): Exercise {
  return { ...ex, id: uid('ex'), tags: [...(ex.tags ?? [])], notes: { ...ex.notes } };
}

/**
 * Fields that auto-sync from a coach's library exercise into every template
 * exercise linked to it (`libraryExerciseId` match, `librarySyncEnabled`
 * true) — identity/media/metadata only. Programming fields (sets/reps/
 * rest/tempo/RIR/warmups) are never synced: the same library exercise is
 * legitimately programmed differently across different templates. Shared
 * with the backend copy in `api/coach-assets/_lib/exerciseSync.ts` — keep
 * both lists in sync by hand if this one changes (the `@/*` alias isn't
 * resolvable from Vercel's per-function bundler, so it can't be imported
 * directly there).
 */
export const SYNCED_EXERCISE_FIELDS = [
  'name',
  'notes',
  'videoUrl',
  'imageUrl',
  'images',
  'targetMuscle',
  'category',
  'equipment',
  'muscles',
  'secondaryMuscles',
  'equipmentList',
  'sourceCategory',
] as const satisfies readonly (keyof Exercise)[];

/** Pick a library exercise into a plan/template being built — the ONE place a `libraryExerciseId` link is created. */
export function pickFromLibrary(libEx: Exercise): Exercise {
  return { ...copyExercise(libEx), libraryExerciseId: libEx.id, librarySyncEnabled: true };
}
