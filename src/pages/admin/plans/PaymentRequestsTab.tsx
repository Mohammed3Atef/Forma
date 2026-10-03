import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { TextAreaField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Sheet } from '@/components/Sheet';
import { alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useLocalized } from '@/hooks/useLocalized';
import { confirmPlanRequest, hasDeadline, isActionable, listPlanRequests, rejectPlanRequest } from '@/services/platform/coachPlanRequestsApi';
import { getFormaConfig } from '@/services/platform/coachPlanTiersApi';
import { commercialErrorMessage } from '@/lib/commercialErrors';
import { fmtDate, termPreview, useCapacityPrice } from '@/lib/formaFormat';
import { capacityOf } from '@/services/platform/coachPlanApi';
import type { AdminPlanRequestRow, PlanRequestStatus } from '@/types';

const HOUR_MS = 3_600_000;
const FILTERS: { key: string; statuses: PlanRequestStatus[] }[] = [
  { key: 'open', statuses: ['awaiting', 'processing'] },
  { key: 'confirmed', statuses: ['confirmed'] },
  { key: 'rejected', statuses: ['rejected'] },
  { key: 'expired', statuses: ['expired'] },
  { key: 'cancelled', statuses: ['cancelled'] },
];
export const statusTone = (s: PlanRequestStatus): PillTone => (s === 'awaiting' || s === 'processing' ? 'warn' : s === 'confirmed' ? 'ok' : s === 'rejected' ? 'bad' : 'mute');

