import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { MetricCard } from '@/components/ui/MetricCard';
import { LoadingState } from '@/components/ui/LoadingState';
import { Icon } from '@/components/Icon';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { capacityOf, trialDaysLeft } from '@/services/platform/coachPlanApi';
import { cancelPlanRequest, hasDeadline, isActionable, isSubscriptionRequest, submitCapacityRequest, submitSubscriptionRequest } from '@/services/platform/coachPlanRequestsApi';
import { getMyCommercialOverview } from '@/services/platform/coachCommercialApi';
import { commercialErrorMessage } from '@/lib/commercialErrors';
import { useLocalized } from '@/hooks/useLocalized';
import { fmtDate, useCapacityPrice } from '@/lib/formaFormat';
import type { CoachCapacityOffer, CoachPlanRequest } from '@/types';

const HOUR_MS = 3_600_000;

/**
 * Coach "My Plan" — the one Forma subscription:
 *   A. Subscription (phase, status, price, dates, renew)
 *   B. Client capacity (used / effective = base + add-ons + adjustment; over-cap)
 *   C. Active capacity add-ons
 *   D. Available add-ons (offered to this coach — never public)
 *   E. Requests (awaiting / history)
 * One bounded read (`coachCommercial.myOverview`). Nothing a request says
 * is shown as active until a Super Admin confirms payment.
 */
