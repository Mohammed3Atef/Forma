import { useMemo, useState } from 'react';
import { NumericField } from '@/components/ui/NumericField';
import { parseDecimal, parseDecimalOrNull } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { FoodItem, LocalizedText, Meal } from '@/types';
import { applyLocalizedEdit, langOf } from '@/lib/localizedText';
import { useNutrition, computeConsumed } from '@/stores/nutritionStore';
import { useSettings } from '@/stores/settingsStore';
import { useCoachContentSync } from '@/stores/coachContentStore';
import { useSubscription } from '@/hooks/useSubscription';
import { EntityNotes } from '@/components/EntityNotes';
import { confirmDelete } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useLocalized } from '@/hooks/useLocalized';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { TextInput } from '@/components/ui/Field';
import { ListGroup, Section } from '@/components/ui/ListRow';
import { WaitingForCoach } from '@/components/WaitingForCoach';
import { DaySwitcher } from '@/components/client/DaySwitcher';
import { uid } from '@/lib/utils';
import { foodLine } from '@/lib/foodFormat';
import { FoodSearchPicker } from '@/components/workout/FoodSearchPicker';
import { formatNumber } from '@/lib/format';

/*
 * NUTRITION (B2.4, doc 16): "What do I eat today?"
 *   remaining calories (targets only when the coach set them — never invented);
 *   water; meals as sections — tap the tick when eaten; each food's swap /
 *   edit / remove sits in its row menu (no red × on every row, VS-08);
 *   ONE add-food flow that asks which meal it belongs to (CL-26);
 *   supplements; the coach's notes.
 * The day is today unless the switcher says otherwise, in words (CL-04).
 * The meal plan is the coach's: swaps follow the coach's substitution policy.
 */

type EditorMode = { type: 'add'; mealId: string | null; foodId?: string } | { type: 'replace'; itemId: string };

