import { lazy, Suspense, type ComponentProps } from 'react';
import { LoadingState } from '@/components/ui/LoadingState';

/**
 * B4 — the catalog UI loads on first use, not with the plan editors: the catalog is off in
 * production until the owner enables it, and a coach who never opens the Forma library downloads
 * none of it (bundle budgets, `scripts/bundle-budgets.json`). The service worker precaches these
 * chunks like every other, so they still open offline.
 */
const Browser = lazy(() => import('./CatalogExerciseBrowser').then((m) => ({ default: m.CatalogExerciseBrowser })));
const Preview = lazy(() => import('./CatalogExercisePreview').then((m) => ({ default: m.CatalogExercisePreview })));
const FoodPicker = lazy(() => import('./CatalogFoodPicker').then((m) => ({ default: m.CatalogFoodPicker })));
const Serving = lazy(() => import('./CatalogFoodPicker').then((m) => ({ default: m.ServingEditor })));

export function LazyCatalogExerciseBrowser(props: ComponentProps<typeof Browser>) {
  return (
    <Suspense fallback={<LoadingState count={3} />}>
      <Browser {...props} />
    </Suspense>
  );
}

export function LazyCatalogExercisePreview(props: ComponentProps<typeof Preview>) {
  return (
    <Suspense fallback={<LoadingState count={2} />}>
      <Preview {...props} />
    </Suspense>
  );
}

export function LazyCatalogFoodPicker(props: ComponentProps<typeof FoodPicker>) {
  return (
    <Suspense fallback={<LoadingState count={2} />}>
      <FoodPicker {...props} />
    </Suspense>
  );
}

export function LazyServingEditor(props: ComponentProps<typeof Serving>) {
  return (
    <Suspense fallback={<LoadingState count={1} />}>
      <Serving {...props} />
    </Suspense>
  );
}
