import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { SelectField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { correctSubscription, renewSubscription, startFirstTerm, type TermChoice } from '@/services/platform/coachClientsApi';
import { listCoachPlans } from '@/services/platform/coachPlansApi';
import { commercialErrorMessage } from '@/lib/commercialErrors';
import { formatDate } from '@/lib/format';
import { DAYS_PER_MONTH, isBackdatedRenewal, isRunningTerm, renewalStartDay, termFirstDay, termLengthDays, termPreview, todayKey } from '@/lib/subscription';
import { parseDecimal, parseNumber, uid } from '@/lib/utils';
import type { Subscription } from '@/types';

// Dates are parsed AND formatted in the coach's local timezone (B0 / CO-14):
// formatting a local-midnight timestamp with toISOString() showed the previous
// day east of UTC (e.g. Cairo).
const pad2 = (n: number) => String(n).padStart(2, '0');
export const toMs = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : 0);
export const toDate = (ms?: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
export const todayStr = () => toDate(Date.now());

/** Everything derived from a client's relationship / subscription refreshes after a change to it. */
export function invalidateSubscription(qc: QueryClient, coachId: string, clientId: string) {
  void qc.invalidateQueries({ queryKey: ['relationship', coachId, clientId] });
  void qc.invalidateQueries({ queryKey: ['freezeRequest', clientId] });
  void qc.invalidateQueries({ queryKey: ['user', clientId] });
  // Me › Business (B3.8): booked / due / lost, renewals, lapsed and counts read the same relationships.
  void qc.invalidateQueries({ queryKey: ['coachBusiness', coachId] });
  void qc.invalidateQueries({ queryKey: ['mySubscription'] });
  // Today (B3.2): a decided freeze request and a renewed / changed term leave or change the queue at once.
  void qc.invalidateQueries({ queryKey: ['coachFreezeRequests', coachId] });
  void qc.invalidateQueries({ queryKey: ['coachRelationships', coachId] });
}

/**
 * B3.8 (Fix C): what the coach is doing to the package — never guessed from the dates.
 *  - `new`     the client's first package (no term, or one left to set up later);
 *  - `renew`   the NEXT package (a running one is renewed from the day after it ends);
 *  - `correct` edit the CURRENT package (a mistake, or the client switching package mid-term).
 */
export type TermSheetMode = 'new' | 'renew' | 'correct';

/** The primary action for a client's package: set the first one, or renew it. */
export function primaryTermMode(sub: Subscription | undefined): 'new' | 'renew' {
  return !sub || sub.status === 'pending' ? 'new' : 'renew';
}

const TITLE: Record<TermSheetMode, string> = { new: 'subscription.firstTermTitle', renew: 'subscription.renewTitle', correct: 'subscription.correctTitle' };
const DONE: Record<TermSheetMode, string> = { new: 'subscription.firstTermDone', renew: 'subscription.renewDone', correct: 'subscription.correctDone' };

/**
 * The package sheet for one client — the subscription panel's actions (B0 / CO-14) and Me ›
 * Business › Renewals (B3.8). Remounted on every opening so the fields reflect the CURRENT term,
 * with a fresh request id (a retry of the same save is applied once by the server).
 */
export function SubscriptionTermSheet({ coachId, clientId, sub, mode, open, onClose }: { coachId: string; clientId: string; sub: Subscription | undefined; mode: TermSheetMode; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} size="md" title={t(TITLE[mode])}>
      {open ? <TermForm key={`${mode}-${clientId}-${sub?.updatedAt ?? 0}`} coachId={coachId} clientId={clientId} sub={sub} mode={mode} onClose={onClose} /> : null}
    </Sheet>
  );
}

