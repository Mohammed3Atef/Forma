import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/types';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { AvatarPicker } from '@/components/AvatarPicker';
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet';
import { SaveStatusBadge, useSaveStatus } from '@/components/ui/SaveStatus';
import { useSession } from '@/services/auth/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { confirmDialog } from '@/stores/dialogStore';
import { formatCurrencyName, formatDate } from '@/lib/format';

const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};
/** "GMT+3" for a zone right now (one zone only — never computed for the whole list). */
function offsetOf(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(Date.now()).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * Account & preferences for the coach and admin shells (B3.8, CO-31 / CD-09 / owner D8): profile
 * fields that each say whether they saved — and keep what was typed when they didn't, with Retry —
 * language, password and sign out. The coach's capacity card is gone (D4): capacity has one home,
 * Me › Forma subscription.
 *
 * B3.8 completion (owner decisions 8 + 9): no time-zone picker — dates and reporting periods follow
 * this device's zone (shown, read-only) — and no currency picker: Forma works in EGP only. The
 * stored `timezone` / `currency` profile fields and the profile API are left as they are (an older
 * app may still send them); nothing reads them for presentation.
 */
export function RoleAccount() {
  const { t, i18n } = useTranslation();
  const account = useSession((s) => s.account);
  const signOut = useSession((s) => s.signOut);
  const locale = useSettings((s) => s.settings?.locale) ?? 'en';
  const setLocale = useSettings((s) => s.setLocale);

  const isCoach = account?.role === 'coach';
  const isAdmin = account?.role === 'admin' || account?.role === 'super_admin';

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
    // B3.8 (owner decision 6): a form — reading width on wide screens (coach and admin alike).
    <div className="mx-auto w-full max-w-3xl" data-testid="role-account">
      <TopBar title={t('platform.account')} />

      {isCoach && account && (
        <div className="mb-4 flex items-center gap-3.5" data-testid="account-identity">
          <Avatar name={account.displayName} photoUrl={account.photoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-semibold">{account.displayName || account.email}</h2>
            {account.email && <p className="truncate text-[13px] text-earth-muted">{account.email}</p>}
          </div>
        </div>
      )}

      {isAdmin && account && (
        <div className="card-featured mb-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={account.displayName} photoUrl={account.photoUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-semibold">{account.displayName || account.email}</h2>
              {account.email && <p className="truncate text-[13px] text-earth-muted">{account.email}</p>}
              <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-brand">
                {t(`roles.${account.role}`)} · {t('timeline.since', { date: formatDate(account.createdAt, i18n.language, 'weekdayShort') })}
              </p>
            </div>
          </div>
        </div>
      )}

      {account ? <ProfileFields key={account.id} /> : <div className="card text-sm text-earth-muted">—</div>}

      <section className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t('settings.language')}</span>
          <div className="flex flex-wrap gap-1">
            {(['en', 'ar', 'ar-eg'] as Locale[]).map((l) => (
              <button key={l} type="button" lang={l === 'en' ? 'en' : l === 'ar' ? 'ar' : 'ar-EG'} aria-pressed={locale === l} onClick={() => void setLocale(l)} className={`chip ${locale === l ? 'chip-on' : ''}`}>
                {l === 'en' ? 'English' : l === 'ar' ? 'العربية' : 'مصري'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {account && <ChangePasswordButton />}

      <button type="button" onClick={() => void onSignOut()} className="btn-danger mt-4 w-full" data-testid="account-sign-out">
        {t('settings.signOut')}
      </button>
    </div>
  );

}

function ChangePasswordButton() {
  const { t } = useTranslation();
  const [pwOpen, setPwOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="change-password" className="btn-ghost mt-4 w-full" onClick={() => setPwOpen(true)}>
        {t('auth.changePassword')}
      </button>
      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  );
}

/** The editable profile fields (their own component, so typing never remounts them). */
function ProfileFields() {
  const { t, i18n } = useTranslation();
  const a = useSession((s) => s.account)!;
  const updateSelf = useSession((s) => s.updateSelf);
  // One saved / failed state per field (sticky on failure, with Retry) — CO-31: nothing saves silently.
  const nameS = useSaveStatus({ stickyError: true });
  const phoneS = useSaveStatus({ stickyError: true });
  const [name, setName] = useState(a.displayName ?? '');
  const [phone, setPhone] = useState(a.phone ?? '');
  const [nameEmpty, setNameEmpty] = useState(false);
  // Each field follows the account only when ITS stored value changes — a failed save keeps what was typed.
  useEffect(() => setName(a.displayName ?? ''), [a.displayName]);
  useEffect(() => setPhone(a.phone ?? ''), [a.phone]);
  const device = deviceTimeZone();

  const saveName = () => {
    const v = name.trim();
    setNameEmpty(!v);
    if (!v || v === (a.displayName ?? '')) return;
    void nameS.run(() => updateSelf({ displayName: v }));
  };
  const savePhone = () => {
    const v = phone.trim();
    if (v === (a.phone ?? '')) return;
    void phoneS.run(() => updateSelf({ phone: v }));
  };

  return (
    <section className="card space-y-4">
      <AvatarPicker name={a.displayName} photoUrl={a.photoUrl} onChange={(url) => updateSelf({ photoUrl: url })} />
      <Field label={t('settings.name')} htmlFor="account-name" status={<SaveStatusBadge status={nameS.status} onRetry={() => void nameS.retry()} testId="account-name-status" />}>
        <input id="account-name" className="input" data-testid="account-name" aria-invalid={nameEmpty || undefined} aria-describedby={nameEmpty ? 'account-name-error' : undefined} value={name} onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameEmpty(false); }} onBlur={saveName} />
        {nameEmpty ? <p id="account-name-error" role="alert" className="mt-1 text-[13px] text-warn" data-testid="account-name-error">{t('account.nameRequired')}</p> : null}
      </Field>
      <Field label={t('settings.phone')} htmlFor="account-phone" status={<SaveStatusBadge status={phoneS.status} onRetry={() => void phoneS.retry()} testId="account-phone-status" />}>
        <input id="account-phone" className="input" type="tel" inputMode="tel" dir="ltr" data-testid="account-phone" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={savePhone} />
      </Field>
      {/* B3.8 (owner): dates follow this device — shown, not chosen. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line-soft pt-3" data-testid="account-timezone">
        <span className="label">{t('account.timeZone')}</span>
        <span className="text-[13px] text-earth-muted">
          {device ? <bdi dir="ltr">{device}{offsetOf(device) ? ` · ${offsetOf(device)}` : ''}</bdi> : null} <span className="block text-[12px] text-earth-subtle sm:inline">{t('account.timeZoneDevice')}</span>
        </span>
      </div>
      {a.role === 'coach' && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1" data-testid="account-currency">
          <span className="label">{t('account.currency')}</span>
          <span className="text-[13px] text-earth-muted">{formatCurrencyName('EGP', i18n.language)}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-line-soft pt-3">
        <span className="label">{t('platform.role')}</span>
        <span className="chip chip-on">{t(`roles.${a.role}`)}</span>
      </div>
    </section>
  );
}

function Field({ label, htmlFor, hint, status, children }: { label: string; htmlFor: string; hint?: string; status: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <label className="label" htmlFor={htmlFor}>{label}</label>
        {status}
      </div>
      {children}
      {hint ? <p className="mt-1 text-[12.5px] text-earth-subtle">{hint}</p> : null}
    </div>
  );
}
