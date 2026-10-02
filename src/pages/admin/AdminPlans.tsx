import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { useSession } from '@/services/auth/sessionStore';
import { FormaPlanTab } from './plans/FormaPlanTab';
import { CapacityPackagesTab } from './plans/CapacityPackagesTab';
import { PaymentRequestsTab } from './plans/PaymentRequestsTab';

/**
 * Super Admin commercial settings for the ONE Forma product:
 *   Forma Plan        — trial, base client limit, price, term, marketing copy, visibility
 *   Capacity Packages — internal client-capacity add-ons (never public)
 *   Payment Requests  — subscription / renewal / add-on confirmations
 */
export function AdminPlans() {
  const { t } = useTranslation();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const [tab, setTab] = useTabParam('tab', 'forma');
  if (!isSuper) return <Navigate to="/admin" replace />;
  return (
    <div data-testid="admin-plans">
      <TopBar title={t('forma.admin.title')} eyebrow={t('platform.superAdmin')} />
      <Tabs
        className="mb-5"
        testIdPrefix="plans-tab"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'forma', label: t('forma.admin.tabForma'), icon: 'bolt' },
          { key: 'packages', label: t('forma.admin.tabPackages'), icon: 'user' },
          { key: 'requests', label: t('forma.admin.tabRequests'), icon: 'list' },
        ]}
      />
      {tab === 'packages' ? <CapacityPackagesTab /> : tab === 'requests' ? <PaymentRequestsTab /> : <FormaPlanTab />}
    </div>
  );
}
