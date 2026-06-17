import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SubscriptionHistory } from '@/components/SubscriptionHistory';
import { useSubscription } from '@/hooks/useSubscription';
import { useSession } from '@/services/auth/sessionStore';
import { cancelFreezeRequest, fetchMyFreezeRequest, submitFreezeRequest } from '@/services/platform/clientCoachApi';

const SUB_PILL: Record<string, string> = {
  active: 'border-success/50 text-success',
  frozen: 'border-warn/50 text-warn',
  ended: 'border-danger/50 text-danger',
  none: 'border-line text-earth-subtle',
};
const fmtDate = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
const toMs = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : 0);
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Client-facing subscription card: status + dates + price plus the freeze-request
 * flow (pick start/end dates + reason → submit / pending+cancel / accepted+rejected)
 * and read-only subscription history. Shared between the coach inbox screen and
 * Settings so the request affordance is discoverable. Renders nothing until a
 * coach has actually set a subscription term.
 */
export function ClientSubscriptionSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const uid = useSession((s) => s.uid) ?? '';
  const { sub, history, status } = useSubscription();
  const req = useQuery({ queryKey: ['myFreezeRequest', uid], queryFn: () => fetchMyFreezeRequest(uid), enabled: !!uid && uid !== 'local-user' });
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState(todayStr());
  const [until, setUntil] = useState('');

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['myFreezeRequest', uid] });
  const submit = useMutation({
    mutationFn: () => submitFreezeRequest(uid, { reason, from: toMs(from), until: toMs(until) }),
    onSuccess: () => { setReason(''); invalidate(); },
  });
  const cancel = useMutation({ mutationFn: () => cancelFreezeRequest(uid), onSuccess: invalidate });

  if (status === 'none') return null; // coach hasn't set a subscription yet

  const r = req.data;
  const pending = r?.status === 'pending';
  const canSubmit = !!reason.trim() && !!from && !!until && toMs(until) > toMs(from) && !submit.isPending;

  return (
    <section data-testid="client-subscription">
      <h2 className="h2 mb-2">{t('subscription.title')}</h2>
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <span data-testid="client-sub-status" className={`chip ${SUB_PILL[status]}`}>{t(`subscription.status.${status}`)}</span>
          {sub && <span className="font-mono text-[12px] text-earth-subtle">{fmtDate(sub.startAt)} → {fmtDate(sub.endAt)}</span>}
        </div>

        {sub?.price != null && (
          <p className="text-[13px]" data-testid="client-sub-price">
            <span className="text-earth-subtle">{t('subscription.price')}: </span>
            <span className="font-medium">{sub.price}{sub.currency ? ` ${sub.currency}` : ''}</span>
          </p>
        )}

        {pending ? (
          <>
            <p className="text-sm text-warn">{t('subscription.requestPending')}</p>
            {r?.from && r?.until && <p className="font-mono text-[12px] text-earth-subtle">{fmtDate(r.from)} → {fmtDate(r.until)}</p>}
            <button type="button" className="btn-ghost w-full disabled:opacity-40" data-testid="freeze-cancel" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {t('subscription.cancelRequest')}
            </button>
          </>
        ) : (
          <>
            {r?.status === 'accepted' && <p className="text-sm text-success">{t('subscription.requestAccepted')}{r.coachNote ? ` — ${r.coachNote}` : ''}</p>}
            {r?.status === 'rejected' && <p className="text-sm text-danger">{t('subscription.requestRejected')}{r.coachNote ? ` — ${r.coachNote}` : ''}</p>}
            <p className="text-[13px] text-earth-muted">{t('subscription.requestDatesHint')}</p>
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
            <textarea className="input min-h-16" data-testid="freeze-reason" placeholder={t('subscription.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
            <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="freeze-submit" disabled={!canSubmit} onClick={() => submit.mutate()}>
              {t('subscription.submitRequest')}
            </button>
          </>
        )}

        <SubscriptionHistory sub={sub} history={history} />
      </div>
    </section>
  );
}
