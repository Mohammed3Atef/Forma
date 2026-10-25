import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../api/_trpc/router';
import { trpc } from '@/services/trpc';

/**
 * B4.3 — the coach's ONE library (`api/_trpc/routers/library.ts`): Forma's shared catalog and the
 * coach's own exercises / foods, searched and paged on the server. A row is either `shared` (a
 * catalog card — used in a plan directly, as a snapshot copy) or `own` (the coach's item, with its
 * library link; `customized` when it is their version of a catalog item).
 */
type Out = inferRouterOutputs<AppRouter>['library'];
type In = inferRouterInputs<AppRouter>['library'];

export type LibraryExerciseRow = Out['exercises']['list']['items'][number];
export type LibraryFoodRow = Out['foods']['list']['items'][number];
export type LibraryExerciseQuery = In['exercises']['list'];
export type LibraryFoodQuery = In['foods']['list'];
export type LibraryScope = NonNullable<LibraryExerciseQuery['scope']>;

export const listLibraryExercises = (input: LibraryExerciseQuery) => trpc.library.exercises.list.query(input);
export const listLibraryFoods = (input: LibraryFoodQuery) => trpc.library.foods.list.query(input);
export const setLibraryFavorite = (kind: 'exercise' | 'food', id: string, on: boolean) => trpc.library.favorites.set.mutate({ kind, id, on });

export { LIBRARY_KEY } from './libraryKeys';
