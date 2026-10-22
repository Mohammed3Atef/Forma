import { useState } from 'react';
import { commercialErrorMessage } from '@/lib/commercialErrors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { TextAreaField } from '@/components/ui/Field';
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
  unfreezeSubscription,
} from '@/services/platform/coachClientsApi';
import { getClientFreezeRequest, resolveFreezeRequest } from '@/services/platform/coachApi';
import { effectiveSubscriptionStatus, freezePending, freezeScheduled, isRunningTerm, termDaysLeft, termEndDay, termFirstDay, termLastDay, todayKey, unfreezeEndAt } from '@/lib/subscription';
import { addDays } from '@/lib/civilDate';
import { formatDate, formatMoney } from '@/lib/format';
import { useCan } from '@/services/auth/permissions';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { SubscriptionTermSheet, invalidateSubscription, primaryTermMode, toDate, toMs, todayStr, type TermSheetMode } from '@/components/coach/SubscriptionTermSheet';
import { Pill } from '@/components/ui/Pill';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ClientPaymentsCard } from '@/components/coach/ClientPaymentsCard';
import { useCoachPlan, useWriteGate } from '@/components/coach/CoachPlanProvider';
import { SUBSCRIPTION_TONE as SUB_TONE, ACCOUNT_TONE as ACCT_TONE } from '@/lib/statusTone';
import type { AccountStatus, UserRecord } from '@/types';



