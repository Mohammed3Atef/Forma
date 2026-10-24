import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../api/_trpc/router';
import { trpc } from '@/services/trpc';

/**
 * B4 — the curated Forma catalog (exercises + foods), read-only. Search happens on the server and
 * returns at most 50 light cards per request; full items are fetched only for what is opened or
 * picked — a session never downloads the catalog. `meta` (vocabulary, versions, whether the
 * catalog is on here) is static per deploy: cache it for an hour.
 */
type Out = inferRouterOutputs<AppRouter>['catalog'];
type In = inferRouterInputs<AppRouter>['catalog'];

export type CatalogMeta = Out['meta'];
export type CatalogTaxonomy = Extract<CatalogMeta, { enabled: true }>['taxonomy'];
export type CatalogExercise = Out['exercises']['get'];
export type CatalogExerciseCard = Out['exercises']['search']['items'][number];
export type CatalogFood = Out['foods']['get'];
export type CatalogFoodCard = Out['foods']['search']['items'][number];
export type CatalogExerciseQuery = In['exercises']['search'];
export type CatalogFoodQuery = In['foods']['search'];

export const catalogMetaQuery = () => ({
  queryKey: ['catalog', 'meta'] as const,
  queryFn: () => trpc.catalog.meta.query(),
  staleTime: 60 * 60_000,
  gcTime: 24 * 60 * 60_000,
});

export const searchCatalogExercises = (input: CatalogExerciseQuery) => trpc.catalog.exercises.search.query(input);
export const getCatalogExercise = (id: string) => trpc.catalog.exercises.get.query({ id });
export const getCatalogExercises = (ids: string[]) => trpc.catalog.exercises.full.query({ ids });
export const catalogExerciseCards = (ids: string[]) => trpc.catalog.exercises.byIds.query({ ids });
export const searchCatalogFoods = (input: CatalogFoodQuery) => trpc.catalog.foods.search.query(input);
export const getCatalogFood = (id: string) => trpc.catalog.foods.get.query({ id });
