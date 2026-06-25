import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { MobileCardList } from '@/components/ui/MobileCardList';
import { Pagination } from '@/components/ui/Pagination';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePagination } from '@/hooks/usePagination';
import { useSelection } from '@/hooks/useSelection';
import { useSession } from '@/services/auth/sessionStore';
import { fetchCoachAdmin, type CoachAdminRow } from '@/services/platform/adminCoachesApi';
import { trialDaysLeft } from '@/services/platform/coachPlanApi';
import { bulkSetAccountStatus } from '@/services/platform/accountsApi';
import { confirmDialog } from '@/stores/dialogStore';
import { shortDate } from '@/lib/utils';
import { CoachStateBadge } from './CoachStateBadge';
import type { AccountStatus } from '@/types';

type Filter = 'all' | 'trial' | 'active' | 'expired' | 'suspended';
const FILTERS: Filter[] = ['all', 'trial', 'active', 'expired', 'suspended'];

export function CoachesPanel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const [filter, setFilter] = useState<Filter>('all');
  const q = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, staleTime: 120_000 });
  const d = q.data;

  const rows = useMemo(
    () => (d?.rows ?? []).filter((r) => filter === 'all' || r.state === filter),
    [d?.rows, filter],
  );
  const sel = useSelection();
  const pg = usePagination(rows, 25, filter);
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

  if (q.isLoading || !d) return <LoadingState variant="cards" count={6} />;

  const usage = (r: CoachAdminRow) => `${r.clientCount}${r.plan ? `/${r.plan.maxClients}` : ''}`;
  const daysLeft = (r: CoachAdminRow) => {
    if (r.state !== 'trial' || !r.plan) return '—';
    const n = trialDaysLeft(r.plan);
    return n == null ? '—' : `${Math.max(0, n)}`;
  };

  const columns: Column<CoachAdminRow>[] = [
    {
      key: 'coach',
      header: t('adminCoaches.coach'),
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.coach.displayName || r.coach.email} photoUrl={r.coach.photoUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.coach.displayName || r.coach.email}</span>
            <span className="block truncate text-[12px] text-earth-subtle">{r.coach.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'plan', header: t('adminCoaches.plan'), cell: (r) => <span className="text-[13px]">{t(`adminCoaches.tier.${r.plan?.plan ?? 'none'}`)}</span> },
    { key: 'state', header: t('subscription.accountTitle'), cell: (r) => <CoachStateBadge state={r.state} /> },
    { key: 'used', header: t('adminCoaches.clientsUsed'), cell: (r) => <span className="font-mono text-sm">{usage(r)}</span>, className: 'text-end' },
    { key: 'days', header: t('adminCoaches.trialDaysLeft'), cell: (r) => <span className="font-mono text-sm">{daysLeft(r)}</span>, className: 'text-end' },
    { key: 'reg', header: t('adminCoaches.registered'), cell: (r) => <span className="text-[12px] text-earth-subtle">{shortDate(new Date(r.coach.createdAt).toISOString().slice(0, 10), i18n.language)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon="trophy" value={d.totalCoaches} label={t('adminCoaches.totalCoaches')} />
        <MetricCard icon="timer" value={d.trialCoaches} label={t('adminCoaches.trial')} />
        <MetricCard icon="check" value={d.activeCoaches} label={t('adminCoaches.active')} tone="success" />
        <MetricCard icon="info" value={d.expiredCoaches} label={t('adminCoaches.expired')} tone={d.expiredCoaches ? 'danger' : 'default'} />
        <MetricCard icon="dumbbell" value={d.totalClients} label={t('adminCoaches.totalClients')} />
        <MetricCard icon="bolt" value={`${d.conversionRate}%`} label={t('adminCoaches.conversion')} tone="system" />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`chip shrink-0 ${filter === f ? 'chip-on' : ''}`}
          >
            {f === 'all' ? t('admin.allStatuses') : t(`adminCoaches.state.${f}`)}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <DataTable
          testId="admin-coaches-table"
          caption={t('adminCoaches.title')}
          columns={columns}
          rows={pg.pageItems}
          rowKey={(r) => r.coach.id}
          onRowClick={(r) => navigate(`/admin/coaches/${r.coach.id}`)}
          selection={isSuper ? {
            isSelected: (r) => sel.has(r.coach.id),
            onToggle: (r) => sel.toggle(r.coach.id),
            allSelected: pageIds.length > 0 && pageIds.every((id) => sel.has(id)),
            someSelected: pageIds.some((id) => sel.has(id)),
            onToggleAll: (on) => sel.setMany(pageIds, on),
          } : undefined}
          empty={t('adminCoaches.none')}
        />
      </div>
      {/* Mobile / tablet cards */}
      <div className="lg:hidden">
        <MobileCardList
          testId="admin-coaches-cards"
          items={pg.pageItems}
          rowKey={(r) => r.coach.id}
          onItemClick={(r) => navigate(`/admin/coaches/${r.coach.id}`)}
          selection={isSuper ? { isSelected: (r) => sel.has(r.coach.id), onToggle: (r) => sel.toggle(r.coach.id) } : undefined}
          empty={<EmptyState icon="trophy" title={t('adminCoaches.none')} />}
          renderItem={(r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.coach.displayName || r.coach.email} photoUrl={r.coach.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.coach.displayName || r.coach.email}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[12px] text-earth-subtle">
                  <span>{t(`adminCoaches.tier.${r.plan?.plan ?? 'none'}`)}</span>
                  <span>·</span>
                  <span className="font-mono">{usage(r)}</span>
                </div>
              </div>
              <CoachStateBadge state={r.state} />
              <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
            </div>
          )}
        />
      </div>

      <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />

      {isSuper && (
        <BulkActionBar count={sel.count} onClear={sel.clear}>
          <button type="button" data-testid="bulk-activate" className="chip" disabled={bulkStatus.isPending} onClick={() => void runBulk('active')}>{t('common.bulk.activate')}</button>
          <button type="button" data-testid="bulk-suspend" className="chip text-danger" disabled={bulkStatus.isPending} onClick={() => void runBulk('suspended')}>{t('common.bulk.suspend')}</button>
        </BulkActionBar>
      )}
    </div>
  );
}
