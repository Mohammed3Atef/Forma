import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SubscriptionHistory } from '@/components/SubscriptionHistory';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { useSubscription } from '@/hooks/useSubscription';
import { useSession } from '@/services/auth/sessionStore';
import { cancelFreezeRequest, fetchMyFreezeRequest, submitFreezeRequest } from '@/services/platform/clientCoachApi';
import { showToast } from '@/stores/toastStore';
import { Pill, type PillTone } from '@/components/ui/Pill';

const SUB_TONE: Record<string, PillTone> = {
  active: 'ok',
  frozen: 'warn',
  ended: 'bad',
  none: 'mute',
};
const fmtDate = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
const toMs = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : 0);
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Client-facing subscription card: status + dates + price plus the freeze-request
 * flow (pick start/end dates + reason → submit / pending+cancel / accepted+rejected)
 * and read-only subscription history. Shared between the coach inbox screen and
 * Settings so the request affordance is discoverable.
 */
export function ClientSubscriptionSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const uid = useSession((s) => s.uid) ?? '';
  const { sub, history, status, hasCoach } = useSubscription();
  const req = useQuery({ queryKey: ['myFreezeRequest', uid], queryFn: () => fetchMyFreezeRequest(uid), enabled: !!uid && uid !== 'local-user' });
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState(todayStr());
  const [until, setUntil] = useState('');

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['myFreezeRequest', uid] });
  const submit = useMutation({
    mutationFn: () => submitFreezeRequest(uid, { reason, from: toMs(from), until: toMs(until) }),
    onSuccess: () => {
      setReason('');
      invalidate();
      showToast({ title: t('subscription.requestSubmitted'), variant: 'success' });
    },
  });
  const cancel = useMutation({ mutationFn: () => cancelFreezeRequest(uid), onSuccess: invalidate });

  if (status === 'none') {
    return (
      <EmptyState
        testId="client-subscription-none"
        icon="shield"
        title={t('subscription.noneTitle')}
        message={t(hasCoach ? 'subscription.noneBodyHasCoach' : 'subscription.noneBodyNoCoach')}
      />
    );
  }

  const r = req.data;
  const pending = r?.status === 'pending';
  const canSubmit = !!reason.trim() && !!from && !!until && toMs(until) > toMs(from) && !submit.isPending;

  return (
    <section data-testid="client-subscription" className="space-y-4">
      {/* Hero — status, term, price, and the one line that matters: who controls it */}
      <div className="card-featured space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Pill testId="client-sub-status" tone={SUB_TONE[status]}>{t(`subscription.status.${status}`)}</Pill>
          {sub && <span className="font-mono text-[12px] text-earth-subtle">{fmtDate(sub.startAt)} → {fmtDate(sub.endAt)}</span>}
        </div>
        {sub?.price != null && (
          <p className="font-display text-3xl font-bold" data-testid="client-sub-price">
            {sub.price}<span className="ms-1 text-sm font-normal text-earth-muted">{sub.currency ?? ''}</span>
          </p>
        )}
        <p className="text-sm text-earth-muted">{t('subscription.setByCoach')}</p>
      </div>

      {/* Pause request — its own labelled card */}
      <div>
        <p className="ui-label mb-2 px-1">{t('subscription.pauseTitle')}</p>
        <div className="card space-y-3">
          {pending ? (
            <>
              <p className="text-sm text-warn">{t('subscription.requestPending')}</p>
              {r?.from && r?.until && <p className="font-mono text-[12px] text-earth-subtle">{fmtDate(r.from)} → {fmtDate(r.until)}</p>}
              {cancel.isError && <p role="alert" className="text-sm text-danger">{t('common.errorGeneric')}</p>}
              <SubmitButton type="button" variant="ghost" fullWidth data-testid="freeze-cancel" pending={cancel.isPending} onClick={() => cancel.mutate()}>
                {t('subscription.cancelRequest')}
              </SubmitButton>
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
              <div>
                <label className="label">{t('subscription.reason')}</label>
                <textarea className="input min-h-16" data-testid="freeze-reason" placeholder={t('subscription.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              {submit.isError && <p role="alert" className="text-sm text-danger">{t('common.errorGeneric')}</p>}
              <SubmitButton type="button" fullWidth data-testid="freeze-submit" disabled={!canSubmit} pending={submit.isPending} onClick={() => submit.mutate()}>
                {t('subscription.submitRequest')}
              </SubmitButton>
            </>
          )}
        </div>
      </div>

      {/* History — its own labelled section, visible by default */}
      <div>
        <p className="ui-label mb-2 px-1">{t('subscription.historyTitle')}</p>
        <SubscriptionHistory sub={sub} history={history} />
      </div>
    </section>
  );
}
