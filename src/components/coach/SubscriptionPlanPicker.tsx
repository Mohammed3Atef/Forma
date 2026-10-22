import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SelectField, TextInput } from '@/components/ui/Field';
import { listCoachPlans } from '@/services/platform/coachPlansApi';
import { parseDecimal, parseNumber } from '@/lib/utils';
import { formatEgp } from '@/lib/format';
import type { CoachSubscriptionPlan } from '@/types';

/** Normalised result of the picker — a superset of the fields the assign/invite
 *  flows need. B3.8: prices are EGP (the only currency); 1 month = 30 days. */
export interface PlanPickResult {
  status: 'trial' | 'active' | 'pending';
  months?: number;
  days?: number;
  trialDays?: number;
  price?: number;
  planName?: string;
}

function planResult(p: CoachSubscriptionPlan): PlanPickResult {
  const money = { ...(p.price != null ? { price: p.price } : {}), planName: p.name };
  if (p.isTrial) return { status: 'trial', trialDays: p.unit === 'months' ? p.duration * 30 : p.duration, ...money };
  return { status: 'active', ...(p.unit === 'days' ? { days: p.duration } : { months: p.duration }), ...money };
}

/**
 * Subscription chooser used wherever a coach assigns a term (add-existing, invite,
 * per-client term). Lists the coach's own plans, plus a "Custom" option (free
 * duration + price) and an optional "Set up later". Emits a {@link PlanPickResult}
 * via `onChange` (pass a stable setter to avoid loops).
 */
export function SubscriptionPlanPicker({
  coachId,
  includePending = true,
  onChange,
  testId,
}: {
  coachId: string;
  includePending?: boolean;
  onChange: (r: PlanPickResult) => void;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['coachPlans', coachId], queryFn: () => listCoachPlans(coachId), enabled: !!coachId });
  const plans = q.data ?? [];
  const hasPlans = plans.length > 0;

  const [sel, setSel] = useState('');
  const [cUnit, setCUnit] = useState<'days' | 'months'>('months');
  const [cDur, setCDur] = useState('1');
  const [cPrice, setCPrice] = useState('');

  // Pick a sensible default once the list resolves: first plan, else Custom (the
  // coach hasn't defined any plans, so there are no presets to fall back to).
  useEffect(() => {
    if (sel || q.isLoading) return;
    setSel(hasPlans ? plans[0].id : 'custom');
  }, [sel, q.isLoading, hasPlans, plans]);

  const result = useMemo<PlanPickResult>(() => {
    if (sel === 'pending') return { status: 'pending' };
    if (sel === 'custom') {
      const dur = Math.max(1, Math.round(parseNumber(cDur) || 1));
      return {
        status: 'active',
        ...(cUnit === 'days' ? { days: dur } : { months: dur }),
        ...(cPrice.trim() ? { price: parseDecimal(cPrice) || 0 } : {}),
      };
    }
    const p = plans.find((x) => x.id === sel);
    return p ? planResult(p) : { status: 'pending' };
  }, [sel, cUnit, cDur, cPrice, plans]);

  useEffect(() => { onChange(result); }, [result, onChange]);

  const planLabel = (p: CoachSubscriptionPlan) =>
    `${p.name} · ${t(`coachPlans.length.${p.unit}`, { count: p.duration })}${p.price != null ? ` · ${formatEgp(p.price, i18n.language)}` : ''}`;

  return (
    <div className="space-y-2">
      <SelectField label={t('invite.subTitle')} data-testid={testId} value={sel} onChange={(e) => setSel(e.target.value)}>
        {plans.map((p) => <option key={p.id} value={p.id}>{planLabel(p)}</option>)}
        <option value="custom">{t('coachPlans.custom')}</option>
        {includePending && <option value="pending">{t('invite.subPending')}</option>}
      </SelectField>

      {sel === 'custom' && (
        <div className="grid grid-cols-3 gap-2" data-testid="plan-custom">
          <TextInput label={t('coachPlans.duration')} inputMode="numeric" value={cDur} onChange={(e) => setCDur(e.target.value)} />
          <SelectField label={t('coachPlans.unitLabel')} value={cUnit} onChange={(e) => setCUnit(e.target.value as 'days' | 'months')}>
            <option value="months">{t('coachPlans.unit.months')}</option>
            <option value="days">{t('coachPlans.unit.days')}</option>
          </SelectField>
          <TextInput label={t('subscription.priceEgp')} inputMode="decimal" value={cPrice} onChange={(e) => setCPrice(e.target.value)} />
          {cUnit === 'months' && <p className="col-span-3 -mt-1 text-[12px] text-earth-subtle">{t('subscription.monthIs30')}</p>}
        </div>
      )}
    </div>
  );
}
