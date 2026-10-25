import { lazy, Suspense, type ComponentProps } from 'react';
import { LoadingState } from '@/components/ui/LoadingState';

/**
 * B4.3 — the food library list loads when the nutrition editor's food sheet opens, not with the
 * editor (bundle budget, `scripts/bundle-budgets.json`). The service worker precaches the chunk.
 */
const FoodBrowser = lazy(() => import('./LibraryFoodBrowser').then((m) => ({ default: m.LibraryFoodBrowser })));

export function LazyLibraryFoodBrowser(props: ComponentProps<typeof FoodBrowser>) {
  return (
    <Suspense fallback={<LoadingState count={3} />}>
      <FoodBrowser {...props} />
    </Suspense>
  );
}
