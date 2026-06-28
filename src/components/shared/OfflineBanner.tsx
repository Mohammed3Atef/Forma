import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Global connectivity banner. Shown for ALL roles whenever the device is
 * offline: the Client keeps working from its local cache; Coach/Admin
 * management actions are disabled (see useOnlineStatus gating). Mounted once in
 * App.tsx so it overlays every screen.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warn px-4 py-1.5 text-center text-[12px] font-medium text-black">
      <Icon name="info" size={14} className="shrink-0" />
      <span>{t('offline.banner')}</span>
    </div>
  );
}
