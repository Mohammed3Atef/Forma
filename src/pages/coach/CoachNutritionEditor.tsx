import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { VersionActions } from '@/components/coach/VersionActions';
import { useSession } from '@/services/auth/sessionStore';
import { parseDecimal, uid } from '@/lib/utils';
import { getClientMealPlan, saveClientMealPlan } from '@/services/platform/planApi';
import { listFoodGroups, listFoods, listSupplements } from '@/services/platform/coachAssetsApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { FoodItem, Meal, MealPlan, MealSlot, SubstitutionPolicy, Supplement } from '@/types';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'postWorkout'];

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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');

  const query = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const groups = useQuery({ queryKey: ['foodGroups', coachId], queryFn: () => listFoodGroups(coachId), enabled: !!coachId });
  const lib = useQuery({ queryKey: ['foods', coachId], queryFn: () => listFoods(coachId), enabled: !!coachId });
  const suppLib = useQuery({ queryKey: ['supplements', coachId], queryFn: () => listSupplements(coachId), enabled: !!coachId });
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [editing, setEditing] = useState<{ mealId: string; form: FoodForm } | null>(null);
  const [pick, setPick] = useState('');
  const [supp, setSupp] = useState<{ id: string | null; name: string; dose: string; timing: string } | null>(null);

  const policy = { ...DEFAULT_POLICY, ...(plan?.substitutionPolicy ?? {}) };
  const setPolicy = (patch: Partial<SubstitutionPolicy>) => plan && setPlan({ ...plan, substitutionPolicy: { ...policy, ...patch } });

  useEffect(() => {
    if (plan === null) setPlan(query.data ?? emptyPlan());
  }, [query.data, plan]);

  const save = useMutation({
    mutationFn: () => saveClientMealPlan(clientId, plan!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clientMealPlan', clientId] });
      navigate(`/coach/client/${clientId}`);
    },
  });

  if (!plan) return null;

  const setTarget = (key: keyof MealPlan['targets'], v: string) => setPlan({ ...plan, targets: { ...plan.targets, [key]: num(v) } });

  const addMeal = () =>
    setPlan({ ...plan, meals: [...plan.meals, { id: uid('meal'), slot: 'breakfast', label: { en: `${t('coachEditor.meal')} ${plan.meals.length + 1}`, ar: '' }, items: [] }] });

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

  const removeFood = (mealId: string, foodId: string) =>
    setPlan({ ...plan, meals: plan.meals.map((m) => (m.id === mealId ? { ...m, items: m.items.filter((i) => i.id !== foodId) } : m)) });

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

  return (
    <>
      <TopBar
        testId="coach-nutrition-editor"
        title={t('coachEditor.nutritionTitle')}
        eyebrow={t('platform.coachPortal')}
        onBack={() => navigate(`/coach/client/${clientId}`)}
        right={
          <button type="button" data-testid="nutrition-save" disabled={save.isPending} className="btn-primary h-[42px] px-4 text-xs disabled:opacity-40" onClick={() => save.mutate()}>
            {t('common.save')}
          </button>
        }
      />

      {save.isError && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {(save.error as Error)?.message || t('coachEditor.saveFailed')}
        </p>
      )}

      <input className="input mb-2" data-testid="nutrition-plan-name" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder={t('coachEditor.planNamePlaceholder')} />
      <div className="mb-4">
        <VersionActions clientId={clientId} kind="nutrition" plan={plan} createdBy={coachId} />
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

      {/* Meals */}
      <div className="space-y-4">
        {plan.meals.map((meal) => (
          <div key={meal.id} className="card">
            <div className="mb-3 flex items-center gap-2">
              <input className="input flex-1" value={meal.label.en} onChange={(e) => patchMeal(meal.id, { label: { ...meal.label, en: e.target.value } })} placeholder={t('coachEditor.mealLabel')} />
              <button type="button" className="text-danger" aria-label={t('coachEditor.removeMeal')} onClick={() => void removeMeal(meal)}>
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
                  <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => removeFood(meal.id, f.id)}>
                    <Icon name="minus" size={18} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" data-testid="nutrition-add-food" className="btn-ghost mt-3 w-full" onClick={() => setEditing({ mealId: meal.id, form: blankFood() })}>
              {t('coachEditor.addFood')}
            </button>
          </div>
        ))}
      </div>

      <button type="button" data-testid="nutrition-add-meal" className="btn-ghost mt-4 w-full" onClick={addMeal}>
        {t('coachEditor.addMeal')}
      </button>

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

      <Sheet open={!!supp} onClose={() => setSupp(null)} title={t('coachEditor.supplement')}>
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
            <input className="input" placeholder={t('coachEditor.suppName')} value={supp.name} onChange={(e) => setSupp({ ...supp, name: e.target.value })} />
            <input className="input" placeholder={t('coachEditor.suppDose')} value={supp.dose} onChange={(e) => setSupp({ ...supp, dose: e.target.value })} />
            <input className="input" placeholder={t('coachEditor.suppTiming')} value={supp.timing} onChange={(e) => setSupp({ ...supp, timing: e.target.value })} />
            <button type="button" disabled={!supp.name.trim()} onClick={saveSupp} className="btn-primary w-full disabled:opacity-40">
              {t('common.save')}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => { setEditing(null); setPick(''); }} title={t('coachEditor.food')}>
        {editing && (
          <div className="space-y-3" data-testid="food-form">
            {/* Pick from the coach's saved foods — fills the form below (an editable
                snapshot, so tweaking it here never changes the library entry). */}
            {(lib.data?.length ?? 0) > 0 && (
              <div data-testid="food-library-picker">
                <label className="label mb-1.5 block">{t('coachEditor.chooseFood')}</label>
                <input className="input mb-2" placeholder={t('coachEditor.searchFoods')} value={pick} onChange={(e) => setPick(e.target.value)} />
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
            <input className="input" data-testid="food-name" placeholder={t('coachEditor.foodName')} value={editing.form.name} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} />
            <input className="input" data-testid="food-quantity" placeholder={t('coachEditor.quantity')} value={editing.form.quantity} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, quantity: e.target.value } })} />
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
