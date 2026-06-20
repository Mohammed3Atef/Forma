import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FoodItem } from "@/types";
import { useNutrition, computeConsumed } from "@/stores/nutritionStore";
import { useSettings } from "@/stores/settingsStore";
import { useSubscription } from "@/hooks/useSubscription";
import { EntityNotes } from "@/components/EntityNotes";
import { confirmDelete } from "@/stores/dialogStore";
import { useLocalized } from "@/hooks/useLocalized";
import { Icon } from "@/components/Icon";
import { ProgressRing } from "@/components/ProgressRing";
import { Sheet } from "@/components/Sheet";
import { TopBar } from "@/components/TopBar";
import { WaitingForCoach } from "@/components/WaitingForCoach";
import { uid } from "@/lib/utils";
import { foodLine } from "@/lib/foodFormat";

export function Nutrition() {
  const { t } = useTranslation();
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
  const { readOnly } = useSubscription();

  // Food editor — handles replacing a planned item, adding to a meal, or a custom snack.
  type EditorMode =
    | { type: "custom"; foodId?: string }
    | { type: "addMeal"; mealId: string; foodId?: string }
    | { type: "replace"; itemId: string };
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [form, setForm] = useState({
    name: "",
    quantity: "",
    protein: "",
    carbs: "",
    fats: "",
  });
  // The planned item being swapped (approved alternatives sheet).
  const [swapItem, setSwapItem] = useState<FoodItem | null>(null);

  if (!plan) {
    return (
      <div className="anim-rise">
        <TopBar title={t("nutrition.title")} eyebrow={t("nutrition.title")} />
        <WaitingForCoach messageKey="clientCoach.waitingNutrition" />
      </div>
    );
  }
  if (!log || !targets)
    return <p className="text-slate-400">{t("progress.noData")}</p>;

  const openEditor = (
    mode: EditorMode,
    prefill?: {
      name: string;
      quantity: string;
      protein: number;
      carbs: number;
      fats: number;
    },
  ) => {
    setForm(
      prefill
        ? {
            name: prefill.name,
            quantity: prefill.quantity,
            protein: String(prefill.protein),
            carbs: String(prefill.carbs),
            fats: String(prefill.fats),
          }
        : { name: "", quantity: "", protein: "", carbs: "", fats: "" },
    );
    setEditor(mode);
  };

  const macros = [
    {
      key: "calories",
      value: consumed.calories,
      target: targets.calories,
      color: "#AE7E56",
    },
    {
      key: "protein",
      value: consumed.protein,
      target: targets.protein,
      color: "#D4A46A",
    },
    {
      key: "carbs",
      value: consumed.carbs,
      target: targets.carbs,
      color: "#BF6E4E",
    },
    {
      key: "fats",
      value: consumed.fats,
      target: targets.fats,
      color: "#2E5D3C",
    },
  ] as const;

  const submitEditor = async () => {
    if (!editor) return;
    const protein = Number(form.protein) || 0;
    const carbs = Number(form.carbs) || 0;
    const fats = Number(form.fats) || 0;
    const name = form.name.trim() || "Custom food";
    const existingId = editor.type !== "replace" ? editor.foodId : undefined;
    const food: FoodItem = {
      id: existingId ?? uid("food"),
      name: { en: name, ar: name },
      quantity: form.quantity.trim(),
      protein,
      carbs,
      fats,
      calories: Math.round(protein * 4 + carbs * 4 + fats * 9),
    };
    if (editor.type === "replace")
      await replaceItem(editor.itemId, food, {
        source: "client_custom_substitution",
        pendingApproval: !!policy?.requireCoachApproval,
      });
    else if (editor.type === "addMeal") await addMealItem(editor.mealId, food);
    else await addCustomFood(food);
    setEditor(null);
  };

  // Coach substitution policy (carried on the synced meal plan).
  const policy = plan.substitutionPolicy;
  const canSwap = !!policy?.allowClientSubstitutions;
  const canCustom = (item: FoodItem) =>
    canSwap && !!policy?.allowCustomFoods && !!item.allowCustomSubstitution;

  const pickAlternative = async (item: FoodItem, alt: FoodItem) => {
    await replaceItem(
      item.id,
      { ...alt, id: alt.id || uid("food") },
      { source: "approved_substitution" },
    );
    setSwapItem(null);
  };

  const waterPct = Math.min(1, log.waterMl / (targets.waterMl || 1));

  return (
    <div className="anim-rise space-y-4">
      <TopBar title={t("nutrition.title")} eyebrow={t("nav.nutrition")} />

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
            <span className="mt-1 text-[10px] uppercase text-slate-400">
              {t(`nutrition.${m.key}`)}
            </span>
            <span className="text-[10px] text-slate-500">/{m.target}</span>
          </div>
        ))}
      </div>

      {/* Water */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="water" size={20} className="text-accent" />
            <span className="font-semibold">{t("nutrition.water")}</span>
          </div>
          <span className="text-sm text-slate-400">
            {log.waterMl} / {targets.waterMl} ml
          </span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${waterPct * 100}%` }}
          />
        </div>
        <div className="flex gap-2">
          {[250, 500, 1000].map((ml) => (
            <button
              key={ml}
              type="button"
              disabled={readOnly}
              onClick={() => void addWater(ml)}
              className="btn-ghost h-11 flex-1 text-sm disabled:opacity-40"
            >
              +{ml}
            </button>
          ))}
          <button
            type="button"
            disabled={readOnly}
            onClick={() => void addWater(-250)}
            className="icon-btn h-11 w-11 disabled:opacity-40"
          >
            <Icon name="minus" size={16} />
          </button>
        </div>
        <EntityNotes
          screen="nutrition"
          entityType="water"
          entityId="water"
        />
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
            (a, i) => ({
              p: a.p + i.protein,
              c: a.c + i.carbs,
              f: a.f + i.fats,
              kcal: a.kcal + i.calories,
            }),
            { p: 0, c: 0, f: 0, kcal: 0 },
          );
          return (
            <section
              key={meal.id}
              className={`card ${eaten ? "ring-1 ring-brand/40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">{loc(meal.label)}</h2>
                  <p
                    className="flex flex-wrap gap-x-2 text-xs text-slate-400"
                    dir="ltr"
                  >
                    <span className="font-semibold text-slate-300">
                      {Math.round(mealMacros.kcal)} kcal
                    </span>
                    <span>P {Math.round(mealMacros.p)}</span>
                    <span>C {Math.round(mealMacros.c)}</span>
                    <span>F {Math.round(mealMacros.f)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => void toggleMeal(meal.id)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-40 ${eaten ? "bg-brand text-slate-950" : "bg-surface-raised text-slate-400"}`}
                  aria-label={t("nutrition.markEaten")}
                >
                  <Icon name="check" size={20} />
                </button>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-300 ">
                {meal.items.map((item) => {
                  const overridden = item.id in log.itemOverrides;
                  const replacement = overridden
                    ? log.itemOverrides[item.id]
                    : undefined;
                  const sub = log.substitutions?.[item.id];
                  const hasApproved =
                    (item.allowedAlternatives?.length ?? 0) > 0;
                  const swapAvailable =
                    canSwap && (hasApproved || canCustom(item));
                  return (
                    <li
                      key={item.id}
                      className="border-b pb-2 border-earth-subtle/10 "
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {/* Original — struck-through when replaced/removed for the day */}
                          <p
                            className={
                              overridden ? "text-slate-500 line-through" : ""
                            }
                          >
                            <span>{loc(item.name)}</span>
                            {item.quantity && (
                              <span className="text-slate-500">
                                {" "}
                                · {item.quantity}
                              </span>
                            )}
                          </p>
                          {replacement && (
                            <>
                              <p className="text-brand-light">
                                ↳ {loc(replacement.name)}
                              </p>
                              {foodLine(replacement) && (
                                <p
                                  className="text-[11px] text-slate-500"
                                  dir="ltr"
                                >
                                  {foodLine(replacement)}
                                </p>
                              )}
                            </>
                          )}
                          {sub && (
                            <span
                              data-testid="sub-badge"
                              className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${sub.source === "approved_substitution" ? "bg-success/20 text-success" : "bg-warn/15 text-warn"}`}
                            >
                              {sub.source === "approved_substitution"
                                ? t("nutritionSub.approvedSubstitution")
                                : t("nutritionSub.customSubstitution")}
                              {sub.pendingApproval
                                ? ` · ${t("nutritionSub.needsReview")}`
                                : ""}
                            </span>
                          )}
                          {overridden && !replacement && (
                            <p className="text-[11px] text-slate-500">
                              {t("nutrition.removed")}
                            </p>
                          )}
                        </div>
                        {!readOnly && (
                          <div className="flex shrink-0 items-center gap-1">
                            {overridden ? (
                              <>
                                {replacement && canCustom(item) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openEditor(
                                        { type: "replace", itemId: item.id },
                                        {
                                          name: loc(replacement.name),
                                          quantity: replacement.quantity,
                                          protein: replacement.protein,
                                          carbs: replacement.carbs,
                                          fats: replacement.fats,
                                        },
                                      )
                                    }
                                    className="icon-btn h-8 w-8"
                                    aria-label={t("common.edit")}
                                  >
                                    <Icon name="edit" size={14} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void resetItem(item.id)}
                                  className="icon-btn h-8 w-8"
                                  aria-label={t("nutrition.reset")}
                                  data-testid="sub-reset"
                                >
                                  <Icon
                                    name="chevron"
                                    size={14}
                                    className="rotate-180"
                                  />
                                </button>
                              </>
                            ) : canSwap ? (
                              <>
                                {swapAvailable && (
                                  <button
                                    type="button"
                                    onClick={() => setSwapItem(item)}
                                    className="icon-btn h-8 w-8"
                                    aria-label={t("nutritionSub.swap")}
                                    data-testid="client-swap"
                                  >
                                    <Icon name="rotate" size={14} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (await confirmDelete())
                                      void removeItem(item.id);
                                  }}
                                  className="icon-btn h-8 w-8 text-danger"
                                  aria-label={t("common.delete")}
                                >
                                  <Icon name="close" size={14} />
                                </button>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <EntityNotes
                        screen="nutrition"
                        entityType="food"
                        entityId={item.id}
                      />
                    </li>
                  );
                })}

                {/* Extra foods added to this meal today */}
                {(log.extraItems[meal.id] ?? []).map((f) => (
                  <li
                    key={f.id}
                    className="flex items-start justify-between gap-2 border-b pb-2 border-earth-subtle/10"
                  >
                    <div className="min-w-0">
                      <p className="text-brand-light">+ {loc(f.name)}</p>
                      {foodLine(f) && (
                        <p className="text-[11px] text-slate-500" dir="ltr">
                          {foodLine(f)}
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            openEditor(
                              {
                                type: "addMeal",
                                mealId: meal.id,
                                foodId: f.id,
                              },
                              {
                                name: loc(f.name),
                                quantity: f.quantity,
                                protein: f.protein,
                                carbs: f.carbs,
                                fats: f.fats,
                              },
                            )
                          }
                          className="icon-btn h-8 w-8"
                          aria-label={t("common.edit")}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (await confirmDelete())
                              void removeMealItem(meal.id, f.id);
                          }}
                          className="icon-btn h-8 w-8 text-danger"
                          aria-label={t("common.delete")}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {!readOnly && (
                <button
                  type="button"
                  onClick={() =>
                    openEditor({ type: "addMeal", mealId: meal.id })
                  }
                  className="mt-2 text-xs font-medium text-brand-light"
                >
                  + {t("nutrition.addFood")}
                </button>
              )}
              <EntityNotes
                screen="nutrition"
                entityType="meal"
                entityId={meal.id}
              />
            </section>
          );
        })}
      </div>

      {/* Custom foods */}
      {log.customFoods.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t("nutrition.addFood")}</h2>
          <ul className="space-y-1.5 text-sm">
            {log.customFoods.map((f) => (
              <li
                key={f.id}
                className="flex items-start justify-between gap-2 border-b pb-2 border-earth-subtle/10"
              >
                <div className="min-w-0">
                  <p>{loc(f.name)}</p>
                  <p className="text-[11px] text-slate-500" dir="ltr">
                    {f.quantity ? `${f.quantity} · ` : ""}
                    {f.calories} kcal · P{f.protein} C{f.carbs} F{f.fats}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        openEditor(
                          { type: "custom", foodId: f.id },
                          {
                            name: loc(f.name),
                            quantity: f.quantity,
                            protein: f.protein,
                            carbs: f.carbs,
                            fats: f.fats,
                          },
                        )
                      }
                      className="icon-btn h-8 w-8"
                      aria-label={t("common.edit")}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirmDelete()) void removeCustomFood(f.id);
                      }}
                      className="icon-btn h-8 w-8 text-danger"
                      aria-label={t("common.delete")}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={() => openEditor({ type: "custom" })}
          className="btn-ghost w-full"
        >
          <Icon name="plus" size={18} /> {t("nutrition.addFood")}
        </button>
      )}

      {/* Supplements — only the ones the coach assigned. */}
      {plan.supplements.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t("nutrition.supplements")}</h2>
          <ul className="space-y-2">
            {plan.supplements.map((s) => {
              const taken = !!log.supplementsTaken[s.id];
              return (
                <li key={s.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="pill" size={18} className="text-slate-400" />
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-slate-500">
                          {[loc(s.dose), s.timing ? loc(s.timing) : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => void toggleSupplement(s.id)}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-40 ${taken ? "bg-brand text-slate-950" : "bg-surface-raised text-slate-400"}`}
                    >
                      <Icon name="check" size={16} />
                    </button>
                  </div>
                  <EntityNotes
                    screen="nutrition"
                    entityType="supplement"
                    entityId={s.id}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Notes — only when the coach added any. */}
      {(plan.generalNotes.length > 0 || plan.beverageNotes.length > 0) && (
        <div className="card text-sm text-slate-300">
          {plan.generalNotes.length > 0 && (
            <>
              <h2 className="mb-2 font-bold">{t("nutrition.notes")}</h2>
              <ul className="list-inside list-disc space-y-1">
                {plan.generalNotes.map((n, i) => (
                  <li key={i}>{loc(n)}</li>
                ))}
              </ul>
            </>
          )}
          {plan.beverageNotes.length > 0 && (
            <>
              <h3 className="mb-1 mt-3 font-semibold text-slate-400">
                {t("nutrition.beverages")}
              </h3>
              <ul className="list-inside list-disc space-y-1">
                {plan.beverageNotes.map((n, i) => (
                  <li key={i}>{loc(n)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Sheet
        open={!!editor}
        onClose={() => setEditor(null)}
        title={
          editor?.type === "replace"
            ? t("nutrition.replace")
            : t("nutrition.addFood")
        }
      >
        <div className="space-y-3">
          <input
            className="input"
            placeholder={t("settings.name")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            placeholder={`${t("nutrition.quantity")} (e.g. 200 g)`}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">{t("nutrition.protein")}</label>
              <input
                className="input"
                inputMode="numeric"
                placeholder="0"
                value={form.protein}
                onChange={(e) => setForm({ ...form, protein: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("nutrition.carbs")}</label>
              <input
                className="input"
                inputMode="numeric"
                placeholder="0"
                value={form.carbs}
                onChange={(e) => setForm({ ...form, carbs: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("nutrition.fats")}</label>
              <input
                className="input"
                inputMode="numeric"
                placeholder="0"
                value={form.fats}
                onChange={(e) => setForm({ ...form, fats: e.target.value })}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void submitEditor()}
            className="btn-primary btn-lg w-full"
          >
            {editor?.type === "replace"
              ? t("nutrition.replace")
              : t("common.add")}
          </button>
        </div>
      </Sheet>

      {/* Swap a planned item for a coach-approved alternative (or a custom food). */}
      <Sheet
        open={!!swapItem}
        onClose={() => setSwapItem(null)}
        title={t("nutritionSub.swap")}
      >
        {swapItem && (
          <div className="space-y-3" data-testid="swap-sheet">
            {(swapItem.allowedAlternatives?.length ?? 0) > 0 ? (
              <>
                <p className="label">
                  {t("nutritionSub.approvedAlternatives")}
                </p>
                <div className="card divide-y divide-line-soft">
                  {swapItem.allowedAlternatives!.map((alt) => (
                    <button
                      key={alt.id}
                      type="button"
                      data-testid="swap-approved-item"
                      className="row w-full text-start"
                      onClick={() => void pickAlternative(swapItem, alt)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {loc(alt.name)}
                        </span>
                        <span
                          className="block truncate text-[12px] text-earth-subtle"
                          dir="ltr"
                        >
                          {alt.quantity ? `${alt.quantity} · ` : ""}
                          {alt.calories} kcal · P{alt.protein} C{alt.carbs} F
                          {alt.fats}
                        </span>
                      </span>
                      <Icon name="check" size={18} className="text-brand" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-earth-muted">
                {t("nutritionSub.noApproved")}
              </p>
            )}
            {canCustom(swapItem) && (
              <button
                type="button"
                data-testid="swap-custom"
                className="btn-ghost w-full"
                onClick={() => {
                  const it = swapItem;
                  setSwapItem(null);
                  openEditor(
                    { type: "replace", itemId: it.id },
                    {
                      name: loc(it.name),
                      quantity: it.quantity,
                      protein: it.protein,
                      carbs: it.carbs,
                      fats: it.fats,
                    },
                  );
                }}
              >
                <Icon name="plus" size={16} /> {t("nutritionSub.customFood")}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
