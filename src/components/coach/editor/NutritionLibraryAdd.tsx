import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LibraryAddPrompt } from './LibraryAddPrompt';
import { addLibraryFood, mealTargets } from '@/lib/foodHandoff';
import { foodForPlan } from '@/lib/foodUse';
import { generatedMealLabel } from '@/lib/nutritionPlanModel';
import { uid } from '@/lib/utils';
import type { LocalizedText, MealPlan, MealSlot } from '@/types';

const notFound = (e: unknown) => (e as { data?: { code?: string } } | null)?.data?.code === 'NOT_FOUND';

/**
 * B3.7 "Use in a client plan" in the nutrition editor: the food handed over from the Library (a
 * Forma food or the coach's own — B4.3), added once the coach picks the meal, as an unsaved change
 * (Save keeps it, as always). Its own chunk: only a hand-off loads it.
 */
export default function NutritionLibraryAdd({
  coachId,
  foodId,
  clientName,
  plan,
  onAdd,
  onDone,
  show,
}: {
  coachId: string;
  foodId: string;
  clientName: string;
  plan: MealPlan;
  /** The plan's meals after the add, and the meal it went to. */
  onAdd: (meals: MealPlan['meals'], mealId: string) => void;
  onDone: () => void;
  show: (l: LocalizedText | undefined, fallback?: string) => string;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['foodForPlan', coachId, foodId],
    queryFn: () => foodForPlan(coachId, foodId),
    enabled: !!coachId,
    retry: (n, e) => !notFound(e) && n < 2,
    staleTime: Infinity,
  });
  const picked = q.data ?? null;
  return (
    <LibraryAddPrompt
      open={q.isSuccess || q.isError}
      testId="library-add"
      title={picked ? t('library.add.foodTitle', { name: show(picked.name, t('coachEditor.untitledFood')) }) : t('library.use.action')}
      hint={t('library.add.foodHint', { name: clientName })}
      newLabel={t('library.add.newMeal')}
      missing={q.isError ? t(notFound(q.error) ? 'library.add.foodMissing' : 'library.add.loadFailed') : null}
      targets={mealTargets(plan).map((m) => ({ key: m.mealId, title: <bdi>{show(m.label, t('coachEditor.meal'))}</bdi>, meta: t('library.add.foodsInMeal', { count: m.count }) }))}
      onCancel={onDone}
      onPick={(key) => {
        if (!picked) return;
        const target = key ? { mealId: key } : { newMeal: { id: uid('meal'), slot: 'breakfast' as MealSlot, label: generatedMealLabel(plan.meals.length + 1) } };
        const res = addLibraryFood(plan, target, picked.food, () => uid('food'));
        onAdd(res.plan.meals, res.mealId);
        onDone();
      }}
    />
  );
}
