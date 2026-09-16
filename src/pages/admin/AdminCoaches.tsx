import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { StatTile } from '@/components/StatTile';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DetailPanel } from '@/components/ui/DetailPanel';
import { Pagination } from '@/components/ui/Pagination';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { usePagination } from '@/hooks/usePagination';
import { useSelection } from '@/hooks/useSelection';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import { fetchCoachAdmin, type CoachAdminRow } from '@/services/platform/adminCoachesApi';
import { listPendingPlanChangeRequests, renewCoachPlan, setCoachPlanStatus, trialDaysLeft } from '@/services/platform/coachPlanApi';
import { tierLabel } from '@/services/platform/coachPlanTiersApi';
import { bulkSetAccountStatus } from '@/services/platform/accountsApi';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useFullBleed } from '@/hooks/useFullBleed';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { shortDate } from '@/lib/utils';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { AccountStatus, CoachPlanTierConfig } from '@/types';

const STATE_TONE: Record<string, PillTone> = {
  trial: 'brand',
  active: 'ok',
  expired: 'bad',
  suspended: 'bad',
  none: 'mute',
};

/** Super-admin: SaaS control panel — all coaches, their plan tier, usage & status. */
export function AdminCoaches() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  useFullBleed();
  const online = useOnlineStatus();
  const isDesktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, enabled: isSuper });
  const pendingReqs = useQuery({ queryKey: ['planRequests', 'pending'], queryFn: listPendingPlanChangeRequests, enabled: isSuper, staleTime: 60_000 });
  const pendingSet = new Set((pendingReqs.data ?? []).map((r) => r.coachId));
  const renew = useMutation({
    mutationFn: (coachId: string) => renewCoachPlan(coachId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['coachAdmin'] }),
    onError: (e) =>
      void alertDialog({
        title: t('adminCoaches.renew'),
        message: e instanceof Error ? e.message : t('common.errorGeneric'),
      }),
  });
  const setStatus = useMutation({
    mutationFn: ({ coachId, status }: { coachId: string; status: 'active' | 'suspended' }) => setCoachPlanStatus(coachId, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['coachAdmin'] }),
    onError: (e) =>
      void alertDialog({ title: t('adminCoaches.suspend'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
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
    onError: (e, vars) =>
      void alertDialog({
        title: t(`platform.status.${vars.status}`),
        message: e instanceof Error ? e.message : t('common.errorGeneric'),
      }),
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
    { key: 'state', header: t('subscription.accountTitle'), cell: (r) => <Pill tone={STATE_TONE[r.state]}>{t(`adminCoaches.state.${r.state}`)}</Pill> },
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
          {needsRenew && <button type="button" data-testid="coach-renew" className="btn-ghost h-8 px-3 text-[11px]" disabled={renew.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => renew.mutate(r.coach.id)}>{t('adminCoaches.renew')}</button>}
        </span>
      );
    } },
  ];

  const selected = rows.find((r) => r.coach.id === selectedId) ?? null;
  const table = (
    <DataTable
      testId="admin-coaches-table"
      columns={columns}
      rows={pg.pageItems}
      rowKey={(r) => r.coach.id}
      selectedKey={isDesktop ? selectedId : undefined}
      onRowClick={(r) => (isDesktop ? setSelectedId(r.coach.id) : navigate(`/admin/coaches/${r.coach.id}`))}
      selection={{
        isSelected: (r) => sel.has(r.coach.id),
        onToggle: (r) => sel.toggle(r.coach.id),
        allSelected: pageIds.length > 0 && pageIds.every((id) => sel.has(id)),
        someSelected: pageIds.some((id) => sel.has(id)),
        onToggleAll: (on) => sel.setMany(pageIds, on),
      }}
      empty={t('adminCoaches.none')}
    />
  );

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
          {isDesktop ? (
            <div className="flex gap-5">
              <div className="min-w-0 flex-1 space-y-4">
                {table}
                <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
              </div>
              <div className="w-80 shrink-0">
                <DetailPanel testId="admin-coach-preview" empty={!selected} emptyMessage={t('coachDash.selectClient')}>
                  {selected && (
                    <CoachPreview
                      row={selected}
                      tiers={tiers}
                      pendingSet={pendingSet}
                      online={online}
                      renewPending={renew.isPending}
                      statusPending={setStatus.isPending}
                      onRenew={() => renew.mutate(selected.coach.id)}
                      onSetStatus={(status) => setStatus.mutate({ coachId: selected.coach.id, status })}
                      onOpenProfile={() => navigate(`/admin/coaches/${selected.coach.id}`)}
                      onViewAudit={() => navigate('/admin/audit')}
                    />
                  )}
                </DetailPanel>
              </div>
            </div>
          ) : (
            <>
              {table}
              <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
            </>
          )}
          <BulkActionBar count={sel.count} onClear={sel.clear}>
            <button type="button" data-testid="bulk-activate" className="chip" disabled={bulkStatus.isPending || !online} onClick={() => void runBulk('active')}>{t('common.bulk.activate')}</button>
            <button type="button" data-testid="bulk-suspend" className="chip text-danger" disabled={bulkStatus.isPending || !online} onClick={() => void runBulk('suspended')}>{t('common.bulk.suspend')}</button>
          </BulkActionBar>
        </div>
      )}
    </div>
  );
}

