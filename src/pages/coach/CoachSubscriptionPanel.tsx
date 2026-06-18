import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { SubscriptionHistory } from '@/components/SubscriptionHistory';
import { confirmDialog } from '@/stores/dialogStore';
import { setAccountStatus } from '@/services/platform/accountsApi';
import {
  endSubscription,
  freezeSubscription,
  getRelationship,
  setSubscriptionPrice,
  setSubscriptionTerm,
  unfreezeSubscription,
} from '@/services/platform/coachClientsApi';
import { getClientFreezeRequest, resolveFreezeRequest } from '@/services/platform/coachApi';
import { effectiveSubscriptionStatus, subscriptionDaysLeft } from '@/lib/subscription';
import type { AccountStatus, UserRecord } from '@/types';

const SUB_PILL: Record<string, string> = {
  none: 'border-line text-earth-subtle',
  active: 'border-success/50 text-success',
  frozen: 'border-warn/50 text-warn',
  ended: 'border-danger/50 text-danger',
};
const ACCT_PILL: Record<AccountStatus, string> = {
  active: 'border-success/50 text-success',
  pending: 'border-warn/50 text-warn',
  suspended: 'border-danger/50 text-danger',
  disabled: 'border-danger/50 text-danger',
};

const toMs = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : 0);
const toDate = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
const todayStr = () => new Date().toISOString().slice(0, 10);

