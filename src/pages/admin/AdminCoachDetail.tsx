import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pill } from '@/components/ui/Pill';
import { SelectField, TextAreaField, TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { useBack } from '@/hooks/useBack';
import { showToast } from '@/stores/toastStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useLocalized } from '@/hooks/useLocalized';
import { useSession } from '@/services/auth/sessionStore';
import { fetchUser } from '@/services/platform/accountsApi';
import { capacityOf, extendCoachTerm, setCoachPlanEndsAt, setCoachSuspended, trialDaysLeft } from '@/services/platform/coachPlanApi';
import { confirmPlanRequest, hasDeadline, isActionable, rejectPlanRequest } from '@/services/platform/coachPlanRequestsApi';
import {
  cancelCapacityEntitlement,
  getAdminCoachCommercial,
  grantCapacityPackage,
  grantCustomCapacity,
  renewCoachSubscription,
  setManualCapacityAdjustment,
} from '@/services/platform/coachCommercialApi';
import { commercialErrorMessage } from '@/lib/commercialErrors';
import { fmtDate, renewConfirmMessage, termPreview, useCapacityPrice } from '@/lib/formaFormat';
import { shortDate } from '@/lib/utils';
import type { CapacityEntitlement, CoachPlanRequest } from '@/types';
import { statusTone } from './plans/PaymentRequestsTab';

// LOCAL y-m-d (saved as local midnight; reading back with toISOString() shifted a day east of UTC).
const toIso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const HOUR_MS = 3_600_000;

type AddForm = { mode: 'package'; packageId: string; note: string } | { mode: 'custom'; clients: string; interval: 'month' | 'one_time'; months: string; price: string; note: string };

/**
 * Super Admin: one coach's Forma subscription and client capacity —
 * renew / confirm payment, extend, end date, suspend; add / remove / adjust
 * capacity; request + plan history. One bounded read (`adminCoachOverview`);
 * every mutation is transactional + audited server-side.
 */
export function AdminCoachDetail() {
  const { t, i18n } = useTranslation();
  const loc = useLocalized();
  const price = useCapacityPrice();
  const { coachId = '' } = useParams();
  const goBack = useBack('/admin/coaches');
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const online = useOnlineStatus();
  const [endDate, setEndDate] = useState('');
  const [add, setAdd] = useState<AddForm | null>(null);
  const [adjust, setAdjust] = useState<{ value: string; reason: string } | null>(null);

  const coach = useQuery({ queryKey: ['coachUser', coachId], queryFn: () => fetchUser(coachId), enabled: isSuper && !!coachId });
  const q = useQuery({ queryKey: ['adminCommercial', coachId], queryFn: () => getAdminCoachCommercial(coachId), enabled: isSuper && !!coachId });
  const d = q.data;
  const p = d?.plan ?? null;

  useEffect(() => {
    setEndDate(p?.endsAt ? toIso(p.endsAt) : '');
  }, [p?.endsAt]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['adminCommercial', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachUser', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachAdmin'] });
    void qc.invalidateQueries({ queryKey: ['planRequests'] });
  };
  const ok = (title: string) => () => {
    invalidate();
    showToast({ title, variant: 'success' });
  };
  const fail = (title: string) => (e: unknown) => void alertDialog({ title, message: commercialErrorMessage(e, t) }).then(invalidate);

  const renew = useMutation({ mutationFn: () => renewCoachSubscription(coachId), onSuccess: ok(t('forma.admin.renewForma')), onError: fail(t('forma.admin.renewForma')) });
  const extend = useMutation({ mutationFn: (days: number) => extendCoachTerm(coachId, days, p?.endsAt ?? null), onSuccess: ok(t('forma.admin.extend')), onError: fail(t('forma.admin.extend')) });
  const ends = useMutation({ mutationFn: (ms: number | null) => setCoachPlanEndsAt(coachId, ms), onSuccess: ok(t('admin.setEndDate')), onError: fail(t('admin.setEndDate')) });
  const acct = useMutation({
    mutationFn: (s: 'active' | 'suspended') => setCoachSuspended(coachId, s === 'suspended'),
    onSuccess: (_v, s) => {
      ok(t(s === 'suspended' ? 'adminCoaches.suspend' : 'adminCoaches.reactivate'))();
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['usersByRole', 'coach'] });
    },
    onError: (e, s) => fail(t(s === 'suspended' ? 'adminCoaches.suspend' : 'adminCoaches.reactivate'))(e),
  });
  const confirmReq = useMutation({ mutationFn: (id: string) => confirmPlanRequest(id), onSuccess: ok(t('forma.admin.confirmed')), onError: fail(t('forma.admin.confirmPayment')) });
  const rejectReq = useMutation({ mutationFn: (id: string) => rejectPlanRequest(id), onSuccess: ok(t('forma.admin.rejected')), onError: fail(t('forma.admin.reject')) });
  const grant = useMutation({
    mutationFn: (f: AddForm) =>
      f.mode === 'package'
        ? grantCapacityPackage(coachId, f.packageId, f.note.trim() || undefined)
        : grantCustomCapacity({ coachId, additionalClients: Math.floor(Number(f.clients)), billingInterval: f.interval, durationMonths: f.interval === 'month' ? Math.floor(Number(f.months)) || 1 : undefined, price: Number(f.price) || 0, currency: d?.config.currency, note: f.note.trim() }),
    onSuccess: (res) => {
      setAdd(null);
      ok(t('forma.admin.capacityChanged', { from: res.before, to: res.after }))();
    },
    onError: fail(t('forma.addCapacity')),
  });
  const remove = useMutation({
    mutationFn: (e: CapacityEntitlement) => cancelCapacityEntitlement(e.id),
    onSuccess: (res) => ok(t('forma.admin.capacityChanged', { from: res.before, to: res.after }))(),
    onError: fail(t('forma.admin.removeCapacity')),
  });
  const adj = useMutation({
    mutationFn: (v: { value: number; reason: string }) => setManualCapacityAdjustment(coachId, v.value, v.reason),
    onSuccess: (res) => {
      setAdjust(null);
      ok(t('forma.admin.capacityChanged', { from: res.before ?? 0, to: res.after }))();
    },
    onError: fail(t('forma.admin.adjustCapacity')),
  });

  if (!isSuper) return <Navigate to="/admin" replace />;
  const coachName = coach.data?.displayName || coach.data?.email || '';
  const cap = capacityOf(p);
  const daysLeft = p ? trialDaysLeft(p) : null;
  const state = p?.state ?? 'none';
  const openReqs = (d?.requests ?? []).filter(isActionable);
  const off = !online ? t('offline.actionDisabled') : undefined;
  const livePackages = (d?.packages ?? []).filter((x) => !x.archived);

  const doRenew = async () => {
    if (!d) return;
    // An open subscription request is what Renew confirms — preview with ITS snapshot, else the live config.
    const snap = openReqs.find((x) => x.planSnapshot)?.planSnapshot;
    const msg = renewConfirmMessage(t, i18n.language, { name: coachName, plan: p, price: snap?.priceMonthly ?? d.config.priceMonthly, currency: snap?.currency ?? d.config.currency, termDays: snap?.termDays ?? d.config.termDays, maxClients: snap?.maxClients ?? d.config.maxClients });
    if (await confirmDialog({ title: t('forma.admin.renewForma'), message: msg })) renew.mutate();
  };
  const doExtend = async (days: number) => {
    if (await confirmDialog({ title: t('forma.admin.extend'), message: t('forma.admin.extendBody', { n: days, name: coachName }) })) extend.mutate(days);
  };
  const doConfirm = async (r: CoachPlanRequest) => {
    const what = r.capacitySnapshot ? `${loc(r.capacitySnapshot.name)} (+${r.capacitySnapshot.additionalClients})` : t(`forma.requestType.${r.type}`);
    if (await confirmDialog({ title: t('forma.admin.confirmPayment'), message: t('forma.admin.confirmBody', { name: coachName, what }) })) confirmReq.mutate(r.id);
  };
  const doReject = async (r: CoachPlanRequest) => {
    if (await confirmDialog({ title: t('forma.admin.reject'), message: t('forma.admin.rejectBody', { name: coachName }), danger: true })) rejectReq.mutate(r.id);
  };
  const doRemove = async (e: CapacityEntitlement) => {
    const to = Math.max(0, cap.limit - e.snapshot.additionalClients);
    if (await confirmDialog({ title: t('forma.admin.removeCapacity'), message: t('forma.admin.removeBody', { name: coachName, from: cap.limit, to }), danger: true })) remove.mutate(e);
  };
  const reqLabel = (r: CoachPlanRequest) => (r.capacitySnapshot ? `${loc(r.capacitySnapshot.name)} · +${r.capacitySnapshot.additionalClients}` : t(`forma.requestType.${r.type}`, { defaultValue: r.type }));
  const reqAmount = (r: CoachPlanRequest) => (r.capacitySnapshot ? price(r.capacitySnapshot) : r.planSnapshot ? t('forma.pricePerMonth', { price: r.planSnapshot.priceMonthly, currency: r.planSnapshot.currency }) : '');

  const addValid = add ? (add.mode === 'package' ? !!add.packageId : Math.floor(Number(add.clients)) >= 1 && add.note.trim().length > 0) : false;
  const adjustValue = adjust ? Math.floor(Number(adjust.value)) : NaN;
  const adjustValid = !!adjust && Number.isFinite(adjustValue) && adjust.value.trim() !== '' && adjust.reason.trim().length >= 3;
  const adjustPreview = adjust && Number.isFinite(adjustValue) ? Math.max(0, cap.limit - (p?.manualCapacityAdjustment ?? 0) + adjustValue) : null;

  return (
    <div data-testid="admin-coach-detail">
      <TopBar title={coach.data?.displayName || t('adminCoaches.coach')} eyebrow={t('platform.superAdmin')} onBack={goBack} />
      {q.isError && !d ? (
        <ErrorState onRetry={() => void q.refetch()} testId="admin-coach-error" />
      ) : coach.isLoading || !d ? (
        <LoadingState variant="list" count={4} />
      ) : (
        <div className="space-y-5">
          {/* Open requests */}
          {openReqs.length > 0 && (
            <section className="card space-y-3 border-brand/40" data-testid="coach-open-requests">
              <h2 className="h2">{t('forma.admin.openRequests')}</h2>
              {openReqs.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-3 last:border-0 last:pb-0" data-testid="coach-open-request">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{reqLabel(r)}</p>
                    <p className="text-[12px] text-earth-subtle"><span dir="ltr">{reqAmount(r)}</span>{r.type === 'renewal' && r.planSnapshot && termPreview(p, 'renewal', r.planSnapshot.termDays).extended ? ` · ${t('forma.renewalPreview', { ends: fmtDate(p!.endsAt!, i18n.language), through: fmtDate(termPreview(p, 'renewal', r.planSnapshot.termDays).end, i18n.language) })}` : ''}{hasDeadline(r) ? ` · ${t('forma.hoursLeft', { count: Math.max(0, Math.ceil((r.confirmationDeadline - Date.now()) / HOUR_MS)) })}` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-ghost btn-sm" data-testid="coach-request-reject" disabled={rejectReq.isPending || confirmReq.isPending || !online} title={off} onClick={() => void doReject(r)}>{t('forma.admin.reject')}</button>
                    <button type="button" className="btn-primary btn-sm" data-testid="coach-request-confirm" disabled={rejectReq.isPending || confirmReq.isPending || !online} title={off} onClick={() => void doConfirm(r)}>{t('forma.admin.confirmPayment')}</button>
                  </div>
                </div>
              ))}
              <p className="text-[12px] text-earth-subtle">{t('forma.admin.confirmExplain')}</p>
            </section>
          )}

          {/* Subscription */}
          <section className="card space-y-2" data-testid="coach-subscription">
            <h2 className="h2 mb-1">{t('forma.section.subscription')}</h2>
            <Row label={t('forma.product')} value={p ? t(p.phase === 'trial' ? 'forma.phase.trial' : 'forma.phase.forma') : '—'} />
            <Row label={t('forma.status')} value={t(`forma.state.${state}`)} />
            <Row label={t('forma.yourPrice')} value={p?.subscription ? `${p.subscription.priceMonthly} ${p.subscription.currency}` : '—'} />
            <Row label={t('admin.started')} value={p?.startedAt ? shortDate(toIso(p.startedAt), i18n.language) : '—'} />
            <Row label={t('admin.endDate')} value={p?.endsAt ? shortDate(toIso(p.endsAt), i18n.language) : '—'} />
            {daysLeft != null && state !== 'expired' ? <Row label={t('adminCoaches.daysLeftLabel')} value={t('forma.daysLeft', { count: Math.max(0, daysLeft) })} /> : null}
            <Row label={t('adminCoaches.accountStatus')} value={t(`subscription.acct.${coach.data?.accountStatus ?? 'active'}`)} />
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" className="btn-primary btn-sm" data-testid="coach-renew" disabled={renew.isPending || !online || !p} title={off} onClick={() => void doRenew()}>{t('forma.admin.renewForma')}</button>
              <button type="button" className="chip" data-testid="coach-extend-7" disabled={extend.isPending || !online || !p} onClick={() => void doExtend(7)}>{t('forma.admin.extendDays', { n: 7 })}</button>
              <button type="button" className="chip" data-testid="coach-extend-15" disabled={extend.isPending || !online || !p} onClick={() => void doExtend(15)}>{t('forma.admin.extendDays', { n: 15 })}</button>
              {coach.data?.accountStatus === 'suspended' || coach.data?.accountStatus === 'pending' ? (
                <button type="button" className="chip" data-testid="coach-reactivate" disabled={acct.isPending || !online} onClick={() => acct.mutate('active')}>{t('adminCoaches.reactivate')}</button>
              ) : (
                <button type="button" className="chip text-danger" data-testid="coach-suspend" disabled={acct.isPending || !online} title={off} onClick={async () => { if (await confirmDialog({ title: t('adminCoaches.suspend'), message: t('adminCoaches.confirmSuspend'), danger: true })) acct.mutate('suspended'); }}>{t('adminCoaches.suspend')}</button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <TextInput label={t('admin.setEndDate')} srOnlyLabel fieldClassName="max-w-[180px]" type="date" data-testid="coach-enddate-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <button type="button" className="chip" data-testid="coach-enddate-save" disabled={ends.isPending || !endDate || !p} onClick={async () => { if (await confirmDialog({ title: t('admin.setEndDate'), message: t('admin.confirmSetEndDate', { date: shortDate(endDate, i18n.language), name: coachName }) })) ends.mutate(new Date(`${endDate}T00:00:00`).getTime()); }}>{t('admin.setEndDate')}</button>
            </div>
          </section>

          {/* Capacity */}
          <section className={`card space-y-3 ${cap.over > 0 ? 'border-warn/60' : ''}`} data-testid="coach-capacity">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h2">{t('forma.section.capacity')}</h2>
              <p className="font-display text-2xl font-bold" data-testid="coach-capacity-usage"><span dir="ltr">{cap.used} / {cap.limit}</span></p>
            </div>
            {cap.over > 0 && <Pill tone="warn" testId="coach-over-capacity">{t('forma.capacity.overBy', { n: cap.over })}</Pill>}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-earth-muted">{t('forma.capacity.base')}</p><p className="font-semibold">{p?.baseMaxClients ?? 0}</p></div>
              <div><p className="text-earth-muted">{t('forma.capacity.addons')}</p><p className="font-semibold">+{p?.addonClientCapacity ?? 0}</p></div>
              <div><p className="text-earth-muted">{t('forma.capacity.adjustment')}</p><p className="font-semibold">{(p?.manualCapacityAdjustment ?? 0) > 0 ? '+' : ''}{p?.manualCapacityAdjustment ?? 0}</p></div>
            </div>
            {p?.manualCapacityNote ? <p className="text-[12px] text-earth-subtle">{t('forma.admin.adjustNote', { reason: p.manualCapacityNote.reason, date: fmtDate(p.manualCapacityNote.at, i18n.language) })}</p> : null}

            {d.activeEntitlements.length > 0 && (
              <div className="divide-y divide-line-soft rounded-xl border border-line-soft">
                {d.activeEntitlements.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" data-testid="coach-entitlement">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{loc(e.snapshot.name)} · +{e.snapshot.additionalClients}</p>
                      <p className="text-[12px] text-earth-subtle">{price(e.snapshot)} · {e.endsAt ? t('forma.capacity.until', { date: fmtDate(e.endsAt, i18n.language) }) : t('forma.capacity.permanent')}{e.note ? ` · ${e.note}` : ''}</p>
                    </div>
                    <button type="button" className="btn-ghost btn-sm text-danger" data-testid="coach-entitlement-remove" disabled={remove.isPending || !online} title={off} onClick={() => void doRemove(e)}>{t('forma.admin.removeCapacity')}</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-tonal btn-sm" data-testid="coach-add-capacity" disabled={!online || !p} title={off} onClick={() => setAdd(livePackages.length ? { mode: 'package', packageId: livePackages[0].id, note: '' } : { mode: 'custom', clients: '10', interval: 'month', months: '1', price: '0', note: '' })}>{t('forma.addCapacity')}</button>
              <button type="button" className="btn-ghost btn-sm" data-testid="coach-adjust-capacity" disabled={!online || !p} title={off} onClick={() => setAdjust({ value: String(p?.manualCapacityAdjustment ?? 0), reason: '' })}>{t('forma.admin.adjustCapacity')}</button>
            </div>
          </section>

          {/* Request history */}
          <section className="space-y-2" data-testid="coach-request-history">
            <h2 className="h2">{t('forma.admin.requestHistory')}</h2>
            {d.requests.length === 0 ? (
              <p className="card text-sm text-earth-muted">{t('forma.noRequests')}</p>
            ) : (
              <div className="card divide-y divide-line-soft p-0">
                {d.requests.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{reqLabel(r)}</span>
                      <span className="block text-[12px] text-earth-subtle"><span dir="ltr">{reqAmount(r)}</span> · {fmtDate(r.requestedAt, i18n.language)}</span>
                    </span>
                    <Pill tone={statusTone(r.status)}>{t(`forma.requestStatus.${r.status}`)}</Pill>
                  </div>
                ))}
              </div>
            )}
          </section>

          {p?.history?.length ? (
            <section className="space-y-2">
              <h2 className="h2">{t('admin.planHistory')}</h2>
              <div className="card divide-y divide-line-soft p-0">
                {[...p.history].reverse().slice(0, 20).map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="min-w-0 truncate text-sm">{t(`forma.hist.${h.action.replace(/\./g, '_')}`, { defaultValue: h.action })}{h.detail ? ` · ${h.detail}` : ''}</span>
                    <span className="shrink-0 font-mono text-[11px] text-earth-subtle">{shortDate(toIso(h.at), i18n.language)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {/* Add capacity */}
      <Sheet open={!!add} onClose={() => setAdd(null)} size="md" title={t('forma.addCapacity')}>
        {add && (
          <div className="space-y-3" data-testid="add-capacity-form">
            <div className="flex gap-2">
              <button type="button" className={`chip ${add.mode === 'package' ? 'chip-on' : ''}`} disabled={!livePackages.length} onClick={() => setAdd({ mode: 'package', packageId: livePackages[0]?.id ?? '', note: add.note })}>{t('forma.admin.fromPackage')}</button>
              <button type="button" className={`chip ${add.mode === 'custom' ? 'chip-on' : ''}`} data-testid="add-capacity-custom" onClick={() => setAdd({ mode: 'custom', clients: '10', interval: 'month', months: '1', price: '0', note: add.note })}>{t('forma.admin.custom')}</button>
            </div>
            {add.mode === 'package' ? (
              <SelectField label={t('forma.admin.tabPackages')} value={add.packageId} onChange={(e) => setAdd({ ...add, packageId: e.target.value })} data-testid="add-capacity-package">
                {livePackages.map((x) => (
                  <option key={x.id} value={x.id}>{loc(x.name)} · +{x.additionalClients} · {price({ ...x, durationMonths: x.billingInterval === 'month' ? x.durationMonths ?? 1 : null })}{x.active ? '' : ` (${t('forma.admin.inactive')})`}</option>
                ))}
              </SelectField>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <TextInput label={t('forma.admin.additionalClients')} inputMode="numeric" value={add.clients} onChange={(e) => setAdd({ ...add, clients: e.target.value })} data-testid="add-capacity-clients" />
                <SelectField label={t('forma.admin.interval')} value={add.interval} onChange={(e) => setAdd({ ...add, interval: e.target.value as 'month' | 'one_time' })}>
                  <option value="month">{t('forma.admin.intervalMonth')}</option>
                  <option value="one_time">{t('forma.admin.intervalOneTime')}</option>
                </SelectField>
                {add.interval === 'month' && <TextInput label={t('forma.admin.durationMonths')} inputMode="numeric" value={add.months} onChange={(e) => setAdd({ ...add, months: e.target.value })} />}
                <TextInput label={`${t('forma.admin.price')} (${d?.config.currency ?? ''})`} inputMode="decimal" value={add.price} onChange={(e) => setAdd({ ...add, price: e.target.value })} />
              </div>
            )}
            <TextAreaField label={add.mode === 'custom' ? `${t('forma.admin.note')} *` : t('forma.admin.note')} className="min-h-16" value={add.note} onChange={(e) => setAdd({ ...add, note: e.target.value })} data-testid="add-capacity-note" />
            <p className="text-[12px] text-earth-subtle">{t('forma.admin.grantExplain')}</p>
            <SubmitButton type="button" pending={grant.isPending} offline={!online} disabled={!addValid} fullWidth onClick={() => grant.mutate(add)} data-testid="add-capacity-save">{t('forma.addCapacity')}</SubmitButton>
          </div>
        )}
      </Sheet>

      {/* Adjust capacity */}
      <Sheet open={!!adjust} onClose={() => setAdjust(null)} size="sm" title={t('forma.admin.adjustCapacity')}>
        {adjust && (
          <div className="space-y-3" data-testid="adjust-capacity-form">
            <TextInput label={t('forma.admin.adjustValue')} inputMode="numeric" value={adjust.value} onChange={(e) => setAdjust({ ...adjust, value: e.target.value })} data-testid="adjust-capacity-value" />
            <TextAreaField label={`${t('forma.admin.reason')} *`} className="min-h-16" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} data-testid="adjust-capacity-reason" />
            {adjustPreview != null && <p className="text-sm">{t('forma.admin.capacityPreview', { from: cap.limit, to: adjustPreview })}</p>}
            <p className="text-[12px] text-earth-subtle">{t('forma.admin.noClientRemoval')}</p>
            <SubmitButton type="button" pending={adj.isPending} offline={!online} disabled={!adjustValid} fullWidth onClick={() => adj.mutate({ value: adjustValue, reason: adjust.reason.trim() })} data-testid="adjust-capacity-save">{t('common.save')}</SubmitButton>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-2 last:border-0 last:pb-0">
      <span className="text-sm text-earth-subtle">{label}</span>
      <span className="text-end text-sm font-medium">{value}</span>
    </div>
  );
}
