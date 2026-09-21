import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { mongoAuth } from '@/services/auth/mongoAuth';
import { passwordError } from '@/lib/password';
import { Icon } from '@/components/Icon';

type Phase = 'form' | 'invalid' | 'done';

/**
 * Public reset-password screen at `/reset/:token`, reached from the link in
 * the password-reset email. Consumes `auth.confirmPasswordReset` — the token
 * is single-use and expires after 1 hour (enforced server-side).
 */
export function ResetPassword() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('form');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const pwErr = passwordError(password);
    if (pwErr) { setError(t(`auth.pw${pwErr}`)); return; }
    if (password !== confirm) { setError(t('auth.pwMismatch')); return; }
    setBusy(true);
    try {
      await mongoAuth.confirmPasswordReset(token, password);
      setPhase('done');
    } catch (e) {
      if (e instanceof Error && /invalid|expired/i.test(e.message)) {
        setPhase('invalid');
      } else {
        setError(e instanceof Error ? e.message : t('common.errorGeneric'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'invalid') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface px-5">
        <div className="anim-rise mx-auto max-w-sm space-y-4 text-center">
          <Icon name="close" size={40} className="mx-auto text-danger" />
          <h1 className="h1">{t('auth.resetInvalidTitle')}</h1>
          <p className="text-sm text-earth-muted">{t('auth.resetInvalidBody')}</p>
          <button type="button" className="btn-primary w-full" onClick={() => navigate('/login')}>{t('auth.backToSignIn')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface px-5">
        <div className="anim-rise mx-auto max-w-sm space-y-4 text-center">
          <Icon name="check" size={40} className="mx-auto text-success" />
          <h1 className="h1">{t('auth.resetSuccessTitle')}</h1>
          <p className="text-sm text-earth-muted">{t('auth.resetSuccessBody')}</p>
          <button type="button" className="btn-primary w-full" onClick={() => navigate('/login')}>{t('auth.backToSignIn')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface px-5 py-12">
      <div className="anim-rise mx-auto max-w-md space-y-5">
        <img src="/Forma-logo.png" alt="Forma" className="mx-auto w-56 max-w-[64%] rounded-2xl" />
        <h1 className="h1">{t('auth.resetTitle')}</h1>
        <form className="card space-y-3" data-testid="reset-password-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div>
            <label className="label">{t('auth.newPassword')}</label>
            <input className="input" type="password" autoComplete="new-password" data-testid="reset-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('auth.confirmPassword')}</label>
            <input className="input" type="password" autoComplete="new-password" data-testid="reset-password-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <p className="text-[12px] text-earth-subtle">{t('auth.pwHint')}</p>
          {error && <p className="text-sm text-danger" role="alert" data-testid="reset-error">{error}</p>}
          <button type="submit" disabled={busy || !password || !confirm} data-testid="reset-submit" className="btn-primary btn-lg w-full disabled:opacity-40">
            {busy ? t('auth.working') : t('auth.setNewPassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
