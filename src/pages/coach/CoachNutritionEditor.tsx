import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlanEditorGate } from '@/components/coach/PlanEditorStates';
import { PlanEditorShell } from '@/components/coach/editor/PlanEditorShell';
import { PlanHistorySheet } from '@/components/coach/editor/PlanHistorySheet';
import { useHistoryParam } from '@/components/coach/editor/useHistoryParam';
import { LibraryAddPrompt } from '@/components/coach/editor/LibraryAddPrompt';
import { ClientContextPanel } from '@/components/coach/ClientContextPanel';
import { usePlanEditor } from '@/hooks/usePlanEditor';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SearchField, SelectField, TextAreaField, TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { Switch } from '@/components/ui/Switch';
import { FoodSearchPicker } from '@/components/workout/FoodSearchPicker';
import { useSession } from '@/services/auth/sessionStore';
import { useCoachClientHeader } from '@/hooks/useCoachClientHeader';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useBack } from '@/hooks/useBack';
import { useHandoffParam } from '@/hooks/useHandoffParam';
import { ADD_FOOD_PARAM, addLibraryFood, mealTargets } from '@/lib/libraryHandoff';
import { uid } from '@/lib/utils';
import { move } from '@/lib/workoutPlanModel';
import { MACRO_KEYS, applyFoodEdit, cleanNotes, generatedMealLabel, mealCalories, normalizeMealPlan, plannedTotals, typeMealLabel, type MacroKey } from '@/lib/nutritionPlanModel';
import { applyLocalizedEdit, secondLanguageStale, setLocalized, typeLocalized } from '@/lib/localizedText';
import { getClientMealPlan, saveClientMealPlan } from '@/services/platform/planApi';
import { listFoodGroups, listFoods, listSupplements } from '@/services/platform/coachAssetsApi';
import { confirmDelete, confirmDialog } from '@/stores/dialogStore';
import type { FoodItem, LocalizedText, Meal, MealPlan, MealSlot, SubstitutionPolicy, Supplement } from '@/types';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'postWorkout'];
// B3.9 (CO-19, owner D6): no "flag swaps for review" switch — nothing anywhere could review them.
const POLICY_KEYS = ['allowClientSubstitutions', 'allowCustomFoods'] as const;
const DEFAULT_POLICY: SubstitutionPolicy = { allowClientSubstitutions: false, allowCustomFoods: false };

function emptyPlan(): MealPlan {
  return { id: uid('mplan'), name: '', meals: [], targets: { calories: 0, protein: 0, carbs: 0, fats: 0 }, supplements: [], waterTargetMl: 0, beverageNotes: [], generalNotes: [], updatedAt: Date.now() };
}
const trimText = (l: LocalizedText): LocalizedText => ({ ...l, en: l.en.trim(), ar: (l.ar ?? '').trim() });
/** Stored shape: typed labels / notes trimmed, blank note rows not saved (the client would see empty notes). */
function serializeMealPlan(p: MealPlan): MealPlan {
  return {
    ...p,
    meals: p.meals.map((m) => (m.label.en !== m.label.en.trim() || (m.label.ar ?? '') !== (m.label.ar ?? '').trim() ? { ...m, label: trimText(m.label) } : m)),
    ...(p.generalNotes ? { generalNotes: cleanNotes(p.generalNotes).map(trimText) } : {}),
    ...(p.beverageNotes ? { beverageNotes: cleanNotes(p.beverageNotes).map(trimText) } : {}),
  };
}

interface FoodForm {
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
}
interface SuppForm {
  orig: Supplement | null;
  name: string;
  dose: string;
  doseAr: string;
  doseArTouched: boolean;
  doseOrig: LocalizedText | null;
  timing: string;
  timingAr: string;
  timingArTouched: boolean;
  timingOrig: LocalizedText | null;
}

/**
 * A client's nutrition plan (B3.5, blueprint §6.4 — CO-12, TB-03, B3-C03 / C04 / C05): targets
 * first with planned vs target as four rows; meals collapsed to name + kcal; bilingual meal labels,
 * supplement dose / timing and client notes (general + beverage, O-10); foods, meals and supplements
 * reorderable, deletes confirmed; substitution policy kept. Every untouched field is preserved
 * (`lib/nutritionPlanModel`). Load gate, compare-and-set, drafts and guards as the other editors.
 */
