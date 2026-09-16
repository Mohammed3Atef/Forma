import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/types';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { AvatarPicker } from '@/components/AvatarPicker';
import { ChangePasswordSheet } from '@/components/ChangePasswordSheet';
import { useSession } from '@/services/auth/sessionStore';
import { useSettings } from '@/stores/settingsStore';
import { confirmDialog } from '@/stores/dialogStore';
import { listMyClients } from '@/services/platform/coachApi';
import { getCoachPlan } from '@/services/platform/coachPlanApi';
import { listCoachPlanTiers, tierLabel } from '@/services/platform/coachPlanTiersApi';

/** Common billing currencies a coach can default to (ISO codes). */
const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED', 'EUR', 'GBP', 'KWD', 'QAR'] as const;

/** Account / settings screen for the coach and admin shells: edit profile + sign out. */
export function RoleAccount() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const updateSelf = useSession((s) => s.updateSelf);
  const signOut = useSession((s) => s.signOut);
  const locale = useSettings((s) => s.settings?.locale) ?? 'en';
  const setLocale = useSettings((s) => s.setLocale);

  const isCoach = account?.role === 'coach';
  const coachId = account?.id ?? '';
  const plan = useQuery({ queryKey: ['coachPlan', coachId], queryFn: () => getCoachPlan(coachId), enabled: isCoach && !!coachId, staleTime: 300_000 });
  const tiers = useQuery({ queryKey: ['coachPlanTiers'], queryFn: () => listCoachPlanTiers(), enabled: isCoach, staleTime: 300_000 });
  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: isCoach && !!coachId, staleTime: 60_000 });
  const tierCfg = (tiers.data ?? []).find((cfg) => cfg.key === (plan.data?.plan ?? 'trial'));
  const cap = plan.data?.maxClients ?? tierCfg?.maxClients ?? 0;
  const used = clients.data?.length ?? 0;
  const atCapacity = cap > 0 && used >= cap;

  const editable = !!account && account.id !== 'local-user';
  const [pwOpen, setPwOpen] = useState(false);
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

      {isCoach && account && (
        <div className="card-featured mb-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={account.displayName} photoUrl={account.photoUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-semibold">{account.displayName || account.email}</h2>
              {account.email && <p className="truncate text-[13px] text-earth-muted">{account.email}</p>}
              {cap > 0 && (
                <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-brand">
                  {tierLabel(tiers.data ?? [], plan.data?.plan, t)} · {t('coachDash.planCapacity', { used, cap })}
                </p>
              )}
            </div>
          </div>
          {cap > 0 && (
            <>
              <div className="prog mt-3.5"><span style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} /></div>
              {atCapacity && <p className="mt-2 text-[13px] text-earth-muted">{t('coachDash.atCapacity')}</p>}
            </>
          )}
          <button type="button" className="btn-primary mt-3 w-full" onClick={() => navigate('/coach/plan')}>
            {atCapacity ? t('coachDash.upgradePlan') : t('nav.coachPlan')}
          </button>
        </div>
      )}

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
          {account.role === 'coach' && (
            <div>
              <label className="label">{t('settings.currency')}</label>
              <select
                className="input"
                data-testid="account-currency"
                value={account.currency ?? 'EGP'}
                onChange={(e) => void updateSelf({ currency: e.target.value })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
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
            {(['en', 'ar', 'ar-eg'] as Locale[]).map((l) => (
              <button key={l} type="button" onClick={() => void setLocale(l)} className={`chip ${locale === l ? 'chip-on' : ''}`}>
                {l === 'en' ? 'English' : l === 'ar' ? 'العربية' : 'مصري'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {editable && (
        <button type="button" data-testid="change-password" className="btn-ghost mt-4 w-full" onClick={() => setPwOpen(true)}>
          {t('auth.changePassword')}
        </button>
      )}

      <button type="button" onClick={() => void onSignOut()} className="btn-danger mt-4 w-full">
        {t('settings.signOut')}
      </button>

      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  );
}
