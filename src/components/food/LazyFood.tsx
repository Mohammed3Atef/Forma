import { lazy, Suspense, type ComponentProps } from 'react';
import { LoadingState } from '@/components/ui/LoadingState';

/**
 * B4.1 — food-sheet tools load when a food sheet opens, not with the screen behind it: the photo
 * editor (with its on-device photo preparation) and the Open Food Facts search. Same rule as
 * `catalog/LazyCatalog` (bundle budgets, `scripts/bundle-budgets.json`); the service worker
 * precaches these chunks, so they still open offline.
 */
const ImageEditor = lazy(() => import('./FoodImageEditor').then((m) => ({ default: m.FoodImageEditor })));
const OffSearch = lazy(() => import('@/components/workout/FoodSearchPicker').then((m) => ({ default: m.FoodSearchPicker })));

export function LazyFoodImageEditor(props: ComponentProps<typeof ImageEditor>) {
  return (
    <Suspense fallback={<LoadingState count={1} />}>
      <ImageEditor {...props} />
    </Suspense>
  );
}

export function LazyFoodSearchPicker(props: ComponentProps<typeof OffSearch>) {
  return (
    <Suspense fallback={<LoadingState count={1} />}>
      <OffSearch {...props} />
    </Suspense>
  );
}
