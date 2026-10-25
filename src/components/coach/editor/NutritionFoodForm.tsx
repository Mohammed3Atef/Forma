import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { Switch } from '@/components/ui/Switch';
import { LazyFoodImageEditor, LazyFoodSearchPicker } from '@/components/food/LazyFood';
import { LazyServingChooser, LazyServingEditor } from '@/components/catalog/LazyCatalog';
import { LazyLibraryFoodBrowser } from '@/components/library/LazyLibrary';
import { useCatalogMeta } from '@/hooks/useCatalog';
import { isEstimate, provenanceOf } from '@/lib/catalogText';
import { MACRO_KEYS, type MacroKey } from '@/lib/nutritionPlanModel';
import { secondLanguageStale } from '@/lib/localizedText';
import type { LibraryFoodRow } from '@/services/platform/libraryApi';
import type { FoodGroup, FoodImageRef, FoodItem, FoodProvenance, LocalizedText } from '@/types';

/** The food sheet's working copy of one plan item (the editor applies it with `applyFoodEdit`). */
export interface FoodForm {
  mealId: string;
  orig: FoodItem | null;
  id: string;
  name: string;
  nameOrig: LocalizedText | null;
  nameAr: string;
  nameArTouched: boolean;
  quantity: string;
  macros: Record<MacroKey, number | null>;
  groupId: string | null;
  groupTouched: boolean;
  allowCustom: boolean;
  /** B4: where the numbers come from (catalog / Open Food Facts serving), or null when typed by hand. */
  provenance: FoodProvenance | null;
  provTouched: boolean;
  /** The coach typed a value over catalog / source numbers — shown, so the change is never silent. */
  clearedByHand: boolean;
  /** B4.1: the item's picture (a copy), whether it changed, and the Forma picture offered for it. */
  image: FoodImageRef | null;
  imageTouched: boolean;
  formaImage: FoodImageRef | null;
}

/**
 * The nutrition editor's food sheet (B3.5; B4.3): pick from the ONE food library (Forma's foods with
 * a serving, or the coach's own) or Open Food Facts, or type it — then the serving, the numbers with
 * where they came from, the picture, swaps. Its own chunk: it loads when a food is opened, not with
 * the editor (bundle budget).
 */
