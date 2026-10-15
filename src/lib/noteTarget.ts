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
  photos: '/progress?tab=photos',
};

const DAY_SCOPED: NoteScreen[] = ['nutrition', 'cardio', 'measurements', 'workout'];

type NoteLink = { screen?: NoteScreen; date?: string; entityType?: NoteEntityType; entityId?: string; route?: string };

/**
 * Where a client should land for an anchored coach note / notification.
 * PURE (B0 / NT-02): building a toast or a list row must never change app
 * state — use `openClientNote` when the user actually taps.
 * Workout notes resolve to the routine day holding the entity.
 */
export function clientNoteRoute(n: NoteLink): string {
  let route = n.route ?? (n.screen ? SCREEN_ROUTE[n.screen] : undefined);
  if (n.screen === 'workout' && n.entityType) {
    const plan = useWorkout.getState().plan;
    const dayId =
      n.entityType === 'workout_day'
        ? n.entityId
        : plan?.days.find((d) => d.exerciseIds.includes(n.entityId ?? '') || d.sections?.some((s) => s.exerciseIds.includes(n.entityId ?? '')))?.id;
    if (dayId) route = `/workout/routine/${dayId}`;
  }
  return route ?? '/';
}

/**
 * The user tapped a note / notification: arm the scroll-to-highlight focus and,
 * for a dated note on a day-scoped screen, show that day (the screen's day
 * switcher then says which day is shown, with "Back to today"). Returns the
 * route to navigate to.
 */
export function openClientNote(n: NoteLink): string {
  if (n.entityType && n.entityId) useFocus.getState().focusEntity({ entityType: n.entityType, entityId: n.entityId });
  if (n.date && n.screen && DAY_SCOPED.includes(n.screen)) useDay.getState().setDay(n.date);
  return clientNoteRoute(n);
}