export function CoachNutritionEditor() {
  const { t, i18n } = useTranslation();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const client = useCoachClientHeader(clientId);
  const isDesktop = useIsDesktop();
  const ed = usePlanEditor<MealPlan>({
    queryKey: 'clientMealPlan',
    clientId,
    draftKey: `nutritionDraft:${coachId}:${clientId}`,
    load: getClientMealPlan,
    save: saveClientMealPlan,
    empty: emptyPlan,
    normalize: normalizeMealPlan,
    serialize: serializeMealPlan,
  });
  const { plan, setPlan, dirty, save } = ed;
  const groups = useQuery({ queryKey: ['foodGroups', coachId], queryFn: () => listFoodGroups(coachId), enabled: !!coachId });
  const lib = useQuery({ queryKey: ['foods', coachId], queryFn: () => listFoods(coachId), enabled: !!coachId });
  // B3.7 "Use in a client plan": a food handed over from the Library, added only once the coach picks
  // the meal — as an unsaved change (Save keeps it, as always).
  const [addFoodId, clearAddFood] = useHandoffParam(ADD_FOOD_PARAM);
  const addFood = addFoodId ? lib.data?.find((f) => f.id === addFoodId) ?? null : null;
  const suppLib = useQuery({ queryKey: ['supplements', coachId], queryFn: () => listSupplements(coachId), enabled: !!coachId });
  // Meals are collapsed to name + kcal; the first one starts open (`undefined` = not chosen yet).
  const [openMealChoice, setOpenMealId] = useState<string | null | undefined>(undefined);
  const [food, setFood] = useState<FoodForm | null>(null);
  const [supp, setSupp] = useState<SuppForm | null>(null);
  const [pick, setPick] = useState('');
  const [history, setHistory] = useHistoryParam(); // B3.9 (D10): ?history=1 opens it
  useUnsavedGuard(dirty, { title: t('coachEditor.unsavedTitle'), body: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave') }, ed.discardDraft);
  const exit = useBack(`/coach/client/${clientId}/plan`, ed.discardDraft);
  const ar = i18n.language.startsWith('ar');
  const show = (l: LocalizedText | undefined, fallback = '') => (ar && l?.ar?.trim() ? l.ar : l?.en || l?.ar || fallback);

  const title = t('coachEditor.nutritionTitle');
  if (!plan) {
    return (
      <PlanEditorShell testId="coach-nutrition-editor" prefix="nutrition" title={title} subtitle={client.name} onBack={exit}>
        {ed.status !== 'ready' && <PlanEditorGate status={ed.status} kind="nutrition" onRetry={ed.retry} onCreate={ed.startNew} />}
      </PlanEditorShell>
    );
  }

  const openMealId = openMealChoice === undefined ? plan.meals[0]?.id ?? null : openMealChoice;
  const policy = { ...DEFAULT_POLICY, ...(plan.substitutionPolicy ?? {}) };
  const { planned, incomplete } = plannedTotals(plan);
  const patchMeal = (mealId: string, patch: Partial<Meal>) => setPlan((p) => ({ ...p, meals: p.meals.map((m) => (m.id === mealId ? { ...m, ...patch } : m)) }));
  const patchItems = (mealId: string, fn: (items: FoodItem[]) => FoodItem[]) => setPlan((p) => ({ ...p, meals: p.meals.map((m) => (m.id === mealId ? { ...m, items: fn(m.items) } : m)) }));

  // ---- meals ----
  const addMeal = () => {
    const m: Meal = { id: uid('meal'), slot: 'breakfast', label: generatedMealLabel(plan.meals.length + 1), items: [] };
    setPlan((p) => ({ ...p, meals: [...p.meals, m] }));
    setOpenMealId(m.id);
  };
  const removeMeal = async (m: Meal) => {
    if (!(await confirmDialog({ title: t('coachEditor.removeMeal'), message: t('coachEditor.removeMealBody', { name: show(m.label, t('coachEditor.meal')) }), danger: true, confirmLabel: t('common.delete') }))) return;
    setPlan((p) => ({ ...p, meals: p.meals.filter((x) => x.id !== m.id) }));
  };
  const moveMeal = (i: number, dir: -1 | 1) => setPlan((p) => ({ ...p, meals: move(p.meals, i, dir) }));

  // ---- foods ----
  const openFood = (mealId: string, f: FoodItem | null) =>
    setFood({
      mealId,
      orig: f,
      id: f?.id ?? uid('food'),
      name: f?.name.en ?? '',
      nameOrig: f?.name ?? null,
      nameAr: f?.name.ar ?? '',
      nameArTouched: false,
      quantity: f?.quantity ?? '',
      macros: { calories: f?.calories ?? null, protein: f?.protein ?? null, carbs: f?.carbs ?? null, fats: f?.fats ?? null },
      groupId: f?.allowedAlternativeGroupId ?? null,
      groupTouched: false,
      allowCustom: !!f?.allowCustomSubstitution,
    });
  const saveFood = () => {
    if (!food) return;
    const name = food.nameArTouched ? setLocalized(food.name, food.nameAr) : applyLocalizedEdit(food.nameOrig, food.name, 'en');
    const grp = food.groupTouched ? (food.groupId ? (groups.data ?? []).find((g) => g.id === food.groupId) ?? null : null) : undefined;
    const item = applyFoodEdit(
      food.orig,
      food.id,
      {
        name,
        quantity: food.quantity,
        calories: food.macros.calories ?? 0,
        protein: food.macros.protein ?? 0,
        carbs: food.macros.carbs ?? 0,
        fats: food.macros.fats ?? 0,
        group: grp === undefined ? undefined : grp ? { id: grp.id, foods: grp.foods } : null,
        allowCustom: food.allowCustom,
      },
      () => uid('food'),
    );
    patchItems(food.mealId, (items) => (items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]));
    setFood(null);
    setPick('');
  };
  const removeFood = async (mealId: string, f: FoodItem) => {
    if (!(await confirmDelete(show(f.name, t('coachEditor.untitledFood'))))) return;
    patchItems(mealId, (items) => items.filter((i) => i.id !== f.id));
  };

  // ---- supplements ----
  const openSupp = (s: Supplement | null) =>
    setSupp({
      orig: s,
      name: s?.name ?? '',
      dose: s?.dose.en ?? '',
      doseAr: s?.dose.ar ?? '',
      doseArTouched: false,
      doseOrig: s?.dose ?? null,
      timing: s?.timing?.en ?? '',
      timingAr: s?.timing?.ar ?? '',
      timingArTouched: false,
      timingOrig: s?.timing ?? null,
    });
  const saveSupp = () => {
    if (!supp) return;
    const dose = supp.doseArTouched ? setLocalized(supp.dose, supp.doseAr) : applyLocalizedEdit(supp.doseOrig, supp.dose, 'en');
    const timing = supp.timingArTouched ? setLocalized(supp.timing, supp.timingAr) : applyLocalizedEdit(supp.timingOrig, supp.timing, 'en');
    const base: Supplement = supp.orig ? { ...supp.orig } : { id: uid('supp'), name: '', dose: { en: '', ar: '' } };
    const s: Supplement = { ...base, name: supp.name.trim(), dose };
    if (timing.en.trim() || (timing.ar ?? '').trim()) s.timing = timing;
    else delete s.timing;
    setPlan((p) => ({ ...p, supplements: p.supplements.some((x) => x.id === s.id) ? p.supplements.map((x) => (x.id === s.id ? s : x)) : [...p.supplements, s] }));
    setSupp(null);
  };
  const removeSupp = async (s: Supplement) => {
    if (!(await confirmDelete(s.name || t('coachEditor.untitledSupp')))) return;
    setPlan((p) => ({ ...p, supplements: p.supplements.filter((x) => x.id !== s.id) }));
  };

  // ---- pieces ----
  const card = (heading: string, children: ReactNode, testId?: string, extra?: ReactNode) => (
    <section className="rounded-ui-surface border border-line-soft bg-surface-card p-4" data-testid={testId}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold">{heading}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
  const macroLine = (f: Pick<FoodItem, 'calories' | 'protein' | 'carbs' | 'fats'>) => t('coachEditor.macroLine', { kcal: f.calories, p: f.protein, c: f.carbs, f: f.fats });

  const targets = card(
    t('coachEditor.dailyTargets'),
    <div className="grid grid-cols-2 gap-3">
      {MACRO_KEYS.map((k) => (
        <NumericField
          key={k}
          label={k === 'calories' ? t('coachEditor.caloriesKcal') : t('coachEditor.macroGrams', { name: t(`nutrition.${k}`) })}
          testId={`nutrition-target-${k}`}
          min={0}
          max={k === 'calories' ? 20000 : 2000}
          value={plan.targets[k] || null}
          onChange={(v) => setPlan((p) => ({ ...p, targets: { ...p.targets, [k]: v ?? 0 } }))}
        />
      ))}
      <div className="col-span-2">
        <NumericField label={t('coachEditor.waterTargetMl')} testId="nutrition-water-target" min={0} max={20000} step={250} value={plan.waterTargetMl || null} onChange={(v) => setPlan((p) => ({ ...p, waterTargetMl: v ?? 0 }))} />
      </div>
    </div>,
    'nutrition-targets',
  );

  const totals = card(
    t('coachEditor.plannedVsTarget'),
    <>
      <ul className="divide-y divide-line-soft" data-testid="nutrition-totals">
        {MACRO_KEYS.map((k) => {
          const target = plan.targets[k] || 0;
          const diff = Math.round(planned[k] - target);
          const tone = !target || diff === 0 ? 'text-earth-subtle' : diff > 0 ? 'text-warn' : 'text-info';
          const unit = k === 'calories' ? t('common.kcal') : t('coachEditor.gramsShort');
          return (
            <li key={k} className="flex items-baseline gap-3 py-2" data-testid={`nutrition-total-${k}`}>
              <span className="min-w-0 flex-1 text-[13.5px]">{t(`nutrition.${k}`)}</span>
              <bdi dir="ltr" className="tabular-nums text-[13.5px]">
                {Math.round(planned[k])} / {target} {unit}
              </bdi>
              <bdi dir="ltr" className={`w-16 text-end tabular-nums text-[13px] ${tone}`}>
                {target ? `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff)}` : '—'}
              </bdi>
            </li>
          );
        })}
      </ul>
      {incomplete > 0 && (
        <p className="mt-2 text-[12.5px] text-warn" data-testid="nutrition-incomplete-totals">
          {t('coachEditor.incompleteTotals', { n: incomplete })}
        </p>
      )}
    </>,
  );

  const policyCard = card(
    t('coachSettings.substitutions'),
    <ul className="space-y-1" data-testid="sub-policy">
      {POLICY_KEYS.map((k) => (
        <li key={k} className="flex min-h-ui-hit items-center gap-3">
          <span className="min-w-0 flex-1 text-[13.5px]">{t(`coachSettings.${k}`)}</span>
          <Switch on={!!policy[k]} label={t(`coachSettings.${k}`)} testId={`policy-${k}`} onChange={() => setPlan((p) => ({ ...p, substitutionPolicy: { ...policy, [k]: !policy[k] } }))} />
        </li>
      ))}
    </ul>,
  );

  const mealCard = (m: Meal, i: number) => {
    const open = openMealId === m.id;
    const label = show(m.label, t('coachEditor.meal'));
    return (
      <li key={m.id} className="rounded-ui-surface border border-line-soft bg-surface-card" data-testid="nutrition-meal" data-meal-id={m.id}>
        <div className="flex items-center gap-1 p-2">
          <button type="button" className="flex min-h-ui-hit min-w-0 flex-1 items-center gap-3 rounded-ui-control px-2 text-start hover:bg-surface-hover" aria-expanded={open} onClick={() => setOpenMealId(open ? null : m.id)} data-testid="nutrition-meal-toggle">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                <bdi>{label}</bdi>
              </span>
              <span className="block truncate text-[12.5px] text-earth-subtle">
                {t(`coachEditor.slots.${m.slot}`)} · {t('coachEditor.foodsCount', { count: m.items.length })} · <bdi dir="ltr">{mealCalories(m.items)} {t('common.kcal')}</bdi>
              </span>
            </span>
            <Icon name="chevronDown" size={18} className={`shrink-0 text-earth-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          <ActionMenu
            label={t('coachEditor.mealActions', { name: label })}
            size="sm"
            testId="meal-menu"
            items={[
              { key: 'up', label: t('coachEditor.moveMealUp'), icon: 'arrowUp', disabled: i === 0, onSelect: () => moveMeal(i, -1) },
              { key: 'down', label: t('coachEditor.moveMealDown'), icon: 'arrowDown', disabled: i === plan.meals.length - 1, onSelect: () => moveMeal(i, 1) },
              { key: 'del', label: t('coachEditor.removeMeal'), icon: 'trash', danger: true, onSelect: () => void removeMeal(m) },
            ]}
          />
        </div>
        {open && (
          <div className="space-y-3 border-t border-line-soft p-3">
            {/* B3.9: at 1024–1279 the meals column is ~360 px — name and slot stack there (the name was ~120 px wide). */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="space-y-1">
                <TextInput label={t('coachEditor.mealLabel')} data-testid="meal-label" value={m.label.en} onChange={(e) => patchMeal(m.id, { label: typeMealLabel(m.label, e.target.value) })} />
                <SecondLanguageField lang="ar" testId="meal-label-ar" value={m.label.ar ?? ''} onChange={(v) => patchMeal(m.id, { label: { ...m.label, ar: v } })} />
              </div>
              <SelectField label={t('coachEditor.mealSlot')} data-testid="meal-slot" value={m.slot} onChange={(e) => patchMeal(m.id, { slot: e.target.value as MealSlot })}>
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`coachEditor.slots.${s}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            {m.items.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-earth-muted">{t('coachEditor.noFoodsYet')}</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {m.items.map((f, fi) => {
                  const name = show(f.name, t('coachEditor.untitledFood'));
                  return (
                    <li key={f.id} className="flex items-center gap-1 py-1.5" data-testid="nutrition-food-row">
                      <button type="button" className="flex min-h-ui-hit min-w-0 flex-1 flex-col justify-center rounded-ui-control px-1 text-start hover:bg-surface-hover" onClick={() => openFood(m.id, f)}>
                        <span className="block truncate font-medium">
                          <bdi>{name}</bdi>
                        </span>
                        <span className="block truncate text-[12.5px] text-earth-subtle">
                          {f.quantity ? (
                            <>
                              <bdi>{f.quantity}</bdi> ·{' '}
                            </>
                          ) : null}
                          <bdi dir={ar ? 'rtl' : 'ltr'}>{macroLine(f)}</bdi>
                        </span>
                      </button>
                      <IconButton icon="arrowUp" size="sm" label={t('coachEditor.moveFoodUp', { name })} disabled={fi === 0} onClick={() => patchItems(m.id, (items) => move(items, fi, -1))} className="border-transparent" />
                      <IconButton icon="arrowDown" size="sm" label={t('coachEditor.moveFoodDown', { name })} disabled={fi === m.items.length - 1} onClick={() => patchItems(m.id, (items) => move(items, fi, 1))} className="border-transparent" />
                      <IconButton icon="trash" size="sm" label={t('coachEditor.deleteFood', { name })} onClick={() => void removeFood(m.id, f)} className="border-transparent text-danger" />
                    </li>
                  );
                })}
              </ul>
            )}
            <Button variant="ghost" size="sm" icon="plus" data-testid="nutrition-add-food" fullWidth onClick={() => openFood(m.id, null)}>
              {t('nutrition.addFoodTo', { meal: show(m.label, t('coachEditor.meal')) })}
            </Button>
          </div>
        )}
      </li>
    );
  };

  const meals = card(
    t('coachEditor.meals'),
    <>
      {plan.meals.length === 0 ? <p className="py-3 text-center text-[13px] text-earth-muted">{t('coachEditor.noMealsYet')}</p> : <ul className="space-y-2">{plan.meals.map(mealCard)}</ul>}
      <Button variant="secondary" icon="plus" data-testid="nutrition-add-meal" fullWidth className="mt-3" onClick={addMeal}>
        {t('coachEditor.addMeal')}
      </Button>
    </>,
    'nutrition-meals',
  );

  const supplements = card(
    t('nutrition.supplements'),
    <>
      {plan.supplements.length === 0 ? (
        <p className="py-2 text-[13px] text-earth-muted">{t('coachEditor.noSupps')}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {plan.supplements.map((s, i) => {
            const name = s.name || t('coachEditor.untitledSupp');
            const sub = [show(s.dose), show(s.timing)].filter(Boolean).join(' · ');
            return (
              <li key={s.id} className="flex items-center gap-1 py-1.5" data-testid="nutrition-supp-row">
                <button type="button" className="flex min-h-ui-hit min-w-0 flex-1 flex-col justify-center rounded-ui-control px-1 text-start hover:bg-surface-hover" onClick={() => openSupp(s)}>
                  <span className="block truncate font-medium">
                    <bdi>{name}</bdi>
                  </span>
                  {sub && (
                    <span className="block truncate text-[12.5px] text-earth-subtle">
                      <bdi>{sub}</bdi>
                    </span>
                  )}
                </button>
                <IconButton icon="arrowUp" size="sm" label={t('coachEditor.moveSuppUp', { name })} disabled={i === 0} onClick={() => setPlan((p) => ({ ...p, supplements: move(p.supplements, i, -1) }))} className="border-transparent" />
                <IconButton icon="arrowDown" size="sm" label={t('coachEditor.moveSuppDown', { name })} disabled={i === plan.supplements.length - 1} onClick={() => setPlan((p) => ({ ...p, supplements: move(p.supplements, i, 1) }))} className="border-transparent" />
                <IconButton icon="trash" size="sm" label={t('coachEditor.deleteSupp', { name })} onClick={() => void removeSupp(s)} className="border-transparent text-danger" />
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="ghost" size="sm" icon="plus" data-testid="nutrition-add-supp" fullWidth className="mt-2" onClick={() => openSupp(null)}>
        {t('coachEditor.addSupp')}
      </Button>
    </>,
    'nutrition-supplements',
  );

  const notesList = (key: 'generalNotes' | 'beverageNotes', heading: string, hint: string) => {
    const list = plan[key] ?? [];
    const setList = (fn: (l: LocalizedText[]) => LocalizedText[]) => setPlan((p) => ({ ...p, [key]: fn(p[key] ?? []) }));
    return card(
      heading,
      <>
        <p className="-mt-1 mb-2 text-[12.5px] text-earth-subtle">{hint}</p>
        <ul className="space-y-3">
          {list.map((n, i) => (
            <li key={i} className="space-y-1 rounded-ui-control border border-line-soft p-2" data-testid={`${key}-item`}>
              <div className="flex items-start gap-1">
                <TextAreaField
                  label={t('coachEditor.noteN', { n: i + 1 })}
                  srOnlyLabel
                  fieldClassName="min-w-0 flex-1"
                  className="min-h-16"
                  data-testid={`${key}-en`}
                  value={n.en}
                  onChange={(e) => setList((l) => l.map((x, j) => (j === i ? typeLocalized(x, e.target.value, 'en') : x)))}
                  dir="auto"
                />
                <div className="flex shrink-0 flex-col">
                  <IconButton icon="arrowUp" size="sm" label={t('common.moveUp')} disabled={i === 0} onClick={() => setList((l) => move(l, i, -1))} className="border-transparent" />
                  <IconButton icon="arrowDown" size="sm" label={t('common.moveDown')} disabled={i === list.length - 1} onClick={() => setList((l) => move(l, i, 1))} className="border-transparent" />
                  <IconButton
                    icon="trash"
                    size="sm"
                    label={t('common.delete')}
                    className="border-transparent text-danger"
                    onClick={async () => {
                      if (!n.en.trim() && !(n.ar ?? '').trim()) return setList((l) => l.filter((_, j) => j !== i));
                      if (await confirmDelete(n.en || n.ar)) setList((l) => l.filter((_, j) => j !== i));
                    }}
                  />
                </div>
              </div>
              <SecondLanguageField lang="ar" multiline testId={`${key}-ar`} value={n.ar ?? ''} onChange={(v) => setList((l) => l.map((x, j) => (j === i ? { ...x, ar: v } : x)))} />
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" icon="plus" data-testid={`${key}-add`} fullWidth className="mt-2" onClick={() => setList((l) => [...l, { en: '', ar: '' }])}>
          {t('coachEditor.addNote')}
        </Button>
      </>,
      `nutrition-${key}`,
    );
  };

  const details = (
    <div className="space-y-3">
      <TextInput label={t('field.planName')} data-testid="nutrition-plan-name" value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} placeholder={t('coachEditor.planNamePlaceholder')} dir="auto" />
      <ClientContextPanel clientId={clientId} />
    </div>
  );
  const generalNotes = notesList('generalNotes', t('coachEditor.generalNotes'), t('coachEditor.generalNotesHint'));
  const beverageNotes = notesList('beverageNotes', t('coachEditor.beverageNotes'), t('coachEditor.beverageNotesHint'));

  return (
    <PlanEditorShell
      testId="coach-nutrition-editor"
      prefix="nutrition"
      title={title}
      subtitle={client.name}
      onBack={exit}
      state={{ saving: save.isPending, dirty, justSaved: ed.justSaved, conflict: ed.conflict, saveFailed: save.isError, canSave: ed.canSave && plan.name.trim().length > 0 }}
      onSave={() => save.mutate({})}
      conflict={{ onLoadLatest: () => void ed.reloadLatest(), onKeepMine: () => save.mutate({ overwrite: true }) }}
      draftRestored={ed.draftRestored}
      draftStale={ed.draftStale}
      onDiscardDraft={() => void ed.revertToSaved()}
      headerActions={
        <Button variant="ghost" size="sm" icon="list" data-testid="version-history" onClick={() => setHistory(true)}>
          <span className="hidden sm:inline">{t('planVersions.history')}</span>
          <span className="sr-only sm:hidden">{t('planVersions.history')}</span>
        </Button>
      }
    >
      {isDesktop ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            {details}
            {meals}
            {supplements}
            {generalNotes}
            {beverageNotes}
          </div>
          <div className="sticky top-4 space-y-4">
            {targets}
            {totals}
            {policyCard}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {details}
          {targets}
          {totals}
          {meals}
          {supplements}
          {generalNotes}
          {beverageNotes}
          {policyCard}
        </div>
      )}

      <LibraryAddPrompt
        open={!!addFoodId && (lib.isSuccess || lib.isError)}
        testId="library-add"
        title={addFood ? t('library.add.foodTitle', { name: show(addFood.name, t('coachEditor.untitledFood')) }) : t('library.use.action')}
        hint={t('library.add.foodHint', { name: client.name })}
        newLabel={t('library.add.newMeal')}
        missing={!addFood ? t(lib.isError ? 'library.add.loadFailed' : 'library.add.foodMissing') : null}
        targets={mealTargets(plan).map((m) => ({ key: m.mealId, title: <bdi>{show(m.label, t('coachEditor.meal'))}</bdi>, meta: t('library.add.foodsInMeal', { count: m.count }) }))}
        onCancel={clearAddFood}
        onPick={(key) => {
          if (!addFood) return;
          const target = key ? { mealId: key } : { newMeal: { id: uid('meal'), slot: 'breakfast' as MealSlot, label: generatedMealLabel(plan.meals.length + 1) } };
          const res = addLibraryFood(plan, target, addFood, () => uid('food'));
          setPlan((cur) => ({ ...cur, meals: res.plan.meals }));
          setOpenMealId(res.mealId);
          clearAddFood();
        }}
      />
      <PlanHistorySheet
        open={history}
        onClose={() => setHistory(false)}
        clientId={clientId}
        kind="nutrition"
        dirty={dirty}
        saving={save.isPending}
        canSave={ed.canSave && plan.name.trim().length > 0}
        onSaveVersion={(reason) => save.mutateAsync({ reason })}
        onRestored={() => ed.reloadLatest()}
      />

      <Sheet open={!!food} onClose={() => { setFood(null); setPick(''); }} size="lg" title={food?.orig ? t('coachEditor.editFood') : t('coachEditor.addFood')}>
        {food && (
          <div className="space-y-4" data-testid="food-form">
            {(lib.data?.length ?? 0) > 0 && (
              <div data-testid="food-library-picker" role="group" aria-labelledby="food-library-picker-label">
                <p className="label mb-1.5 block" id="food-library-picker-label">{t('coachEditor.chooseFood')}</p>
                <SearchField fieldClassName="mb-2" aria-label={t('coachEditor.searchFoods')} placeholder={t('coachEditor.searchFoods')} value={pick} onChange={(e) => setPick(e.target.value)} />
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {(lib.data ?? [])
                    .filter((f) => {
                      const q = pick.trim().toLowerCase();
                      return !q || (f.name.en || '').toLowerCase().includes(q) || (f.name.ar || '').includes(pick.trim());
                    })
                    .slice(0, 40)
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        data-testid="food-lib-option"
                        className="row min-h-ui-hit w-full text-start"
                        onClick={() => setFood({ ...food, name: f.name.en, nameOrig: f.name, nameAr: f.name.ar ?? '', nameArTouched: false, quantity: f.quantity, macros: { calories: f.calories, protein: f.protein, carbs: f.carbs, fats: f.fats } })}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            <bdi>{show(f.name)}</bdi>
                          </span>
                          <span className="block truncate text-[12px] text-earth-subtle">
                            <bdi>{f.quantity}</bdi> · <bdi dir={ar ? 'rtl' : 'ltr'}>{macroLine(f)}</bdi>
                          </span>
                        </span>
                        <Icon name="plus" size={16} className="text-brand" />
                      </button>
                    ))}
                </div>
              </div>
            )}
            {lib.isError && <p className="text-[12.5px] text-warn">{t('coachEditor.foodLibraryFailed')}</p>}
            <div role="group" aria-labelledby="food-database-label">
              <p className="label mb-1.5 block" id="food-database-label">{t('coachEditor.searchFoodDatabase')}</p>
              <FoodSearchPicker onPick={(f) => setFood({ ...food, name: f.name, quantity: f.quantity, macros: { calories: f.calories, protein: f.protein, carbs: f.carbs, fats: f.fats } })} />
            </div>
            <div className="h-px bg-line-soft" />
            <TextInput label={t('field.name')} data-testid="food-name" placeholder={t('coachEditor.foodName')} value={food.name} onChange={(e) => setFood({ ...food, name: e.target.value })} />
            <SecondLanguageField lang="ar" testId="food-name-ar" value={food.nameAr} onChange={(v) => setFood({ ...food, nameAr: v, nameArTouched: true })} stale={!food.nameArTouched && secondLanguageStale(food.nameOrig, food.name, 'en')} />
            <TextInput label={t('field.quantity')} data-testid="food-quantity" placeholder={t('coachEditor.quantity')} value={food.quantity} onChange={(e) => setFood({ ...food, quantity: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              {MACRO_KEYS.map((k) => (
                <NumericField
                  key={k}
                  label={k === 'calories' ? t('coachEditor.caloriesKcal') : t('coachEditor.macroGrams', { name: t(`nutrition.${k}`) })}
                  testId={`food-${k}`}
                  min={0}
                  max={k === 'calories' ? 10000 : 1000}
                  value={food.macros[k]}
                  onChange={(v) => setFood({ ...food, macros: { ...food.macros, [k]: v } })}
                />
              ))}
            </div>
            <div>
              <p className="label mb-1.5 block" id="meal-allowed-group-label">{t('nutritionSub.approvedAlternatives')}</p>
              <div className="flex flex-wrap gap-2" data-testid="meal-allowed-group" role="group" aria-labelledby="meal-allowed-group-label">
                <button type="button" className={`chip ${!food.groupId ? 'chip-on' : ''}`} aria-pressed={!food.groupId} onClick={() => setFood({ ...food, groupId: null, groupTouched: true })}>
                  {t('nutritionSub.noGroup')}
                </button>
                {(groups.data ?? []).map((g) => (
                  <button key={g.id} type="button" data-testid={`group-opt-${g.id}`} aria-pressed={food.groupId === g.id} className={`chip ${food.groupId === g.id ? 'chip-on' : ''}`} onClick={() => setFood({ ...food, groupId: g.id, groupTouched: true })}>
                    {g.name}
                  </button>
                ))}
                {food.groupId && !food.groupTouched && !(groups.data ?? []).some((g) => g.id === food.groupId) && (
                  <span className="chip chip-on" title={t('coachEditor.groupKept')}>
                    {t('coachEditor.groupKeptShort', { n: food.orig?.allowedAlternatives?.length ?? 0 })}
                  </span>
                )}
              </div>
              {(groups.data?.length ?? 0) === 0 && <p className="mt-1 text-[12px] text-earth-subtle">{t('coachFoods.noGroups')}</p>}
            </div>
            <div className="flex min-h-ui-hit items-center gap-3">
              <span className="min-w-0 flex-1 text-[13.5px]">{t('coachSettings.allowCustomFoods')}</span>
              <Switch on={food.allowCustom} label={t('coachSettings.allowCustomFoods')} testId="food-allow-custom" onChange={() => setFood({ ...food, allowCustom: !food.allowCustom })} />
            </div>
            <Button data-testid="food-save" fullWidth disabled={!food.name.trim() && !food.nameAr.trim()} onClick={saveFood}>
              {t('coachEditor.applyFood')}
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!supp} onClose={() => setSupp(null)} size="md" title={t('coachEditor.supplement')}>
        {supp && (
          <div className="space-y-3" data-testid="supp-form">
            {(suppLib.data?.length ?? 0) > 0 && (
              <div>
                <p className="label mb-1.5 block" id="supp-picker-label">{t('coachEditor.chooseSupp')}</p>
                <div className="flex flex-wrap gap-2" data-testid="supp-picker" role="group" aria-labelledby="supp-picker-label">
                  {(suppLib.data ?? []).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="chip"
                      onClick={() => setSupp({ ...supp, name: s.name, dose: s.dose.en, doseAr: s.dose.ar ?? '', doseOrig: s.dose, doseArTouched: false, timing: s.timing?.en ?? '', timingAr: s.timing?.ar ?? '', timingOrig: s.timing ?? null, timingArTouched: false })}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <TextInput label={t('field.name')} data-testid="supp-name" placeholder={t('coachEditor.suppName')} value={supp.name} onChange={(e) => setSupp({ ...supp, name: e.target.value })} dir="auto" />
            <TextInput label={t('field.dose')} data-testid="supp-dose" placeholder={t('coachEditor.suppDose')} value={supp.dose} onChange={(e) => setSupp({ ...supp, dose: e.target.value })} />
            <SecondLanguageField lang="ar" testId="supp-dose-ar" value={supp.doseAr} onChange={(v) => setSupp({ ...supp, doseAr: v, doseArTouched: true })} stale={!supp.doseArTouched && secondLanguageStale(supp.doseOrig, supp.dose, 'en')} />
            <TextInput label={t('field.timing')} data-testid="supp-timing" placeholder={t('coachEditor.suppTiming')} value={supp.timing} onChange={(e) => setSupp({ ...supp, timing: e.target.value })} />
            <SecondLanguageField lang="ar" testId="supp-timing-ar" value={supp.timingAr} onChange={(v) => setSupp({ ...supp, timingAr: v, timingArTouched: true })} stale={!supp.timingArTouched && secondLanguageStale(supp.timingOrig, supp.timing, 'en')} />
            <Button data-testid="supp-save" fullWidth disabled={!supp.name.trim()} onClick={saveSupp}>
              {t('coachEditor.applySupp')}
            </Button>
          </div>
        )}
      </Sheet>
    </PlanEditorShell>
  );
}