export default function NutritionFoodForm({
  food,
  setFood,
  groups,
  onApply,
}: {
  food: FoodForm;
  setFood: React.Dispatch<React.SetStateAction<FoodForm | null>>;
  groups: FoodGroup[];
  onApply: () => void;
}) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const catalog = useCatalogMeta();
  // A Forma food waiting for its serving (the list stays behind it).
  const [serving, setServing] = useState<Extract<LibraryFoodRow, { kind: 'shared' }> | null>(null);

  return (
    <div className="space-y-4" data-testid="food-form">
      {catalog.taxonomy && (
        <div role="group" aria-labelledby="food-library-label" data-testid="food-library-picker">
          <p className="label mb-1.5 block" id="food-library-label">
            {t('coachEditor.chooseFood')}
          </p>
          {serving ? (
            <LazyServingChooser
              card={serving.card}
              taxonomy={catalog.taxonomy}
              testId="food-catalog"
              onBack={() => setServing(null)}
              onPick={(p) => {
                setServing(null);
                setFood({ ...food, name: p.name.en, nameOrig: p.name, nameAr: p.name.ar, nameArTouched: false, quantity: p.quantity, macros: p.macros, provenance: p.provenance, provTouched: true, clearedByHand: false, image: p.image, imageTouched: true, formaImage: p.image });
              }}
            />
          ) : (
            <LazyLibraryFoodBrowser
              taxonomy={catalog.taxonomy}
              compact
              testId="food-library"
              onOpen={(r) => {
                if (r.kind === 'shared') return setServing(r);
                const f = r.food;
                setFood({ ...food, name: f.name.en, nameOrig: f.name, nameAr: f.name.ar ?? '', nameArTouched: false, quantity: f.quantity, macros: { calories: f.calories, protein: f.protein, carbs: f.carbs, fats: f.fats }, provenance: provenanceOf(f), provTouched: true, clearedByHand: false, image: f.image ?? null, imageTouched: true, formaImage: f.image?.source === 'forma-catalog' ? f.image : null });
              }}
            />
          )}
        </div>
      )}
      <div role="group" aria-labelledby="food-database-label">
        <p className="label mb-1.5 block" id="food-database-label">
          {t('coachEditor.searchFoodDatabase')}
        </p>
        <LazyFoodSearchPicker onPick={(f) => setFood({ ...food, name: f.name, nameOrig: null, nameAr: '', nameArTouched: false, quantity: f.quantity, macros: { calories: f.calories, protein: f.protein, carbs: f.carbs, fats: f.fats }, provenance: f.provenance, provTouched: true, clearedByHand: false, image: null, imageTouched: true, formaImage: null })} />
      </div>
      <div className="h-px bg-line-soft" />
      <TextInput label={t('field.name')} data-testid="food-name" placeholder={t('coachEditor.foodName')} value={food.name} onChange={(e) => setFood({ ...food, name: e.target.value })} />
      <SecondLanguageField lang="ar" testId="food-name-ar" value={food.nameAr} onChange={(v) => setFood({ ...food, nameAr: v, nameArTouched: true })} stale={!food.nameArTouched && secondLanguageStale(food.nameOrig, food.name, 'en')} />
      {/* An upload finishes later: the update is functional, so typing meanwhile is kept. */}
      <LazyFoodImageEditor value={food.image} formaImage={food.formaImage} name={{ en: food.name, ar: food.nameAr }} testId="food-image" onChange={(image) => setFood((cur) => (cur ? { ...cur, image, imageTouched: true } : cur))} />
      {food.provenance?.per100g ? (
        <div className="space-y-2 rounded-ui-control border border-line-soft p-3" data-testid="food-serving">
          <p className="text-[12.5px] text-earth-muted">
            {food.provenance.source?.provider === 'open-food-facts' ? t('catalog.off.attribution') : t('catalog.foods.fromForma')}
            {isEstimate(food.provenance) && <span className="pill ms-2">{t('catalog.foods.estimate')}</span>}
          </p>
          {food.provenance.sourceNote && <p className="text-[12px] text-earth-subtle">{ar ? food.provenance.sourceNote.ar : food.provenance.sourceNote.en}</p>}
          <LazyServingEditor
            key={food.id + (food.provenance.catalogId ?? '')}
            provenance={food.provenance}
            testId="food-serving-editor"
            onChange={(r) => setFood({ ...food, quantity: r.quantity, macros: r.macros, provenance: r.provenance, provTouched: true, clearedByHand: false })}
          />
        </div>
      ) : (
        <TextInput label={t('field.quantity')} data-testid="food-quantity" placeholder={t('coachEditor.quantity')} value={food.quantity} onChange={(e) => setFood({ ...food, quantity: e.target.value })} />
      )}
      <div className="grid grid-cols-2 gap-3">
        {MACRO_KEYS.map((k) => (
          <NumericField
            key={k}
            label={k === 'calories' ? t('coachEditor.caloriesKcal') : t('coachEditor.macroGrams', { name: t(`nutrition.${k}`) })}
            testId={`food-${k}`}
            min={0}
            max={k === 'calories' ? 10000 : 1000}
            value={food.macros[k]}
            // A typed value makes the row the coach's own: the catalog / source claim is dropped.
            onChange={(v) => setFood({ ...food, macros: { ...food.macros, [k]: v }, ...(food.provenance ? { provenance: null, provTouched: true, clearedByHand: true } : {}) })}
          />
        ))}
      </div>
      {food.clearedByHand && (
        <p className="text-[12px] text-earth-subtle" data-testid="food-by-hand">
          {t('catalog.foods.byHand')}
        </p>
      )}
      <div>
        <p className="label mb-1.5 block" id="meal-allowed-group-label">
          {t('nutritionSub.approvedAlternatives')}
        </p>
        <div className="flex flex-wrap gap-2" data-testid="meal-allowed-group" role="group" aria-labelledby="meal-allowed-group-label">
          <button type="button" className={`chip ${!food.groupId ? 'chip-on' : ''}`} aria-pressed={!food.groupId} onClick={() => setFood({ ...food, groupId: null, groupTouched: true })}>
            {t('nutritionSub.noGroup')}
          </button>
          {groups.map((g) => (
            <button key={g.id} type="button" data-testid={`group-opt-${g.id}`} aria-pressed={food.groupId === g.id} className={`chip ${food.groupId === g.id ? 'chip-on' : ''}`} onClick={() => setFood({ ...food, groupId: g.id, groupTouched: true })}>
              {g.name}
            </button>
          ))}
          {food.groupId && !food.groupTouched && !groups.some((g) => g.id === food.groupId) && (
            <span className="chip chip-on" title={t('coachEditor.groupKept')}>
              {t('coachEditor.groupKeptShort', { n: food.orig?.allowedAlternatives?.length ?? 0 })}
            </span>
          )}
        </div>
        {groups.length === 0 && <p className="mt-1 text-[12px] text-earth-subtle">{t('coachFoods.noGroups')}</p>}
      </div>
      <div className="flex min-h-ui-hit items-center gap-3">
        <span className="min-w-0 flex-1 text-[13.5px]">{t('coachSettings.allowCustomFoods')}</span>
        <Switch on={food.allowCustom} label={t('coachSettings.allowCustomFoods')} testId="food-allow-custom" onChange={() => setFood({ ...food, allowCustom: !food.allowCustom })} />
      </div>
      <Button data-testid="food-save" fullWidth disabled={!food.name.trim() && !food.nameAr.trim()} onClick={onApply}>
        {t('coachEditor.applyFood')}
      </Button>
    </div>
  );
}
