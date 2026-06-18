import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/types';
import { TopBar } from '@/components/TopBar';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useSession } from '@/services/auth/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { confirmDialog } from '@/stores/dialogStore';

/** Account / settings screen for the coach and admin shells: edit profile + sign out. */
export function RoleAccount() {
  const { t } = useTranslation();
  const account = useSession((s) => s.account);
  const updateSelf = useSession((s) => s.updateSelf);
  const signOut = useSession((s) => s.signOut);
  const locale = useSettings((s) => s.settings?.locale) ?? 'en';
  const setLocale = useSettings((s) => s.setLocale);

  const editable = !!account && account.id !== 'local-user';
  const [name, setName] = useState(account?.displayName ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [timezone, setTimezone] = useState(account?.timezone ?? '');
  useEffect(() => { setName(account?.displayName ?? ''); setPhone(account?.phone ?? ''); setTimezone(account?.timezone ?? ''); }, [account?.id, account?.displayName, account?.phone, account?.timezone]);

  const saveIfChanged = (key: 'displayName' | 'phone' | 'timezone', value: string, original: string) => {
    if (value.trim() !== (original ?? '')) void updateSelf({ [key]: value.trim() });
  };

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

      {editable ? (
        <section className="card space-y-4">
          <AvatarPicker name={account.displayName} photoUrl={account.photoUrl} folder={`Forma/${account.id}/avatar`} onChange={(url) => void updateSelf({ photoUrl: url })} />
          <div>
            <label className="label">{t('settings.name')}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => saveIfChanged('displayName', name, account.displayName ?? '')} />
          </div>
          <div>
            <label className="label">{t('settings.phone')}</label>
            <input className="input" type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => saveIfChanged('phone', phone, account.phone ?? '')} />
          </div>
          <div>
            <label className="label">{t('settings.timezone')}</label>
            <input className="input" dir="ltr" placeholder="Africa/Cairo" value={timezone} onChange={(e) => setTimezone(e.target.value)} onBlur={() => saveIfChanged('timezone', timezone, account.timezone ?? '')} />
          </div>
          {account.email && <div className="text-sm text-earth-muted">{account.email}</div>}
          <div className="flex items-center justify-between border-t border-line-soft pt-3">
            <span className="label">{t('platform.role')}</span>
            <span className="chip chip-on">{t(`roles.${account.role}`)}</span>
          </div>
        </section>
      ) : (
        <div className="card text-sm text-earth-muted">{account?.email ?? '—'}</div>
      )}

      <section className="card mt-4">
        <div className="flex items-center justify-between">
          <span>{t('settings.language')}</span>
          <div className="flex gap-1">
            {(['en', 'ar'] as Locale[]).map((l) => (
              <button key={l} type="button" onClick={() => void setLocale(l)} className={`rounded-lg px-3 py-1.5 text-sm ${locale === l ? 'bg-brand text-slate-950' : 'bg-surface-raised'}`}>
                {l === 'en' ? 'English' : 'العربية'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <button type="button" onClick={() => void onSignOut()} className="btn-danger mt-4 w-full">
        {t('settings.signOut')}
      </button>
    </>
  );
}
