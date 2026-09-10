import type { StarterExercise } from './exerciseLibrary.js';
import type { StarterTemplate } from './starterLibraryData.js';
import type { CoachWorkoutTemplateDoc, TemplateExercise, WorkoutDay } from './types.js';

/**
 * Ports the muscle-blueprint fill logic from
 * `src/services/platform/starterLibraryApi.ts` (`groupByMuscle`,
 * `pickByMuscles`, `buildTemplate`) so `POST /seed-starter-library` can build
 * the same starter workout templates against the dataset, server-side.
 */

const LEVEL_ORDER: Record<string, number> = { beginner: 0, intermediate: 1, expert: 2 };

/** Group exercises by `targetMuscle`, ordered beginner-first then by name (stable picks). */
export function groupByMuscle(exercises: StarterExercise[]): Map<string, StarterExercise[]> {
  const m = new Map<string, StarterExercise[]>();
  for (const e of exercises) {
    const key = e.targetMuscle || e.category || 'Other';
    const arr = m.get(key);
    if (arr) arr.push(e);
    else m.set(key, [e]);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => {
      const la = LEVEL_ORDER[a.level ?? ''] ?? 1;
      const lb = LEVEL_ORDER[b.level ?? ''] ?? 1;
      return la - lb || a.name.localeCompare(b.name);
    });
  }
  return m;
}

/** Fill a day by drawing up to `count` exercises round-robin across `muscles`, skipping `used`. */
function pickByMuscles(byMuscle: Map<string, StarterExercise[]>, muscles: string[], count: number, used: Set<string>): StarterExercise[] {
  const picks: StarterExercise[] = [];
  const cursor = new Map<string, number>(muscles.map((mu) => [mu, 0]));
  let progressed = true;
  while (picks.length < count && progressed) {
    progressed = false;
    for (const mu of muscles) {
      if (picks.length >= count) break;
      const list = byMuscle.get(mu) ?? [];
      let i = cursor.get(mu) ?? 0;
      while (i < list.length && used.has(list[i].id)) i += 1;
      cursor.set(mu, i + 1);
      if (i < list.length) {
        picks.push(list[i]);
        used.add(list[i].id);
        progressed = true;
      }
    }
  }
  return picks;
}

/** Build one workout template doc from its muscle-group blueprint against the dataset. */
export function buildTemplate(
  tpl: StarterTemplate,
  byMuscle: Map<string, StarterExercise[]>,
  coachId: string,
  now: number,
): CoachWorkoutTemplateDoc {
  const used = new Set<string>();
  const exercises: Record<string, TemplateExercise> = {};
  const days: WorkoutDay[] = tpl.days.map((d, i) => {
    const picks = pickByMuscles(byMuscle, d.muscles, d.count ?? 6, used);
    for (const e of picks) exercises[e.id] = e;
    return { id: `${tpl.id}-day-${i}`, dayIndex: i, title: d.title, focus: d.focus, exerciseIds: picks.map((e) => e.id) };
  });
  return {
    _id: tpl.id,
    coachId,
    name: tpl.name,
    goal: tpl.goal,
    splitType: tpl.splitType,
    days,
    exercises,
    createdAt: now,
    updatedAt: now,
  };
}
