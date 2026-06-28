import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { StatTile } from '@/components/StatTile';
import { BarChart } from '@/components/charts';
import { useFullBleed } from '@/hooks/useFullBleed';
import { fetchPlatformStats } from '@/services/platform/analyticsApi';

export function AdminAnalytics() {
  useFullBleed();
  const { t } = useTranslation();
  const stats = useQuery({ queryKey: ['platformStats'], queryFn: fetchPlatformStats });
  const d = stats.data;

  const dist = d
    ? [
        { label: t('roles.admin'), value: d.byRole.admin + d.byRole.super_admin },
        { label: t('roles.coach'), value: d.byRole.coach },
        { label: t('roles.client'), value: d.byRole.client },
      ]
    : [];

  return (
    <>
      <TopBar testId="admin-analytics" title={t('admin.analytics')} eyebrow={t('platform.platform')} />

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon="user" value={d?.total ?? '—'} label={t('admin.totalAccounts')} />
        <StatTile icon="trophy" value={d?.byRole.coach ?? '—'} label={t('admin.coaches')} />
        <StatTile icon="dumbbell" value={d?.byRole.client ?? '—'} label={t('admin.clients')} />
        <StatTile icon="timer" value={d?.pending ?? '—'} label={t('platform.status.pending')} />
      </div>

      <h2 className="h2 mb-1 mt-6">{t('admin.roleDistribution')}</h2>
      <div className="card">
        {dist.length ? <BarChart data={dist} /> : <p className="py-6 text-center text-sm text-earth-muted">{t('progress.noData')}</p>}
      </div>
    </>
  );
}