/** Coach controls for a client's subscription, account status, and freeze requests. */
export function CoachSubscriptionPanel({ clientId, coachId, account }: { clientId: string; coachId: string; account: UserRecord | null }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const [sheet, setSheet] = useState<'freeze' | null>(null);
  // B3.8 (Fix C): which package change the sheet makes — first package, renewal, or an edit.
  const [termMode, setTermMode] = useState<TermSheetMode | null>(null);

  const rel = useQuery({ queryKey: ['relationship', coachId, clientId], queryFn: () => getRelationship(coachId, clientId), enabled: !!coachId && !!clientId });
  const request = useQuery({ queryKey: ['freezeRequest', clientId], queryFn: () => getClientFreezeRequest(clientId), enabled: !!clientId });
  // Account Freeze/Trash calls `adminUsers.setStatus` (`users.manageStatus`);
  // coaches hold no platform permission, so for them every click was a
  // guaranteed FORBIDDEN. Only render the section for a caller who can use it
  // (admins reviewing this panel); the coach's own tools are the
  // subscription actions below, which are relationship-gated.
  const canManageStatus = useCan('users.manageStatus');
  // B3.8 (P2): a lapsed or suspended Forma plan makes the coach's tools read-only.
  const { canWrite } = useCoachPlan();
  const gate = useWriteGate();

  const sub = rel.data?.subscription;
  const status = effectiveSubscriptionStatus(sub);
  const acctStatus = account?.accountStatus ?? 'active';
  // B3.8: the primary action sets the first package, or renews (a running one from the day after it ends).
  const primaryMode = primaryTermMode(sub);
  const fmtDay = (key: string) => formatDate(key, i18n.language);

  const invalidate = () => invalidateSubscription(qc, coachId, clientId);
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
  const unfreeze = useMutation({ mutationFn: () => unfreezeSubscription(coachId, clientId), onSuccess: succeed(t('subscription.done.unfrozen')), onError: onErr(t('subscription.unfreeze')) });
  const end = useMutation({ mutationFn: () => endSubscription(coachId, clientId), onSuccess: succeed(t('subscription.done.ended')), onError: onErr(t('subscription.end')) });
  const cancel = useMutation({ mutationFn: () => cancelSubscription(coachId, clientId), onSuccess: succeed(t('subscription.done.cancelled')), onError: onErr(t('subscription.cancel')) });
  const extend = useMutation({ mutationFn: (days: number) => extendSubscription(coachId, clientId, days), onSuccess: (_v, days) => succeed(t('subscription.done.extended', { count: days }))(), onError: onErr(t('subscription.extend')) });
  const decide = useMutation({
    // B3.0.1: accepting applies the freeze FIRST — the request is marked accepted
    // only when the freeze itself was accepted (dates in the term, not in the past).
    mutationFn: async ({ outcome, note, from, until }: { outcome: 'accepted' | 'rejected'; note: string; from: number; until: number }) => {
      if (outcome === 'accepted') await freezeSubscription(coachId, clientId, from, until, note);
      await resolveFreezeRequest(clientId, coachId, outcome, note);
    },
    onSuccess: (_v, { outcome }) => succeed(t(outcome === 'accepted' ? 'subscription.done.pauseAccepted' : 'subscription.done.pauseDeclined'))(),
    onError: onErr(t('subscription.pauseTitle')),
  });
  // Pending state + error handling on every sheet's save (a failed write used to leave an unresponsive sheet).
  const freeze = useMutation({
    mutationFn: (args: { from: string; until: string; note: string }) => freezeSubscription(coachId, clientId, toMs(args.from), toMs(args.until), args.note),
    onSuccess: (_v, args) => {
      invalidate();
      setSheet(null);
      showToast({ title: t('subscription.done.frozen', { date: fmtDay(args.until) }), variant: 'success' });
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
    if (!sub) return;
    // B3.8: calendar days — from the day after the term ends, or from today once it has lapsed.
    const base = isRunningTerm(sub) ? termEndDay(sub) : todayKey();
    const lastDay = addDays(base, days - 1);
    if (await confirmDialog({ title: t('subscription.extend'), message: t('subscription.confirmExtendDay', { n: days, date: fmtDay(lastDay) }) })) extend.mutate(days);
  };

  const pending = request.data?.status === 'pending';

  return (
    // B3.8 (owner decision 6): wide screens put the package and its payments side by side.
    <div className="mt-6 grid items-start gap-4 lg:grid-cols-2" data-testid="coach-subscription">
      {/* Pending client freeze request */}
      {pending && <div className="lg:col-span-2"><FreezeRequestCard request={request.data!} onDecide={(outcome, note, from, until) => decide.mutate({ outcome, note, from, until })} busy={decide.isPending || !gate.canWrite} /></div>}

      {/* Subscription */}
      <section>
        <h2 className="h2 mb-2">{t('subscription.title')}</h2>
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Pill testId="sub-status" tone={SUB_TONE[status]}>{t(`subscription.status.${status}`)}</Pill>
            {sub && status !== 'ended' && status !== 'pending' && <span className="font-mono text-[12px] text-earth-subtle">{t('coachClients.daysLeft', { count: termDaysLeft(sub) })}</span>}
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
          ) : sub && sub.status !== 'pending' ? (
            <>
              {/* B3.8: the term's calendar days — first and LAST covered day (the end is exclusive). */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="ui-label">{t('subscription.startDate')}</dt>
                  <dd className="text-[13px] tabular-nums" data-testid="sub-start">{fmtDay(termFirstDay(sub))}</dd>
                </div>
                <div>
                  <dt className="ui-label">{t('subscription.lastDay')}</dt>
                  <dd className="text-[13px] font-medium tabular-nums text-earth" data-testid="sub-last-day">{fmtDay(termLastDay(sub))}</dd>
                </div>
                <div>
                  <dt className="ui-label">{t('subscription.price')}</dt>
                  <dd className="text-[13px]" data-testid="sub-price">
                    {sub.price != null ? <span className="font-medium" dir="ltr">{formatMoney(sub.price, sub.currency, i18n.language)}</span> : <span className="text-earth-muted">{t('subscription.noPrice')}</span>}
                  </dd>
                </div>
                <div>
                  <dt className="ui-label">{t('subscription.length')}</dt>
                  <dd className="text-[13px]" data-testid="sub-length">
                    {sub.months ? t('subscription.lengthMonths', { count: sub.months, days: sub.days ?? sub.months * 30 }) : sub.days ? t('subscription.lengthDays', { count: sub.days }) : '—'}
                  </dd>
                </div>
                {sub.planName && (
                  <div className="col-span-2">
                    <dt className="ui-label">{t('subscription.package')}</dt>
                    <dd className="text-[13px]" data-testid="sub-plan-name"><bdi>{sub.planName}</bdi></dd>
                  </div>
                )}
              </dl>
              {freezeScheduled(sub) ? (
                <p className="text-[12px] text-warn" data-testid="sub-freeze-scheduled">{t('subscription.freezeScheduled', { from: toDate(sub.frozenFrom), until: toDate(sub.frozenUntil) })}</p>
              ) : (
                status === 'frozen' && sub.frozenUntil && <p className="text-[12px] text-warn">{t('subscription.frozenUntil', { date: toDate(sub.frozenUntil) })}</p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-earth-muted">{t('subscription.none')}</p>
          )}

          {/* Primary action (B3.8, Fix C): the first package, or a renewal — only on a loaded relationship. */}
          <button type="button" className="btn-primary w-full disabled:opacity-40 sm:w-auto sm:min-w-[12rem]" data-testid="sub-set-term" disabled={!rel.isSuccess || !gate.canWrite} title={gate.reason} onClick={() => setTermMode(primaryMode)}>
            {primaryMode === 'new' ? t('subscription.setFirstTerm') : t('subscription.renew')}
          </button>

          {/* B3.4 (CO-14-R / RM-26): one primary action above; Freeze / Unfreeze is the only other
              action in view; price, extend and the two terminal actions live in "More package
              actions", the terminal ones apart and confirmed with their consequences. */}
          {sub && sub.status !== 'pending' && (
            <div className="flex flex-wrap items-center gap-2">
              {freezePending(sub) ? (
                <button type="button" className="btn-secondary btn-sm" data-testid="sub-unfreeze" disabled={unfreeze.isPending || !gate.canWrite} title={gate.reason} onClick={async () => { if (await confirmDialog({ title: t('subscription.unfreeze'), message: t('subscription.confirmUnfreezeEnd', { date: toDate(unfreezeEndAt(sub)) }), confirmLabel: t('common.yes'), cancelLabel: t('common.no') })) unfreeze.mutate(); }}>{t('subscription.unfreeze')}</button>
              ) : status === 'active' ? (
                <button type="button" className="btn-secondary btn-sm disabled:opacity-40" data-testid="sub-freeze" disabled={!gate.canWrite} title={gate.reason} onClick={() => setSheet('freeze')}>{t('subscription.freeze')}</button>
              ) : null}
              <ActionMenu
                label={t('subscription.moreActions')}
                icon="dots"
                testId="sub-more"
                items={[
                  { key: 'edit', label: t('subscription.editTerm'), icon: 'edit', testId: 'sub-edit-term', disabled: !gate.canWrite, onSelect: () => setTermMode('correct') },
                  ...(sub.status === 'active' || sub.status === 'trial' || sub.status === 'frozen'
                    ? [{ key: 'extend', label: t('subscription.extend'), icon: 'calendar' as const, testId: 'sub-extend', disabled: extend.isPending || !gate.canWrite, onSelect: () => void doExtend(30) }]
                    : []),
                  ...(status !== 'ended'
                    ? [{ key: 'end', label: t('subscription.endPackage'), icon: 'logout' as const, danger: true, testId: 'sub-end', disabled: end.isPending || !gate.canWrite, onSelect: () => void doEnd() }]
                    : []),
                  ...(status === 'active' || status === 'trial'
                    ? [{ key: 'cancel', label: t('subscription.cancelPackage'), icon: 'logout' as const, danger: true, testId: 'sub-cancel', disabled: cancel.isPending || !gate.canWrite, onSelect: async () => { if (await confirmDialog({ title: t('subscription.cancelPackage'), message: t('subscription.confirmCancel'), danger: true })) cancel.mutate(); } }]
                    : []),
                ]}
              />
            </div>
          )}

          <SubscriptionHistory sub={sub} history={rel.data?.subscriptionHistory} />
        </div>
      </section>

      {/* B3.8: payments the coach recorded for this client (manual — Forma verifies nothing). */}
      <ClientPaymentsCard coachId={coachId} clientId={clientId} rel={rel.data ?? undefined} canWrite={canWrite} />

      {/* Account status — admin-only (see `canManageStatus`) */}
      {canManageStatus && (
      <section className="lg:col-span-2">
        <h2 className="h2 mb-2">{t('subscription.accountTitle')}</h2>
        <div className="card space-y-3">
          <Pill testId="acct-status" tone={ACCT_TONE[acctStatus]}>{t(`subscription.acct.${acctStatus}`)}</Pill>
          <div className="flex flex-wrap gap-2">
            {/* Suspend ⇄ Unsuspend (hidden once trashed — restore first). */}
            {acctStatus !== 'disabled' &&
              (acctStatus === 'suspended' ? (
                <button type="button" data-testid="acct-unfreeze" disabled={setStatus.isPending} onClick={() => void changeStatus('active')} className="btn-ghost btn-sm disabled:opacity-40">
                  {t('subscription.acctAction.unfreeze')}
                </button>
              ) : (
                <button type="button" data-testid="acct-freeze" disabled={setStatus.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void changeStatus('suspended')} className="btn-ghost btn-sm text-warn disabled:opacity-40">
                  {t('subscription.acctAction.freeze')}
                </button>
              ))}
            {/* Trash ⇄ Restore */}
            {acctStatus === 'disabled' ? (
              <button type="button" data-testid="acct-restore" disabled={setStatus.isPending} onClick={() => void changeStatus('active')} className="btn-ghost btn-sm disabled:opacity-40">
                {t('subscription.acctAction.restore')}
              </button>
            ) : (
              <button type="button" data-testid="acct-trash" disabled={setStatus.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void changeStatus('disabled')} className="btn-ghost btn-sm text-danger disabled:opacity-40">
                {t('subscription.acctAction.trash')}
              </button>
            )}
          </div>
          {setStatus.isError && <p className="text-[12px] text-danger" data-testid="acct-error">{t('subscription.statusError')}</p>}
          <p className="text-[12px] text-earth-subtle">{t('subscription.deleteHint')}</p>
        </div>
      </section>
      )}

      {/* First package / renew / edit (B3.8, Fix C) — shared with Me › Business › Renewals */}
      <SubscriptionTermSheet coachId={coachId} clientId={clientId} sub={sub} mode={termMode ?? primaryMode} open={termMode !== null} onClose={() => setTermMode(null)} />

      {/* Freeze sheet */}
      <FreezeSheet
        open={sheet === 'freeze'}
        onClose={() => setSheet(null)}
        pending={freeze.isPending}
        error={freeze.isError ? commercialErrorMessage(freeze.error, t) : null}
        maxDate={sub ? termEndDay(sub) : undefined}
        onSave={(from, until, note) => freeze.mutate({ from, until, note })}
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
            <label className="label" htmlFor="freeze-req-from">{t('subscription.from')}</label>
            <input type="date" className="input" id="freeze-req-from" data-testid="freeze-req-from" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="freeze-req-until">{t('subscription.until')}</label>
            <input type="date" className="input" id="freeze-req-until" data-testid="freeze-req-until" value={until} onChange={(e) => setUntil(e.target.value)} />
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
            <label className="label" htmlFor="freeze-from">{t('subscription.from')}</label>
            <input type="date" className="input" id="freeze-from" data-testid="freeze-from" min={todayStr()} max={maxDate} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="freeze-until">{t('subscription.until')}</label>
            <input type="date" className="input" id="freeze-until" data-testid="freeze-until" min={from || todayStr()} max={maxDate} value={until} onChange={(e) => setUntil(e.target.value)} />
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
