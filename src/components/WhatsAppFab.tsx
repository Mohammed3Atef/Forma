import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { whatsappUrl } from '@/lib/contact';

/**
 * Floating WhatsApp contact button for coaches/admins to reach Forma support.
 * Compact, sits above the mobile bottom-nav (bottom-right on desktop). A small
 * × dismisses it for the session only — module-level flag, so it stays hidden
 * across navigation but reappears on a full reload (not persisted).
 */
let dismissedThisSession = false;

export function WhatsAppFab() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(dismissedThisSession);
  // Hide on messaging screens — the FAB sits exactly where the composer's send
  // button is and would cover it on mobile.
  if (hidden || /\/messages(\/|$)/.test(pathname)) return null;

  const dismiss = () => {
    dismissedThisSession = true;
    setHidden(true);
  };

  return (
    <div className="fixed bottom-24 end-3 z-40 md:bottom-6 md:end-6">
      <a
        href={whatsappUrl()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp"
        data-testid="whatsapp-fab"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white shadow-elevated transition-transform hover:scale-105 active:scale-95"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
          <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.738-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.876 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
        </svg>
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('common.close')}
        data-testid="whatsapp-fab-dismiss"
        className="absolute -top-1.5 -end-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-earth-muted shadow-card transition-colors hover:text-white"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
