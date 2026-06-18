import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CoachDayNav } from '@/components/coach/CoachDayNav';
import { EntityNotes } from '@/components/EntityNotes';
import { useLocalized } from '@/hooks/useLocalized';
import { fetchClientDay } from '@/services/platform/coachApi';
import { getClientMealPlan } from '@/services/platform/planApi';
import { computeConsumed } from '@/stores/nutritionStore';
import { today } from '@/lib/utils';

/** Read-only mirror of the client's Nutrition screen for one day (coach view). */
export function CoachViewNutrition({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const [date, setDate] = useState(today());

  const plan = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const day = useQuery({ queryKey: ['clientDay', clientId, date], queryFn: () => fetchClientDay(clientId, date), enabled: !!clientId });

  const mealPlan = plan.data ?? null;
  const log = day.data?.nutrition ?? null;
  const consumed = computeConsumed(mealPlan, log);
  const target = mealPlan?.targets;
  const eaten = (mealId: string) => !!log?.mealsEaten[mealId];

  return (
    <div className="space-y-4">
      <CoachDayNav date={date} onChange={setDate} />

      {/* Macro summary */}
      <div className="card grid grid-cols-4 gap-2 text-center">
        <Macro label={t('nutrition.calories')} value={Math.round(consumed.calories)} target={target?.calories} />
        <Macro label={t('nutrition.protein')} value={Math.round(consumed.protein)} target={target?.protein} />
        <Macro label={t('nutrition.carbs')} value={Math.round(consumed.carbs)} target={target?.carbs} />
        <Macro label={t('nutrition.fats')} value={Math.round(consumed.fats)} target={target?.fats} />
      </div>
      {log && (
        <div className="card flex items-center justify-between text-sm">
          <span className="text-earth-muted">{t('nutrition.water')}</span>
          <span className="font-mono">{log.waterMl ?? 0} ml</span>
        </div>
      )}

      {!mealPlan ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('clientCoach.waitingNutrition')}</p>
      ) : (
        mealPlan.meals.map((meal) => {
          const extras = log?.extraItems?.[meal.id] ?? [];
          return (
            <section key={meal.id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-bold">{loc(meal.label)}</h2>
                <span className={`chip text-[11px] ${eaten(meal.id) ? 'border-success/50 text-success' : 'text-earth-subtle'}`}>
                  {eaten(meal.id) ? t('activity.finished') : '—'}
                </span>
              </div>
              <ul className="space-y-1.5 text-sm text-slate-300">
                {meal.items.map((item) => {
                  const overridden = !!(log?.itemOverrides && item.id in log.itemOverrides);
                  const replacement = overridden ? log!.itemOverrides![item.id] : undefined;
                  const removed = overridden && !replacement;
                  // ✅ eaten · 🔄 replaced · ⬜ removed/not-eaten
                  const mark = removed ? '⬜' : replacement ? '🔄' : eaten(meal.id) ? '✅' : '⬜';
                  return (
                    <li key={item.id}>
                      <div className="flex items-start gap-2">
                        <span className="select-none">{mark}</span>
                        <span className={overridden ? 'text-slate-500 line-through' : ''}>
                          {loc(item.name)}
                          {item.quantity && <span className="text-slate-500"> · {item.quantity}</span>}
                          {removed && <span className="ms-1 text-[11px] text-slate-500">({t('nutrition.removed')})</span>}
                        </span>
                      </div>
                      {replacement && <p className="ms-6 text-brand-light">↳ {loc(replacement.name)}</p>}
                      <EntityNotes screen="nutrition" date={date} entityType="food" entityId={item.id} label={loc(item.name)} />
                    </li>
                  );
                })}
                {extras.map((f) => (
                  <li key={f.id} className="text-brand-light">+ {loc(f.name)}</li>
                ))}
              </ul>
              <EntityNotes screen="nutrition" date={date} entityType="meal" entityId={meal.id} label={loc(meal.label)} />
            </section>
          );
        })
      )}
    </div>
  );
}

function Macro({ label, value, target }: { label: string; value: number; target?: number }) {
  return (
    <div>
      <div className="font-mono text-lg">{value}{target ? <span className="text-earth-subtle">/{target}</span> : null}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