/** Coach controls for a client's subscription, account status, and freeze requests. */
export function CoachSubscriptionPanel({ clientId, coachId, account }: { clientId: string; coachId: string; account: UserRecord | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<'term' | 'freeze' | 'price' | null>(null);

  const rel = useQuery({ queryKey: ['relationship', coachId, clientId], queryFn: () => getRelationship(coachId, clientId), enabled: !!coachId && !!clientId });
  const request = useQuery({ queryKey: ['freezeRequest', clientId], queryFn: () => getClientFreezeRequest(clientId), enabled: !!clientId });

  const sub = rel.data?.subscription;
  const status = effectiveSubscriptionStatus(sub);
  const acctStatus = account?.accountStatus ?? 'active';

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['relationship', coachId, clientId] });
    void qc.invalidateQueries({ queryKey: ['freezeRequest', clientId] });
    void qc.invalidateQueries({ queryKey: ['user', clientId] });
  };

  // ---- mutations ----
  const setStatus = useMutation({
    mutationFn: (s: AccountStatus) => setAccountStatus(account!, s),
    onSuccess: invalidate,
  });
  const unfreeze = useMutation({ mutationFn: () => unfreezeSubscription(coachId, clientId), onSuccess: invalidate });
  const end = useMutation({ mutationFn: () => endSubscription(coachId, clientId), onSuccess: invalidate });
  const decide = useMutation({
    mutationFn: ({ outcome, note, from, until }: { outcome: 'accepted' | 'rejected'; note: string; from: number; until: number }) =>
      resolveFreezeRequest(clientId, coachId, outcome, note).then(async () => {
        if (outcome === 'accepted') await freezeSubscription(coachId, clientId, from, until, note);
      }),
    onSuccess: invalidate,
  });

  const changeStatus = async (s: AccountStatus) => {
    if (!account) return;
    const danger = s === 'suspended' || s === 'disabled';
    if (danger && !(await confirmDialog({ title: t(`subscription.acct.${s}`), message: t('subscription.confirmStatus'), danger: true }))) return;
    setStatus.mutate(s);
  };
  const doEnd = async () => {
    if (await confirmDialog({ title: t('subscription.end'), message: t('subscription.confirmEnd'), danger: true })) end.mutate();
  };

  const pending = request.data?.status === 'pending';

  return (
    <div className="mt-6 space-y-4" data-testid="coach-subscription">
      {/* Pending client freeze request */}
      {pending && <FreezeRequestCard request={request.data!} onDecide={(outcome, note, from, until) => decide.mutate({ outcome, note, from, until })} busy={decide.isPending} />}

      {/* Subscription */}
      <section>
        <h2 className="h2 mb-2">{t('subscription.title')}</h2>
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span data-testid="sub-status" className={`chip ${SUB_PILL[status]}`}>{t(`subscription.status.${status}`)}</span>
            {sub && status !== 'ended' && <span className="font-mono text-[12px] text-earth-subtle">{t('subscription.daysLeft', { n: subscriptionDaysLeft(sub) })}</span>}
          </div>
          {sub ? (
            <>
              <p className="text-[13px] text-earth-muted">
                {toDate(sub.startAt)} → {toDate(sub.endAt)}
                {sub.status === 'frozen' && sub.frozenUntil ? ` · ${t('subscription.frozenUntil', { date: toDate(sub.frozenUntil) })}` : ''}
              </p>
              <p className="text-[13px]" data-testid="sub-price">
                <span className="text-earth-subtle">{t('subscription.price')}: </span>
                {sub.price != null ? <span className="font-medium">{sub.price}{sub.currency ? ` ${sub.currency}` : ''}</span> : <span className="text-earth-muted">{t('subscription.noPrice')}</span>}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-earth-muted">{t('subscription.none')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="chip" data-testid="sub-set-term" onClick={() => setSheet('term')}>{t('subscription.setTerm')}</button>
            {sub && <button type="button" className="chip" data-testid="sub-set-price" onClick={() => setSheet('price')}>{t('subscription.setPrice')}</button>}
            {sub && status === 'frozen' ? (
              <button type="button" className="chip" data-testid="sub-unfreeze" disabled={unfreeze.isPending} onClick={async () => { if (await confirmDialog({ title: t('subscription.unfreeze'), message: t('subscription.confirmUnfreeze'), confirmLabel: t('common.yes'), cancelLabel: t('common.no') })) unfreeze.mutate(); }}>{t('subscription.unfreeze')}</button>
            ) : sub && status === 'active' ? (
              <button type="button" className="chip" data-testid="sub-freeze" onClick={() => setSheet('freeze')}>{t('subscription.freeze')}</button>
            ) : null}
            {sub && status !== 'ended' && <button type="button" className="chip text-danger" data-testid="sub-end" disabled={end.isPending} onClick={() => void doEnd()}>{t('subscription.end')}</button>}
          </div>
          <SubscriptionHistory sub={sub} history={rel.data?.subscriptionHistory} />
        </div>
      </section>

      {/* Account status */}
      <section>
        <h2 className="h2 mb-2">{t('subscription.accountTitle')}</h2>
        <div className="card space-y-3">
          <span data-testid="acct-status" className={`chip ${ACCT_PILL[acctStatus]}`}>{t(`subscription.acct.${acctStatus}`)}</span>
          <div className="flex flex-wrap gap-2">
            {(['active', 'pending', 'suspended', 'disabled'] as AccountStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`acct-${s}`}
                disabled={setStatus.isPending || acctStatus === s}
                onClick={() => void changeStatus(s)}
                className={`chip ${s === 'suspended' || s === 'disabled' ? 'text-danger' : ''} disabled:opacity-40`}
              >
                {t(`subscription.acctAction.${s}`)}
              </button>
            ))}
          </div>
          {setStatus.isError && <p className="text-[12px] text-danger" data-testid="acct-error">{t('subscription.statusError')}</p>}
          <p className="text-[12px] text-earth-subtle">{t('subscription.deleteHint')}</p>
        </div>
      </section>

      {/* Set-term sheet */}
      <SetTermSheet
        open={sheet === 'term'}
        onClose={() => setSheet(null)}
        initialStart={sub ? toDate(sub.startAt) : todayStr()}
        initialMonths={sub?.months ?? 3}
        onSave={async (start, months) => {
          await setSubscriptionTerm(coachId, clientId, toMs(start), months);
          invalidate();
          setSheet(null);
        }}
      />

      {/* Freeze sheet */}
      <FreezeSheet
        open={sheet === 'freeze'}
        onClose={() => setSheet(null)}
        onSave={async (from, until, note) => {
          await freezeSubscription(coachId, clientId, toMs(from), toMs(until), note);
          invalidate();
          setSheet(null);
        }}
      />

      {/* Price sheet */}
      <PriceSheet
        open={sheet === 'price'}
        onClose={() => setSheet(null)}
        initialPrice={sub?.price != null ? String(sub.price) : ''}
        initialCurrency={sub?.currency ?? 'EGP'}
        onSave={async (price, currency) => {
          await setSubscriptionPrice(coachId, clientId, price, currency);
          invalidate();
          setSheet(null);
        }}
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
        <textarea className="input min-h-16" data-testid="freeze-note" placeholder={t('subscription.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
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

function PriceSheet({ open, onClose, initialPrice, initialCurrency, onSave }: { open: boolean; onClose: () => void; initialPrice: string; initialCurrency: string; onSave: (price: number, currency: string) => void }) {
  const { t } = useTranslation();
  const [price, setPrice] = useState(initialPrice);
  const [currency, setCurrency] = useState(initialCurrency);
  return (
    <Sheet open={open} onClose={onClose} title={t('subscription.setPrice')}>
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
        <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="price-save" disabled={!(Number(price) >= 0) || price.trim() === ''} onClick={() => onSave(Number(price), currency.trim())}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}

function SetTermSheet({ open, onClose, initialStart, initialMonths, onSave }: { open: boolean; onClose: () => void; initialStart: string; initialMonths: number; onSave: (start: string, months: number) => void }) {
  const { t } = useTranslation();
  const [start, setStart] = useState(initialStart);
  const [months, setMonths] = useState(String(initialMonths));
  return (
    <Sheet open={open} onClose={onClose} title={t('subscription.setTerm')}>
      <div className="space-y-3">
        <div>
          <label className="label">{t('subscription.startDate')}</label>
          <input type="date" className="input" data-testid="term-start" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('subscription.months')}</label>
          <input className="input" inputMode="numeric" data-testid="term-months" value={months} onChange={(e) => setMonths(e.target.value)} />
        </div>
        <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="term-save" disabled={!start || !(Number(months) > 0)} onClick={() => onSave(start, Math.max(1, Number(months) || 1))}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}

function FreezeSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (from: string, until: string, note: string) => void }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(todayStr());
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={t('subscription.freeze')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t('subscription.from')}</label>
            <input type="date" className="input" data-testid="freeze-from" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('subscription.until')}</label>
            <input type="date" className="input" data-testid="freeze-until" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>
        <textarea className="input min-h-16" placeholder={t('subscription.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="freeze-save" disabled={!from || !until || toMs(until) <= toMs(from)} onClick={() => onSave(from, until, note)}>
          {t('subscription.freeze')}
        </button>
      </div>
    </Sheet>
  );
}
