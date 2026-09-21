import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import localforage from 'localforage';
import { TopBar } from '@/components/TopBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { SearchField, TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { showToast } from '@/stores/toastStore';
import { VersionActions } from '@/components/coach/VersionActions';
import { ClientContextPanel } from '@/components/coach/ClientContextPanel';
import { useSession } from '@/services/auth/sessionStore';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { parseDecimal, uid } from '@/lib/utils';
import { getClientMealPlan, saveClientMealPlan } from '@/services/platform/planApi';
import { listFoodGroups, listFoods, listSupplements } from '@/services/platform/coachAssetsApi';
import { confirmDelete, confirmDialog } from '@/stores/dialogStore';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useBack } from '@/hooks/useBack';
import type { FoodItem, Meal, MealPlan, MealSlot, SubstitutionPolicy, Supplement } from '@/types';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'postWorkout'];
const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });

function emptyPlan(): MealPlan {
  return {
    id: uid('mplan'),
    name: '',
    meals: [],
    targets: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    supplements: [],
    waterTargetMl: 0,
    beverageNotes: [],
    generalNotes: [],
    updatedAt: Date.now(),
  };
}

interface FoodForm {
  id: string | null;
  name: string;
  quantity: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  groupId: string | null;
  allowCustom: boolean;
}
const blankFood = (): FoodForm => ({ id: null, name: '', quantity: '', calories: '', protein: '', carbs: '', fats: '', groupId: null, allowCustom: false });
const num = (s: string) => Math.max(0, parseDecimal(s)); // decimals allowed (macros, water, targets)
/** Strip a library food down to a plain plan FoodItem (no undefined keys). */
const cleanFood = (f: FoodItem): FoodItem => ({
  id: f.id || uid('food'),
  name: f.name,
  quantity: f.quantity,
  protein: f.protein,
  carbs: f.carbs,
  fats: f.fats,
  calories: f.calories,
});
const DEFAULT_POLICY: SubstitutionPolicy = { allowClientSubstitutions: false, allowCustomFoods: false, requireCoachApproval: false };

