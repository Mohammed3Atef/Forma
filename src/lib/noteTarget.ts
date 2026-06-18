import type { NoteEntityType, NoteScreen } from '@/types';
import { useWorkout } from '@/stores/workoutStore';
import { useDay } from '@/stores/dayStore';
import { useFocus } from '@/stores/focusStore';

const SCREEN_ROUTE: Record<NoteScreen, string> = {
  nutrition: '/nutrition',
  workout: '/workout',
  cardio: '/cardio',
  progress: '/progress',
  measurements: '/progress/measurements',
  photos: '/progress/photos',
};

const DAY_SCOPED: NoteScreen[] = ['nutrition', 'cardio', 'measurements', 'workout'];

/**
 * Resolve where a client should land for an anchored coach note / notification,
 * and arm the scroll-to-highlight focus + active day as a side effect. Workout
 * notes resolve to the routine day holding the entity. Returns the route.
 */
export function clientNoteRoute(n: { screen?: NoteScreen; date?: string; entityType?: NoteEntityType; entityId?: string; route?: string }): string {
  if (n.entityType && n.entityId) useFocus.getState().focusEntity({ entityType: n.entityType, entityId: n.entityId });

  let route = n.route ?? (n.screen ? SCREEN_ROUTE[n.screen] : undefined);
  if (n.screen === 'workout' && n.entityType) {
    const plan = useWorkout.getState().plan;
    const dayId =
      n.entityType === 'workout_day'
        ? n.entityId
        : plan?.days.find((d) => d.exerciseIds.includes(n.entityId ?? '') || d.sections?.some((s) => s.exerciseIds.includes(n.entityId ?? '')))?.id;
    if (dayId) route = `/workout/routine/${dayId}`;
  }
  if (n.date && n.screen && DAY_SCOPED.includes(n.screen)) useDay.getState().setDay(n.date);
  return route ?? '/';
}
