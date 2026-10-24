import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { SelectField, TextAreaField, TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Pill } from '@/components/ui/Pill';
import { confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { clientPaymentsQuery, correctPayment, recordPayment, reversePayment, type PaymentInput } from '@/services/platform/clientPaymentsApi';
import { commercialErrorMessage } from '@/lib/commercialErrors';
import { formatDate, formatEgpMinor } from '@/lib/format';
import { balanceOf, isLivePayment, paidByTerm, parseEgpToMinor, payableTerms, type PayableTerm } from '@/lib/payments';
import { termFirstDay, todayKey } from '@/lib/subscription';
import { parseDecimal, uid } from '@/lib/utils';
import { toMs } from '@/components/coach/SubscriptionTermSheet';
import type { ClientPayment, CoachClientRelationship, PaymentMethod } from '@/types';

const METHODS: PaymentMethod[] = ['cash', 'mobile_wallet', 'instapay'];

/**
 * B3.8 (owner decision 1) — the client's payments, recorded by the coach: the current package's
 * price, what was recorded against it and what is still owed (or a credit), every recorded payment,
 * and Record / Correct / Reverse. Forma does not see money move — the card says so. Nothing is ever
 * deleted: a reversed payment stays listed, marked, and counts nowhere.
 */
export function ClientPaymentsCard({ coachId, clientId, rel, canWrite = true }: { coachId: string; clientId: string; rel: CoachClientRelationship | undefined; canWrite?: boolean }) {
  const { t, i18n } = useTranslation();
  const online = useOnlineStatus();
  const q = useQuery(clientPaymentsQuery(coachId, clientId)); // B3.9 (B38F-R7): this client's records only
  const [sheet, setSheet] = useState<{ mode: 'record' } | { mode: 'correct' | 'reverse'; payment: ClientPayment } | null>(null);

  // The server already filters by client; the check stays as a guard for a shared cache entry.
  const mine = useMemo(() => (q.data ?? []).filter((p) => p.clientId === clientId), [q.data, clientId]);
  const terms = useMemo(() => (rel ? payableTerms(rel) : []), [rel]);
  const paid = useMemo(() => paidByTerm(mine), [mine]);
  const current = rel?.subscription && rel.subscription.status !== 'pending' ? rel.subscription : undefined;
  const currentPrice = current?.price != null ? Math.round(current.price * 100) : null;
  const currentPaid = current?.termId ? (paid.get(current.termId) ?? 0) : 0;
  const balance = currentPrice != null ? balanceOf(currentPrice, currentPaid) : null;
  const payments = mine.filter((p) => p.kind === 'payment');
  // Recorded without a package: money received, but taken off no package's balance until linked (Correct).
  const unlinkedMinor = payments.reduce((n, p) => (isLivePayment(p) && !p.termId ? n + p.amountMinor : n), 0);
  const writeBlocked = !canWrite || !online;
  const blockTitle = !canWrite ? t('payments.planLapsed') : !online ? t('offline.actionDisabled') : undefined;
  const termLabel = (termId: string | null) => {
    if (!termId) return t('payments.noTerm');
    const pt = terms.find((x) => x.termId === termId);
    if (!pt) return t('payments.olderTerm');
    return pt.current ? t('payments.termCurrent') : t('payments.termFrom', { date: formatDate(termFirstDay(pt.term), i18n.language) });
  };

  return (
    <section data-testid="client-payments">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="h2">{t('payments.title')}</h2>
        <button type="button" className="btn-secondary btn-sm disabled:opacity-40" data-testid="pay-record" disabled={writeBlocked || !q.isSuccess} title={blockTitle} onClick={() => setSheet({ mode: 'record' })}>
          {t('payments.record')}
        </button>
      </div>
      <div className="card space-y-4">
        {q.isError ? (
          <div role="alert" className="space-y-2" data-testid="pay-load-error">
            <p className="text-[13px] text-danger">{t('payments.loadFailed')}</p>
            <button type="button" className="btn-ghost w-full" onClick={() => void q.refetch()}>{t('common.retry')}</button>
          </div>
        ) : q.isPending ? (
          <div className="sk h-16 rounded-xl" />
        ) : (
          <>
            {balance && currentPrice != null && (
              <dl className="grid grid-cols-3 gap-x-3 gap-y-1" data-testid="pay-balance">
                <div>
                  <dt className="ui-label">{t('payments.price')}</dt>
                  <dd className="text-[13.5px] font-medium tabular-nums" dir="ltr">{formatEgpMinor(currentPrice, i18n.language)}</dd>
                </div>
                <div>
                  <dt className="ui-label">{t('payments.recorded')}</dt>
                  <dd className="text-[13.5px] font-medium tabular-nums" dir="ltr" data-testid="pay-recorded">{formatEgpMinor(currentPaid, i18n.language)}</dd>
                </div>
                <div>
                  <dt className="ui-label">{balance.overpaidMinor > 0 ? t('payments.credit') : t('payments.outstanding')}</dt>
                  <dd className={`text-[13.5px] font-semibold tabular-nums ${balance.outstandingMinor > 0 ? 'text-warn' : 'text-ok'}`} dir="ltr" data-testid="pay-outstanding">
                    {formatEgpMinor(balance.overpaidMinor > 0 ? balance.overpaidMinor : balance.outstandingMinor, i18n.language)}
                  </dd>
                </div>
              </dl>
            )}
            {payments.length === 0 ? (
              <p className="text-[13px] text-earth-muted" data-testid="pay-empty">{t('payments.empty')}</p>
            ) : (
              <ul className="divide-y divide-line-soft" data-testid="pay-list">
                {payments.map((p) => {
                  const reversed = !isLivePayment(p);
                  const reversal = reversed ? mine.find((r) => r.id === p.reversedById) : undefined;
                  return (
                    <li key={p.id} className="flex items-start gap-3 py-2.5" data-testid="pay-row">
                      <div className="min-w-0 grow">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
                          <span className={`font-medium tabular-nums ${reversed ? 'text-earth-subtle line-through' : 'text-earth'}`} dir="ltr">{formatEgpMinor(p.amountMinor, i18n.language)}</span>
                          <span className="text-earth-muted">· {t(`payments.method.${p.method}`)}</span>
                          {reversed && <Pill tone="bad" testId="pay-reversed">{t('payments.reversed')}</Pill>}
                          {p.correctsId && <Pill tone="mute">{t('payments.correction')}</Pill>}
                        </p>
                        <p className="truncate text-[12px] text-earth-subtle">
                          {formatDate(p.paidAt, i18n.language)} · {termLabel(p.termId)}
                          {p.reference ? <> · <bdi>{p.reference}</bdi></> : null}
                        </p>
                        {reversal?.reason && <p className="text-[12px] text-earth-subtle">{t('payments.reversedBecause', { reason: reversal.reason })}</p>}
                      </div>
                      {!reversed && (
                        <ActionMenu
                          label={t('payments.actionsFor', { amount: formatEgpMinor(p.amountMinor, i18n.language) })}
                          icon="dots"
                          testId="pay-actions"
                          items={[
                            { key: 'correct', label: t('payments.correct'), icon: 'edit', testId: 'pay-correct', disabled: writeBlocked, onSelect: () => setSheet({ mode: 'correct', payment: p }) },
                            { key: 'reverse', label: t('payments.reverse'), icon: 'logout', danger: true, testId: 'pay-reverse', disabled: writeBlocked, onSelect: () => setSheet({ mode: 'reverse', payment: p }) },
                          ]}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {unlinkedMinor > 0 ? (
              <p className="text-[12.5px] text-earth-muted" data-testid="pay-unlinked">
                {t('payments.unlinkedNote', { amount: formatEgpMinor(unlinkedMinor, i18n.language) })}
              </p>
            ) : null}
            <p className="text-[12px] text-earth-subtle">{t('payments.notVerified')}</p>
          </>
        )}
      </div>

      <Sheet open={sheet?.mode === 'record' || sheet?.mode === 'correct'} onClose={() => setSheet(null)} size="md" title={t(sheet?.mode === 'correct' ? 'payments.correctTitle' : 'payments.recordTitle')}>
        {sheet && sheet.mode !== 'reverse' ? (
          <PaymentForm key={sheet.mode === 'correct' ? sheet.payment.id : 'record'} coachId={coachId} clientId={clientId} terms={terms} paid={paid} original={sheet.mode === 'correct' ? sheet.payment : undefined} onDone={() => setSheet(null)} />
        ) : null}
      </Sheet>
      <Sheet open={sheet?.mode === 'reverse'} onClose={() => setSheet(null)} size="md" title={t('payments.reverseTitle')}>
        {sheet?.mode === 'reverse' ? <ReverseForm key={sheet.payment.id} coachId={coachId} clientId={clientId} payment={sheet.payment} onDone={() => setSheet(null)} /> : null}
      </Sheet>
    </section>
  );
}

function useInvalidatePayments(coachId: string, clientId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['coachPayments', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachBusiness', coachId] });
    // Recording against a package written before B3.8 gives that package its id.
    void qc.invalidateQueries({ queryKey: ['relationship', coachId, clientId] });
  };
}

/** Record (or correct) one payment. The request id is fixed for this opening: a retry records once. */
function PaymentForm({ coachId, clientId, terms, paid, original, onDone }: { coachId: string; clientId: string; terms: PayableTerm[]; paid: Map<string, number>; original?: ClientPayment; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const invalidate = useInvalidatePayments(coachId, clientId);
  const requestId = useMemo(() => uid('pay'), []);
  const outstandingOf = (termId: string | null) => {
    if (!termId) return null;
    const pt = terms.find((x) => x.termId === termId);
    if (!pt) return null;
    // A correction replaces the original: its amount is available again on its own term.
    const back = original && original.termId === termId ? original.amountMinor : 0;
    return balanceOf(pt.priceMinor, (paid.get(termId) ?? 0) - back).outstandingMinor;
  };
  const firstTerm = terms[0]?.termId ?? null;
  const [termId, setTermId] = useState<string | null>(original ? original.termId : firstTerm);
  const initialAmount = original ? original.amountMinor : (outstandingOf(firstTerm) ?? 0);
  const [amount, setAmount] = useState(initialAmount > 0 ? String(initialAmount / 100) : '');
  const [method, setMethod] = useState<PaymentMethod>(original?.method ?? 'cash');
  const [day, setDay] = useState(original ? formatDate(original.paidAt, 'en', 'iso') : todayKey());
  const [reference, setReference] = useState(original?.reference ?? '');
  const [note, setNote] = useState(original?.note ?? '');
  const [reason, setReason] = useState('');

  const minor = amount.trim() ? parseEgpToMinor(parseDecimal(amount)) : null;
  const limit = outstandingOf(termId);
  const tooMuch = minor != null && limit != null && minor > limit;
  const today = todayKey();
  const dayValid = !!day && day <= today;
  const valid = minor != null && !tooMuch && dayValid && (!original || reason.trim().length > 0);

  const input = (): PaymentInput => ({
    termId,
    amountMinor: minor!,
    method,
    // Today: the moment it is recorded; an earlier day: that day's middle (never a future instant).
    paidAt: day === today ? Date.now() : toMs(day) + 12 * 3_600_000,
    reference,
    note,
  });
  const save = useMutation({
    mutationFn: () => (original ? correctPayment(original.id, input(), reason, requestId) : recordPayment(clientId, input(), requestId)),
    onSuccess: () => {
      invalidate();
      showToast({ title: t(original ? 'payments.correctedToast' : 'payments.recordedToast'), variant: 'success' });
      onDone();
    },
  });
  const submit = async () => {
    const summary = t('payments.confirmBody', { amount: formatEgpMinor(minor!, i18n.language), method: t(`payments.method.${method}`), date: formatDate(day, i18n.language) });
    if (await confirmDialog({ title: t(original ? 'payments.confirmCorrect' : 'payments.confirmRecord'), message: summary, confirmLabel: t(original ? 'payments.correct' : 'payments.record'), cancelLabel: t('common.cancel') })) save.mutate();
  };

  return (
    <div className="space-y-3" data-testid="pay-form">
      {terms.length === 0 && (
        <p className="text-[13px] text-earth-muted" data-testid="pay-no-term">
          {t('payments.noTermHint')}
        </p>
      )}
      {terms.length > 0 && (
        <SelectField label={t('payments.term')} data-testid="pay-term" value={termId ?? ''} onChange={(e) => setTermId(e.target.value || null)}>
          {terms.map((pt) => {
            const left = outstandingOf(pt.termId);
            return (
              <option key={pt.termId} value={pt.termId}>
                {pt.current ? t('payments.termCurrent') : t('payments.termFrom', { date: formatDate(termFirstDay(pt.term), i18n.language) })}
                {left != null ? ` · ${t('payments.left', { amount: formatEgpMinor(left, i18n.language) })}` : ''}
              </option>
            );
          })}
          <option value="">{t('payments.noTerm')}</option>
        </SelectField>
      )}
      <TextInput
        label={t('payments.amount')}
        inputMode="decimal"
        data-testid="pay-amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={amount.trim() && minor == null ? t('subscription.priceInvalid') : tooMuch ? t('payments.tooMuch', { amount: formatEgpMinor(limit ?? 0, i18n.language) }) : undefined}
      />
      <fieldset className="space-y-1.5" data-testid="pay-method">
        <legend className="label">{t('payments.methodLabel')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => (
            <label key={m} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 text-center text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/60 ${method === m ? 'border-brand bg-brand/10 text-earth' : 'border-line text-earth-muted'}`}>
              <input type="radio" className="sr-only" name="pay-method" value={m} checked={method === m} onChange={() => setMethod(m)} data-testid={`pay-method-${m}`} />
              {t(`payments.method.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <TextInput label={t('payments.date')} type="date" max={today} data-testid="pay-date" value={day} onChange={(e) => setDay(e.target.value)} error={day && !dayValid ? t('payments.dateFuture') : undefined} />
      <TextInput label={t('payments.reference')} data-testid="pay-reference" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} helper={t('payments.referenceHint')} dir="auto" />
      <TextAreaField label={t('payments.note')} className="min-h-16" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      {original && <TextAreaField label={t('payments.reason')} required className="min-h-16" data-testid="pay-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
      {save.isError && (
        <p role="alert" className="text-sm text-danger" data-testid="pay-error">
          {commercialErrorMessage(save.error, t)}
        </p>
      )}
      <SubmitButton type="button" fullWidth data-testid="pay-save" disabled={!valid} pending={save.isPending} onClick={() => void submit()}>
        {save.isError ? t('common.retry') : t(original ? 'payments.correct' : 'payments.record')}
      </SubmitButton>
    </div>
  );
}

function ReverseForm({ coachId, clientId, payment, onDone }: { coachId: string; clientId: string; payment: ClientPayment; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const invalidate = useInvalidatePayments(coachId, clientId);
  const requestId = useMemo(() => uid('rev'), []);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => reversePayment(payment.id, reason, requestId),
    onSuccess: () => {
      invalidate();
      showToast({ title: t('payments.reversedToast'), variant: 'success' });
      onDone();
    },
  });
  const submit = async () => {
    if (await confirmDialog({ title: t('payments.confirmReverse'), message: t('payments.confirmReverseBody', { amount: formatEgpMinor(payment.amountMinor, i18n.language) }), confirmLabel: t('payments.reverse'), cancelLabel: t('common.cancel'), danger: true })) save.mutate();
  };
  return (
    <div className="space-y-3" data-testid="pay-reverse-form">
      <p className="text-[13px] text-earth-muted">{t('payments.reverseHint')}</p>
      <TextAreaField label={t('payments.reason')} required className="min-h-16" data-testid="pay-reverse-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      {save.isError && (
        <p role="alert" className="text-sm text-danger" data-testid="pay-error">
          {commercialErrorMessage(save.error, t)}
        </p>
      )}
      <SubmitButton type="button" fullWidth variant="danger" data-testid="pay-reverse-save" disabled={!reason.trim()} pending={save.isPending} onClick={() => void submit()}>
        {save.isError ? t('common.retry') : t('payments.reverse')}
      </SubmitButton>
    </div>
  );
}