export function CoachNutritionEditor() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const draftKey = `nutritionDraft:${clientId}`;

  const query = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const groups = useQuery({ queryKey: ['foodGroups', coachId], queryFn: () => listFoodGroups(coachId), enabled: !!coachId });
  const lib = useQuery({ queryKey: ['foods', coachId], queryFn: () => listFoods(coachId), enabled: !!coachId });
  const suppLib = useQuery({ queryKey: ['supplements', coachId], queryFn: () => listSupplements(coachId), enabled: !!coachId });
  const [plan, setPlan] = useState<MealPlan | null>(null);
  // Dirty is COMPUTED vs the last-saved baseline (matches CoachWorkoutEditor's
  // pattern), so a leftover draft identical to the saved plan never false-prompts.
  const baselineRef = useRef<string>('');
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  const [editing, setEditing] = useState<{ mealId: string; form: FoodForm } | null>(null);
  const [pick, setPick] = useState('');
  const [supp, setSupp] = useState<{ id: string | null; name: string; dose: string; timing: string } | null>(null);
  const isDesktop = useIsDesktop();
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);

  const policy = { ...DEFAULT_POLICY, ...(plan?.substitutionPolicy ?? {}) };
  const setPolicy = (patch: Partial<SubstitutionPolicy>) => plan && setPlan({ ...plan, substitutionPolicy: { ...policy, ...patch } });

  useEffect(() => {
    // Wait for the query to actually settle before falling back to an empty
    // plan — otherwise the very first render (query.data still undefined
    // while loading) locks in an empty plan before the real saved plan has a
    // chance to arrive, and a coach reopening an existing client's nutrition
    // plan would silently see it as blank (and could overwrite it on save).
    if (plan !== null || query.isLoading) return;
    void draftStore.getItem<MealPlan>(draftKey).then((draft) => {
      const base = query.data ?? emptyPlan();
      baselineRef.current = JSON.stringify(base);
      setPlan(draft ?? base);
    });
  }, [query.isLoading, query.data, plan, draftKey]);

  const dirty = plan !== null && JSON.stringify(plan) !== baselineRef.current;
  useUnsavedGuard(dirty, { title: t('coachEditor.unsavedTitle'), body: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave') });

  // Autosave a local draft while there are unsaved changes — the same
  // protection CoachWorkoutEditor already has, so navigating away (any tab,
  // the workspace back button, a refresh) never actually loses the edits;
  // reopening this editor for the same client picks the draft back up.
  useEffect(() => {
    if (plan && dirty) void draftStore.setItem(draftKey, plan);
  }, [plan, dirty, draftKey]);

  const save = useMutation({
    mutationFn: () => saveClientMealPlan(clientId, plan!),
    onSuccess: async () => {
      await draftStore.removeItem(draftKey);
      baselineRef.current = JSON.stringify(plan);
      void qc.invalidateQueries({ queryKey: ['clientMealPlan', clientId] });
      showToast({ title: t('common.saved'), variant: 'success' });
      window.clearTimeout(savedTimer.current);
      setJustSaved(true);
      savedTimer.current = window.setTimeout(() => setJustSaved(false), 3000);
    },
  });

  const exit = useBack(`/coach/client/${clientId}`, () => void draftStore.removeItem(draftKey));

  // Keep the desktop pane-b selection valid as meals are added/removed.
  useEffect(() => {
    if (!plan) return;
    if (!plan.meals.some((m) => m.id === selectedMealId)) setSelectedMealId(plan.meals[0]?.id ?? null);
  }, [plan, selectedMealId]);

  if (!plan) {
    return (
      <>
        <TopBar testId="coach-nutrition-editor" title={t('coachEditor.nutritionTitle')} dense onBack={exit} />
        <LoadingState variant="list" count={4} />
      </>
    );
  }

  const setTarget = (key: keyof MealPlan['targets'], v: string) => setPlan({ ...plan, targets: { ...plan.targets, [key]: num(v) } });

  // Real totals from the plan's own food items — never fabricated. An item
  // with calories === 0 has no macro data typed in yet (a real food is never
  // 0 kcal), so it's flagged rather than silently counted as "0 contribution".
  const allItems = plan.meals.flatMap((m) => m.items);
  const incompleteCount = allItems.filter((i) => i.calories === 0 && i.protein === 0 && i.carbs === 0 && i.fats === 0).length;
  const planned = allItems.reduce(
    (acc, i) => ({ calories: acc.calories + i.calories, protein: acc.protein + i.protein, carbs: acc.carbs + i.carbs, fats: acc.fats + i.fats }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );

  const addMeal = () => {
    const m: Meal = { id: uid('meal'), slot: 'breakfast', label: { en: `${t('coachEditor.meal')} ${plan.meals.length + 1}`, ar: '' }, items: [] };
    setPlan({ ...plan, meals: [...plan.meals, m] });
    setSelectedMealId(m.id);
  };

  const patchMeal = (mealId: string, patch: Partial<Meal>) =>
    setPlan({ ...plan, meals: plan.meals.map((m) => (m.id === mealId ? { ...m, ...patch } : m)) });

  const removeMeal = async (meal: Meal) => {
    if (!(await confirmDialog({ title: t('coachEditor.removeMeal'), message: meal.label.en, danger: true }))) return;
    setPlan({ ...plan, meals: plan.meals.filter((m) => m.id !== meal.id) });
  };

  const saveFood = () => {
    if (!editing) return;
    const { mealId, form } = editing;
    const id = form.id ?? uid('food');
    const grp = form.groupId ? (groups.data ?? []).find((g) => g.id === form.groupId) : undefined;
    const food: FoodItem = {
      id,
      name: { en: form.name.trim(), ar: form.name.trim() },
      quantity: form.quantity.trim(),
      calories: num(form.calories),
      protein: num(form.protein),
      carbs: num(form.carbs),
      fats: num(form.fats),
      // Snapshot the alternatives group's foods onto the item (independent copy).
      ...(grp ? { allowedAlternativeGroupId: grp.id, allowedAlternatives: grp.foods.map(cleanFood) } : {}),
      ...(form.allowCustom ? { allowCustomSubstitution: true } : {}),
    };
    setPlan({
      ...plan,
      meals: plan.meals.map((m) =>
        m.id !== mealId ? m : { ...m, items: m.items.some((i) => i.id === id) ? m.items.map((i) => (i.id === id ? food : i)) : [...m.items, food] },
      ),
    });
    setEditing(null);
  };

  const removeFood = async (mealId: string, foodId: string, name?: string) => {
    if (!(await confirmDelete(name))) return;
    setPlan({ ...plan, meals: plan.meals.map((m) => (m.id === mealId ? { ...m, items: m.items.filter((i) => i.id !== foodId) } : m)) });
  };

  const saveSupp = () => {
    if (!supp) return;
    const id = supp.id ?? uid('supp');
    const s: Supplement = {
      id,
      name: supp.name.trim(),
      dose: { en: supp.dose.trim(), ar: supp.dose.trim() },
      ...(supp.timing.trim() ? { timing: { en: supp.timing.trim(), ar: supp.timing.trim() } } : {}),
    };
    setPlan({
      ...plan,
      supplements: plan.supplements.some((x) => x.id === id) ? plan.supplements.map((x) => (x.id === id ? s : x)) : [...plan.supplements, s],
    });
    setSupp(null);
  };
  const removeSupp = (id: string) => setPlan({ ...plan, supplements: plan.supplements.filter((s) => s.id !== id) });

  const mealCard = (meal: Meal) => (
    <div key={meal.id} className="card">
      <div className="mb-3 flex items-end gap-2">
        <TextInput label={t('coachEditor.mealLabel')} fieldClassName="flex-1" value={meal.label.en} onChange={(e) => patchMeal(meal.id, { label: { ...meal.label, en: e.target.value } })} />
        <button type="button" className="icon-btn h-11 w-11 shrink-0 text-danger" aria-label={t('coachEditor.removeMeal')} onClick={() => void removeMeal(meal)}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {SLOTS.map((s) => (
          <button key={s} type="button" onClick={() => patchMeal(meal.id, { slot: s })} className={`chip text-[11px] ${meal.slot === s ? 'chip-on' : ''}`}>
            {t(`coachEditor.slots.${s}`)}
          </button>
        ))}
      </div>
      <div className="divide-y divide-line-soft">
        {meal.items.map((f) => (
          <div key={f.id} className="flex items-center gap-3 py-2.5">
            <button
              type="button"
              className="min-w-0 flex-1 text-start"
              onClick={() => setEditing({ mealId: meal.id, form: { id: f.id, name: f.name.en, quantity: f.quantity, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fats: String(f.fats), groupId: f.allowedAlternativeGroupId ?? null, allowCustom: !!f.allowCustomSubstitution } })}
            >
              <span className="block truncate font-medium">{f.name.en || t('coachEditor.untitledFood')}</span>
              <span className="block truncate text-[12px] text-earth-subtle">{f.quantity} · {f.calories} kcal · P{f.protein} C{f.carbs} F{f.fats}</span>
            </button>
            <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => void removeFood(meal.id, f.id, f.name.en)}>
              <Icon name="minus" size={18} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" data-testid="nutrition-add-food" className="btn-ghost mt-3 w-full" onClick={() => setEditing({ mealId: meal.id, form: blankFood() })}>
        {t('coachEditor.addFood')}
      </button>
    </div>
  );

  const mealList = (
    <div className="space-y-2">
      {plan.meals.map((meal) => (
        <button
          key={meal.id}
          type="button"
          onClick={() => setSelectedMealId(meal.id)}
          className={`card-tap flex w-full items-center gap-3 text-start ${isDesktop && selectedMealId === meal.id ? 'border-brand/50 bg-brand/[0.06]' : ''}`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{meal.label.en || t('coachEditor.untitledFood')}</span>
            <span className="block truncate text-[12px] text-earth-subtle">
              {t(`coachEditor.slots.${meal.slot}`)} · {t('coachEditor.foodCount', { n: meal.items.length })}
            </span>
          </span>
          <Icon name="chevron" size={18} className="text-earth-subtle" />
        </button>
      ))}
    </div>
  );
  const selectedMeal = plan.meals.find((m) => m.id === selectedMealId);

  return (
    <>
      <TopBar
        testId="coach-nutrition-editor"
        title={t('coachEditor.nutritionTitle')}
        dense
        onBack={exit}
        right={
          <SubmitButton type="button" data-testid="nutrition-save" pending={save.isPending} className="h-[42px] px-4 text-xs" onClick={() => save.mutate()}>
            {t('common.save')}
          </SubmitButton>
        }
      />

      <div className="mb-3"><ClientContextPanel clientId={clientId} /></div>

      {save.isPending ? (
        <p className="mb-3 text-[12px] text-earth-subtle" data-testid="nutrition-saving">{t('settings.saving')}</p>
      ) : dirty ? (
        <p className="mb-3 text-[12px] text-warn" data-testid="nutrition-unsaved">{t('coachEditor.unsavedIndicator')}</p>
      ) : justSaved ? (
        <p className="mb-3 text-[12px] text-success" data-testid="nutrition-saved">{t('common.saved')}</p>
      ) : null}
      <p className="mb-3 text-[11.5px] text-earth-subtle">{t('coachEditor.saveHint')}</p>

      {save.isError && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {(save.error as Error)?.message || t('coachEditor.saveFailed')}
        </p>
      )}

      <TextInput label={t('field.planName')} fieldClassName="mb-2" data-testid="nutrition-plan-name" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder={t('coachEditor.planNamePlaceholder')} />
      <div className="mb-4">
        <VersionActions clientId={clientId} kind="nutrition" plan={plan} createdBy={coachId} />
      </div>

      {/* Planned vs target totals — real sums from the meals below, never fabricated. */}
      <h2 className="h2 mb-2">{t('coachEditor.plannedVsTarget')}</h2>
      <div className="card mb-5 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-line-soft text-start">
              <th className="py-1.5 text-start font-mono text-[11px] uppercase tracking-wide text-earth-subtle"> </th>
              {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
                <th key={k} className="py-1.5 text-end font-mono text-[11px] uppercase tracking-wide text-earth-subtle">{t(`nutrition.${k}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line-soft">
              <td className="py-1.5 text-earth-subtle">{t('coachEditor.target')}</td>
              {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
                <td key={k} className="py-1.5 text-end font-mono">{plan.targets[k] || 0}</td>
              ))}
            </tr>
            <tr className="border-b border-line-soft">
              <td className="py-1.5 text-earth-subtle">{t('coachEditor.planned')}</td>
              {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
                <td key={k} className="py-1.5 text-end font-mono">{Math.round(planned[k])}</td>
              ))}
            </tr>
            <tr>
              <td className="py-1.5 text-earth-subtle">{t('coachEditor.difference')}</td>
              {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => {
                const diff = Math.round(planned[k] - (plan.targets[k] || 0));
                const tone = diff === 0 ? 'text-earth-subtle' : diff > 0 ? 'text-warn' : 'text-info';
                return <td key={k} className={`py-1.5 text-end font-mono ${tone}`}>{diff > 0 ? '+' : ''}{diff}</td>;
              })}
            </tr>
          </tbody>
        </table>
        {incompleteCount > 0 && (
          <p className="mt-2 text-[12px] text-warn" data-testid="nutrition-incomplete-totals">
            {t('coachEditor.incompleteTotals', { n: incompleteCount })}
          </p>
        )}
      </div>

      {/* Daily targets */}
      <h2 className="h2 mb-2">{t('coach.targets')}</h2>
      <div className="card mb-5 grid grid-cols-2 gap-3">
        {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
          <div key={k}>
            <label className="label">{t(`nutrition.${k}`)}</label>
            <input className="input" data-testid={`nutrition-target-${k}`} inputMode="decimal" value={plan.targets[k] || ''} onChange={(e) => setTarget(k, e.target.value)} />
          </div>
        ))}
        <div className="col-span-2">
          <label className="label">{t('coachEditor.waterTargetMl')}</label>
          <input className="input" data-testid="nutrition-water-target" inputMode="decimal" value={plan.waterTargetMl || ''} onChange={(e) => setPlan({ ...plan, waterTargetMl: num(e.target.value) })} />
        </div>
      </div>

      {/* Substitution policy */}
      <h2 className="h2 mb-2">{t('coachSettings.substitutions')}</h2>
      <div className="card mb-5 flex flex-wrap gap-2" data-testid="sub-policy">
        {(['allowClientSubstitutions', 'allowCustomFoods', 'requireCoachApproval'] as const).map((k) => (
          <button key={k} type="button" data-testid={`policy-${k}`} onClick={() => setPolicy({ [k]: !policy[k] })} className={`chip ${policy[k] ? 'chip-on' : ''}`}>
            {t(`coachSettings.${k}`)}
          </button>
        ))}
      </div>

      {/* Meals — desktop: list pane-a + editor pane-b (matches the Workout builder's split); mobile: expanded list, unchanged. */}
      <h2 className="h2 mb-2">{t('coachEditor.meals')}</h2>
      {isDesktop ? (
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="w-full shrink-0 space-y-2 lg:w-72">
            {mealList}
            <button type="button" data-testid="nutrition-add-meal" className="btn-ghost w-full" onClick={addMeal}>
              {t('coachEditor.addMeal')}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            {selectedMeal ? (
              mealCard(selectedMeal)
            ) : (
              <div className="card flex min-h-48 flex-col items-center justify-center gap-3 py-10 text-center text-earth-subtle">
                <Icon name="meal" size={28} />
                <p className="text-sm">{t('coachEditor.selectMealPrompt')}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-4">{plan.meals.map(mealCard)}</div>
          <button type="button" data-testid="nutrition-add-meal" className="btn-ghost mt-4 w-full" onClick={addMeal}>
            {t('coachEditor.addMeal')}
          </button>
        </>
      )}

      {/* Supplements */}
      <h2 className="h2 mb-2 mt-6">{t('nutrition.supplements')}</h2>
      <div className="card divide-y divide-line-soft">
        {plan.supplements.length ? (
          plan.supplements.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setSupp({ id: s.id, name: s.name, dose: s.dose.en, timing: s.timing?.en ?? '' })}>
                <span className="block truncate font-medium">{s.name || t('coachEditor.untitledSupp')}</span>
                {(s.dose.en || s.timing?.en) && <span className="block truncate text-[12px] text-earth-subtle">{[s.dose.en, s.timing?.en].filter(Boolean).join(' · ')}</span>}
              </button>
              <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => removeSupp(s.id)}>
                <Icon name="minus" size={18} />
              </button>
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-earth-muted">{t('coachEditor.noSupps')}</p>
        )}
      </div>
      <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setSupp({ id: null, name: '', dose: '', timing: '' })}>
        {t('coachEditor.addSupp')}
      </button>

      <Sheet open={!!supp} onClose={() => setSupp(null)} size="md" title={t('coachEditor.supplement')}>
        {supp && (
          <div className="space-y-3">
            {/* Pick from the coach's saved supplements — fills the fields below. */}
            {(suppLib.data?.length ?? 0) > 0 && (
              <div>
                <label className="label mb-1.5 block">{t('coachEditor.chooseSupp')}</label>
                <div className="flex flex-wrap gap-2" data-testid="supp-picker">
                  {(suppLib.data ?? []).map((s) => (
                    <button key={s.id} type="button" className="chip" onClick={() => setSupp({ ...supp, name: s.name, dose: s.dose.en, timing: s.timing?.en ?? '' })}>
                      {s.name}
                    </button>
                  ))}
                </div>
                <div className="my-3 h-px bg-line-soft" />
              </div>
            )}
            <TextInput label={t('field.name')} placeholder={t('coachEditor.suppName')} value={supp.name} onChange={(e) => setSupp({ ...supp, name: e.target.value })} />
            <TextInput label={t('field.dose')} placeholder={t('coachEditor.suppDose')} value={supp.dose} onChange={(e) => setSupp({ ...supp, dose: e.target.value })} />
            <TextInput label={t('field.timing')} placeholder={t('coachEditor.suppTiming')} value={supp.timing} onChange={(e) => setSupp({ ...supp, timing: e.target.value })} />
            <button type="button" disabled={!supp.name.trim()} onClick={saveSupp} className="btn-primary w-full disabled:opacity-40">
              {t('common.save')}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => { setEditing(null); setPick(''); }} size="lg" title={t('coachEditor.food')}>
        {editing && (
          <div className="space-y-3" data-testid="food-form">
            {/* Pick from the coach's saved foods — fills the form below (an editable
                snapshot, so tweaking it here never changes the library entry). */}
            {(lib.data?.length ?? 0) > 0 && (
              <div data-testid="food-library-picker">
                <label className="label mb-1.5 block">{t('coachEditor.chooseFood')}</label>
                <SearchField fieldClassName="mb-2" aria-label={t('coachEditor.searchFoods')} placeholder={t('coachEditor.searchFoods')} value={pick} onChange={(e) => setPick(e.target.value)} />
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {(lib.data ?? [])
                    .filter((f) => { const q = pick.trim().toLowerCase(); return !q || (f.name.en || '').toLowerCase().includes(q) || (f.name.ar || '').includes(pick.trim()); })
                    .slice(0, 40)
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        data-testid="food-lib-option"
                        className="row w-full text-start"
                        onClick={() => setEditing({ ...editing, form: { ...editing.form, name: f.name.en, quantity: f.quantity, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fats: String(f.fats) } })}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.name.en || f.name.ar}</span>
                          <span className="block truncate text-[12px] text-earth-subtle">{f.quantity} · {f.calories} kcal · P{f.protein} C{f.carbs} F{f.fats}</span>
                        </span>
                        <Icon name="plus" size={16} className="text-brand" />
                      </button>
                    ))}
                </div>
                <div className="my-3 h-px bg-line-soft" />
              </div>
            )}
            <TextInput label={t('field.name')} data-testid="food-name" placeholder={t('coachEditor.foodName')} value={editing.form.name} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} />
            <TextInput label={t('field.quantity')} data-testid="food-quantity" placeholder={t('coachEditor.quantity')} value={editing.form.quantity} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, quantity: e.target.value } })} />
            <div className="grid grid-cols-2 gap-2">
              {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
                <div key={k}>
                  <label className="label">{t(`nutrition.${k}`)}</label>
                  <input className="input" data-testid={`food-${k}`} inputMode="decimal" value={editing.form[k]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [k]: e.target.value } })} />
                </div>
              ))}
            </div>

            {/* Approved alternatives (snapshotted from a coach food group) */}
            <div>
              <label className="label mb-1.5 block">{t('nutritionSub.approvedAlternatives')}</label>
              <div className="flex flex-wrap gap-2" data-testid="meal-allowed-group">
                <button type="button" className={`chip ${!editing.form.groupId ? 'chip-on' : ''}`} onClick={() => setEditing({ ...editing, form: { ...editing.form, groupId: null } })}>
                  {t('nutritionSub.noGroup')}
                </button>
                {(groups.data ?? []).map((g) => (
                  <button key={g.id} type="button" data-testid={`group-opt-${g.id}`} className={`chip ${editing.form.groupId === g.id ? 'chip-on' : ''}`} onClick={() => setEditing({ ...editing, form: { ...editing.form, groupId: g.id } })}>
                    {g.name}
                  </button>
                ))}
              </div>
              {(groups.data?.length ?? 0) === 0 && <p className="mt-1 text-[12px] text-earth-subtle">{t('coachFoods.noGroups')}</p>}
            </div>
            <button type="button" data-testid="food-allow-custom" className={`chip ${editing.form.allowCustom ? 'chip-on' : ''}`} onClick={() => setEditing({ ...editing, form: { ...editing.form, allowCustom: !editing.form.allowCustom } })}>
              {t('coachSettings.allowCustomFoods')}
            </button>

            <button type="button" data-testid="food-save" disabled={!editing.form.name.trim()} onClick={saveFood} className="btn-primary w-full disabled:opacity-40">
              {t('common.save')}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
