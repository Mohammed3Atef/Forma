import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { uid } from '@/lib/utils';
import { getClientMealPlan, saveClientMealPlan } from '@/services/platform/planApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { FoodItem, Meal, MealPlan, MealSlot, Supplement } from '@/types';

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
}
const blankFood = (): FoodForm => ({ id: null, name: '', quantity: '', calories: '', protein: '', carbs: '', fats: '' });
const num = (s: string) => Math.max(0, Number(s) || 0);

export function CoachNutritionEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();

  const query = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [editing, setEditing] = useState<{ mealId: string; form: FoodForm } | null>(null);
  const [supp, setSupp] = useState<{ id: string | null; name: string; dose: string } | null>(null);

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
    const food: FoodItem = {
      id,
      name: { en: form.name.trim(), ar: form.name.trim() },
      quantity: form.quantity.trim(),
      calories: num(form.calories),
      protein: num(form.protein),
      carbs: num(form.carbs),
      fats: num(form.fats),
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
    const s: Supplement = { id, name: supp.name.trim(), dose: { en: supp.dose.trim(), ar: supp.dose.trim() } };
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
        title={t('coachEditor.nutritionTitle')}
        eyebrow={t('platform.coachPortal')}
        onBack={() => navigate(`/coach/client/${clientId}`)}
        right={
          <button type="button" disabled={save.isPending} className="btn-primary h-[42px] px-4 text-xs disabled:opacity-40" onClick={() => save.mutate()}>
            {t('common.save')}
          </button>
        }
      />

      {save.isError && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {(save.error as Error)?.message || t('coachEditor.saveFailed')}
        </p>
      )}

      <input className="input mb-4" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder={t('coachEditor.planNamePlaceholder')} />

      {/* Daily targets */}
      <h2 className="h2 mb-2">{t('coach.targets')}</h2>
      <div className="card mb-5 grid grid-cols-2 gap-3">
        {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
          <div key={k}>
            <label className="label">{t(`nutrition.${k}`)}</label>
            <input className="input" inputMode="numeric" value={plan.targets[k] || ''} onChange={(e) => setTarget(k, e.target.value)} />
          </div>
        ))}
        <div className="col-span-2">
          <label className="label">{t('coachEditor.waterTargetMl')}</label>
          <input className="input" inputMode="numeric" value={plan.waterTargetMl || ''} onChange={(e) => setPlan({ ...plan, waterTargetMl: num(e.target.value) })} />
        </div>
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
                    onClick={() => setEditing({ mealId: meal.id, form: { id: f.id, name: f.name.en, quantity: f.quantity, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fats: String(f.fats) } })}
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
            <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setEditing({ mealId: meal.id, form: blankFood() })}>
              {t('coachEditor.addFood')}
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn-ghost mt-4 w-full" onClick={addMeal}>
        {t('coachEditor.addMeal')}
      </button>

      {/* Supplements */}
      <h2 className="h2 mb-2 mt-6">{t('nutrition.supplements')}</h2>
      <div className="card divide-y divide-line-soft">
        {plan.supplements.length ? (
          plan.supplements.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setSupp({ id: s.id, name: s.name, dose: s.dose.en })}>
                <span className="block truncate font-medium">{s.name || t('coachEditor.untitledSupp')}</span>
                {s.dose.en && <span className="block truncate text-[12px] text-earth-subtle">{s.dose.en}</span>}
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
      <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setSupp({ id: null, name: '', dose: '' })}>
        {t('coachEditor.addSupp')}
      </button>

      <Sheet open={!!supp} onClose={() => setSupp(null)} title={t('coachEditor.supplement')}>
        {supp && (
          <div className="space-y-3">
            <input className="input" placeholder={t('coachEditor.suppName')} value={supp.name} onChange={(e) => setSupp({ ...supp, name: e.target.value })} />
            <input className="input" placeholder={t('coachEditor.suppDose')} value={supp.dose} onChange={(e) => setSupp({ ...supp, dose: e.target.value })} />
            <button type="button" disabled={!supp.name.trim()} onClick={saveSupp} className="btn-primary w-full disabled:opacity-40">
              {t('common.save')}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('coachEditor.food')}>
        {editing && (
          <div className="space-y-3">
            <input className="input" placeholder={t('coachEditor.foodName')} value={editing.form.name} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} />
            <input className="input" placeholder={t('coachEditor.quantity')} value={editing.form.quantity} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, quantity: e.target.value } })} />
            <div className="grid grid-cols-2 gap-2">
              {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
                <div key={k}>
                  <label className="label">{t(`nutrition.${k}`)}</label>
                  <input className="input" inputMode="numeric" value={editing.form[k]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [k]: e.target.value } })} />
                </div>
              ))}
            </div>
            <button type="button" disabled={!editing.form.name.trim()} onClick={saveFood} className="btn-primary w-full disabled:opacity-40">
              {t('common.save')}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
