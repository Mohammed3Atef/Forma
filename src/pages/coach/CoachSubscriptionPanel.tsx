import { useState } from 'react';
import { commercialErrorMessage } from '@/lib/commercialErrors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SubscriptionHistory } from '@/components/SubscriptionHistory';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { setAccountStatus } from '@/services/platform/accountsApi';
import {
  cancelSubscription,
  endSubscription,
  extendSubscription,
  freezeSubscription,
  getRelationship,
  setSubscriptionPrice,
  setSubscriptionTerm,
  unfreezeSubscription,
} from '@/services/platform/coachClientsApi';
import { getClientFreezeRequest, resolveFreezeRequest } from '@/services/platform/coachApi';
import { listCoachPlans } from '@/services/platform/coachPlansApi';
import { effectiveSubscriptionStatus, freezePending, freezeScheduled, isBackdatedRenewal, subscriptionDaysLeft, unfreezeEndAt } from '@/lib/subscription';
import { parseDecimal, parseNumber } from '@/lib/utils';
import { useSession } from '@/services/auth/sessionStore';
import { useCan } from '@/services/auth/permissions';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { ActionMenu } from '@/components/ui/ActionMenu';
import type { AccountStatus, UserRecord } from '@/types';

const SUB_TONE: Record<string, PillTone> = {
  none: 'mute',
  trial: 'brand',
  active: 'ok',
  pending: 'warn',
  frozen: 'warn',
  expired: 'bad',
  cancelled: 'bad',
  ended: 'bad',
};
const ACCT_TONE: Record<AccountStatus, PillTone> = {
  active: 'ok',
  pending: 'warn',
  suspended: 'bad',
  disabled: 'bad',
};

