import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { StatTile } from '@/components/StatTile';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useSession } from '@/services/auth/sessionStore';
import { fetchCoachAdmin, type CoachAdminRow } from '@/services/platform/adminCoachesApi';
import { shortDate } from '@/lib/utils';

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
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const q = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, enabled: isSuper });
  if (!isSuper) return <Navigate to="/admin" replace />;
  const d = q.data;

  const columns: Column<CoachAdminRow>[] = [
    { key: 'coach', header: t('adminCoaches.coach'), cell: (r) => (
      <span className="min-w-0">
        <span className="block truncate font-medium">{r.coach.displayName || r.coach.email}</span>
        <span className="block truncate text-[12px] text-earth-subtle">{r.coach.email}</span>
      </span>
    ) },
    { key: 'plan', header: t('adminCoaches.plan'), cell: (r) => <span className="text-[13px]">{t(`adminCoaches.tier.${r.plan?.plan ?? 'none'}`)}</span> },
    { key: 'state', header: t('subscription.accountTitle'), cell: (r) => <span className={`chip text-[11px] ${STATE_PILL[r.state]}`}>{t(`adminCoaches.state.${r.state}`)}</span> },
    { key: 'used', header: t('adminCoaches.clientsUsed'), cell: (r) => <span className="font-mono text-sm">{r.plan ? `${r.plan.activeClientCount}/${r.plan.maxClients}` : '—'}</span>, className: 'text-end' },
    { key: 'reg', header: t('adminCoaches.registered'), cell: (r) => <span className="text-[12px] text-earth-subtle">{shortDate(new Date(r.coach.createdAt).toISOString().slice(0, 10), i18n.language)}</span> },
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
            rows={d.rows}
            rowKey={(r) => r.coach.id}
            onRowClick={(r) => navigate(`/admin/coaches/${r.coach.id}`)}
            empty={t('adminCoaches.none')}
          />
        </div>
      )}
    </div>
  );
}
