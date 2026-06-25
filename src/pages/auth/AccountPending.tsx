import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { Icon } from '@/components/Icon';

/** Shown when a signed-in account is awaiting admin approval (status: pending). */
export function AccountPending() {
  const { t } = useTranslation();
  const refreshAccount = useSession((s) => s.refreshAccount);
  const signOut = useSession((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  const recheck = async () => {
    setBusy(true);
    try {
      await refreshAccount();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="account-pending" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-surface px-8 text-center">
      <span className="text-brand">
        <Icon name="timer" size={40} />
      </span>
      <h1 className="h1">{t('auth.pendingTitle')}</h1>
      <p className="max-w-sm text-sm text-earth-muted">{t('auth.pendingBody')}</p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button type="button" disabled={busy} onClick={() => void recheck()} className="btn-primary w-full disabled:opacity-40">
          {t('auth.checkAgain')}
        </button>
        <button type="button" onClick={() => void signOut()} className="btn-ghost w-full">
          {t('settings.signOut')}
        </button>
      </div>
    </div>
  );
}
