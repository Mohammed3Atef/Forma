import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { StatTile } from '@/components/StatTile';
import { fetchPlatformStats } from '@/services/platform/analyticsApi';
import { fetchAuditPage } from '@/services/platform/auditApi';
import { useSession } from '@/services/auth/sessionStore';

export function AdminOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const stats = useQuery({ queryKey: ['platformStats'], queryFn: fetchPlatformStats });
  const recent = useQuery({ queryKey: ['audit', 'recent'], queryFn: () => fetchAuditPage(6) });

  return (
    <>
      <TopBar
        testId="admin-overview"
        title={t('admin.overview')}
        eyebrow={t(isSuper ? 'platform.superAdmin' : 'platform.admin')}
        right={
          <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('platform.account')} onClick={() => navigate('/admin/settings')}>
            <Icon name="user" size={20} />
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon="user" value={stats.data?.total ?? '—'} label={t('admin.totalAccounts')} onClick={() => navigate('/admin/accounts')} />
        <StatTile icon="trophy" value={stats.data?.byRole.coach ?? '—'} label={t('admin.coaches')} />
        <StatTile icon="dumbbell" value={stats.data?.byRole.client ?? '—'} label={t('admin.clients')} />
        <StatTile icon="settings" value={stats.data?.byRole.admin ?? '—'} label={t('admin.admins')} />
        <StatTile icon="timer" value={stats.data?.pending ?? '—'} label={t('platform.status.pending')} />
        <StatTile icon="info" value={stats.data?.suspended ?? '—'} label={t('platform.status.suspended')} />
      </div>

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="h2">{t('admin.recentActivity')}</h2>
        <button type="button" className="eyebrow text-brand" onClick={() => navigate('/admin/governance')}>
          {t('admin.auditLogs')}
        </button>
      </div>
      <div className="card divide-y divide-line-soft">
        {recent.data?.logs.length ? (
          recent.data.logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
              <span className="truncate text-sm">{t(log.action, { defaultValue: log.action.replace(/\./g, ' ') })}</span>
              <span className="font-mono text-[11px] text-earth-subtle">
                {new Date(log.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-earth-muted">{t('admin.noLogs')}</p>
        )}
      </div>
    </>
  );
}
