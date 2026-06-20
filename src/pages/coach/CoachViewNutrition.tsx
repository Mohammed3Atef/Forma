import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CoachDayNav } from "@/components/coach/CoachDayNav";
import { EntityNotes } from "@/components/EntityNotes";
import { useLocalized } from "@/hooks/useLocalized";
import { fetchClientDay } from "@/services/platform/coachApi";
import { getClientMealPlan } from "@/services/platform/planApi";
import { computeConsumed } from "@/stores/nutritionStore";
import { today } from "@/lib/utils";
import { foodLine } from "@/lib/foodFormat";

/** Read-only mirror of the client's Nutrition screen for one day (coach view). */
export function CoachViewNutrition({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const [date, setDate] = useState(today());

  const plan = useQuery({
    queryKey: ["clientMealPlan", clientId],
    queryFn: () => getClientMealPlan(clientId),
    enabled: !!clientId,
    refetchOnWindowFocus: true,
  });
  // The day log changes as the client eats/swaps — keep it fresh (poll + refetch
  // on focus) so the coach sees the client's latest swaps/extras, not a stale snapshot.
  const day = useQuery({
    queryKey: ["clientDay", clientId, date],
    queryFn: () => fetchClientDay(clientId, date),
    enabled: !!clientId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });

  const mealPlan = plan.data ?? null;
  const log = day.data?.nutrition ?? null;
  const consumed = computeConsumed(mealPlan, log);
  const target = mealPlan?.targets;
  const eaten = (mealId: string) => !!log?.mealsEaten[mealId];

  return (
    <div className="space-y-4">
      <CoachDayNav date={date} onChange={setDate} />

      {/* Macro summary */}
      <div className="card grid grid-cols-4 gap-3">
        <Macro
          label={t("nutrition.calories")}
          value={Math.round(consumed.calories)}
          target={target?.calories}
        />
        <Macro
          label={t("nutrition.protein")}
          value={Math.round(consumed.protein)}
          target={target?.protein}
        />
        <Macro
          label={t("nutrition.carbs")}
          value={Math.round(consumed.carbs)}
          target={target?.carbs}
        />
        <Macro
          label={t("nutrition.fats")}
          value={Math.round(consumed.fats)}
          target={target?.fats}
        />
      </div>
      {log && (
        <div className="card text-sm">
          <div className="flex items-center justify-between">
            <span className="text-earth-muted">{t("nutrition.water")}</span>
            <span className="font-mono">{log.waterMl ?? 0} ml</span>
          </div>
          <EntityNotes screen="nutrition" date={date} entityType="water" entityId="water" label={t("nutrition.water")} />
        </div>
      )}

      {!mealPlan ? (
        <p className="py-8 text-center text-sm text-earth-muted">
          {t("clientCoach.waitingNutrition")}
        </p>
      ) : (
        mealPlan.meals.map((meal) => {
          const extras = log?.extraItems?.[meal.id] ?? [];
          // Planned total with the client's swaps applied + extras (mirrors the
          // client's per-meal header).
          const effItems = meal.items
            .flatMap((item) => {
              if (log?.itemOverrides && item.id in log.itemOverrides) {
                const r = log.itemOverrides[item.id];
                return r ? [r] : [];
              }
              return [item];
            })
            .concat(extras);
          const mm = effItems.reduce(
            (a, i) => ({
              kcal: a.kcal + i.calories,
              p: a.p + i.protein,
              c: a.c + i.carbs,
              f: a.f + i.fats,
            }),
            { kcal: 0, p: 0, c: 0, f: 0 },
          );
          return (
            <section key={meal.id} className="card">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold">{loc(meal.label)}</h2>
                  <p
                    className="flex flex-wrap gap-x-2 text-xs text-slate-400"
                    dir="ltr"
                  >
                    <span className="font-semibold text-slate-300">
                      {Math.round(mm.kcal)} kcal
                    </span>
                    <span>P {Math.round(mm.p)}</span>
                    <span>C {Math.round(mm.c)}</span>
                    <span>F {Math.round(mm.f)}</span>
                  </p>
                </div>
                <span
                  className={`chip shrink-0 text-[11px] ${eaten(meal.id) ? "border-success/50 text-success" : "border-line text-earth-subtle"}`}
                >
                  {eaten(meal.id)
                    ? t("activity.finished")
                    : t("activity.notFinished")}
                </span>
              </div>
              <ul className="space-y-1.5 text-sm text-slate-300">
                {meal.items.map((item) => {
                  const overridden = !!(
                    log?.itemOverrides && item.id in log.itemOverrides
                  );
                  const replacement = overridden
                    ? log!.itemOverrides![item.id]
                    : undefined;
                  const removed = overridden && !replacement;
                  const sub = log?.substitutions?.[item.id];
                  // ✅ eaten · 🔄 replaced · ⬜ removed/not-eaten
                  const mark = removed
                    ? "⬜"
                    : replacement
                      ? "🔄"
                      : eaten(meal.id)
                        ? "✅"
                        : "⬜";
                  return (
                    <li
                      key={item.id}
                      className="border-b pb-2 border-earth-subtle/10 "
                    >
                      <div className="flex items-start gap-2 ">
                        <span className="select-none">{mark}</span>
                        <span
                          className={
                            overridden ? "text-slate-500 line-through" : ""
                          }
                        >
                          {loc(item.name)}
                          {item.quantity && (
                            <span className="text-slate-500">
                              {" "}
                              · {item.quantity}
                            </span>
                          )}
                          {removed && (
                            <span className="ms-1 text-[11px] text-slate-500">
                              ({t("nutrition.removed")})
                            </span>
                          )}
                        </span>
                      </div>
                      {replacement && (
                        <p className="ms-6 text-brand-light">
                          ↳ {loc(replacement.name)}
                          {foodLine(replacement) && (
                            <span
                              className="text-[11px] text-earth-subtle"
                              dir="ltr"
                            >
                              {" "}
                              · {foodLine(replacement)}
                            </span>
                          )}
                        </p>
                      )}
                      {sub && (
                        <span
                          className={`ms-6 mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${sub.source === "approved_substitution" ? "bg-success/20 text-success" : "bg-warn/15 text-warn"}`}
                        >
                          {sub.source === "approved_substitution"
                            ? t("nutritionSub.approvedSubstitution")
                            : t("nutritionSub.customSubstitution")}
                          {sub.pendingApproval
                            ? ` · ${t("nutritionSub.needsReview")}`
                            : ""}
                        </span>
                      )}
                      <EntityNotes
                        screen="nutrition"
                        date={date}
                        entityType="food"
                        entityId={item.id}
                        label={loc(item.name)}
                      />
                    </li>
                  );
                })}
              </ul>
              {extras.length > 0 && (
                <div
                  className="mt-2 rounded-xl border border-sky-400/30 bg-sky-400/5 p-2.5"
                  data-testid="coach-extras"
                >
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                    {t("nutrition.addedByClient")}
                  </p>
                  <ul className="space-y-1">
                    {extras.map((f) => (
                      <li key={f.id} className="text-sm text-sky-100">
                        + {loc(f.name)}
                        {foodLine(f) && (
                          <span
                            className="text-[11px] text-sky-300/80"
                            dir="ltr"
                          >
                            {" "}
                            · {foodLine(f)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <EntityNotes
                screen="nutrition"
                date={date}
                entityType="meal"
                entityId={meal.id}
                label={loc(meal.label)}
              />
            </section>
          );
        })
      )}

      {/* Supplements the coach assigned — with the client's taken status. */}
      {mealPlan && mealPlan.supplements.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">{t("nutrition.supplements")}</h2>
          <ul className="space-y-2 text-sm text-slate-300">
            {mealPlan.supplements.map((s) => {
              const taken = !!log?.supplementsTaken?.[s.id];
              const meta = [loc(s.dose), s.timing ? loc(s.timing) : ""]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={s.id}>
                  <div className="flex items-start gap-2">
                    <span className="select-none">{taken ? "✅" : "⬜"}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      {meta && (
                        <p className="text-[12px] text-earth-subtle">{meta}</p>
                      )}
                    </div>
                  </div>
                  <EntityNotes
                    screen="nutrition"
                    date={date}
                    entityType="supplement"
                    entityId={s.id}
                    label={s.name}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Macro({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target?: number;
}) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const over = !!target && value > target;
  return (
    <div className="flex flex-col items-center">
      <span className="stat-label">{label}</span>
      <span
        className={`mt-1 font-mono text-xl font-bold leading-none ${over ? "text-warn" : "text-white"}`}
      >
        {value}
      </span>
      {target ? (
        <>
          <span className="mt-1 text-[10px] leading-none text-earth-subtle">
            / {target}
          </span>
          <div className="mt-1.5 h-1 w-full max-w-[56px] overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${over ? "bg-warn" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