// Dates are parsed AND formatted in the coach's local timezone (B0 / CO-14):
// formatting a local-midnight timestamp with toISOString() showed the previous
// day east of UTC (e.g. Cairo).
const pad2 = (n: number) => String(n).padStart(2, '0');
const toMs = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : 0);
const toDate = (ms?: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const todayStr = () => toDate(Date.now());

/** Coach controls for a client's subscription, account status, and freeze requests. */
export function CoachSubscriptionPanel({ clientId, coachId, account }: { clientId: string; coachId: string; account: UserRecord | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const coachCurrency = useSession((s) => s.account?.currency) ?? 'EGP';
  const [sheet, setSheet] = useState<'term' | 'freeze' | 'price' | null>(null);

  const rel = useQuery({ queryKey: ['relationship', coachId, clientId], queryFn: () => getRelationship(coachId, clientId), enabled: !!coachId && !!clientId });
  const request = useQuery({ queryKey: ['freezeRequest', clientId], queryFn: () => getClientFreezeRequest(clientId), enabled: !!clientId });
  // Account Freeze/Trash calls `adminUsers.setStatus` (`users.manageStatus`);
  // coaches hold no platform permission, so for them every click was a
  // guaranteed FORBIDDEN. Only render the section for a caller who can use it
  // (admins reviewing this panel); the coach's own tools are the
  // subscription actions below, which are relationship-gated.
  const canManageStatus = useCan('users.manageStatus');

  const sub = rel.data?.subscription;
  const status = effectiveSubscriptionStatus(sub);
  const acctStatus = account?.accountStatus ?? 'active';
  // Expired/cancelled/ended → the primary action reads "Renew" (still opens the term sheet).
  const isRenew = status === 'expired' || status === 'cancelled' || status === 'ended';

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['relationship', coachId, clientId] });
    void qc.invalidateQueries({ queryKey: ['freezeRequest', clientId] });
    void qc.invalidateQueries({ queryKey: ['user', clientId] });
    // Dashboard sub pills / renewals / revenue are derived from the same relationship.
    void qc.invalidateQueries({ queryKey: ['coachDashboard'] });
    void qc.invalidateQueries({ queryKey: ['mySubscription'] });
    // Today (B3.2): a decided freeze request and a renewed / changed term leave or change the queue at once.
    void qc.invalidateQueries({ queryKey: ['coachFreezeRequests', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachRelationships', coachId] });
  };
  const onErr = (title: string) => (e: unknown) => void alertDialog({ title, message: commercialErrorMessage(e, t) });
  const succeed = (title: string) => () => {
    invalidate();
    showToast({ title, variant: 'success' });
  };

  // ---- mutations ----
  const setStatus = useMutation({
    mutationFn: (s: AccountStatus) => setAccountStatus(account!, s),
    onSuccess: invalidate,
  });
  const unfreeze = useMutation({ mutationFn: () => unfreezeSubscription(coachId, clientId), onSuccess: succeed(t('subscription.unfreeze')), onError: onErr(t('subscription.unfreeze')) });
  const end = useMutation({ mutationFn: () => endSubscription(coachId, clientId), onSuccess: succeed(t('subscription.end')), onError: onErr(t('subscription.end')) });
  const cancel = useMutation({ mutationFn: () => cancelSubscription(coachId, clientId), onSuccess: succeed(t('subscription.cancel')), onError: onErr(t('subscription.cancel')) });
  const extend = useMutation({ mutationFn: (days: number) => extendSubscription(coachId, clientId, days), onSuccess: succeed(t('subscription.extend')), onError: onErr(t('subscription.extend')) });
  const decide = useMutation({
    // B3.0.1: accepting applies the freeze FIRST — the request is marked accepted
    // only when the freeze itself was accepted (dates in the term, not in the past).
    mutationFn: async ({ outcome, note, from, until }: { outcome: 'accepted' | 'rejected'; note: string; from: number; until: number }) => {
      if (outcome === 'accepted') await freezeSubscription(coachId, clientId, from, until, note);
      await resolveFreezeRequest(clientId, coachId, outcome, note);
    },
    onSuccess: succeed(t('subscription.pauseTitle')),
    onError: onErr(t('subscription.pauseTitle')),
  });
  // These three used to be plain unguarded `async` functions passed straight
  // into the sheets' `onSave` — no pending state, no try/catch, so a failed
  // write left the coach staring at an unresponsive sheet with no explanation.
  const setTerm = useMutation({
    mutationFn: (args: { start: string; term: { months?: number; days?: number }; price?: number; planName?: string }) =>
      setSubscriptionTerm(coachId, clientId, toMs(args.start), args.term, args.price, coachCurrency, args.planName),
    onSuccess: () => {
      invalidate();
      setSheet(null);
      showToast({ title: t('subscription.setTerm'), variant: 'success' });
    },
  });
  const freeze = useMutation({
    mutationFn: (args: { from: string; until: string; note: string }) => freezeSubscription(coachId, clientId, toMs(args.from), toMs(args.until), args.note),
    onSuccess: () => {
      invalidate();
      setSheet(null);
      showToast({ title: t('subscription.freeze'), variant: 'success' });
    },
  });
  const setPrice = useMutation({
    mutationFn: (args: { price: number; currency: string }) => setSubscriptionPrice(coachId, clientId, args.price, args.currency),
    onSuccess: () => {
      invalidate();
      setSheet(null);
      showToast({ title: t('subscription.setPrice'), variant: 'success' });
    },
  });

  const changeStatus = async (s: AccountStatus) => {
    if (!account) return;
    // Coaches get a simple Freeze / Trash lifecycle; reactivating ('active') is
    // safe and needs no confirm, the two destructive transitions do.
    if (s === 'disabled' && !(await confirmDialog({ title: t('subscription.acctAction.trash'), message: t('subscription.confirmTrash'), danger: true }))) return;
    if (s === 'suspended' && !(await confirmDialog({ title: t('subscription.acctAction.freeze'), message: t('subscription.confirmFreeze'), danger: true }))) return;
    setStatus.mutate(s);
  };
  const doEnd = async () => {
    if (await confirmDialog({ title: t('subscription.endPackage'), message: t('subscription.confirmEnd'), danger: true })) end.mutate();
  };
  const doExtend = async (days: number) => {
    const base = sub?.endAt && sub.endAt > Date.now() ? sub.endAt : Date.now();
    const newEnd = toDate(base + days * 86_400_000);
    if (await confirmDialog({ title: t('subscription.extend'), message: t('subscription.confirmExtend', { n: days, date: newEnd }) })) extend.mutate(days);
  };

  const pending = request.data?.status === 'pending';

  return (
    <div className="mt-6 space-y-4" data-testid="coach-subscription">
      {/* Pending client freeze request */}
      {pending && <FreezeRequestCard request={request.data!} onDecide={(outcome, note, from, until) => decide.mutate({ outcome, note, from, until })} busy={decide.isPending} />}

      {/* Subscription */}
      <section>
        <h2 className="h2 mb-2">{t('subscription.title')}</h2>
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Pill testId="sub-status" tone={SUB_TONE[status]}>{t(`subscription.status.${status}`)}</Pill>
            {sub && status !== 'ended' && <span className="font-mono text-[12px] text-earth-subtle">{t('subscription.daysLeft', { n: subscriptionDaysLeft(sub) })}</span>}
          </div>

          {rel.isError ? (
            <div className="space-y-2" role="alert" data-testid="sub-load-error">
              <p className="text-[13px] text-danger">{t('trust.subscription.loadFailed')}</p>
              <button type="button" className="btn-ghost w-full" onClick={() => void rel.refetch()}>
                {t('common.retry')}
              </button>
            </div>
          ) : rel.isPending ? (
            <div className="sk h-16 rounded-xl" />
          ) : sub ? (
            <>
              {/* Clear summary grid (renewal date emphasised) instead of a dense inline line. */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="ui-label">{t('subscription.startDate')}</p>
                  <p className="font-mono text-[13px]">{toDate(sub.startAt) || '—'}</p>
                </div>
                <div>
                  <p className="ui-label">{t('subscription.renews')}</p>
                  <p className="font-mono text-[13px] font-medium text-earth">{toDate(sub.endAt) || '—'}</p>
                </div>
                <div>
                  <p className="ui-label">{t('subscription.price')}</p>
                  <p className="text-[13px]" data-testid="sub-price">
                    {sub.price != null ? <span className="font-medium">{sub.price}{sub.currency ? ` ${sub.currency}` : ''}</span> : <span className="text-earth-muted">{t('subscription.noPrice')}</span>}
                  </p>
                </div>
                <div>
                  <p className="ui-label">{t('subscription.months')}</p>
                  <p className="text-[13px]">{sub.months ?? '—'}</p>
                </div>
              </div>
              {freezeScheduled(sub) ? (
                <p className="text-[12px] text-warn" data-testid="sub-freeze-scheduled">{t('subscription.freezeScheduled', { from: toDate(sub.frozenFrom), until: toDate(sub.frozenUntil) })}</p>
              ) : (
                status === 'frozen' && sub.frozenUntil && <p className="text-[12px] text-warn">{t('subscription.frozenUntil', { date: toDate(sub.frozenUntil) })}</p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-earth-muted">{t('subscription.none')}</p>
          )}

          {/* Primary action (reads "Renew" for expired/cancelled/ended) — only on a loaded relationship. */}
          <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="sub-set-term" disabled={!rel.isSuccess} onClick={() => setSheet('term')}>
            {isRenew ? t('subscription.renew') : t('subscription.setTerm')}
          </button>

          {/* B3.4 (CO-14-R / RM-26): one primary action above; Freeze / Unfreeze is the only other
              action in view; price, extend and the two terminal actions live in "More package
              actions", the terminal ones apart and confirmed with their consequences. */}
          {sub && (
            <div className="flex flex-wrap items-center gap-2">
              {freezePending(sub) ? (
                <button type="button" className="btn-secondary btn-sm" data-testid="sub-unfreeze" disabled={unfreeze.isPending} onClick={async () => { if (await confirmDialog({ title: t('subscription.unfreeze'), message: t('subscription.confirmUnfreezeEnd', { date: toDate(unfreezeEndAt(sub)) }), confirmLabel: t('common.yes'), cancelLabel: t('common.no') })) unfreeze.mutate(); }}>{t('subscription.unfreeze')}</button>
              ) : status === 'active' ? (
                <button type="button" className="btn-secondary btn-sm" data-testid="sub-freeze" onClick={() => setSheet('freeze')}>{t('subscription.freeze')}</button>
              ) : null}
              <ActionMenu
                label={t('subscription.moreActions')}
                icon="dots"
                testId="sub-more"
                items={[
                  { key: 'price', label: t('subscription.setPrice'), icon: 'edit', testId: 'sub-set-price', onSelect: () => setSheet('price') },
                  ...(sub.status === 'active' || sub.status === 'trial' || sub.status === 'frozen'
                    ? [{ key: 'extend', label: t('subscription.extend'), icon: 'calendar' as const, testId: 'sub-extend', disabled: extend.isPending, onSelect: () => void doExtend(30) }]
                    : []),
                  ...(status !== 'ended'
                    ? [{ key: 'end', label: t('subscription.endPackage'), icon: 'logout' as const, danger: true, testId: 'sub-end', disabled: end.isPending || !online, onSelect: () => void doEnd() }]
                    : []),
                  ...(status === 'active' || status === 'trial'
                    ? [{ key: 'cancel', label: t('subscription.cancelPackage'), icon: 'logout' as const, danger: true, testId: 'sub-cancel', disabled: cancel.isPending || !online, onSelect: async () => { if (await confirmDialog({ title: t('subscription.cancelPackage'), message: t('subscription.confirmCancel'), danger: true })) cancel.mutate(); } }]
                    : []),
                ]}
              />
            </div>
          )}

          <SubscriptionHistory sub={sub} history={rel.data?.subscriptionHistory} />
        </div>
      </section>

      {/* Account status — admin-only (see `canManageStatus`) */}
      {canManageStatus && (
      <section>
        <h2 className="h2 mb-2">{t('subscription.accountTitle')}</h2>
        <div className="card space-y-3">
          <Pill testId="acct-status" tone={ACCT_TONE[acctStatus]}>{t(`subscription.acct.${acctStatus}`)}</Pill>
          <div className="flex flex-wrap gap-2">
            {/* Suspend ⇄ Unsuspend (hidden once trashed — restore first). */}
            {acctStatus !== 'disabled' &&
              (acctStatus === 'suspended' ? (
                <button type="button" data-testid="acct-unfreeze" disabled={setStatus.isPending} onClick={() => void changeStatus('active')} className="btn-ghost h-9 px-3 text-[13px] disabled:opacity-40">
                  {t('subscription.acctAction.unfreeze')}
                </button>
              ) : (
                <button type="button" data-testid="acct-freeze" disabled={setStatus.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void changeStatus('suspended')} className="btn-ghost h-9 px-3 text-[13px] text-warn disabled:opacity-40">
                  {t('subscription.acctAction.freeze')}
                </button>
              ))}
            {/* Trash ⇄ Restore */}
            {acctStatus === 'disabled' ? (
              <button type="button" data-testid="acct-restore" disabled={setStatus.isPending} onClick={() => void changeStatus('active')} className="btn-ghost h-9 px-3 text-[13px] disabled:opacity-40">
                {t('subscription.acctAction.restore')}
              </button>
            ) : (
              <button type="button" data-testid="acct-trash" disabled={setStatus.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void changeStatus('disabled')} className="btn-ghost h-9 px-3 text-[13px] text-danger disabled:opacity-40">
                {t('subscription.acctAction.trash')}
              </button>
            )}
          </div>
          {setStatus.isError && <p className="text-[12px] text-danger" data-testid="acct-error">{t('subscription.statusError')}</p>}
          <p className="text-[12px] text-earth-subtle">{t('subscription.deleteHint')}</p>
        </div>
      </section>
      )}

      {/* Set-term sheet */}
      <SetTermSheet
        // Remount on every open so the fields reflect the CURRENT term (B0 / CO-14) —
        // the sheet used to keep whatever it was first initialised with.
        key={sheet === 'term' ? `term-${sub?.updatedAt ?? 0}` : 'term-closed'}
        open={sheet === 'term'}
        onClose={() => setSheet(null)}
        initialStart={isRenew || !sub ? todayStr() : toDate(sub.startAt)}
        initialMonths={sub?.months ?? 3}
        initialPrice={sub?.price != null ? String(sub.price) : ''}
        coachId={coachId}
        currency={sub?.currency || coachCurrency}
        pending={setTerm.isPending}
        error={setTerm.isError}
        onSave={async (start, term, price, planName) => {
          // B3.0.1 (owner): a renewal back-dated over unpaid time is confirmed explicitly — it lets
          // the client's blocked logs from those days sync. The server flags it in the audit event.
          if (isBackdatedRenewal(sub, toMs(start)) && !(await confirmDialog({ title: t('subscription.backdatedTitle'), message: t('subscription.confirmBackdated', { date: start }), confirmLabel: t('common.yes'), cancelLabel: t('common.no') }))) return;
          setTerm.mutate({ start, term, price, planName });
        }}
      />

      {/* Freeze sheet */}
      <FreezeSheet
        open={sheet === 'freeze'}
        onClose={() => setSheet(null)}
        pending={freeze.isPending}
        error={freeze.isError ? commercialErrorMessage(freeze.error, t) : null}
        maxDate={sub ? toDate(sub.endAt) : undefined}
        onSave={(from, until, note) => freeze.mutate({ from, until, note })}
      />

      {/* Price sheet */}
      <PriceSheet
        open={sheet === 'price'}
        onClose={() => setSheet(null)}
        initialPrice={sub?.price != null ? String(sub.price) : ''}
        initialCurrency={sub?.currency ?? 'EGP'}
        pending={setPrice.isPending}
        error={setPrice.isError}
        onSave={(price, currency) => setPrice.mutate({ price, currency })}
      />
    </div>
  );
}

function FreezeRequestCard({ request, onDecide, busy }: { request: { from?: number | null; until?: number | null; reason: string }; onDecide: (outcome: 'accepted' | 'rejected', note: string, from: number, until: number) => void; busy: boolean }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  // Pre-fill with the client's requested dates; the coach may adjust them before accepting.
  const [from, setFrom] = useState(request.from ? toDate(request.from) : todayStr());
  const [until, setUntil] = useState(request.until ? toDate(request.until) : '');
  const valid = !!from && !!until && toMs(until) > toMs(from);
  return (
    <section data-testid="freeze-request">
      <h2 className="h2 mb-2">{t('subscription.requestTitle')}</h2>
      <div className="card space-y-3 border border-warn/40">
        <p className="text-sm">{request.reason || t('subscription.noReason')}</p>
        <p className="text-[12px] text-earth-subtle">{t('subscription.editDatesHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t('subscription.from')}</label>
            <input type="date" className="input" data-testid="freeze-req-from" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('subscription.until')}</label>
            <input type="date" className="input" data-testid="freeze-req-until" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>
        <TextAreaField label={t('field.notes')} className="min-h-16" data-testid="freeze-note" placeholder={t('subscription.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <button type="button" className="btn-primary flex-1 disabled:opacity-40" data-testid="freeze-accept" disabled={busy || !valid} onClick={() => onDecide('accepted', note, toMs(from), toMs(until))}>
            {t('subscription.accept')}
          </button>
          <button type="button" className="btn-ghost flex-1 disabled:opacity-40" data-testid="freeze-reject" disabled={busy} onClick={() => onDecide('rejected', note, toMs(from), toMs(until))}>
            {t('subscription.reject')}
          </button>
        </div>
      </div>
    </section>
  );
}

function PriceSheet({ open, onClose, initialPrice, initialCurrency, pending, error, onSave }: { open: boolean; onClose: () => void; initialPrice: string; initialCurrency: string; pending: boolean; error: boolean; onSave: (price: number, currency: string) => void }) {
  const { t } = useTranslation();
  const [price, setPrice] = useState(initialPrice);
  const [currency, setCurrency] = useState(initialCurrency);
  return (
    <Sheet open={open} onClose={onClose} size="md" title={t('subscription.setPrice')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t('subscription.price')}</label>
            <input className="input" inputMode="decimal" data-testid="price-amount" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('subscription.currency')}</label>
            <input className="input" data-testid="price-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-danger" data-testid="freeze-error">{error}</p>}
        <SubmitButton type="button" fullWidth data-testid="price-save" disabled={!(parseNumber(price) >= 0) || price.trim() === ''} pending={pending} onClick={() => onSave(parseNumber(price), currency.trim())}>
          {t('common.save')}
        </SubmitButton>
      </div>
    </Sheet>
  );
}

/** The end date the term will get — shown before saving (same rule as the server: calendar months / days). */
function previewEnd(start: string, unit: 'days' | 'months', dur: number): string {
  const [y, m, d] = start.split('-').map(Number);
  if (!y || !m || !d) return '';
  const end = unit === 'days' ? new Date(y, m - 1, d + dur) : new Date(y, m - 1 + dur, d);
  return toDate(end.getTime());
}

function SetTermSheet({
  open,
  onClose,
  initialStart,
  initialMonths,
  initialPrice,
  coachId,
  currency,
  pending,
  error,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initialStart: string;
  initialMonths: number;
  /** The current term's price — a renewal is never prefilled as free. */
  initialPrice: string;
  coachId: string;
  currency: string;
  pending: boolean;
  error: boolean;
  onSave: (start: string, term: { months?: number; days?: number }, price?: number, planName?: string) => void;
}) {
  const { t } = useTranslation();
  const plansQ = useQuery({ queryKey: ['coachPlans', coachId], queryFn: () => listCoachPlans(coachId), enabled: open && !!coachId });
  const plans = plansQ.data ?? [];
  const [start, setStart] = useState(initialStart);
  const [unit, setUnit] = useState<'days' | 'months'>('months');
  const [duration, setDuration] = useState(String(initialMonths));
  const [price, setPrice] = useState(initialPrice);
  const [planName, setPlanName] = useState<string | undefined>(undefined);

  // Picking a plan prefills the fields; the coach can then tweak them per client.
  const applyPlan = (id: string) => {
    const p = plans.find((x) => x.id === id);
    if (!p) { setPlanName(undefined); return; }
    setUnit(p.unit);
    setDuration(String(p.duration));
    if (p.price != null) setPrice(String(p.price));
    setPlanName(p.name);
  };

  const dur = Math.max(1, parseNumber(duration) || 1);
  return (
    <Sheet open={open} onClose={onClose} size="md" title={t('subscription.setTerm')}>
      <div className="space-y-3">
        {plans.length > 0 && (
          <SelectField label={t('coachPlans.usePlan')} data-testid="term-plan" defaultValue="" onChange={(e) => applyPlan(e.target.value)}>
            <option value="">{t('coachPlans.custom')}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.duration} {t(`coachPlans.unit.${p.unit}`)}</option>
            ))}
          </SelectField>
        )}
        <div>
          <label className="label">{t('subscription.startDate')}</label>
          <input type="date" className="input" data-testid="term-start" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t('coachPlans.duration')}</label>
            <input className="input" inputMode="numeric" data-testid="term-months" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <SelectField label={t('coachPlans.unitLabel')} data-testid="term-unit" value={unit} onChange={(e) => setUnit(e.target.value as 'days' | 'months')}>
            <option value="months">{t('coachPlans.unit.months')}</option>
            <option value="days">{t('coachPlans.unit.days')}</option>
          </SelectField>
        </div>
        <div>
          <label className="label">{t('coachPlans.price')} ({currency})</label>
          <input className="input" inputMode="decimal" data-testid="term-price" placeholder={t('invite.priceOptional')} value={price} onChange={(e) => setPrice(e.target.value)} />
          {initialPrice && price === initialPrice && <p className="mt-1 text-[11.5px] text-earth-subtle">{t('trust.subscription.priceKept')}</p>}
        </div>
        {start && (
          <p className="text-[13px] text-earth-muted" data-testid="term-end-preview">
            {t('trust.subscription.endsOn', { date: previewEnd(start, unit, dur) })}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-danger">{t('common.savedFailed')}</p>}
        <SubmitButton
          type="button"
          fullWidth
          data-testid="term-save"
          disabled={!start || !(dur > 0)}
          pending={pending}
          onClick={() => onSave(start, unit === 'days' ? { days: dur } : { months: dur }, price.trim() ? parseDecimal(price) || 0 : undefined, planName)}
        >
          {t('common.save')}
        </SubmitButton>
      </div>
    </Sheet>
  );
}

function FreezeSheet({ open, onClose, pending, error, maxDate, onSave }: { open: boolean; onClose: () => void; pending: boolean; error: string | null; maxDate?: string; onSave: (from: string, until: string, note: string) => void }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(todayStr());
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  return (
    <Sheet open={open} onClose={onClose} size="md" title={t('subscription.freeze')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t('subscription.from')}</label>
            <input type="date" className="input" data-testid="freeze-from" min={todayStr()} max={maxDate} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('subscription.until')}</label>
            <input type="date" className="input" data-testid="freeze-until" min={from || todayStr()} max={maxDate} value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>
        <TextAreaField label={t('field.notes')} className="min-h-16" placeholder={t('subscription.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p role="alert" className="text-sm text-danger">{t('common.savedFailed')}</p>}
        <SubmitButton type="button" fullWidth data-testid="freeze-save" disabled={!from || !until || toMs(until) <= toMs(from)} pending={pending} onClick={() => onSave(from, until, note)}>
          {t('subscription.freeze')}
        </SubmitButton>
      </div>
    </Sheet>
  );
}
