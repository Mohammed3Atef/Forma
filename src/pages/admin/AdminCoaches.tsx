import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { StatTile } from '@/components/StatTile';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { usePagination } from '@/hooks/usePagination';
import { useSelection } from '@/hooks/useSelection';
import { useSession } from '@/services/auth/sessionStore';
import { fetchCoachAdmin, type CoachAdminRow } from '@/services/platform/adminCoachesApi';
import { listPendingPlanChangeRequests, renewCoachPlan, trialDaysLeft } from '@/services/platform/coachPlanApi';
import { tierLabel } from '@/services/platform/coachPlanTiersApi';
import { bulkSetAccountStatus } from '@/services/platform/accountsApi';
import { confirmDialog } from '@/stores/dialogStore';
import { shortDate } from '@/lib/utils';
import type { AccountStatus } from '@/types';

const STATE_PILL: Record<string, string> = {
  trial: 'border-brand/50 text-brand',
  active: 'border-success/50 text-success',
  expired: 'border-danger/50 text-danger',
  suspended: 'border-danger/50 text-danger',
  none: 'border-line text-earth-subtle',
};

/** Super-admin: SaaS control panel — all coaches, their plan tier, usage & status. */
export function AdminCoaches() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const q = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, enabled: isSuper });
  const pendingReqs = useQuery({ queryKey: ['planRequests', 'pending'], queryFn: listPendingPlanChangeRequests, enabled: isSuper, staleTime: 60_000 });
  const pendingSet = new Set((pendingReqs.data ?? []).map((r) => r.coachId));
  const renew = useMutation({
    mutationFn: (coachId: string) => renewCoachPlan(coachId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['coachAdmin'] }),
  });
  const sel = useSelection();
  const rows = q.data?.rows ?? [];
  const pg = usePagination(rows, 25);
  const pageIds = pg.pageItems.map((r) => r.coach.id);
  const bulkStatus = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: AccountStatus }) =>
      bulkSetAccountStatus(rows.filter((r) => ids.includes(r.coach.id)).map((r) => r.coach), status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coachAdmin'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      sel.clear();
    },
  });
  const runBulk = async (status: AccountStatus) => {
    if (sel.count === 0) return;
    const ok = await confirmDialog({ title: t(`platform.status.${status}`), message: t('common.bulk.confirmStatus', { n: sel.count }), danger: status !== 'active' });
    if (ok) bulkStatus.mutate({ ids: sel.ids, status });
  };
  if (!isSuper) return <Navigate to="/admin" replace />;
  const d = q.data;

  const tiers = d?.tiers ?? [];
  const renewsCell = (r: CoachAdminRow) => {
    if (!r.plan?.endsAt) return <span className="text-[12px] text-earth-subtle">—</span>;
    if (r.state === 'expired' || r.state === 'suspended') return <span className="text-[12px] font-medium text-danger">{t('adminCoaches.expired')}</span>;
    const left = trialDaysLeft(r.plan);
    if (left != null && left <= 5) return <span className="text-[12px] font-medium text-warn">{t('subscription.daysLeft', { n: Math.max(0, left) })}</span>;
    return <span className="text-[12px] text-earth-subtle">{shortDate(new Date(r.plan.endsAt).toISOString().slice(0, 10), i18n.language)}</span>;
  };

  const columns: Column<CoachAdminRow>[] = [
    { key: 'coach', header: t('adminCoaches.coach'), cell: (r) => (
      <span className="min-w-0">
        <span className="block truncate font-medium">{r.coach.displayName || r.coach.email}</span>
        <span className="block truncate text-[12px] text-earth-subtle">{r.coach.email}</span>
      </span>
    ) },
    { key: 'plan', header: t('adminCoaches.plan'), cell: (r) => <span className="text-[13px]">{tierLabel(tiers, r.plan?.plan ?? 'none', t)}</span> },
    { key: 'state', header: t('subscription.accountTitle'), cell: (r) => <span className={`chip text-[11px] ${STATE_PILL[r.state]}`}>{t(`adminCoaches.state.${r.state}`)}</span> },
    { key: 'used', header: t('adminCoaches.clientsUsed'), cell: (r) => <span className="font-mono text-sm">{r.plan ? `${r.clientCount}/${r.plan.maxClients}` : '—'}</span>, className: 'text-end' },
    { key: 'renews', header: t('adminCoaches.renews'), cell: renewsCell },
    { key: 'reg', header: t('adminCoaches.registered'), cell: (r) => <span className="text-[12px] text-earth-subtle">{shortDate(new Date(r.coach.createdAt).toISOString().slice(0, 10), i18n.language)}</span> },
    { key: 'attn', header: '', className: 'text-end', cell: (r) => {
      const needsRenew = !!r.plan && (r.state === 'expired' || r.state === 'suspended' || (trialDaysLeft(r.plan) ?? 99) <= 5);
      const hasReq = pendingSet.has(r.coach.id);
      if (!needsRenew && !hasReq) return null;
      return (
        <span className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {hasReq && <span className="chip border-brand/50 text-[10.5px] text-brand">{t('adminCoaches.requestPending')}</span>}
          {needsRenew && <button type="button" data-testid="coach-renew" className="btn-ghost h-8 px-3 text-[11px]" disabled={renew.isPending} onClick={() => renew.mutate(r.coach.id)}>{t('adminCoaches.renew')}</button>}
        </span>
      );
    } },
  ];

  return (
    <div data-testid="admin-coaches">
      <TopBar title={t('adminCoaches.title')} eyebrow={t('platform.superAdmin')} />
      {q.isLoading || !d ? (
        <p className="py-10 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            <StatTile icon="trophy" value={d.totalCoaches} label={t('adminCoaches.totalCoaches')} />
            <StatTile icon="timer" value={d.trialCoaches} label={t('adminCoaches.trial')} />
            <StatTile icon="user" value={d.activeCoaches} label={t('adminCoaches.active')} />
            <StatTile icon="info" value={d.expiredCoaches} label={t('adminCoaches.expired')} />
            <StatTile icon="dumbbell" value={d.totalClients} label={t('adminCoaches.totalClients')} />
            <StatTile icon="bolt" value={`${d.conversionRate}%`} label={t('adminCoaches.conversion')} />
          </div>
          <DataTable
            testId="admin-coaches-table"
            columns={columns}
            rows={pg.pageItems}
            rowKey={(r) => r.coach.id}
            onRowClick={(r) => navigate(`/admin/coaches/${r.coach.id}`)}
            selection={{
              isSelected: (r) => sel.has(r.coach.id),
              onToggle: (r) => sel.toggle(r.coach.id),
              allSelected: pageIds.length > 0 && pageIds.every((id) => sel.has(id)),
              someSelected: pageIds.some((id) => sel.has(id)),
              onToggleAll: (on) => sel.setMany(pageIds, on),
            }}
            empty={t('adminCoaches.none')}
          />
          <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
          <BulkActionBar count={sel.count} onClear={sel.clear}>
            <button type="button" data-testid="bulk-activate" className="chip" disabled={bulkStatus.isPending} onClick={() => void runBulk('active')}>{t('common.bulk.activate')}</button>
            <button type="button" data-testid="bulk-suspend" className="chip text-danger" disabled={bulkStatus.isPending} onClick={() => void runBulk('suspended')}>{t('common.bulk.suspend')}</button>
          </BulkActionBar>
        </div>
      )}
    </div>
  );
}
