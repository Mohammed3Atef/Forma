import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { passwordError } from '@/lib/password';
import { alertDialog } from '@/stores/dialogStore';

/**
 * Sign-in / sign-up state + actions for platform accounts. Sign-up requires a
 * phone number (used for coach offers / data later) and a policy-checked
 * password entered twice; includes the "forgot password" reset flow.
 *
 * One product, nothing to pick: every new coach starts the Forma Free Trial
 * configured by the Super Admin (`auth.signup` → `ensureTrialPlan`).
 *
 * Self-signup is COACH-ONLY for now — clients are onboarded by their coach via
 * invite. `?signup=1` opens (and keeps the URL in sync with) sign-up mode.
 */
export type AuthMode = 'signin' | 'signup';

export function useLoginForm() {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const signInWithGoogle = useSession((s) => s.signInWithGoogle);
  const resetPassword = useSession((s) => s.resetPassword);
  const sessionError = useSession((s) => s.error);
  const [params, setParams] = useSearchParams();
  const urlMode: AuthMode = params.get('signup') === '1' ? 'signup' : 'signin';
  const [mode, setModeState] = useState<AuthMode>(urlMode);
  const [creds, setCreds] = useState({ email: '', password: '', confirm: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Nav / pricing CTAs link to /login?signup=1 — follow the URL when it changes under us.
  useEffect(() => setModeState(urlMode), [urlMode]);

  const setMode = (next: AuthMode) => {
    setModeState(next);
    setLocalError(null);
    const p = new URLSearchParams(params);
    if (next === 'signup') p.set('signup', '1');
    else p.delete('signup');
    setParams(p, { replace: true });
  };

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
      if (err) {
        setLocalError(err);
        return;
      }
    }
    setBusy(true);
    try {
      await signIn(creds.email.trim(), creds.password, mode === 'signup', creds.phone.trim() || undefined, 'coach');
    } finally {
      setBusy(false);
    }
  };

  const google = async (idToken: string) => {
    setLocalError(null);
    setBusy(true);
    try {
      await signInWithGoogle(idToken);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    const email = creds.email.trim();
    if (!email) {
      setLocalError(t('auth.enterEmailFirst'));
      return;
    }
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

  return { mode, setMode, creds, setCreds, busy, error: localError ?? sessionError, submit, google, forgot };
}
