import { GovernanceSections } from '@/pages/admin/AdminGovernance';

/** System tab: feature flags + role/permission reference + audit logs. */
export function SystemPanel() {
  return (
    <div className="space-y-6">
      <GovernanceSections />
    </div>
  );
}