function CoachPreview({
  row,
  tiers,
  pendingSet,
  online,
  renewPending,
  statusPending,
  onRenew,
  onSetStatus,
  onOpenProfile,
  onViewAudit,
}: {
  row: CoachAdminRow;
  tiers: CoachPlanTierConfig[];
  pendingSet: Set<string>;
  online: boolean;
  renewPending: boolean;
  statusPending: boolean;
  onRenew: () => void;
  onSetStatus: (status: 'active' | 'suspended') => void;
  onOpenProfile: () => void;
  onViewAudit: () => void;
}) {
  const { t, i18n } = useTranslation();
  const c = row.coach;
  const usagePct = row.plan?.maxClients ? Math.min(100, Math.round((row.clientCount / row.plan.maxClients) * 100)) : 0;
  const needsRenew = !!row.plan && (row.state === 'expired' || row.state === 'suspended' || (trialDaysLeft(row.plan) ?? 99) <= 5);
  const hasReq = pendingSet.has(c.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar name={c.displayName || c.email} photoUrl={c.photoUrl} size="lg" />
        <div>
          <p className="font-semibold">{c.displayName || c.email}</p>
          <p className="text-[12px] text-earth-subtle">{c.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={STATE_TONE[row.state]}>{t(`adminCoaches.state.${row.state}`)}</Pill>
          <span className="chip text-[11px]">{tierLabel(tiers, row.plan?.plan ?? 'none', t)}</span>
          {hasReq && <span className="chip border-brand/50 text-[10.5px] text-brand">{t('adminCoaches.requestPending')}</span>}
        </div>
      </div>

      {row.plan?.maxClients ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[12px] text-earth-subtle">
            <span>{t('adminCoaches.clientsUsed')}</span>
            <span className="font-mono text-earth">{row.clientCount}/{row.plan.maxClients}</span>
          </div>
          <div className="prog"><span style={{ width: `${usagePct}%` }} /></div>
        </div>
      ) : null}

      <div className="space-y-2 text-sm">
        <PreviewRow label={t('adminCoaches.renews')}>
          {row.plan?.endsAt ? shortDate(new Date(row.plan.endsAt).toISOString().slice(0, 10), i18n.language) : '—'}
        </PreviewRow>
        <PreviewRow label={t('adminCoaches.registered')}>{shortDate(new Date(c.createdAt).toISOString().slice(0, 10), i18n.language)}</PreviewRow>
      </div>

      <div className="flex flex-col gap-2">
        {needsRenew && (
          <button type="button" className="btn-primary w-full disabled:opacity-40" disabled={renewPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={onRenew}>
            {t('adminCoaches.renew')}
          </button>
        )}
        {row.state === 'suspended' ? (
          <button type="button" data-testid="admin-coach-reactivate" className="btn-tonal w-full disabled:opacity-40" disabled={statusPending || !online} onClick={() => onSetStatus('active')}>{t('adminCoaches.reactivate')}</button>
        ) : (
          <button type="button" data-testid="admin-coach-suspend" className="btn-ghost w-full text-danger disabled:opacity-40" disabled={statusPending || !online} onClick={() => onSetStatus('suspended')}>{t('adminCoaches.suspend')}</button>
        )}
        <button type="button" data-testid="admin-coach-view-audit" className="btn-ghost w-full" onClick={onViewAudit}>
          <Icon name="list" size={16} className="me-1.5 inline" />{t('admin.auditLogs')}
        </button>
        <button type="button" data-testid="admin-coach-open-profile" className="btn-secondary w-full" onClick={onOpenProfile}>{t('admin.viewClientDetails')}</button>
      </div>
    </div>
  );
}

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-2">
      <span className="shrink-0 text-earth-subtle">{label}</span>
      <span className="min-w-0 text-end font-medium">{children}</span>
    </div>
  );
}