export function CoachPlan() {
  const { t, i18n } = useTranslation();
  const loc = useLocalized();
  const price = useCapacityPrice();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['coachCommercial', 'mine'], queryFn: getMyCommercialOverview, refetchInterval: 60_000 });
  const d = q.data;

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['coachCommercial'] });
    void qc.invalidateQueries({ queryKey: ['coachPlanRequests'] });
    void qc.invalidateQueries({ queryKey: ['coachPlan'] });
  };

  // A confirmation that lands while the page is open changes real entitlements —
  // refresh the shared plan query (gate / banner / client caps) too.
  const confirmedKey = (d?.requests ?? []).filter((r) => r.status === 'confirmed').map((r) => r.id).join(',');
  useEffect(() => {
    if (confirmedKey) void qc.invalidateQueries({ queryKey: ['coachPlan'] });
  }, [confirmedKey, qc]);

  const fail = (title: string) => (e: unknown) => void alertDialog({ title, message: commercialErrorMessage(e, t) }).then(refreshAll);
  const subscribe = useMutation({ mutationFn: () => submitSubscriptionRequest(), onSuccess: refreshAll, onError: fail(t('forma.requestSubscription')) });
  const addCapacity = useMutation({ mutationFn: (id: string) => submitCapacityRequest(id), onSuccess: refreshAll, onError: fail(t('forma.addCapacity')) });
  const cancel = useMutation({ mutationFn: (id: string) => cancelPlanRequest(id), onSuccess: refreshAll, onError: fail(t('forma.cancelRequest')) });

  if (q.isError && !d) {
    return (
      <div data-testid="coach-plan">
        <PageHeader eyebrow={t('platform.coachPortal')} title={t('forma.myPlan')} />
        <ErrorState onRetry={() => void q.refetch()} testId="coach-plan-error" />
      </div>
    );
  }
  if (!d) {
    return (
      <div data-testid="coach-plan">
        <PageHeader eyebrow={t('platform.coachPortal')} title={t('forma.myPlan')} />
        <LoadingState variant="cards" count={4} />
      </div>
    );
  }

  const p = d.plan;
  const state = p?.state ?? 'none';
  const cap = capacityOf(p);
  const daysLeft = p ? trialDaysLeft(p) : null;
  const openReqs = d.requests.filter(isActionable);
  const openSub = openReqs.find(isSubscriptionRequest);
  const openCapacityFor = (packageId: string) => openReqs.find((r) => r.capacitySnapshot?.packageId === packageId);
  const lapsed = state === 'expired' || state === 'suspended';
  const isTrial = p?.phase === 'trial';
  const statusTone = state === 'active' || state === 'trial' ? 'success' : state === 'none' ? 'default' : 'danger';
  const heldPackageIds = new Set(d.activeEntitlements.map((e) => e.sourcePackageId).filter(Boolean));

  const askSubscription = async () => {
    const ok = await confirmDialog({
      title: isTrial || lapsed ? t('forma.requestSubscription') : t('forma.requestRenewal'),
      message: t('forma.requestSubscriptionBody', { price: d.config.priceMonthly, currency: d.config.currency, n: d.config.maxClients, days: d.config.termDays }),
      confirmLabel: t('forma.sendRequest'),
    });
    if (ok) subscribe.mutate();
  };
  const askCapacity = async (o: CoachCapacityOffer) => {
    const ok = await confirmDialog({
      title: t('forma.addCapacity'),
      message: t(heldPackageIds.has(o.id) ? 'forma.capacity.requestRenewBody' : 'forma.capacity.requestBody', { name: loc(o.name), n: o.additionalClients, price: price(o) }),
      confirmLabel: t('forma.sendRequest'),
    });
    if (ok) addCapacity.mutate(o.id);
  };

  const requestLabel = (r: CoachPlanRequest) =>
    r.capacitySnapshot
      ? `${loc(r.capacitySnapshot.name)} · +${r.capacitySnapshot.additionalClients}`
      : t(`forma.requestType.${r.type}`, { defaultValue: t('forma.requestType.subscription') });
  const requestPrice = (r: CoachPlanRequest) =>
    r.capacitySnapshot ? price(r.capacitySnapshot) : r.planSnapshot ? t('forma.pricePerMonth', { price: r.planSnapshot.priceMonthly, currency: r.planSnapshot.currency }) : '';

  return (
    <div data-testid="coach-plan">
      <PageHeader eyebrow={t('platform.coachPortal')} title={t('forma.myPlan')} />
      <div className="space-y-6">
        {/* A. Subscription */}
        <DashboardSection title={t('forma.section.subscription')} icon="bolt" testId="plan-subscription">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon="bolt" value={isTrial ? t('forma.phase.trial') : t('forma.phase.forma')} label={t('forma.product')} tone="brand" testId="plan-phase" />
            <MetricCard icon="check" value={t(`forma.state.${state}`)} label={t('forma.status')} tone={statusTone} testId="plan-state" />
            <MetricCard
              icon="calendar"
              value={p?.endsAt ? fmtDate(p.endsAt, i18n.language) : '—'}
              hint={daysLeft != null && !lapsed ? t('forma.daysLeft', { count: Math.max(0, daysLeft) }) : undefined}
              label={isTrial ? t('forma.trialEnds') : t('forma.renewsOn')}
              tone={daysLeft != null && daysLeft <= 5 ? 'warn' : 'default'}
              testId="plan-ends"
            />
            <MetricCard
              icon="chart"
              value={<span dir="ltr">{p?.subscription ? `${p.subscription.priceMonthly} ${p.subscription.currency}` : `${d.config.priceMonthly} ${d.config.currency}`}</span>}
              label={p?.subscription ? t('forma.yourPrice') : t('forma.priceAfterTrial')}
              testId="plan-price"
            />
          </div>
          <div className="card mt-3 space-y-3" data-testid="plan-subscription-card">
            <p className="text-sm text-earth-muted">
              {state === 'suspended'
                ? t('forma.explain.suspended')
                : lapsed
                  ? t(isTrial ? 'forma.explain.trialEnded' : 'forma.explain.expired')
                  : isTrial
                    ? t('forma.explain.trial', { price: d.config.priceMonthly, currency: d.config.currency })
                    : t('forma.explain.active')}
            </p>
            <p className="text-[12px] text-earth-subtle">{t('forma.manualPaymentNote')}</p>
            {state !== 'suspended' &&
              (openSub ? (
                <p className="chip border-warn/50 text-warn" data-testid="plan-subscription-pending">{t('forma.awaitingPayment')}</p>
              ) : (
                <button type="button" className="btn-primary" data-testid="plan-request-subscription" disabled={subscribe.isPending} onClick={() => void askSubscription()}>
                  <Icon name="bolt" size={16} /> {isTrial || lapsed ? t('forma.requestSubscription') : t('forma.requestRenewal')}
                </button>
              ))}
          </div>
        </DashboardSection>

        {/* B. Client capacity */}
        <DashboardSection title={t('forma.section.capacity')} icon="user" testId="plan-capacity">
          <div className={`card space-y-3 ${cap.over > 0 ? 'border-warn/60' : ''}`} data-testid="plan-capacity-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-3xl font-bold" data-testid="plan-capacity-usage">
                <span dir="ltr">{cap.used} / {cap.limit}</span> <span className="text-base font-normal text-earth-muted">{t('forma.capacity.clients')}</span>
              </p>
              {cap.over > 0 ? (
                <span className="chip border-warn/60 text-warn" data-testid="plan-over-capacity">{t('forma.capacity.overBy', { n: cap.over })}</span>
              ) : (
                <span className="text-sm text-earth-muted">{t('forma.capacity.remaining', { count: cap.remaining })}</span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line-soft" aria-hidden>
              <div className={`h-full ${cap.over > 0 ? 'bg-warn' : 'bg-brand'}`} style={{ width: `${cap.limit ? Math.min(100, (cap.used / cap.limit) * 100) : 100}%` }} />
            </div>
            <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-3" data-testid="plan-capacity-breakdown">
              <div className="flex justify-between gap-2 sm:block"><dt className="text-earth-muted">{t('forma.capacity.base')}</dt><dd className="font-semibold">{p?.baseMaxClients ?? 0}</dd></div>
              <div className="flex justify-between gap-2 sm:block"><dt className="text-earth-muted">{t('forma.capacity.addons')}</dt><dd className="font-semibold">+{p?.addonClientCapacity ?? 0}</dd></div>
              {p?.manualCapacityAdjustment ? (
                <div className="flex justify-between gap-2 sm:block"><dt className="text-earth-muted">{t('forma.capacity.adjustment')}</dt><dd className="font-semibold">{p.manualCapacityAdjustment > 0 ? '+' : ''}{p.manualCapacityAdjustment}</dd></div>
              ) : null}
            </dl>
            {cap.over > 0 && <p className="text-sm text-warn">{t('forma.capacity.overExplain')}</p>}
          </div>
        </DashboardSection>

        {/* C. Active add-ons */}
        <DashboardSection title={t('forma.section.activeAddons')} icon="check" testId="plan-active-addons">
          {d.activeEntitlements.length === 0 ? (
            <p className="card text-sm text-earth-muted">{t('forma.capacity.noActive')}</p>
          ) : (
            <div className="card divide-y divide-line-soft p-0">
              {d.activeEntitlements.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" data-testid="plan-active-addon">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{loc(e.snapshot.name)} · +{e.snapshot.additionalClients}</p>
                    <p className="text-[12px] text-earth-subtle">{price(e.snapshot)}</p>
                  </div>
                  <span className="text-[12px] text-earth-muted">{e.endsAt ? t('forma.capacity.until', { date: fmtDate(e.endsAt, i18n.language) }) : t('forma.capacity.permanent')}</span>
                </div>
              ))}
            </div>
          )}
        </DashboardSection>

        {/* D. Available add-ons */}
        <DashboardSection title={t('forma.section.availableAddons')} icon="bolt" testId="plan-available-addons">
          {lapsed ? (
            <p className="card text-sm text-earth-muted">{t('forma.capacity.renewFirst')}</p>
          ) : d.availablePackages.length === 0 ? (
            <p className="card text-sm text-earth-muted">{t('forma.capacity.noneAvailable')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.availablePackages.map((o) => {
                const pending = openCapacityFor(o.id);
                return (
                  <div key={o.id} className="card flex flex-col gap-2" data-testid="plan-offer">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-xl font-bold">+{o.additionalClients} <span className="text-sm font-normal text-earth-muted">{t('forma.capacity.clients')}</span></p>
                      {o.badge && loc(o.badge) ? <span className="chip chip-on text-[11px]">{loc(o.badge)}</span> : null}
                    </div>
                    <p className="text-sm font-semibold">{loc(o.name)}</p>
                    {o.description && loc(o.description) ? <p className="text-[13px] text-earth-muted">{loc(o.description)}</p> : null}
                    <p className="text-sm" dir="auto">{price(o)}</p>
                    {o.validUntil ? <p className="text-[12px] text-earth-subtle">{t('forma.capacity.offerUntil', { date: fmtDate(o.validUntil, i18n.language) })}</p> : null}
                    {pending ? (
                      <span className="chip mt-auto self-start border-warn/50 text-warn">{t('forma.awaitingPayment')}</span>
                    ) : (
                      <button type="button" className="btn-primary mt-auto" data-testid="plan-offer-request" disabled={addCapacity.isPending} onClick={() => void askCapacity(o)}>
                        {heldPackageIds.has(o.id) ? t('forma.capacity.renewAddon') : t('forma.addCapacity')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DashboardSection>

        {/* E. Requests */}
        <DashboardSection title={t('forma.section.requests')} icon="list" testId="plan-requests">
          {d.requests.length === 0 ? (
            <p className="card text-sm text-earth-muted">{t('forma.noRequests')}</p>
          ) : (
            <div className="card divide-y divide-line-soft p-0">
              {d.requests.map((r) => {
                const open = isActionable(r);
                const hours = open && hasDeadline(r) ? Math.max(0, Math.ceil((r.confirmationDeadline - Date.now()) / HOUR_MS)) : null;
                return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" data-testid="plan-request-row">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{requestLabel(r)}</p>
                      <p className="text-[12px] text-earth-subtle">
                        <span dir="ltr">{requestPrice(r)}</span> · {fmtDate(r.requestedAt, i18n.language)}
                        {hours != null ? ` · ${t('forma.hoursLeft', { count: hours })}` : ''}
                      </p>
                      {r.adminNote && !open ? <p className="text-[12px] text-earth-muted">{r.adminNote}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`chip text-[11px] ${open ? 'border-warn/50 text-warn' : r.status === 'confirmed' ? 'border-success/50 text-success' : ''}`}>{t(`forma.requestStatus.${r.status}`)}</span>
                      {r.status === 'awaiting' && r.type !== 'trial_expired' && (
                        <button type="button" className="text-[13px] text-earth-muted hover:text-white" data-testid="plan-request-cancel" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                          {t('forma.cancelRequest')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardSection>
      </div>
    </div>
  );
}
