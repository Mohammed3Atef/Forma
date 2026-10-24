import { useEffect, useRef, useState } from 'react';
import { parseNumber } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { SearchField } from '@/components/ui/Field';
import { searchFoods, type FoodSearchResult } from '@/services/platform/foodSearchApi';
import { nutrientsFor } from '@/lib/catalogNutrition';
import type { FoodProvenance } from '@/types';

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 400;

/**
 * Search wger's public food database and pick a result — a third option
 * alongside "type manually" / "pick from your library" in the food-entry
 * flows (`CoachNutritionEditor.tsx`, `Nutrition.tsx`). Picking a result
 * pre-fills the caller's own manual form via `onPick` (still fully editable,
 * still saved as an independent snapshot — no live sync after that point).
 * Serving size defaults to the source's 100g basis; adjusting it live-scales
 * the previewed macros before the coach/client commits to a pick.
 *
 * B4 (FD-03 / FD-11): the values come from Open Food Facts (wger's ingredient feed is an ODbL
 * extract of it), so the list carries the ODbL notice with links, and a pick keeps that source on
 * the row it creates. Servings use the one shared calculation (`lib/catalogNutrition`).
 */
export function FoodSearchPicker({ onPick, language }: { onPick: (food: { name: string; quantity: string; calories: number; protein: number; carbs: number; fats: number; provenance: FoodProvenance }) => void; language?: 'en' | 'ar' }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [picked, setPicked] = useState<FoodSearchResult | null>(null);
  const [grams, setGrams] = useState('100');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) { setStatus('idle'); setResults([]); return; }
    setStatus('loading');
    timer.current = setTimeout(() => {
      searchFoods(q, language)
        .then((r) => { setResults(r); setStatus('ok'); })
        .catch(() => setStatus('error'));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [query, language]);

  const g = Math.max(0, parseNumber(grams) || 0);
  const per100g = picked ? { kcal: picked.sourceNutrition.calories, protein: picked.sourceNutrition.protein, carbs: picked.sourceNutrition.carbs, fat: picked.sourceNutrition.fats } : null;
  const serving = per100g ? nutrientsFor(per100g, g) : null;
  const scaled = serving ? { calories: serving.kcal, protein: serving.protein, carbs: serving.carbs, fats: serving.fat } : null;

  const commit = () => {
    if (!picked || !scaled || !per100g || !serving) return;
    onPick({
      name: picked.name,
      quantity: `${serving.grams} g`,
      ...scaled,
      provenance: {
        per100g,
        portion: { id: 'g', amount: serving.grams, grams: serving.grams },
        source: { provider: 'open-food-facts', license: 'ODbL-1.0', attribution: 'Contains data from Open Food Facts (via wger.de), available under the ODbL', url: `https://wger.de/en/nutrition/ingredient/${picked.sourceId}/view/` },
      },
    });
    setPicked(null);
    setQuery('');
    setResults([]);
  };

  if (picked) {
    return (
      <div className="space-y-2 rounded-xl border border-line-soft p-3" data-testid="food-search-preview">
        <p className="text-sm font-medium">{picked.name}</p>
        <div className="flex items-center gap-2">
          <label className="label">{t('coachEditor.quantity')}</label>
          <input className="input w-24" inputMode="numeric" data-testid="food-search-grams" value={grams} onChange={(e) => setGrams(e.target.value)} />
          <span className="text-[13px] text-earth-subtle">g</span>
        </div>
        {scaled && (
          <p className="text-[12px] text-earth-subtle" dir="ltr">
            {scaled.calories} kcal · P{scaled.protein} C{scaled.carbs} F{scaled.fats}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-tonal btn-sm flex-1" onClick={() => setPicked(null)}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary btn-sm flex-1" data-testid="food-search-use" onClick={commit}>{t('coachEditor.useThis')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="food-search-picker">
      <SearchField
        aria-label={t('coachEditor.searchFoodDatabase')}
        placeholder={t('coachEditor.searchFoodDatabase')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {status === 'loading' && <p className="py-3 text-center text-[13px] text-earth-muted">{t('auth.working')}</p>}
      {status === 'error' && <p className="py-3 text-center text-[13px] text-danger">{t('coachEditor.foodSearchError')}</p>}
      {status === 'ok' && results.length === 0 && <p className="py-3 text-center text-[13px] text-earth-muted">{t('catalog.foods.noResults')}</p>}
      {status === 'ok' && results.length > 0 && (
        <>
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {results.map((r) => (
              <button key={r.id} type="button" data-testid="food-search-result" className="row w-full text-start" onClick={() => { setPicked(r); setGrams('100'); }}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-[12px] text-earth-subtle" dir="ltr">{r.quantity} · {r.calories} kcal · P{r.protein} C{r.carbs} F{r.fats}</span>
                </span>
                <Icon name="plus" size={16} className="text-brand" />
              </button>
            ))}
          </div>
          <p className="text-center text-[12px] text-earth-subtle" data-testid="off-attribution">
            {t('catalog.off.attribution')}{' '}
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="underline">
              Open Food Facts
            </a>{' '}
            ·{' '}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer" className="underline">
              ODbL
            </a>
          </p>
        </>
      )}
    </div>
  );
}
