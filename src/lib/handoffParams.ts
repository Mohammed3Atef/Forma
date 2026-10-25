/**
 * "Use in a client plan" (B3.7): the URL parameters that hand one library item to a plan editor.
 * Kept apart from the training / nutrition helpers (`libraryHandoff` / `foodHandoff`) so each editor
 * loads only its own (B4.3 bundle split).
 */
export const ADD_EXERCISE_PARAM = 'addExercise';
export const ADD_FOOD_PARAM = 'addFood';

/** The editor URL that receives the hand-off. */
export function useInPlanPath(kind: 'exercise' | 'food', clientId: string, itemId: string): string {
  const editor = kind === 'exercise' ? 'workout' : 'nutrition';
  const param = kind === 'exercise' ? ADD_EXERCISE_PARAM : ADD_FOOD_PARAM;
  return `/coach/client/${encodeURIComponent(clientId)}/${editor}?${param}=${encodeURIComponent(itemId)}`;
}
