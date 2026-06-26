import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { transferClientWithMode, type ClientSubscriptionInput } from '@/services/platform/coachClientsApi';
import { parseDecimal } from '@/lib/utils';
import type { SubscriptionStatus, TransferMode, TransferSubHandling, UserRecord } from '@/types';

const NEW_SUB_STATUSES: SubscriptionStatus[] = ['trial', 'active', 'pending', 'expired', 'cancelled', 'frozen'];

/**
 * Admin 4-step client transfer: target coach → transfer type → subscription
 * handling → review. Fresh Start (archive + clear coach content) is gated to
 * super-admins (`canFreshStart`); regular admins get Keep Plans only.
 */
export function TransferWizard({
  client,
  fromCoachId,
  coaches,
  canFreshStart,
  actorId,
  presetCoachId,
  onDone,
  onCancel,
}: {
  client: UserRecord;
  fromCoachId: string | undefined;
  coaches: UserRecord[];
  canFreshStart: boolean;
  actorId: string;
  presetCoachId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [toCoachId, setToCoachId] = useState<string | null>(presetCoachId ?? null);
  const [mode, setMode] = useState<TransferMode>(canFreshStart ? 'fresh_start' : 'keep_plans');
  const [subHandling, setSubHandling] = useState<TransferSubHandling>('keep');
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>('pending');
  const [months, setMonths] = useState('1');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('');

  const targets = coaches.filter((c) => c.id !== fromCoachId);
  const toCoachName = coaches.find((c) => c.id === toCoachId)?.displayName || coaches.find((c) => c.id === toCoachId)?.email || '';

  const buildSub = (): ClientSubscriptionInput | undefined => {
    if (subHandling !== 'new') return undefined;
    const sub: ClientSubscriptionInput = { status: subStatus };
    if (subStatus === 'active') sub.months = Math.max(1, Math.round(parseDecimal(months) || 1));
    if (price.trim()) sub.price = parseDecimal(price) || undefined;
    if (currency.trim()) sub.currency = currency.trim();
    return sub;
  };

  const run = useMutation({
    mutationFn: () => transferClientWithMode(client.id, fromCoachId, toCoachId!, mode, subHandling, actorId, buildSub()),
    onSuccess: onDone,
  });

  const StepDots = () => (
    <div className="mb-4 flex items-center gap-1.5" data-testid="transfer-steps">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-brand' : 'bg-line/50'}`} />
      ))}
    </div>
  );

  const Option = ({ active, onClick, title, desc, testId, disabled }: { active: boolean; onClick: () => void; title: string; desc: string; testId: string; disabled?: boolean }) => (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`card flex w-full items-start gap-3 text-start disabled:opacity-40 ${active ? 'border-brand' : ''}`}
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-brand bg-brand text-white' : 'border-line'}`}>
        {active && <Icon name="check" size={12} />}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-[12px] text-earth-subtle">{desc}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-4" data-testid="transfer-wizard">
      <StepDots />

      {/* STEP 1 — target coach */}
      {step === 1 && (
        <div className="space-y-2">
          <p className="label">{t('transfer.step.coach')}</p>
          <p className="text-[13px] text-earth-muted">{t('transfer.pickCoach')}</p>
          {targets.length === 0 ? (
            <p className="text-sm text-earth-muted">{t('transfer.noCoaches')}</p>
          ) : (
            <div className="card divide-y divide-line-soft">
              {targets.map((co) => (
                <button key={co.id} type="button" data-testid="transfer-coach-row" data-coach-id={co.id} onClick={() => setToCoachId(co.id)} className="row w-full text-start">
                  <span className="min-w-0 flex-1 truncate">{co.displayName || co.email}</span>
                  {toCoachId === co.id && <span className="text-brand"><Icon name="check" size={18} /></span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — transfer type */}
      {step === 2 && (
        <div className="space-y-2">
          <p className="label">{t('transfer.step.type')}</p>
          <Option
            active={mode === 'fresh_start'}
            disabled={!canFreshStart}
            onClick={() => setMode('fresh_start')}
            title={t('transfer.typeFresh')}
            desc={t('transfer.typeFreshDesc')}
            testId="transfer-type-fresh"
          />
          {!canFreshStart && <p className="text-[12px] text-warn" data-testid="transfer-fresh-locked">{t('transfer.freshStartLocked')}</p>}
          <Option active={mode === 'keep_plans'} onClick={() => setMode('keep_plans')} title={t('transfer.typeKeep')} desc={t('transfer.typeKeepDesc')} testId="transfer-type-keep" />
        </div>
      )}

      {/* STEP 3 — subscription handling */}
      {step === 3 && (
        <div className="space-y-2">
          <p className="label">{t('transfer.step.subscription')}</p>
          <Option active={subHandling === 'keep'} onClick={() => setSubHandling('keep')} title={t('transfer.subKeep')} desc="" testId="transfer-sub-keep" />
          <Option active={subHandling === 'new'} onClick={() => setSubHandling('new')} title={t('transfer.subNew')} desc="" testId="transfer-sub-new" />
          <Option active={subHandling === 'expire'} onClick={() => setSubHandling('expire')} title={t('transfer.subExpire')} desc="" testId="transfer-sub-expire" />
          {subHandling === 'new' && (
            <div className="space-y-2 pt-1">
              <label className="label">{t('transfer.subStatusLabel')}</label>
              <select className="input" data-testid="transfer-sub-status" value={subStatus} onChange={(e) => setSubStatus(e.target.value as SubscriptionStatus)}>
                {NEW_SUB_STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`subscription.status.${s}`)}</option>
                ))}
              </select>
              {subStatus === 'active' && (
                <input className="input" inputMode="numeric" data-testid="transfer-sub-months" placeholder={t('common.min')} value={months} onChange={(e) => setMonths(e.target.value)} />
              )}
              <div className="flex gap-2">
                <input className="input flex-1" inputMode="decimal" data-testid="transfer-sub-price" placeholder={t('invite.priceOptional')} value={price} onChange={(e) => setPrice(e.target.value)} />
                <input className="input w-24" data-testid="transfer-sub-currency" placeholder="EGP" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4 — review */}
      {step === 4 && (
        <div className="space-y-3" data-testid="transfer-review">
          <p className="text-sm">{t('transfer.reviewIntro', { coach: toCoachName })}</p>
          {mode === 'fresh_start' && (
            <div className="grid grid-cols-1 gap-2">
              <div className="rounded-lg border border-danger/40 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-danger">{t('transfer.archived')}</p>
                <p className="text-[12px] text-earth-muted">{t('transfer.archivedList')}</p>
              </div>
              <div className="rounded-lg border border-success/40 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-success">{t('transfer.kept')}</p>
                <p className="text-[12px] text-earth-muted">{t('transfer.keptList')}</p>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-line-soft px-3 py-2 text-[13px]">
            <p><span className="text-earth-subtle">{t('transfer.step.type')}:</span> {t(mode === 'fresh_start' ? 'transfer.typeFresh' : 'transfer.typeKeep')}</p>
            <p><span className="text-earth-subtle">{t('transfer.step.subscription')}:</span> {t(subHandling === 'keep' ? 'transfer.subKeep' : subHandling === 'new' ? 'transfer.subNew' : 'transfer.subExpire')}</p>
          </div>
          <button type="button" data-testid="transfer-confirm" disabled={run.isPending} onClick={() => run.mutate()} className="btn-primary w-full disabled:opacity-40">
            {run.isPending ? t('auth.working') : t('transfer.confirm')}
          </button>
        </div>
      )}

      {/* Footer nav */}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" data-testid="transfer-back" onClick={() => (step === 1 ? onCancel() : setStep((s) => s - 1))}>
          {step === 1 ? t('common.cancel') : t('transfer.back')}
        </button>
        {step < 4 && (
          <button
            type="button"
            className="btn-primary flex-1 disabled:opacity-40"
            data-testid="transfer-next"
            disabled={step === 1 && !toCoachId}
            onClick={() => setStep((s) => s + 1)}
          >
            {t('transfer.next')}
          </button>
        )}
      </div>
    </div>
  );
}
