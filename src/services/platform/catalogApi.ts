import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../api/_trpc/router';
import { trpc } from '@/services/trpc';

/**
 * B4 — the curated Forma catalog (exercises + foods), read-only. Full items are fetched only for
 * what is opened or picked; food search returns at most 50 light cards — a session never downloads
 * the catalog (the coach's exercise / food lists are `libraryApi`). `meta` (vocabulary, versions)
 * is static per deploy: cache it for an hour.
 */
type Out = inferRouterOutputs<AppRouter>['catalog'];
type In = inferRouterInputs<AppRouter>['catalog'];

export type CatalogMeta = Out['meta'];
export type CatalogTaxonomy = CatalogMeta['taxonomy'];
export type CatalogExercise = Out['exercises']['get'];
export type CatalogFood = Out['foods']['get'];
export type CatalogFoodCard = Out['foods']['search']['items'][number];
export type CatalogFoodQuery = In['foods']['search'];

export const catalogMetaQuery = () => ({
  queryKey: ['catalog', 'meta'] as const,
  queryFn: () => trpc.catalog.meta.query(),
  staleTime: 60 * 60_000,
  gcTime: 24 * 60 * 60_000,
});

export const getCatalogExercise = (id: string) => trpc.catalog.exercises.get.query({ id });
export const getCatalogExercises = (ids: string[]) => trpc.catalog.exercises.full.query({ ids });
export const searchCatalogFoods = (input: CatalogFoodQuery) => trpc.catalog.foods.search.query(input);
export const getCatalogFood = (id: string) => trpc.catalog.foods.get.query({ id });
