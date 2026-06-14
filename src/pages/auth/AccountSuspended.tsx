import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { Icon } from '@/components/Icon';

/** Shown when a signed-in account is suspended or disabled. */
export function AccountSuspended() {
  const { t } = useTranslation();
  const signOut = useSession((s) => s.signOut);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black px-8 text-center">
      <span className="text-danger">
        <Icon name="info" size={40} />
      </span>
      <h1 className="h1">{t('auth.suspendedTitle')}</h1>
      <p className="max-w-sm text-sm text-earth-muted">{t('auth.suspendedBody')}</p>
      <button type="button" onClick={() => void signOut()} className="btn-ghost w-full max-w-xs">
        {t('settings.signOut')}
      </button>
    </div>
  );
}
