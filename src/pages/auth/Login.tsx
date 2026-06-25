import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { passwordError } from '@/lib/password';
import { alertDialog } from '@/stores/dialogStore';

/**
 * Full-screen sign-in / sign-up for platform accounts. Sign-up requires a phone
 * number (used for coach offers / data later) and a policy-checked password
 * entered twice. Includes a "forgot password" reset flow.
 */
export function Login() {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const resetPassword = useSession((s) => s.resetPassword);
  const error = useSession((s) => s.error);
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('signup') === '1' ? 'signup' : 'signin');
  const [creds, setCreds] = useState({ email: '', password: '', confirm: '', phone: '' });
  const [signupRole, setSignupRole] = useState<'client' | 'coach'>('client');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateSignup = (): string | null => {
    if (!creds.phone.trim()) return t('auth.phoneRequired');
    const pwErr = passwordError(creds.password);
    if (pwErr) return t(`auth.pw${pwErr}`);
    if (creds.password !== creds.confirm) return t('auth.pwMismatch');
    return null;
  };

  const submit = async () => {
    setLocalError(null);
    if (!creds.email.trim() || !creds.password) return;
    if (mode === 'signup') {
      const err = validateSignup();
      if (err) { setLocalError(err); return; }
    }
    setBusy(true);
    try {
      await signIn(creds.email.trim(), creds.password, mode === 'signup', creds.phone.trim() || undefined, signupRole);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    const email = creds.email.trim();
    if (!email) { setLocalError(t('auth.enterEmailFirst')); return; }
    setBusy(true);
    setLocalError(null);
    try {
      await resetPassword(email);
      await alertDialog({ title: t('auth.forgotPassword'), message: t('auth.resetSent', { email }) });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface px-5 py-12">
      <div className="anim-rise mx-auto max-w-md space-y-5">
        <img src="/Forma-logo.png" alt="Forma" className="mx-auto w-56 max-w-[64%] rounded-2xl" />
        <h1 className="h1">{t(mode === 'signup' ? 'auth.createAccount' : 'auth.welcomeBack')}</h1>
        <p className="text-sm text-earth-muted">{t('auth.intro')}</p>

        <form className="card space-y-3" data-testid="login-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {mode === 'signup' && (
            <div data-testid="signup-role" className="grid grid-cols-2 gap-2">
              {(['client', 'coach'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  data-testid={`signup-role-${r}`}
                  aria-pressed={signupRole === r}
                  onClick={() => setSignupRole(r)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${signupRole === r ? 'border-brand bg-brand/10 text-brand' : 'border-line-soft text-earth-muted'}`}
                >
                  {t(`auth.role.${r}`)}
                </button>
              ))}
            </div>
          )}
          {mode === 'signup' && <p className="text-[12px] text-earth-subtle">{t(`auth.roleHint.${signupRole}`)}</p>}
          <input className="input" type="email" autoComplete="email" data-testid="login-email" placeholder={t('settings.email')} value={creds.email} onChange={(e) => setCreds({ ...creds, email: e.target.value })} />
          {mode === 'signup' && (
            <input className="input" type="tel" autoComplete="tel" inputMode="tel" dir="ltr" data-testid="login-phone" placeholder={t('settings.phone')} value={creds.phone} onChange={(e) => setCreds({ ...creds, phone: e.target.value })} />
          )}
          <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} data-testid="login-password" placeholder={t('settings.password')} value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
          {mode === 'signup' && (
            <>
              <input className="input" type="password" autoComplete="new-password" data-testid="login-confirm" placeholder={t('auth.confirmPassword')} value={creds.confirm} onChange={(e) => setCreds({ ...creds, confirm: e.target.value })} />
              <p className="text-[12px] text-earth-subtle">{t('auth.pwHint')}</p>
            </>
          )}
          {(localError || error) && <p className="text-sm text-danger" data-testid="login-error">{localError ?? error}</p>}
          {busy && <p className="text-sm text-earth-muted">{t('auth.working')}</p>}
          <button type="submit" disabled={busy} data-testid="login-submit" className="btn-primary btn-lg w-full disabled:opacity-40">
            {t(mode === 'signup' ? 'settings.signUp' : 'onboard.signIn')}
          </button>
        </form>

        {mode === 'signin' && (
          <button type="button" data-testid="login-forgot" onClick={() => void forgot()} disabled={busy} className="block w-full text-center text-sm text-brand-light">
            {t('auth.forgotPassword')}
          </button>
        )}

        <button type="button" data-testid="login-toggle-mode" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setLocalError(null); }} className="btn-ghost w-full">
          {t(mode === 'signup' ? 'auth.haveAccount' : 'auth.needAccount')}
        </button>
      </div>
    </div>
  );
}