function TermForm({ coachId, clientId, sub, mode, onClose }: { coachId: string; clientId: string; sub: Subscription | undefined; mode: TermSheetMode; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const requestId = useMemo(() => uid('term'), []);
  const plansQ = useQuery({ queryKey: ['coachPlans', coachId], queryFn: () => listCoachPlans(coachId), enabled: !!coachId });
  const plans = (plansQ.data ?? []).filter((p) => !p.archived);

  const running = isRunningTerm(sub);
  // A running package is renewed from the day after it ends — fixed, never an overlap.
  const fixedStart = mode === 'renew' && running ? renewalStartDay(sub) : null;
  const initialStart = mode === 'correct' && sub ? termFirstDay(sub) : fixedStart ?? todayKey();
  const initialDays = sub ? (sub.days ?? (sub.months ? sub.months * DAYS_PER_MONTH : undefined)) : undefined;
  const initialUnit: 'months' | 'days' = sub && !sub.months && sub.days ? 'days' : 'months';
  const initialDuration = initialUnit === 'days' ? String(initialDays ?? 30) : String(sub?.months ?? (mode === 'new' ? 1 : 1));

  const [start, setStart] = useState(initialStart);
  const [unit, setUnit] = useState<'months' | 'days'>(initialUnit);
  const [duration, setDuration] = useState(initialDuration);
  // A renewal is never prefilled as free: the current price carries over (B0 / CO-14).
  const [price, setPrice] = useState(sub?.price != null ? String(sub.price) : '');
  const [planName, setPlanName] = useState<string | undefined>(sub?.planName);
  const [reason, setReason] = useState<'correction' | 'changePackage'>('correction');
  const [trial, setTrial] = useState(false);

  const applyPlan = (id: string) => {
    const p = plans.find((x) => x.id === id);
    if (!p) {
      setPlanName(undefined);
      setTrial(false);
      return;
    }
    setUnit(p.unit);
    setDuration(String(Math.max(1, Math.round(p.duration))));
    setPrice(p.price != null ? String(p.price) : '');
    setPlanName(p.name);
    setTrial(!!p.isTrial && mode === 'new');
  };

  const dur = Math.max(1, Math.round(parseNumber(duration) || 0));
  const lengthDays = unit === 'days' ? dur : dur * DAYS_PER_MONTH;
  const priceValue = price.trim() ? parseDecimal(price) : undefined;
  const priceValid = priceValue === undefined || (Number.isFinite(priceValue) && priceValue >= 0 && Math.abs(Math.round(priceValue * 100) - priceValue * 100) < 1e-6);
  const term: TermChoice = { ...(unit === 'days' ? { days: dur } : { months: dur }), ...(priceValue !== undefined ? { price: priceValue } : {}), ...(planName ? { planName } : {}) };

  // A correction sends only what changed; a save that changes nothing is not offered.
  const correction = useMemo(() => {
    if (mode !== 'correct' || !sub) return null;
    const patch: Parameters<typeof correctSubscription>[2] = { reason };
    if (start !== termFirstDay(sub)) patch.startDate = start;
    if (lengthDays !== termLengthDays({ days: sub.days ?? null, months: sub.months ?? null }) || (unit === 'months') !== !!sub.months) {
      if (unit === 'days') patch.days = dur;
      else patch.months = dur;
    }
    if ((priceValue ?? null) !== (sub.price ?? null)) patch.price = priceValue ?? null;
    if ((planName ?? null) !== (sub.planName ?? null)) patch.planName = planName ?? null;
    return Object.keys(patch).length > 1 ? patch : null;
  }, [mode, sub, reason, start, lengthDays, unit, dur, priceValue, planName]);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'new') return startFirstTerm(coachId, clientId, { ...term, startDate: start, ...(trial ? { status: 'trial' as const, days: lengthDays, months: undefined } : {}) }, requestId);
      if (mode === 'renew') return renewSubscription(coachId, clientId, { ...term, ...(fixedStart ? {} : { startDate: start }) }, requestId);
      return correctSubscription(coachId, clientId, correction!, { requestId, expectedTermId: sub?.termId });
    },
    onSuccess: () => {
      invalidateSubscription(qc, coachId, clientId);
      void qc.invalidateQueries({ queryKey: ['coachPayments', coachId] });
      onClose();
      showToast({ title: t(DONE[mode]), variant: 'success' });
    },
  });

  const onSave = async () => {
    // B3.0.1 (owner): a start back-dated over unpaid time is confirmed explicitly — it lets the
    // client's blocked logs from those days sync. The server flags it in the audit event.
    const movesStart = mode !== 'correct' || start !== (sub ? termFirstDay(sub) : start);
    if (!fixedStart && movesStart && isBackdatedRenewal(sub, toMs(start)) && !(await confirmDialog({ title: t('subscription.backdatedTitle'), message: t('subscription.confirmBackdated', { date: formatDate(start, i18n.language) }), confirmLabel: t('common.yes'), cancelLabel: t('common.no') }))) return;
    save.mutate();
  };

  const preview = start ? termPreview(start, lengthDays) : null;
  const canSave = !!start && dur > 0 && priceValid && (mode !== 'correct' || !!correction);

  return (
    <div className="space-y-3" data-testid={`term-sheet-${mode}`}>
      {mode === 'correct' && (
        <fieldset className="space-y-1.5" data-testid="term-reason">
          <legend className="label">{t('subscription.correctWhat')}</legend>
          {(['correction', 'changePackage'] as const).map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3 text-[13.5px]">
              <input type="radio" name="term-reason" value={r} checked={reason === r} onChange={() => setReason(r)} data-testid={`term-reason-${r}`} />
              {t(r === 'correction' ? 'subscription.correctMistake' : 'subscription.changePackage')}
            </label>
          ))}
          <p className="text-[12px] text-earth-subtle">{t('subscription.correctHint')}</p>
        </fieldset>
      )}
      {plans.length > 0 && (
        <SelectField label={t('coachPlans.usePlan')} data-testid="term-plan" defaultValue="" onChange={(e) => applyPlan(e.target.value)}>
          <option value="">{t('coachPlans.custom')}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {t(`coachPlans.length.${p.unit}`, { count: p.duration })}
            </option>
          ))}
        </SelectField>
      )}
      {fixedStart ? (
        <p className="rounded-xl bg-surface-raised px-3 py-2.5 text-[13px] text-earth" data-testid="term-renew-start">
          {t('subscription.renewFromEnd', { date: formatDate(fixedStart, i18n.language) })}
        </p>
      ) : (
        <div>
          <label className="label" htmlFor="term-start">{t('subscription.startDate')}</label>
          <input id="term-start" type="date" className="input" data-testid="term-start" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="term-duration">{t('coachPlans.duration')}</label>
          <input id="term-duration" className="input" inputMode="numeric" data-testid="term-months" value={duration} onChange={(e) => setDuration(e.target.value.replace(/[^\d٠-٩]/g, ''))} />
        </div>
        <SelectField label={t('coachPlans.unitLabel')} data-testid="term-unit" value={unit} onChange={(e) => setUnit(e.target.value as 'days' | 'months')}>
          <option value="months">{t('coachPlans.unit.months')}</option>
          <option value="days">{t('coachPlans.unit.days')}</option>
        </SelectField>
      </div>
      {unit === 'months' && <p className="-mt-1 text-[12px] text-earth-subtle">{t('subscription.monthIs30')}</p>}
      <div>
        <label className="label" htmlFor="term-price">{t('subscription.priceEgp')}</label>
        <input id="term-price" className="input" inputMode="decimal" data-testid="term-price" placeholder={t('invite.priceOptional')} value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!priceValid} />
        {mode === 'renew' && sub?.price != null && price === String(sub.price) && <p className="mt-1 text-[12px] text-earth-subtle">{t('trust.subscription.priceKept')}</p>}
        {!priceValid && <p className="mt-1 text-[12px] text-danger">{t('subscription.priceInvalid')}</p>}
      </div>
      {preview && (
        <p className="text-[13px] text-earth-muted" data-testid="term-end-preview">
          {t('subscription.covers', { from: formatDate(start, i18n.language), to: formatDate(preview.lastDay, i18n.language), count: lengthDays })}
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-danger" data-testid="term-error">
          {commercialErrorMessage(save.error, t)}
        </p>
      )}
      <SubmitButton type="button" fullWidth data-testid="term-save" disabled={!canSave} pending={save.isPending} onClick={() => void onSave()}>
        {mode === 'renew' ? t('subscription.renew') : t('common.save')}
      </SubmitButton>
      {mode === 'correct' && !correction && <p className="text-center text-[12px] text-earth-subtle" data-testid="term-no-changes">{t('subscription.noChanges')}</p>}
    </div>
  );
}
