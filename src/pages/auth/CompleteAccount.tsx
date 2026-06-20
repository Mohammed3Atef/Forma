import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet';

/**
 * Post-login gate shown when a signed-in account is missing its required phone
 * number (e.g. a coach/admin created it without one). Blocks the app until a
 * phone is entered, and offers a password change (relevant for temp-password
 * accounts). Saving the phone updates the session and the app proceeds.
 */
export function CompleteAccount() {
  const { t } = useTranslation();
  const account = useSession((s) => s.account);
  const updateContact = useSession((s) => s.updateContact);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const save = async () => {
    if (!phone.trim()) return;
    setBusy(true);
    try {
      await updateContact(phone.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black px-5 py-12">
      <div className="anim-rise mx-auto max-w-md space-y-5">
        <img src="/Forma-logo.png" alt="Forma" className="mx-auto w-48 max-w-[56%] rounded-2xl" />
        <h1 className="h1">{t('auth.completeTitle')}</h1>
        <p className="text-sm text-earth-muted">{t('auth.completeBody')}</p>

        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div>
            <label className="label">{t('settings.phone')}</label>
            <input className="input" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" data-testid="complete-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {account?.mustChangePassword && (
            <button type="button" data-testid="complete-change-pw" className="btn-ghost w-full" onClick={() => setPwOpen(true)}>
              {t('auth.changePassword')}
            </button>
          )}
          <button type="submit" data-testid="complete-save" disabled={busy || !phone.trim()} className="btn-primary btn-lg w-full disabled:opacity-40">
            {busy ? t('auth.working') : t('common.continue')}
          </button>
        </form>

        {!account?.mustChangePassword && (
          <button type="button" data-testid="complete-change-pw" onClick={() => setPwOpen(true)} className="block w-full text-center text-sm text-brand-light">
            {t('auth.changePassword')}
          </button>
        )}
      </div>
      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
