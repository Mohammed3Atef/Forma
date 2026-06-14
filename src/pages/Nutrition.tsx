import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FoodItem } from '@/types';
import { useNutrition, computeConsumed } from '@/stores/nutritionStore';
import { useSettings } from '@/stores/settingsStore';
import { useLocalized } from '@/hooks/useLocalized';
import { Icon } from '@/components/Icon';
import { ProgressRing } from '@/components/ProgressRing';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { uid } from '@/lib/utils';

export function Nutrition() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const plan = useNutrition((s) => s.plan);
  const log = useNutrition((s) => s.log);
  const toggleMeal = useNutrition((s) => s.toggleMeal);
  const toggleSupplement = useNutrition((s) => s.toggleSupplement);
  const addWater = useNutrition((s) => s.addWater);
  const setCreatine = useNutrition((s) => s.setCreatine);
  const addCustomFood = useNutrition((s) => s.addCustomFood);
  const removeCustomFood = useNutrition((s) => s.removeCustomFood);
  const replaceItem = useNutrition((s) => s.replaceItem);
  const removeItem = useNutrition((s) => s.removeItem);
  const resetItem = useNutrition((s) => s.resetItem);
  const addMealItem = useNutrition((s) => s.addMealItem);
  const removeMealItem = useNutrition((s) => s.removeMealItem);
  const consumed = useMemo(() => computeConsumed(plan, log), [plan, log]);
  const targets = useSettings((s) => s.settings?.targets);

  // Food editor — handles replacing a planned item, adding to a meal, or a custom snack.
  type EditorMode =
    | { type: 'custom'; foodId?: string }
    | { type: 'addMeal'; mealId: string; foodId?: string }
    | { type: 'replace'; itemId: string };
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [form, setForm] = useState({ name: '', quantity: '', protein: '', carbs: '', fats: '' });

  if (!plan || !log || !targets) return <p className="text-slate-400">{t('progress.noData')}</p>;

  const openEditor = (mode: EditorMode, prefill?: { name: string; quantity: string; protein: number; carbs: number; fats: number }) => {
    setForm(
      prefill
        ? { name: prefill.name, quantity: prefill.quantity, protein: String(prefill.protein), carbs: String(prefill.carbs), fats: String(prefill.fats) }
        : { name: '', quantity: '', protein: '', carbs: '', fats: '' },
    );
    setEditor(mode);
  };

  const macros = [
    { key: 'calories', value: consumed.calories, target: targets.calories, color: '#AE7E56' },
    { key: 'protein', value: consumed.protein, target: targets.protein, color: '#D4A46A' },
    { key: 'carbs', value: consumed.carbs, target: targets.carbs, color: '#BF6E4E' },
    { key: 'fats', value: consumed.fats, target: targets.fats, color: '#2E5D3C' },
  ] as const;

  const submitEditor = async () => {
    if (!editor) return;
    const protein = Number(form.protein) || 0;
    const carbs = Number(form.carbs) || 0;
    const fats = Number(form.fats) || 0;
    const name = form.name.trim() || 'Custom food';
    const existingId = editor.type !== 'replace' ? editor.foodId : undefined;
    const food: FoodItem = {
      id: existingId ?? uid('food'),
      name: { en: name, ar: name },
      quantity: form.quantity.trim(),
      protein,
      carbs,
      fats,
      calories: Math.round(protein * 4 + carbs * 4 + fats * 9),
    };
    if (editor.type === 'replace') await replaceItem(editor.itemId, food);
    else if (editor.type === 'addMeal') await addMealItem(editor.mealId, food);
    else await addCustomFood(food);
    setEditor(null);
  };

  const waterPct = Math.min(1, log.waterMl / (targets.waterMl || 1));

  return (
    <div className="anim-rise space-y-4">
      <TopBar title={t('nutrition.title')} eyebrow={t('nav.nutrition')} />

      {/* Macro rings */}
      <div className="card grid grid-cols-4 gap-1">
        {macros.map((m) => (
          <div key={m.key} className="flex flex-col items-center">
            <ProgressRing
              value={m.target ? m.value / m.target : 0}
              size={62}
              stroke={6}
              color={m.color}
              label={String(Math.round(m.value))}
            />
            <span className="mt-1 text-[10px] uppercase text-slate-400">{t(`nutrition.${m.key}`)}</span>
            <span className="text-[10px] text-slate-500">/{m.target}</span>
          </div>
        ))}
      </div>

      {/* Water */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="water" size={20} className="text-accent" />
            <span className="font-semibold">{t('nutrition.water')}</span>
          </div>
          <span className="text-sm text-slate-400">{log.waterMl} / {targets.waterMl} ml</span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${waterPct * 100}%` }} />
        </div>
        <div className="flex gap-2">
          {[250, 500, 1000].map((ml) => (
            <button key={ml} type="button" onClick={() => void addWater(ml)} className="btn-ghost h-11 flex-1 text-sm">
              +{ml}
            </button>
          ))}
          <button type="button" onClick={() => void addWater(-250)} className="icon-btn h-11 w-11">
            <Icon name="minus" size={16} />
          </button>
        </div>
      </div>

      {/* Meals */}
      <div className="space-y-3">
        {plan.meals.map((meal) => {
          const eaten = !!log.mealsEaten[meal.id];
          // Effective items for the day = plan items (with swaps applied) + extras.
          const effItems = meal.items
            .flatMap((item) => {
              if (item.id in log.itemOverrides) {
                const ov = log.itemOverrides[item.id];
                return ov ? [ov] : [];
              }
              return [item];
            })
            .concat(log.extraItems[meal.id] ?? []);
          const mealMacros = effItems.reduce(
            (a, i) => ({ p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fats, kcal: a.kcal + i.calories }),
            { p: 0, c: 0, f: 0, kcal: 0 },
          );
          return (
            <section key={meal.id} className={`card ${eaten ? 'ring-1 ring-brand/40' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">{loc(meal.label)}</h2>
                  <p className="flex flex-wrap gap-x-2 text-xs text-slate-400" dir="ltr">
                    <span className="font-semibold text-slate-300">{Math.round(mealMacros.kcal)} kcal</span>
                    <span>P {Math.round(mealMacros.p)}</span>
                    <span>C {Math.round(mealMacros.c)}</span>
                    <span>F {Math.round(mealMacros.f)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleMeal(meal.id)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${eaten ? 'bg-brand text-slate-950' : 'bg-surface-raised text-slate-400'}`}
                  aria-label={t('nutrition.markEaten')}
                >
                  <Icon name="check" size={20} />
                </button>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                {meal.items.map((item) => {
                  const overridden = item.id in log.itemOverrides;
                  const replacement = overridden ? log.itemOverrides[item.id] : undefined;
                  return (
                    <li key={item.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {/* Original — struck-through when replaced/removed for the day */}
                        <p className={overridden ? 'text-slate-500 line-through' : ''}>
                          <span>{loc(item.name)}</span>
                          {item.quantity && <span className="text-slate-500"> · {item.quantity}</span>}
                        </p>
                        {replacement && (
                          <>
                            <p className="text-brand-light">↳ {loc(replacement.name)}</p>
                            <p className="text-[11px] text-slate-500" dir="ltr">
                              {replacement.quantity ? `${replacement.quantity} · ` : ''}{replacement.calories} kcal · P{replacement.protein} C{replacement.carbs} F{replacement.fats}
                            </p>
                          </>
                        )}
                        {overridden && !replacement && (
                          <p className="text-[11px] text-slate-500">{t('nutrition.removed')}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {overridden ? (
                          <>
                            {replacement && (
                              <button
                                type="button"
                                onClick={() => openEditor({ type: 'replace', itemId: item.id }, { name: loc(replacement.name), quantity: replacement.quantity, protein: replacement.protein, carbs: replacement.carbs, fats: replacement.fats })}
                                className="icon-btn h-8 w-8"
                                aria-label={t('common.edit')}
                              >
                                <Icon name="edit" size={14} />
                              </button>
                            )}
                            <button type="button" onClick={() => void resetItem(item.id)} className="icon-btn h-8 w-8" aria-label={t('nutrition.reset')}>
                              <Icon name="chevron" size={14} className="rotate-180" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditor({ type: 'replace', itemId: item.id }, { name: loc(item.name), quantity: item.quantity, protein: item.protein, carbs: item.carbs, fats: item.fats })}
                              className="icon-btn h-8 w-8"
                              aria-label={t('nutrition.replace')}
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button type="button" onClick={() => void removeItem(item.id)} className="icon-btn h-8 w-8 text-danger" aria-label={t('common.delete')}>
                              <Icon name="close" size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}

                {/* Extra foods added to this meal today */}
                {(log.extraItems[meal.id] ?? []).map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-brand-light">+ {loc(f.name)}</p>
                      <p className="text-[11px] text-slate-500" dir="ltr">
                        {f.quantity ? `${f.quantity} · ` : ''}{f.calories} kcal · P{f.protein} C{f.carbs} F{f.fats}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditor({ type: 'addMeal', mealId: meal.id, foodId: f.id }, { name: loc(f.name), quantity: f.quantity, protein: f.protein, carbs: f.carbs, fats: f.fats })}
                        className="icon-btn h-8 w-8"
                        aria-label={t('common.edit')}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button type="button" onClick={() => void removeMealItem(meal.id, f.id)} className="icon-btn h-8 w-8 text-danger" aria-label={t('common.delete')}>
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <button type="button" onClick={() => openEditor({ type: 'addMeal', mealId: meal.id })} className="mt-2 text-xs font-medium text-brand-light">
                + {t('nutrition.addFood')}
              </button>
            </section>
          );
        })}
      </div>

      {/* Custom foods */}
      {log.customFoods.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t('nutrition.addFood')}</h2>
          <ul className="space-y-1.5 text-sm">
            {log.customFoods.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p>{loc(f.name)}</p>
                  <p className="text-[11px] text-slate-500" dir="ltr">
                    {f.quantity ? `${f.quantity} · ` : ''}{f.calories} kcal · P{f.protein} C{f.carbs} F{f.fats}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditor({ type: 'custom', foodId: f.id }, { name: loc(f.name), quantity: f.quantity, protein: f.protein, carbs: f.carbs, fats: f.fats })}
                    className="icon-btn h-8 w-8"
                    aria-label={t('common.edit')}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button type="button" onClick={() => void removeCustomFood(f.id)} className="icon-btn h-8 w-8 text-danger" aria-label={t('common.delete')}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" onClick={() => openEditor({ type: 'custom' })} className="btn-ghost w-full">
        <Icon name="plus" size={18} /> {t('nutrition.addFood')}
      </button>

      {/* Supplements + creatine */}
      <div className="card">
        <h2 className="mb-2 font-bold">{t('nutrition.supplements')}</h2>
        <ul className="space-y-2">
          {plan.supplements.map((s) => {
            const taken = !!log.supplementsTaken[s.id];
            return (
              <li key={s.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="pill" size={18} className="text-slate-400" />
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-slate-500">{loc(s.dose)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleSupplement(s.id)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${taken ? 'bg-brand text-slate-950' : 'bg-surface-raised text-slate-400'}`}
                >
                  <Icon name="check" size={16} />
                </button>
              </li>
            );
          })}
          <li className="flex items-center justify-between border-t border-white/5 pt-2">
            <span className="text-sm font-medium">{t('nutrition.creatineTaken')}</span>
            <button
              type="button"
              onClick={() => void setCreatine(!log.creatineTaken)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${log.creatineTaken ? 'bg-brand text-slate-950' : 'bg-surface-raised text-slate-400'}`}
            >
              <Icon name="check" size={16} />
            </button>
          </li>
        </ul>
      </div>

      {/* Notes */}
      <div className="card text-sm text-slate-300">
        <h2 className="mb-2 font-bold">{t('nutrition.notes')}</h2>
        <ul className="list-inside list-disc space-y-1">
          {plan.generalNotes.map((n, i) => (
            <li key={i}>{loc(n)}</li>
          ))}
        </ul>
        <h3 className="mb-1 mt-3 font-semibold text-slate-400">{t('nutrition.beverages')}</h3>
        <ul className="list-inside list-disc space-y-1">
          {plan.beverageNotes.map((n, i) => (
            <li key={i}>{loc(n)}</li>
          ))}
        </ul>
      </div>

      <Sheet
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.type === 'replace' ? t('nutrition.replace') : t('nutrition.addFood')}
      >
        <div className="space-y-3">
          <input className="input" placeholder={t('settings.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder={`${t('nutrition.quantity')} (e.g. 200 g)`} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">{t('nutrition.protein')}</label>
              <input className="input" inputMode="numeric" placeholder="0" value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('nutrition.carbs')}</label>
              <input className="input" inputMode="numeric" placeholder="0" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('nutrition.fats')}</label>
              <input className="input" inputMode="numeric" placeholder="0" value={form.fats} onChange={(e) => setForm({ ...form, fats: e.target.value })} />
            </div>
          </div>
          <button type="button" onClick={() => void submitEditor()} className="btn-primary btn-lg w-full">
            {editor?.type === 'replace' ? t('nutrition.replace') : t('common.add')}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
