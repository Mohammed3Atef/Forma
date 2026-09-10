import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SearchField, SelectField } from '@/components/ui/Field';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import { setAccountStatus } from '@/services/platform/accountsApi';
import { fetchMembers, inSegment, type MemberRow, type MemberSegment } from '@/services/platform/adminMembersApi';
import { bumpUsage } from '@/services/platform/usageApi';
import { confirmDialog } from '@/stores/dialogStore';
import { shortDate } from '@/lib/utils';
import type { AccountStatus, Role } from '@/types';

const ACCT_PILL: Record<AccountStatus, string> = {
  active: 'border-success/50 text-success',
  pending: 'border-warn/50 text-warn',
  suspended: 'border-danger/50 text-danger',
  disabled: 'border-danger/50 text-danger',
};
const SUB_PILL: Record<string, string> = {
  none: 'border-line text-earth-subtle', trial: 'border-brand/50 text-brand',
  active: 'border-success/50 text-success', pending: 'border-warn/50 text-warn',
  frozen: 'border-warn/50 text-warn', expired: 'border-danger/50 text-danger',
  cancelled: 'border-danger/50 text-danger', ended: 'border-danger/50 text-danger',
};

/** Admin member console: every account, join-date segments, client-subscription oversight + control. */
export function AdminMembers() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const actorId = useSession((s) => s.account?.id);
  const qc = useQueryClient();
  useFullBleed();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');
  const [segment, setSegment] = useState<MemberSegment>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  // Track admin searches for platform usage analytics (debounced, best-effort).
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) return;
    const id = setTimeout(() => { void bumpUsage('searches'); }, 900);
    return () => clearTimeout(id);
  }, [search]);

  const q = useQuery({ queryKey: ['adminMembers'], queryFn: fetchMembers, staleTime: 60_000 });
  const d = q.data;

  const canManage = (r: Role) =>
    isSuper ? r !== 'super_admin' : r === 'client' || r === 'coach';

  const status = useMutation({
    mutationFn: ({ row, next }: { row: MemberRow; next: AccountStatus }) => setAccountStatus(row.user, next),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['adminMembers'] }),
  });

  const rows = useMemo(() => {
    const qq = search.trim().toLowerCase();
    const list = (d?.rows ?? []).filter((r) => {
      if (roleFilter !== 'all' && r.user.role !== roleFilter) return false;
      if (statusFilter !== 'all' && r.user.accountStatus !== statusFilter) return false;
      if (!inSegment(r.user.createdAt, segment)) return false;
      if (!qq) return true;
      return (r.user.displayName || '').toLowerCase().includes(qq) || r.user.email.toLowerCase().includes(qq) || (r.user.phone ?? '').includes(qq);
    });
    return list.sort((a, b) => (sort === 'newest' ? b.user.createdAt - a.user.createdAt : a.user.createdAt - b.user.createdAt));
  }, [d?.rows, search, roleFilter, statusFilter, segment, sort]);

  const openMember = (r: MemberRow) => navigate(r.user.role === 'coach' ? `/admin/coaches/${r.user.id}` : `/admin/clients/${r.user.id}`);
  const quickAction = async (r: MemberRow) => {
    const suspend = r.user.accountStatus === 'active' || r.user.accountStatus === 'pending';
    const next: AccountStatus = suspend ? 'suspended' : 'active';
    if (suspend && !(await confirmDialog({ title: t('adminMembers.suspend'), message: t('adminMembers.confirmSuspend', { name: r.user.displayName || r.user.email }), danger: true }))) return;
    status.mutate({ row: r, next });
  };

  const activeSubs = (d?.subs.active ?? 0) + (d?.subs.trial ?? 0);

  const columns: Column<MemberRow>[] = [
    { key: 'member', header: t('adminMembers.member'), cell: (r) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={r.user.displayName || r.user.email} photoUrl={r.user.photoUrl} size="sm" />
        <span className="min-w-0"><span className="block truncate font-medium">{r.user.displayName || r.user.email}</span><span className="block truncate text-[12px] text-earth-subtle">{r.user.email}</span></span>
      </span>
    ) },
    { key: 'role', header: t('adminMembers.role'), cell: (r) => <span className="text-[13px]">{t(`roles.${r.user.role}`)}</span> },
    { key: 'acct', header: t('subscription.accountTitle'), cell: (r) => <span className={`chip text-[11px] ${ACCT_PILL[r.user.accountStatus]}`}>{t(`subscription.acct.${r.user.accountStatus}`)}</span> },
    { key: 'sub', header: t('adminMembers.subscription'), cell: (r) => r.user.role === 'client' ? <span className={`chip text-[11px] ${SUB_PILL[r.subState ?? 'none']}`}>{t(`subscription.status.${r.subState ?? 'none'}`)}</span> : <span className="text-earth-subtle">—</span> },
    { key: 'joined', header: t('adminMembers.joined'), cell: (r) => <span className="text-[12px] text-earth-subtle">{shortDate(new Date(r.user.createdAt).toISOString().slice(0, 10), i18n.language)}</span> },
    { key: 'actions', header: '', className: 'text-end', cell: (r) => canManage(r.user.role) && r.user.id !== actorId ? (
      <button type="button" className="btn-ghost h-8 px-3 text-[11px]" onClick={(e) => { e.stopPropagation(); void quickAction(r); }}>
        {r.user.accountStatus === 'suspended' || r.user.accountStatus === 'disabled' ? t('adminMembers.reactivate') : t('adminMembers.suspend')}
      </button>
    ) : null },
  ];

  return (
    <div data-testid="admin-members">
      <PageHeader eyebrow={t(isSuper ? 'platform.superAdmin' : 'platform.admin')} title={t('adminMembers.title')} />

      {q.isLoading || !d ? (
        <LoadingState variant="cards" count={4} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon="user" value={d.total} label={t('adminMembers.members')} />
            <MetricCard icon="plus" value={d.newThisMonth} label={t('adminMembers.newThisMonth')} hint={t('adminMembers.newThisWeekHint', { n: d.newThisWeek })} tone="brand" />
            <MetricCard icon="check" value={activeSubs} label={t('adminMembers.activeSubs')} tone="success" />
            <MetricCard icon="calendar" value={d.expiringSoon.length} label={t('adminMembers.expiringSubs')} tone={d.expiringSoon.length ? 'warn' : 'default'} />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SearchField label={t('adminMembers.search')} srOnlyLabel placeholder={t('adminMembers.search')} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="members-search" />
            <SelectField label={t('adminMembers.role')} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | 'all')} data-testid="members-role">
              <option value="all">{t('admin.allRoles')}</option>
              <option value="coach">{t('roles.coach')}</option>
              <option value="client">{t('roles.client')}</option>
              <option value="admin">{t('roles.admin')}</option>
            </SelectField>
            <SelectField label={t('subscription.accountTitle')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AccountStatus | 'all')} data-testid="members-status">
              <option value="all">{t('admin.allStatuses')}</option>
              <option value="active">{t('subscription.acct.active')}</option>
              <option value="pending">{t('subscription.acct.pending')}</option>
              <option value="suspended">{t('subscription.acct.suspended')}</option>
              <option value="disabled">{t('subscription.acct.disabled')}</option>
            </SelectField>
            <SelectField label={t('adminMembers.segmentLabel')} value={segment} onChange={(e) => setSegment(e.target.value as MemberSegment)} data-testid="members-segment">
              <option value="all">{t('adminMembers.segment.all')}</option>
              <option value="week">{t('adminMembers.segment.week')}</option>
              <option value="month">{t('adminMembers.segment.month')}</option>
              <option value="older">{t('adminMembers.segment.older')}</option>
            </SelectField>
            <SelectField label={t('adminMembers.sortLabel')} value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} data-testid="members-sort">
              <option value="newest">{t('adminMembers.sort.newest')}</option>
              <option value="oldest">{t('adminMembers.sort.oldest')}</option>
            </SelectField>
          </div>

          {/* Expiring soon */}
          {d.expiringSoon.length ? (
            <DashboardSection title={t('adminMembers.expiringSoon')} icon="calendar">
              <div className="card divide-y divide-line-soft">
                {d.expiringSoon.slice(0, 8).map((r) => {
                  const days = Math.max(0, Math.ceil((r.subscription!.endAt - Date.now()) / 86_400_000));
                  return (
                    <button key={r.user.id} type="button" onClick={() => openMember(r)} className="row w-full text-start">
                      <Avatar name={r.user.displayName || r.user.email} photoUrl={r.user.photoUrl} />
                      <span className="min-w-0 flex-1 truncate font-medium">{r.user.displayName || r.user.email}</span>
                      <span className={`font-mono text-sm ${days <= 1 ? 'text-danger' : 'text-warn'}`}>{t('subscription.daysLeft', { n: days })}</span>
                      <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
                    </button>
                  );
                })}
              </div>
            </DashboardSection>
          ) : null}

          {/* Members list */}
          {rows.length === 0 ? (
            <EmptyState icon="user" title={t('adminMembers.noMembers')} />
          ) : isDesktop ? (
            <div className="hidden lg:block">
              <DataTable testId="admin-members-table" columns={columns} rows={rows} rowKey={(r) => r.user.id} onRowClick={openMember} empty={t('adminMembers.noMembers')} />
            </div>
          ) : (
            <div className="card divide-y divide-line-soft">
              {rows.map((r) => (
                <button key={r.user.id} type="button" onClick={() => openMember(r)} className="row w-full text-start">
                  <Avatar name={r.user.displayName || r.user.email} photoUrl={r.user.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.user.displayName || r.user.email}</span>
                    <span className="block truncate text-[12px] text-earth-subtle">{t(`roles.${r.user.role}`)} · {shortDate(new Date(r.user.createdAt).toISOString().slice(0, 10), i18n.language)}</span>
                  </span>
                  {r.user.role === 'client' ? <span className={`chip text-[11px] ${SUB_PILL[r.subState ?? 'none']}`}>{t(`subscription.status.${r.subState ?? 'none'}`)}</span> : <span className={`chip text-[11px] ${ACCT_PILL[r.user.accountStatus]}`}>{t(`subscription.acct.${r.user.accountStatus}`)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
