import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { useSession } from '@/services/auth/sessionStore';
import { confirmDialog } from '@/stores/dialogStore';

/** Account / settings screen shared by the coach and admin shells. */
export function RoleAccount() {
  const { t } = useTranslation();
  const account = useSession((s) => s.account);
  const signOut = useSession((s) => s.signOut);

  const onSignOut = async () => {
    const ok = await confirmDialog({
      title: t('settings.signOut'),
      message: t('platform.signOutConfirm'),
      confirmLabel: t('settings.signOut'),
      danger: true,
    });
    if (ok) await signOut();
  };

  return (
    <>
      <TopBar title={t('platform.account')} eyebrow={t('app.name')} />
      <div className="card space-y-3">
        <div className="flex items-center gap-3.5">
          <div className="row-av font-serif text-lg">
            {(account?.displayName || account?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{account?.displayName || '—'}</div>
            {account?.email && <div className="truncate text-sm text-earth-muted">{account.email}</div>}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line-soft pt-3">
          <span className="label">{t('platform.role')}</span>
          <span className="chip chip-on">{account ? t(`roles.${account.role}`) : '—'}</span>
        </div>
      </div>
      <button type="button" onClick={() => void onSignOut()} className="btn-danger mt-4 w-full">
        {t('settings.signOut')}
      </button>
    </>
  );
}
