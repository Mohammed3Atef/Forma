import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSession } from '@/services/auth/sessionStore';

/**
 * Global connectivity banner. Shown for ALL roles whenever the device is
 * offline: the Client keeps working from its local cache; Coach/Admin
 * management actions are disabled (see useOnlineStatus gating). Mounted once in
 * App.tsx so it overlays every screen.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  // Only a client's tracker data syncs later; for coaches/admins only queued
  // messages do (B1.7 / PWA-11 — the banner must not promise what won't happen).
  const isClient = useSession((s) => s.account?.role === 'client' || s.account == null);
  if (online) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warn px-4 py-1.5 text-center text-[12px] font-medium text-black"
      style={{ paddingTop: 'calc(0.375rem + env(safe-area-inset-top))' }}>
      <Icon name="info" size={14} className="shrink-0" />
      <span>{isClient ? t('offline.banner') : t('offline.bannerStaff')}</span>
    </div>
  );
}
