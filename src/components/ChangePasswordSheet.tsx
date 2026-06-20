import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { useSession } from '@/services/auth/sessionStore';
import { passwordError } from '@/lib/password';
import { alertDialog } from '@/stores/dialogStore';

/** Sheet to set a new password (policy-checked, entered twice). */
export function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const changePassword = useSession((s) => s.changePassword);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    const code = passwordError(pw);
    if (code) { setErr(t(`auth.pw${code}`)); return; }
    if (pw !== confirm) { setErr(t('auth.pwMismatch')); return; }
    setBusy(true);
    try {
      await changePassword(pw);
      setPw('');
      setConfirm('');
      onClose();
      await alertDialog({ title: t('auth.changePassword'), message: t('auth.pwChanged') });
    } catch (e) {
      const fbCode = (e as { code?: string })?.code;
      setErr(fbCode === 'auth/requires-recent-login' ? t('auth.reloginNeeded') : e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('auth.changePassword')}>
      <div className="space-y-3">
        <input className="input" type="password" autoComplete="new-password" data-testid="change-pw-new" placeholder={t('auth.newPassword')} value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="input" type="password" autoComplete="new-password" data-testid="change-pw-confirm" placeholder={t('auth.confirmPassword')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="text-[12px] text-earth-subtle">{t('auth.pwHint')}</p>
        {err && <p className="text-sm text-danger" data-testid="change-pw-error">{err}</p>}
        <button type="button" data-testid="change-pw-save" disabled={busy || !pw || !confirm} onClick={() => void submit()} className="btn-primary w-full disabled:opacity-40">
          {busy ? t('auth.working') : t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
