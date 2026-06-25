import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, useTabParam, type TabDef } from '@/components/ui/Tabs';
import { useSession } from '@/services/auth/sessionStore';
import { useCan } from '@/services/auth/permissions';
import { OverviewPanel } from './dashboard/OverviewPanel';
import { CoachesPanel } from './dashboard/CoachesPanel';
import { RevenuePanel } from './dashboard/RevenuePanel';
import { SubscriptionsPanel } from './dashboard/SubscriptionsPanel';
import { SystemPanel } from './dashboard/SystemPanel';

/**
 * Admin "control center" — a tabbed hub at /admin. Overview is available to any
 * admin; Coaches/Revenue/Subscriptions are super-admin (SaaS) tabs; System is
 * gated by flag/audit permissions. Standalone /admin/* pages remain as deep
 * routes. Uses the cooler `system` accent to distinguish the admin tone.
 */
export function AdminDashboard() {
  const { t } = useTranslation();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const canFlags = useCan('flags.manage');
  const canAudit = useCan('audit.read');
  const canSystem = canFlags || canAudit;

  const tabs: TabDef[] = [
    { key: 'overview', label: t('admin.tabs.overview'), icon: 'chart' },
    ...(isSuper
      ? ([
          { key: 'coaches', label: t('admin.tabs.coaches'), icon: 'trophy' },
          { key: 'revenue', label: t('admin.tabs.revenue'), icon: 'bolt' },
          { key: 'subscriptions', label: t('admin.tabs.subscriptions'), icon: 'calendar' },
        ] as TabDef[])
      : []),
    ...(canSystem ? ([{ key: 'system', label: t('admin.tabs.system'), icon: 'settings' }] as TabDef[]) : []),
  ];

  const [tabParam, setTab] = useTabParam('tab', 'overview');
  const active = tabs.some((x) => x.key === tabParam) ? tabParam : 'overview';

  return (
    <div data-testid="admin-dashboard">
      <PageHeader
        eyebrow={t(isSuper ? 'platform.superAdmin' : 'platform.admin')}
        title={t('admin.controlCenter')}
      />
      <Tabs tabs={tabs} active={active} onChange={setTab} testIdPrefix="admin-tab" accent="system" />
      <div className="mt-6">
        {active === 'overview' ? <OverviewPanel /> : null}
        {active === 'coaches' ? <CoachesPanel /> : null}
        {active === 'revenue' ? <RevenuePanel /> : null}
        {active === 'subscriptions' ? <SubscriptionsPanel /> : null}
        {active === 'system' ? <SystemPanel /> : null}
      </div>
    </div>
  );
}
