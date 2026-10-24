import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import { parseDecimal } from '@/lib/utils';
import { useSession } from '@/services/auth/sessionStore';
import { useCoachContentSync } from '@/stores/coachContentStore';

/**
 * First-launch setup overlay for a signed-in client whose profile has no
 * name / body stats yet (after the coach-content read succeeded). Disappears
 * as soon as they exist. (The old local-only "sign in" mode was unreachable
 * and was removed in B0 / RM-02.)
 */
export function Onboarding() {
  const { t } = useTranslation();
  const profile = useSettings((s) => s.profile);
  const loaded = useSettings((s) => s.loaded);
  const updateProfile = useSettings((s) => s.updateProfile);
  const uid = useSession((st) => st.uid);
  const contentSync = useCoachContentSync((st) => st.status);

  const [form, setForm] = useState({ name: '', weight: '', height: '', age: '' });

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
  // A signed-in client's real profile lives on the server and is pulled in by
  // ClientGate's coach-content sync. Until that read has SUCCEEDED, an empty
  // local profile only means 'not loaded yet' (fresh device) or 'load failed' —
  // never ask an existing client to re-onboard over a network blip (that also
  // hid the Retry behind this full-screen overlay).
  const needed = loaded && incomplete && !!uid && contentSync === 'ok';
  if (!needed) return null;

  const saveProfile = async () => {
    const name = form.name.trim();
    const weightKg = parseDecimal(form.weight);
    const heightCm = parseDecimal(form.height);
    if (!name || weightKg <= 0 || heightCm <= 0) return;
    await updateProfile({ name, weightKg, heightCm, age: Math.round(parseDecimal(form.age)) });
  };

  return (
    <div data-testid="onboarding-overlay" className="fixed inset-0 z-50 overflow-y-auto bg-surface px-5 py-12">
      <div className="anim-rise mx-auto max-w-md space-y-5">
        <img src="/forma-logo.webp" alt="Forma" width={960} height={640} className="mx-auto w-48 max-w-[58%] rounded-2xl" />
        <h1 className="h1">{t('onboard.welcome')}</h1>
        <p className="text-sm text-earth-muted">{t('onboard.intro')}</p>

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
              <input id="ob-height" className="input" inputMode="decimal" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} />
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
        </div>
      </div>
    </div>
  );
}
