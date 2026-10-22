import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CoachDayNav } from "@/components/coach/CoachDayNav";
import { EntityNotes } from "@/components/EntityNotes";
import { useLocalized } from "@/hooks/useLocalized";
import { fetchClientNutritionDay } from "@/services/platform/coachApi";
import { getClientMealPlan } from "@/services/platform/planApi";
import { computeConsumed } from "@/stores/nutritionStore";
import { today } from "@/lib/utils";
import { foodLine } from "@/lib/foodFormat";
import { formatNumber } from "@/lib/format";
import { ErrorState } from "@/components/ui/ErrorState";
import { OfflineState, StaleNotice, useQueryScreen } from "@/components/ui/ScreenState";

/**
 * Read-only mirror of the client's Nutrition screen for one day (coach view). B3.9: the plan and the
 * day's log are read before anything is totalled — a failed or offline read is said (CO-18), never
 * shown as "0 kcal eaten" — and every figure carries its unit.
 */
export function CoachViewNutrition({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
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
  // B3.9 (PF-22): the nutrition log alone — not the client's whole day — is what this polls.
  const day = useQuery({
    queryKey: ["clientNutritionDay", clientId, date],
    queryFn: () => fetchClientNutritionDay(clientId, date),
    enabled: !!clientId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });

  const planScreen = useQueryScreen(plan);
  const dayScreen = useQueryScreen(day);
  const blocked = [planScreen, dayScreen].find((s) => s.status === "loading" || s.status === "offline" || s.status === "error");

  const mealPlan = plan.data ?? null;
  const log = day.data ?? null;
  const consumed = computeConsumed(mealPlan, log);
  const target = mealPlan?.targets;
  const eaten = (mealId: string) => !!log?.mealsEaten[mealId];

  if (blocked) {
    return (
      <div className="space-y-4" data-testid="coach-view-nutrition">
        <CoachDayNav date={date} onChange={setDate} />
        {blocked.status === "loading" ? (
          <div className="sk h-28 rounded-ui-surface" aria-busy="true" />
        ) : blocked.status === "offline" ? (
          <OfflineState onRetry={blocked.retry} testId="nutrition-view-offline" />
        ) : (
          <ErrorState onRetry={blocked.retry} testId="nutrition-view-error" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="coach-view-nutrition">
      <CoachDayNav date={date} onChange={setDate} />
      {planScreen.stale || dayScreen.stale ? <StaleNotice online={planScreen.online} /> : null}

      {/* Macro summary */}
      <div className="card grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Macro
          label={t("nutrition.calories")}
          value={Math.round(consumed.calories)}
          target={target?.calories}
          unit={t("common.kcal")}
        />
        <Macro
          label={t("nutrition.protein")}
          value={Math.round(consumed.protein)}
          target={target?.protein}
          unit={t("common.g")}
        />
        <Macro
          label={t("nutrition.carbs")}
          value={Math.round(consumed.carbs)}
          target={target?.carbs}
          unit={t("common.g")}
        />
        <Macro
          label={t("nutrition.fats")}
          value={Math.round(consumed.fats)}
          target={target?.fats}
          unit={t("common.g")}
        />
      </div>
      {log && (
        <div className="card text-sm">
          <div className="flex items-center justify-between">
            <span className="text-earth-muted">{t("nutrition.water")}</span>
            <span className="tabular-nums"><bdi dir="ltr">{formatNumber(log.waterMl ?? 0, i18n.language)}</bdi> {t("common.ml")}</span>
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
                    className="flex flex-wrap gap-x-2 text-[12px] text-earth-muted"
                    dir="ltr"
                  >
                    <span className="font-semibold text-earth">
                      {Math.round(mm.kcal)} {t("common.kcal")}
                    </span>
                    <span>P {Math.round(mm.p)}</span>
                    <span>C {Math.round(mm.c)}</span>
                    <span>F {Math.round(mm.f)}</span>
                  </p>
                </div>
                <span
                  className={`chip shrink-0 text-[12px] ${eaten(meal.id) ? "border-success/50 text-success" : "border-line text-earth-subtle"}`}
                >
                  {eaten(meal.id)
                    ? t("activity.finished")
                    : t("activity.notFinished")}
                </span>
              </div>
              <ul className="space-y-1.5 text-sm text-earth">
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
                            overridden ? "text-earth-subtle line-through" : ""
                          }
                        >
                          {loc(item.name)}
                          {item.quantity && (
                            <span className="text-earth-subtle">
                              {" "}
                              · {item.quantity}
                            </span>
                          )}
                          {removed && (
                            <span className="ms-1 text-[12px] text-earth-subtle">
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
                              className="text-[12px] text-earth-subtle"
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
                          className={`ms-6 mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[12px] ${sub.source === "approved_substitution" ? "bg-success/20 text-success" : "bg-warn/15 text-warn"}`}
                        >
                          {sub.source === "approved_substitution"
                            ? t("nutritionSub.approvedSubstitution")
                            : t("nutritionSub.customSubstitution")}
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
                  className="mt-2 rounded-xl border border-info/30 bg-info/5 p-2.5"
                  data-testid="coach-extras"
                >
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-info">
                    {t("nutrition.addedByClient")}
                  </p>
                  <ul className="space-y-1">
                    {extras.map((f) => (
                      <li key={f.id} className="text-sm text-earth">
                        + {loc(f.name)}
                        {foodLine(f) && (
                          <span
                            className="text-[12px] text-earth-muted"
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
          <ul className="space-y-2 text-sm text-earth">
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
  unit,
}: {
  label: string;
  value: number;
  target?: number;
  unit: string;
}) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const over = !!target && value > target;
  return (
    <div className="flex flex-col items-center">
      <span className="stat-label">{label}</span>
      <span
        className={`mt-1 text-xl font-bold leading-none tabular-nums ${over ? "text-warn" : "text-earth"}`}
      >
        <bdi dir="ltr">{value}</bdi>
      </span>
      {target ? (
        <>
          <span className="mt-1 text-[12px] leading-none text-earth-subtle">
            <bdi dir="ltr">/ {target}</bdi> {unit}
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
