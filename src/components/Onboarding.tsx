import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import { useCloud } from '@/services/auth/cloudStore';
import { parseDecimal } from '@/lib/utils';

/**
 * First-launch setup overlay. Shown while the local profile has no name:
 * the user either fills in a quick local profile or signs in to pull their
 * existing cloud data. Disappears as soon as a profile name exists (typed
 * here, or pulled by the post-sign-in sync).
 */
export function Onboarding() {
  const { t } = useTranslation();
  const profile = useSettings((s) => s.profile);
  const loaded = useSettings((s) => s.loaded);
  const updateProfile = useSettings((s) => s.updateProfile);
  const cloud = useCloud();

  const [mode, setMode] = useState<'profile' | 'signin'>('profile');
  const [form, setForm] = useState({ name: '', weight: '', height: '', age: '' });
  const [creds, setCreds] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  // Prefill anything the coach already set (without clobbering live typing).
  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      name: f.name || profile.name || '',
      weight: f.weight || (profile.weightKg > 0 ? String(profile.weightKg) : ''),
      height: f.height || (profile.heightCm > 0 ? String(profile.heightCm) : ''),
      age: f.age || (profile.age > 0 ? String(profile.age) : ''),
    }));
  }, [profile]);

  // Required until the essentials exist — name + body stats. A coach may have
  // pre-filled these at account creation; otherwise the client must complete it.
  const incomplete =
    profile != null && (profile.name.trim() === '' || profile.weightKg <= 0 || profile.heightCm <= 0);
  const needed = loaded && incomplete;
  if (!needed) return null;

  const saveProfile = async () => {
    const name = form.name.trim();
    const weightKg = parseDecimal(form.weight);
    const heightCm = parseDecimal(form.height);
    if (!name || weightKg <= 0 || heightCm <= 0) return;
    await updateProfile({ name, weightKg, heightCm, age: Math.round(parseDecimal(form.age)) });
  };

  const auth = async (create: boolean) => {
    setBusy(true);
    try {
      await cloud.signIn(creds.email, creds.password, create);
      // On success the sync pull fills the profile and this overlay unmounts;
      // a brand-new account keeps it open so the user can set their name.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="onboarding-overlay" className="fixed inset-0 z-50 overflow-y-auto bg-surface px-5 py-12">
      <div className="anim-rise mx-auto max-w-md space-y-5">
        <img src="/Forma-logo.png" alt="Forma" className="mx-auto w-48 max-w-[58%] rounded-2xl" />
        <h1 className="h1">{t('onboard.welcome')}</h1>
        <p className="text-sm text-earth-muted">{t('onboard.intro')}</p>

        {mode === 'profile' ? (
          <div className="card space-y-3">
            <div>
              <label className="label" htmlFor="ob-name">{t('settings.name')}</label>
              <input
                id="ob-name"
                className="input"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label" htmlFor="ob-weight">{t('settings.weight')} ({t('common.kg')})</label>
                <input id="ob-weight" className="input" inputMode="decimal" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="ob-height">{t('settings.height')} (cm)</label>
                <input id="ob-height" className="input" inputMode="numeric" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="ob-age">{t('settings.age')}</label>
                <input id="ob-age" className="input" inputMode="numeric" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={!form.name.trim() || parseDecimal(form.weight) <= 0 || parseDecimal(form.height) <= 0}
              className="btn-primary btn-lg w-full disabled:opacity-40"
            >
              {t('onboard.getStarted')}
            </button>
            {cloud.available && !cloud.user && (
              <button type="button" onClick={() => setMode('signin')} className="btn-ghost w-full">
                {t('onboard.haveAccount')}
              </button>
            )}
          </div>
        ) : (
          <div className="card space-y-3">
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder={t('settings.email')}
              value={creds.email}
              onChange={(e) => setCreds({ ...creds, email: e.target.value })}
            />
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder={t('settings.password')}
              value={creds.password}
              onChange={(e) => setCreds({ ...creds, password: e.target.value })}
            />
            {cloud.error && <p className="text-sm text-danger">{cloud.error}</p>}
            {(busy || cloud.syncing) && <p className="text-sm text-earth-muted">{t('onboard.syncing')}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void auth(false)} className="btn-primary flex-1 disabled:opacity-40">
                {t('onboard.signIn')}
              </button>
              <button type="button" disabled={busy} onClick={() => void auth(true)} className="btn-ghost flex-1 disabled:opacity-40">
                {t('settings.signUp')}
              </button>
            </div>
            <button type="button" onClick={() => setMode('profile')} className="btn-ghost w-full">
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
