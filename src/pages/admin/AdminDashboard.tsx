import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { useSession } from '@/services/auth/sessionStore';
import { useFullBleed } from '@/hooks/useFullBleed';
import { OverviewPanel } from './dashboard/OverviewPanel';

/**
 * Admin overview — matches the design's `overview()`, a plain standalone
 * screen, not a tabbed hub. The dashboard used to have 6 more tabs
 * (Growth/Usage/Coaches/Revenue/Subscriptions/System); every one of them
 * turned out to duplicate a standalone page or another tab's data (same
 * `coachAdmin` payload sliced 3 different ways, `CoachesPanel` ≈
 * `/admin/coaches`, `SystemPanel` was already just `/admin/governance`'s own
 * content re-imported) — each tab's real unique content was migrated to its
 * rightful destination (Coaches' split-pane, the new `/admin/subscriptions`,
 * the Analytics page, or this Overview's own growth chart) rather than kept
 * duplicated in two places.
 */
export function AdminDashboard() {
  useFullBleed();
  const { t } = useTranslation();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');

  return (
    <div data-testid="admin-dashboard">
      <PageHeader
        testId="admin-dashboard-top"
        eyebrow={t(isSuper ? 'platform.superAdmin' : 'platform.admin')}
        title={t('admin.controlCenter')}
      />
      <div className="mt-6">
        <OverviewPanel />
      </div>
    </div>
  );
}