/** Super Admin queue: subscription, renewal and capacity add-on payment confirmations. */
export function PaymentRequestsTab() {
  const { t, i18n } = useTranslation();
  const loc = useLocalized();
  const price = useCapacityPrice();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const [filter, setFilter] = useState('open');
  const [kind, setKind] = useState<'all' | 'subscription' | 'capacity'>('all');
  const [sel, setSel] = useState<AdminPlanRequestRow | null>(null);
  const [note, setNote] = useState('');
  const statuses = FILTERS.find((f) => f.key === filter)!.statuses;
  const q = useQuery({
    queryKey: ['planRequests', 'admin', filter, kind],
    queryFn: () => listPlanRequests({ statuses, types: kind === 'capacity' ? ['capacity_addon'] : kind === 'subscription' ? ['subscription', 'renewal', 'trial_expired'] : undefined }),
    refetchInterval: 60_000,
  });
  const cfg = useQuery({ queryKey: ['formaConfig'], queryFn: getFormaConfig, staleTime: 300_000 });
  const done = () => {
    setSel(null);
    setNote('');
    void qc.invalidateQueries({ queryKey: ['planRequests'] });
    void qc.invalidateQueries({ queryKey: ['coachAdmin'] });
    void qc.invalidateQueries({ queryKey: ['adminCommercial'] });
  };
  const onErr = (title: string) => (e: unknown) => void alertDialog({ title, message: commercialErrorMessage(e, t) }).then(done);
  const confirm = useMutation({ mutationFn: (r: AdminPlanRequestRow) => confirmPlanRequest(r.id, note.trim() || undefined), onSuccess: () => { done(); showToast({ title: t('forma.admin.confirmed'), variant: 'success' }); }, onError: onErr(t('forma.admin.confirmPayment')) });
  const reject = useMutation({ mutationFn: (r: AdminPlanRequestRow) => rejectPlanRequest(r.id, note.trim() || undefined), onSuccess: () => { done(); showToast({ title: t('forma.admin.rejected'), variant: 'success' }); }, onError: onErr(t('forma.admin.reject')) });

  const what = (r: AdminPlanRequestRow) =>
    r.capacitySnapshot ? `${loc(r.capacitySnapshot.name)} · +${r.capacitySnapshot.additionalClients}` : t(`forma.requestType.${r.type}`, { defaultValue: t('forma.requestType.subscription') });
  const amount = (r: AdminPlanRequestRow) =>
    r.capacitySnapshot ? price(r.capacitySnapshot) : r.planSnapshot ? t('forma.pricePerMonth', { price: r.planSnapshot.priceMonthly, currency: r.planSnapshot.currency }) : '—';
  const deadline = (r: AdminPlanRequestRow) => {
    if (!isActionable(r) || !hasDeadline(r)) return null;
    const h = Math.ceil((r.confirmationDeadline - Date.now()) / HOUR_MS);
    return h <= 0 ? t('forma.admin.overdue') : t('forma.hoursLeft', { count: h });
  };
  const current = (r: AdminPlanRequestRow) => {
    const p = r.currentPlan;
    if (!p) return t('forma.state.none');
    const c = capacityOf(p);
    return `${t(p.phase === 'trial' ? 'forma.phase.trial' : 'forma.phase.forma')} · ${t(`forma.state.${p.state}`)} · ${c.used}/${c.limit}`;
  };
  const rows = q.data ?? [];
  const priceChanged = sel?.planSnapshot && cfg.data && (sel.planSnapshot.priceMonthly !== cfg.data.priceMonthly || sel.planSnapshot.maxClients !== cfg.data.maxClients);

  return (
    <div data-testid="payment-requests">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`chip ${filter === f.key ? 'chip-on' : ''}`} onClick={() => setFilter(f.key)} data-testid={`requests-filter-${f.key}`}>
            {t(`forma.admin.filter.${f.key}`)}
          </button>
        ))}
        <span className="mx-1 w-px bg-line" aria-hidden />
        {(['all', 'subscription', 'capacity'] as const).map((k) => (
          <button key={k} type="button" className={`chip ${kind === k ? 'chip-on' : ''}`} onClick={() => setKind(k)} data-testid={`requests-kind-${k}`}>
            {t(`forma.admin.kind.${k}`)}
          </button>
        ))}
      </div>

      {q.isError && !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} testId="requests-error" />
      ) : q.isLoading ? (
        <LoadingState variant="cards" count={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon="check" tone="brand" title={t('forma.admin.noRequests')} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto p-0 lg:block">
            <table className="w-full text-sm" data-testid="requests-table">
              <thead className="text-start text-[12px] text-earth-muted">
                <tr className="border-b border-line-soft">
                  {['coach', 'request', 'amount', 'current', 'requested', 'deadline', 'status', ''].map((h) => (
                    <th key={h} className="px-4 py-2 text-start font-medium">{h ? t(`forma.admin.col.${h}`) : ''}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id} data-testid="request-row">
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-start font-medium hover:underline" onClick={() => navigate(`/admin/coaches/${r.coachId}`)}>{r.coachName ?? r.coachId}</button>
                      <span className="block text-[12px] text-earth-subtle">{r.coachEmail}</span>
                    </td>
                    <td className="px-4 py-2.5">{what(r)}</td>
                    <td className="px-4 py-2.5" dir="auto">{amount(r)}</td>
                    <td className="px-4 py-2.5 text-[12px] text-earth-muted">{current(r)}</td>
                    <td className="px-4 py-2.5 text-[12px]">{fmtDate(r.requestedAt, i18n.language)}</td>
                    <td className="px-4 py-2.5 text-[12px]">{deadline(r) ?? '—'}</td>
                    <td className="px-4 py-2.5"><Pill tone={statusTone(r.status)}>{t(`forma.requestStatus.${r.status}`)}</Pill></td>
                    <td className="px-4 py-2.5 text-end">
                      <button type="button" className="btn-tonal btn-sm" onClick={() => setSel(r)} data-testid="request-open">{isActionable(r) ? t('forma.admin.review') : t('forma.admin.details')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards — same actions */}
          <div className="space-y-3 lg:hidden">
            {rows.map((r) => (
              <button key={r.id} type="button" className="card block w-full text-start" onClick={() => setSel(r)} data-testid="request-card">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.coachName ?? r.coachId}</span>
                    <span className="block truncate text-[12px] text-earth-subtle">{what(r)}</span>
                  </span>
                  <Pill tone={statusTone(r.status)}>{t(`forma.requestStatus.${r.status}`)}</Pill>
                </div>
                <span className="mt-2 block text-sm" dir="auto">{amount(r)}</span>
                <span className="block text-[12px] text-earth-muted">{fmtDate(r.requestedAt, i18n.language)}{deadline(r) ? ` · ${deadline(r)}` : ''}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} size="md" title={sel ? what(sel) : ''}>
        {sel && (
          <div className="space-y-3" data-testid="request-detail">
            <dl className="card grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-earth-muted">{t('forma.admin.col.coach')}</dt><dd>{sel.coachName ?? sel.coachId} <span className="text-[12px] text-earth-subtle">{sel.coachEmail}</span></dd>
              <dt className="text-earth-muted">{t('forma.admin.col.current')}</dt><dd>{current(sel)}</dd>
              <dt className="text-earth-muted">{t('forma.admin.col.amount')}</dt><dd dir="auto" data-testid="request-detail-amount">{amount(sel)}</dd>
              {sel.planSnapshot && (<><dt className="text-earth-muted">{t('forma.admin.grants')}</dt><dd data-testid="request-detail-term">{(() => {
                const pv = termPreview(sel.currentPlan, sel.type, sel.planSnapshot.termDays);
                return pv.extended
                  ? t('forma.admin.grantsRenewal', { n: sel.planSnapshot.maxClients, ends: fmtDate(pv.currentEndsAt!, i18n.language), through: fmtDate(pv.end, i18n.language) })
                  : t('forma.admin.grantsSubscription', { n: sel.planSnapshot.maxClients, days: sel.planSnapshot.termDays });
              })()}</dd></>)}
              {sel.capacitySnapshot && (<><dt className="text-earth-muted">{t('forma.admin.grants')}</dt><dd>{t('forma.admin.grantsCapacity', { n: sel.capacitySnapshot.additionalClients })}</dd></>)}
              <dt className="text-earth-muted">{t('forma.admin.col.requested')}</dt><dd>{fmtDate(sel.requestedAt, i18n.language)}</dd>
              {deadline(sel) && (<><dt className="text-earth-muted">{t('forma.admin.col.deadline')}</dt><dd>{deadline(sel)}</dd></>)}
              <dt className="text-earth-muted">{t('forma.admin.col.status')}</dt><dd><Pill tone={statusTone(sel.status)}>{t(`forma.requestStatus.${sel.status}`)}</Pill></dd>
              {sel.reason && (<><dt className="text-earth-muted">{t('forma.admin.coachNote')}</dt><dd>{sel.reason}</dd></>)}
              {sel.adminNote && (<><dt className="text-earth-muted">{t('forma.admin.adminNote')}</dt><dd>{sel.adminNote}</dd></>)}
            </dl>
            {priceChanged && isActionable(sel) && <p className="text-[12px] text-warn" data-testid="request-config-changed">{t('forma.admin.snapshotDiffers')}</p>}
            {isActionable(sel) && (
              <>
                <p className="text-[12px] text-earth-subtle">{t('forma.admin.confirmExplain')}</p>
                <TextAreaField label={t('forma.admin.adminNote')} className="min-h-16" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <SubmitButton type="button" variant="ghost" pending={reject.isPending} offline={!online} disabled={confirm.isPending} onClick={() => reject.mutate(sel)} data-testid="request-reject">
                    {t('forma.admin.reject')}
                  </SubmitButton>
                  <SubmitButton type="button" pending={confirm.isPending} offline={!online} disabled={reject.isPending} onClick={() => confirm.mutate(sel)} data-testid="request-confirm">
                    {t('forma.admin.confirmPayment')}
                  </SubmitButton>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