export function Nutrition() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const loc = useLocalized();
  const plan = useNutrition((s) => s.plan);
  const log = useNutrition((s) => s.log);
  const toggleMeal = useNutrition((s) => s.toggleMeal);
  const toggleSupplement = useNutrition((s) => s.toggleSupplement);
  const addWater = useNutrition((s) => s.addWater);
  const addCustomFood = useNutrition((s) => s.addCustomFood);
  const removeCustomFood = useNutrition((s) => s.removeCustomFood);
  const replaceItem = useNutrition((s) => s.replaceItem);
  const removeItem = useNutrition((s) => s.removeItem);
  const resetItem = useNutrition((s) => s.resetItem);
  const addMealItem = useNutrition((s) => s.addMealItem);
  const removeMealItem = useNutrition((s) => s.removeMealItem);
  const consumed = useMemo(() => computeConsumed(plan, log), [plan, log]);
  const targets = useSettings((s) => s.settings?.targets);
  const contentSync = useCoachContentSync();
  const { readOnly } = useSubscription();

  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [form, setForm] = useState<{ name: string; nameOrig?: LocalizedText; quantity: string; protein: string; carbs: string; fats: string }>({ name: '', quantity: '', protein: '', carbs: '', fats: '' });
  const [swapItem, setSwapItem] = useState<FoodItem | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  if (!plan) {
    return (
      <>
        <DaySwitcher />
        {contentSync.status === 'failed' ? (
          <ErrorState message={t('clientCoach.loadFailed')} onRetry={contentSync.retry ?? undefined} testId="nutrition-load-error" />
        ) : contentSync.status === 'idle' ? (
          <LoadingState variant="list" count={3} />
        ) : (
          <WaitingForCoach messageKey="clientCoach.waitingNutrition" />
        )}
      </>
    );
  }
  if (!log || !targets) {
    return (
      <>
        <DaySwitcher />
        <LoadingState variant="list" count={3} />
      </>
    );
  }

  const policy = plan.substitutionPolicy;
  const canSwap = !!policy?.allowClientSubstitutions;
  const canCustom = (item: FoodItem) => canSwap && !!policy?.allowCustomFoods && !!item.allowCustomSubstitution;

  const openEditor = (mode: EditorMode, prefill?: { name: string; nameOrig?: LocalizedText; quantity: string; protein: number; carbs: number; fats: number }) => {
    setForm(prefill ? { name: prefill.name, nameOrig: prefill.nameOrig, quantity: prefill.quantity, protein: String(prefill.protein), carbs: String(prefill.carbs), fats: String(prefill.fats) } : { name: '', quantity: '', protein: '', carbs: '', fats: '' });
    setEditorError(null);
    setEditor(mode);
  };

  const submitEditor = async () => {
    if (!editor) return;
    const protein = parseDecimal(form.protein);
    const carbs = parseDecimal(form.carbs);
    const fats = parseDecimal(form.fats);
    // A food with nothing in it is not a food (CL-28).
    if (!form.name.trim() && protein + carbs + fats <= 0) {
      setEditorError(t('nutrition.needFood'));
      return;
    }
    const name = form.name.trim() || t('nutritionSub.customFood');
    const existingId = editor.type === 'add' ? editor.foodId : undefined;
    const food: FoodItem = {
      id: existingId ?? uid('food'),
      // The client edits in THEIR language; the coach's other-language name is kept (B1.8 / FD-01).
      name: applyLocalizedEdit(form.nameOrig, name, langOf(lang)),
      quantity: form.quantity.trim(),
      protein,
      carbs,
      fats,
      calories: Math.round(protein * 4 + carbs * 4 + fats * 9),
    };
    setEditorSaving(true);
    setEditorError(null);
    try {
      if (editor.type === 'replace') await replaceItem(editor.itemId, food, { source: 'client_custom_substitution', pendingApproval: !!policy?.requireCoachApproval });
      else if (editor.mealId) await addMealItem(editor.mealId, food);
      else await addCustomFood(food);
      setEditor(null);
      showToast({ title: t('common.saved'), variant: 'success' });
    } catch {
      setEditorError(t('common.savedFailed'));
    } finally {
      setEditorSaving(false);
    }
  };

  const pickAlternative = async (item: FoodItem, alt: FoodItem) => {
    await replaceItem(item.id, { ...alt, id: alt.id || uid('food') }, { source: 'approved_substitution' });
    setSwapItem(null);
  };

  const remaining = Math.round(targets.calories - consumed.calories);
  const hasTargets = targets.calories > 0;
  const macros = [
    { key: 'protein', value: consumed.protein, target: targets.protein, color: '#FF8B02' },
    { key: 'carbs', value: consumed.carbs, target: targets.carbs, color: '#8B7CF0' },
    { key: 'fats', value: consumed.fats, target: targets.fats, color: '#2FB8B0' },
  ] as const;
  const mealsDone = plan.meals.filter((m) => log.mealsEaten[m.id]).length;
  const waterTarget = targets.waterMl ?? 0;

  return (
    <div className="space-y-7" data-testid="client-nutrition">
      <DaySwitcher className="!mb-0" />

      {/* Remaining today */}
      <section
        className="relative overflow-hidden rounded-[20px] border border-white/[0.1] bg-gradient-surface-hi p-5 after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:content-[''] md:p-6"
        data-testid="nutrition-summary"
      >
        <div className="relative z-[1]">
          <p className="text-[13px] font-medium text-brand-hover">{hasTargets ? (remaining >= 0 ? t('nutrition.remaining') : t('nutrition.overTarget')) : t('nutrition.eatenSoFar')}</p>
          <p className="mt-1 font-mono text-[40px] font-semibold leading-none tabular-nums">
            <span dir="ltr">{formatNumber(hasTargets ? Math.abs(remaining) : Math.round(consumed.calories), lang)}</span>
            <span className="ms-1.5 font-sans text-[16px] font-normal text-earth-muted">{t('common.kcal')}</span>
          </p>
          {hasTargets && (
            <p className="mt-2 text-[14px] tabular-nums text-earth-muted">
              {t('nutrition.ofTarget', { eaten: formatNumber(Math.round(consumed.calories), lang), target: formatNumber(targets.calories, lang) })}
            </p>
          )}
          {macros.some((m) => m.target > 0) && (
            <div className="mt-5 grid grid-cols-3 gap-3">
              {macros.map((m) => (
                <div key={m.key}>
                  <p className="text-[12px] text-earth-muted">{t(`nutrition.${m.key}`)}</p>
                  <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                    <span dir="ltr">
                      {formatNumber(Math.round(m.value), lang)}
                      {m.target > 0 && <span className="text-[13px] font-normal text-earth-muted">/{formatNumber(m.target, lang)}g</span>}
                    </span>
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${m.target > 0 ? Math.min(100, (m.value / m.target) * 100) : 0}%`, background: m.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Water */}
      {waterTarget > 0 && (
        <section className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4" data-testid="nutrition-water">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{t('today.water')}</p>
              <p className="text-[14px] tabular-nums text-earth-muted">
                <span dir="ltr">
                  {formatNumber(log.waterMl / 1000, lang, { maxFractionDigits: 2 })} / {formatNumber(waterTarget / 1000, lang, { maxFractionDigits: 2 })}
                </span>{' '}
                {t('today.liters')}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {[250, 500].map((ml) => (
                <button key={ml} type="button" disabled={readOnly} onClick={() => void addWater(ml)} className="min-h-ui-hit rounded-ui-control border border-white/[0.12] px-3 text-[14px] font-semibold tabular-nums disabled:opacity-40" aria-label={t('nutrition.addMl', { ml })}>
                  <span dir="ltr">+{ml}</span>
                </button>
              ))}
              <button type="button" disabled={readOnly || log.waterMl <= 0} onClick={() => void addWater(-250)} className="min-h-ui-hit rounded-ui-control border border-white/[0.12] px-3 text-[14px] font-semibold tabular-nums text-earth-muted disabled:opacity-30" aria-label={t('nutrition.removeMl', { ml: 250 })}>
                <span dir="ltr">−250</span>
              </button>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <span className="block h-full rounded-full bg-info" style={{ width: `${Math.min(100, (log.waterMl / waterTarget) * 100)}%` }} />
          </div>
          <EntityNotes screen="nutrition" date={log.date} entityType="water" entityId="water" />
        </section>
      )}

      {/* Meals */}
      <Section title={t('nutrition.mealsTitle', { done: mealsDone, total: plan.meals.length })} testId="nutrition-meals">
        <div className="space-y-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0">
          {plan.meals.map((meal) => (
            <MealSection
              key={meal.id}
              meal={meal}
              eaten={!!log.mealsEaten[meal.id]}
              readOnly={readOnly}
              renderItems={() => renderMealItems(meal)}
              mealMacros={mealMacrosOf(meal)}
              onToggle={() => void toggleMeal(meal.id)}
              onAdd={() => openEditor({ type: 'add', mealId: meal.id })}
              notes={<EntityNotes screen="nutrition" date={log.date} entityType="meal" entityId={meal.id} />}
            />
          ))}
        </div>
      </Section>

      {/* Other foods (not part of a meal) + the one Add-food flow */}
      <Section title={t('nutrition.otherFoods')} testId="nutrition-other">
        {log.customFoods.length > 0 && (
          <ListGroup className="mb-3">
            {log.customFoods.map((f) => (
              <FoodRow
                key={f.id}
                name={loc(f.name)}
                meta={foodLine(f)}
                readOnly={readOnly}
                menu={[
                  { key: 'edit', label: t('common.edit'), icon: 'edit', onSelect: () => openEditor({ type: 'add', mealId: null, foodId: f.id }, { name: loc(f.name), nameOrig: f.name, quantity: f.quantity, protein: f.protein, carbs: f.carbs, fats: f.fats }) },
                  { key: 'remove', label: t('common.delete'), icon: 'trash', danger: true, onSelect: async () => { if (await confirmDelete()) void removeCustomFood(f.id); } },
                ]}
              />
            ))}
          </ListGroup>
        )}
        {!readOnly && (
          <Button variant="secondary" icon="plus" className="w-full" onClick={() => openEditor({ type: 'add', mealId: null })}>
            {t('nutrition.addFood')}
          </Button>
        )}
      </Section>

      {plan.supplements.length > 0 && (
        <Section title={t('nutrition.supplements')} testId="nutrition-supplements">
          <ListGroup>
            {plan.supplements.map((s) => {
              const taken = !!log.supplementsTaken[s.id];
              return (
                <div key={s.id}>
                  <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] font-semibold ${taken ? 'text-earth-muted' : ''}`}>{s.name}</span>
                      <span className="block truncate text-[13px] text-earth-muted">{[loc(s.dose), s.timing ? loc(s.timing) : ''].filter(Boolean).join(' · ')}</span>
                    </span>
                    <TickButton on={taken} disabled={readOnly} label={t('nutrition.takenLabel', { name: s.name })} onClick={() => void toggleSupplement(s.id)} />
                  </div>
                  <div className="px-4 pb-2 empty:hidden">
                    <EntityNotes screen="nutrition" date={log.date} entityType="supplement" entityId={s.id} />
                  </div>
                </div>
              );
            })}
          </ListGroup>
        </Section>
      )}

      {(plan.generalNotes.length > 0 || plan.beverageNotes.length > 0) && (
        <Section title={t('exerciseDetail.coachNotes')}>
          <div className="space-y-2 border-s-2 border-brand/50 ps-3 text-[15px] leading-relaxed text-earth">
            {plan.generalNotes.map((n, i) => (
              <p key={`g${i}`}>{loc(n)}</p>
            ))}
            {plan.beverageNotes.length > 0 && <p className="pt-1 text-[13px] font-semibold text-earth-muted">{t('nutrition.beverages')}</p>}
            {plan.beverageNotes.map((n, i) => (
              <p key={`b${i}`}>{loc(n)}</p>
            ))}
          </div>
        </Section>
      )}

      {/* The one Add-food flow: search a database or type it, and choose where it goes. */}
      <Sheet open={!!editor} onClose={() => setEditor(null)} title={editor?.type === 'replace' ? t('nutrition.replace') : editor?.type === 'add' && editor.foodId ? t('common.edit') : t('nutrition.addFood')}>
        <div className="space-y-4">
          {editor?.type === 'add' && !editor.foodId && (
            <div role="radiogroup" aria-label={t('nutrition.addTo')} data-testid="food-target">
              <p className="mb-1.5 text-[14px] font-medium">{t('nutrition.addTo')}</p>
              <div className="flex flex-wrap gap-2">
                {[...plan.meals.map((m) => ({ id: m.id as string | null, label: loc(m.label) })), { id: null, label: t('nutrition.otherFood') }].map((o) => (
                  <button
                    key={o.id ?? 'other'}
                    type="button"
                    role="radio"
                    aria-checked={editor.mealId === o.id}
                    onClick={() => setEditor({ type: 'add', mealId: o.id })}
                    className={`min-h-ui-hit rounded-ui-pill border px-3.5 text-[14px] font-medium ${editor.mealId === o.id ? 'border-brand/60 bg-brand/[0.13] text-earth' : 'border-white/[0.12] text-earth-muted'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <FoodSearchPicker onPick={(f) => setForm({ ...form, name: f.name, quantity: f.quantity, protein: String(f.protein), carbs: String(f.carbs), fats: String(f.fats) })} />
          <div className="h-px bg-white/[0.08]" />
          <TextInput label={t('settings.name')} helper={t('nutrition.nameOptionalHint')} placeholder={t('settings.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextInput label={t('nutrition.quantity')} placeholder={t('nutrition.quantityExample')} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <NumericField label={t('nutrition.protein')} placeholder="0" value={parseDecimalOrNull(form.protein)} onChange={(n) => setForm({ ...form, protein: n == null ? '' : String(n) })} />
            <NumericField label={t('nutrition.carbs')} placeholder="0" value={parseDecimalOrNull(form.carbs)} onChange={(n) => setForm({ ...form, carbs: n == null ? '' : String(n) })} />
            <NumericField label={t('nutrition.fats')} placeholder="0" value={parseDecimalOrNull(form.fats)} onChange={(n) => setForm({ ...form, fats: n == null ? '' : String(n) })} />
          </div>
          {editorError && (
            <p role="alert" className="text-[14px] text-warn" data-testid="food-editor-error">
              {editorError}
            </p>
          )}
          <Button size="lg" pending={editorSaving} onClick={() => void submitEditor()} className="w-full">
            {editor?.type === 'replace' ? t('nutrition.replace') : editor?.type === 'add' && editor.foodId ? t('common.save') : t('common.add')}
          </Button>
        </div>
      </Sheet>

      {/* Swap a planned food for a coach-approved alternative (or a custom one). */}
      <Sheet open={!!swapItem} onClose={() => setSwapItem(null)} title={t('nutritionSub.swap')}>
        {swapItem && (
          <div className="space-y-4" data-testid="swap-sheet">
            {(swapItem.allowedAlternatives?.length ?? 0) > 0 ? (
              <>
                <p className="text-[14px] font-medium text-earth-muted">{t('nutritionSub.approvedAlternatives')}</p>
                <ListGroup>
                  {swapItem.allowedAlternatives!.map((alt) => (
                    <button key={alt.id} type="button" data-testid="swap-approved-item" className="flex min-h-14 w-full items-center gap-3 px-4 text-start hover:bg-white/[0.03]" onClick={() => void pickAlternative(swapItem, alt)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{loc(alt.name)}</span>
                        <span className="block truncate text-[13px] text-earth-muted">
                          <bdi>{foodLine(alt)}</bdi>
                        </span>
                      </span>
                      <Icon name="chevron" size={18} className="text-earth-subtle" />
                    </button>
                  ))}
                </ListGroup>
              </>
            ) : (
              <p className="text-[15px] text-earth-muted">{t('nutritionSub.noApproved')}</p>
            )}
            {canCustom(swapItem) && (
              <Button
                variant="secondary"
                icon="plus"
                className="w-full"
                data-testid="swap-custom"
                onClick={() => {
                  const it = swapItem;
                  setSwapItem(null);
                  openEditor({ type: 'replace', itemId: it.id }, { name: loc(it.name), quantity: it.quantity, protein: it.protein, carbs: it.carbs, fats: it.fats });
                }}
              >
                {t('nutritionSub.customFood')}
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );

  function effectiveItems(meal: Meal): FoodItem[] {
    return meal.items
      .flatMap((item) => {
        if (log && item.id in log.itemOverrides) {
          const ov = log.itemOverrides[item.id];
          return ov ? [ov] : [];
        }
        return [item];
      })
      .concat(log?.extraItems[meal.id] ?? []);
  }

  function mealMacrosOf(meal: Meal) {
    return effectiveItems(meal).reduce((a, i) => ({ p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fats, kcal: a.kcal + i.calories }), { p: 0, c: 0, f: 0, kcal: 0 });
  }

  function renderMealItems(meal: Meal) {
    if (!log) return null;
    return (
      <>
        {meal.items.map((item) => {
          const overridden = item.id in log.itemOverrides;
          const replacement = overridden ? log.itemOverrides[item.id] : undefined;
          const sub = log.substitutions?.[item.id];
          const swapAvailable = canSwap && ((item.allowedAlternatives?.length ?? 0) > 0 || canCustom(item));
          const menu: ActionMenuItem[] = overridden
            ? [
                ...(replacement && canCustom(item) ? [{ key: 'edit', label: t('common.edit'), icon: 'edit' as const, onSelect: () => openEditor({ type: 'replace', itemId: item.id }, { name: loc(replacement.name), quantity: replacement.quantity, protein: replacement.protein, carbs: replacement.carbs, fats: replacement.fats }) }] : []),
                { key: 'reset', label: t('nutrition.reset'), icon: 'rotate' as const, onSelect: () => void resetItem(item.id), testId: 'sub-reset' },
              ]
            : canSwap
              ? [
                  ...(swapAvailable ? [{ key: 'swap', label: t('nutritionSub.swap'), icon: 'rotate' as const, onSelect: () => setSwapItem(item), testId: 'client-swap' }] : []),
                  { key: 'remove', label: t('nutrition.skipToday'), icon: 'trash' as const, danger: true, onSelect: async () => { if (await confirmDelete()) void removeItem(item.id); } },
                ]
              : [];
          return (
            <div key={item.id}>
              <FoodRow
                name={overridden && replacement ? loc(replacement.name) : loc(item.name)}
                struck={overridden ? loc(item.name) : undefined}
                meta={
                  overridden && !replacement
                    ? t('nutrition.removed')
                    : [
                        (replacement ?? item).quantity,
                        `${formatNumber((replacement ?? item).calories, lang)} kcal`,
                        sub ? (sub.source === 'approved_substitution' ? t('nutritionSub.approvedSubstitution') : t('nutritionSub.customSubstitution')) + (sub.pendingApproval ? ` · ${t('nutritionSub.needsReview')}` : '') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                }
                readOnly={readOnly}
                menu={menu}
                menuLabel={t('nutrition.foodOptions', { name: loc(item.name) })}
              />
              <div className="px-4 pb-2 empty:hidden">
                <EntityNotes screen="nutrition" date={log.date} entityType="food" entityId={item.id} />
              </div>
            </div>
          );
        })}
        {(log.extraItems[meal.id] ?? []).map((f) => (
          <FoodRow
            key={f.id}
            name={`+ ${loc(f.name)}`}
            meta={foodLine(f)}
            readOnly={readOnly}
            menuLabel={t('nutrition.foodOptions', { name: loc(f.name) })}
            menu={[
              { key: 'edit', label: t('common.edit'), icon: 'edit', onSelect: () => openEditor({ type: 'add', mealId: meal.id, foodId: f.id }, { name: loc(f.name), nameOrig: f.name, quantity: f.quantity, protein: f.protein, carbs: f.carbs, fats: f.fats }) },
              { key: 'remove', label: t('common.delete'), icon: 'trash', danger: true, onSelect: async () => { if (await confirmDelete()) void removeMealItem(meal.id, f.id); } },
            ]}
          />
        ))}
      </>
    );
  }
}

function MealSection({
  meal,
  eaten,
  readOnly,
  renderItems,
  mealMacros,
  onToggle,
  onAdd,
  notes,
}: {
  meal: Meal;
  eaten: boolean;
  readOnly: boolean;
  renderItems: () => React.ReactNode;
  mealMacros: { p: number; c: number; f: number; kcal: number };
  onToggle: () => void;
  onAdd: () => void;
  notes: React.ReactNode;
}) {
  const { t } = useTranslation();
  const loc = useLocalized();
  return (
    <section
      data-testid={`meal-${meal.id}`}
      data-eaten={eaten || undefined}
      className={`overflow-hidden rounded-ui-surface border bg-surface-card transition-colors duration-ui-base ${eaten ? 'border-success/40' : 'border-white/[0.07]'}`}
    >
      <div className="flex items-center gap-3 px-4 pb-2 pt-3.5">
        <div className="min-w-0 flex-1">
          <h3 className={`text-[17px] font-semibold ${eaten ? 'text-success' : ''}`}>{loc(meal.label)}</h3>
          <p className="mt-0.5 text-[13px] tabular-nums text-earth-muted">
            <span dir="ltr">
              {Math.round(mealMacros.kcal)} kcal · P{Math.round(mealMacros.p)} C{Math.round(mealMacros.c)} F{Math.round(mealMacros.f)}
            </span>
          </p>
        </div>
        <TickButton on={eaten} disabled={readOnly} label={t('nutrition.markEaten')} onClick={onToggle} />
      </div>
      <div className="divide-y divide-white/[0.05]">{renderItems()}</div>
      <div className="px-4 empty:hidden">{notes}</div>
      {!readOnly && (
        <button type="button" onClick={onAdd} className="flex min-h-12 w-full items-center gap-2 border-t border-white/[0.05] px-4 text-[14px] font-medium text-earth-muted hover:text-earth" aria-label={t('nutrition.addFoodTo', { meal: loc(meal.label) })}>
          <Icon name="plus" size={16} /> {t('nutrition.addFood')}
        </button>
      )}
    </section>
  );
}

function FoodRow({ name, struck, meta, readOnly, menu, menuLabel }: { name: string; struck?: string; meta?: string; readOnly: boolean; menu: ActionMenuItem[]; menuLabel?: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1">
        {struck && <span className="block truncate text-[13px] text-earth-subtle line-through">{struck}</span>}
        <span className="block truncate text-[15px]">{name}</span>
        {meta ? (
          <span className="block truncate text-[13px] text-earth-muted">
            <bdi>{meta}</bdi>
          </span>
        ) : null}
      </span>
      {!readOnly && menu.length > 0 && <ActionMenu size="sm" label={menuLabel ?? name} items={menu} />}
    </div>
  );
}

function TickButton({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-ui-fast disabled:opacity-40 ${on ? 'border-success bg-success text-[#06210f]' : 'border-white/[0.18] text-earth-muted hover:border-white/30'}`}
    >
      <Icon name="check" size={20} />
    </button>
  );
}
