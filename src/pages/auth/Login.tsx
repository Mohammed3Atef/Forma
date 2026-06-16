import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';

/**
 * Full-screen sign-in / sign-up for platform accounts. Shown when the session
 * is anonymous. On success the session phase changes and the role router swaps
 * in the appropriate app — no manual navigation needed here.
 */
export function Login() {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const error = useSession((s) => s.error);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [creds, setCreds] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!creds.email.trim() || !creds.password) return;
    setBusy(true);
    try {
      await signIn(creds.email.trim(), creds.password, mode === 'signup');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black px-5 py-12">
      <div className="anim-rise mx-auto max-w-md space-y-5">
        <img src="/Forma-logo.png" alt="Forma" className="mx-auto w-56 max-w-[64%] rounded-2xl" />
        <h1 className="h1">{t(mode === 'signup' ? 'auth.createAccount' : 'auth.welcomeBack')}</h1>
        <p className="text-sm text-earth-muted">{t('auth.intro')}</p>

        <form
          className="card space-y-3"
          data-testid="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className="input"
            type="email"
            autoComplete="email"
            data-testid="login-email"
            placeholder={t('settings.email')}
            value={creds.email}
            onChange={(e) => setCreds({ ...creds, email: e.target.value })}
          />
          <input
            className="input"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            data-testid="login-password"
            placeholder={t('settings.password')}
            value={creds.password}
            onChange={(e) => setCreds({ ...creds, password: e.target.value })}
          />
          {error && <p className="text-sm text-danger" data-testid="login-error">{error}</p>}
          {busy && <p className="text-sm text-earth-muted">{t('auth.working')}</p>}
          <button type="submit" disabled={busy} data-testid="login-submit" className="btn-primary btn-lg w-full disabled:opacity-40">
            {t(mode === 'signup' ? 'settings.signUp' : 'onboard.signIn')}
          </button>
        </form>

        <button
          type="button"
          data-testid="login-toggle-mode"
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          className="btn-ghost w-full"
        >
          {t(mode === 'signup' ? 'auth.haveAccount' : 'auth.needAccount')}
        </button>
      </div>
    </div>
  );
}
