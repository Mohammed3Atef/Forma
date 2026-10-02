import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useSession } from '@/services/auth/sessionStore';

/**
 * Shown when a SIGNED-IN user opens an invite (`/invite/:code`) or password-
 * reset (`/reset/:token`) link. Those screens only exist in the anonymous
 * app; before this, every role app's catch-all silently redirected the link
 * to the role home, so the link looked broken. Signing out here keeps the
 * URL, so the anonymous app then renders the intended screen for it.
 */
export function SignedInInterstitial({ kind }: { kind: 'invite' | 'reset' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const signOut = useSession((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  const onSignOut = async () => {
    setBusy(true);
    try {
      await signOut(); // phase → anonymous; the URL is untouched, so AcceptInvite / ResetPassword mounts
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-5 text-center" data-testid="signed-in-interstitial">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 text-brand">
        <Icon name={kind === 'invite' ? 'user' : 'shield'} size={26} />
      </span>
      <div className="space-y-2">
        <h1 className="h1">{t(kind === 'invite' ? 'signedIn.inviteTitle' : 'signedIn.resetTitle')}</h1>
        <p className="text-sm text-earth-muted">{t('signedIn.body', { name: account?.displayName || account?.email || '' })}</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void onSignOut()} data-testid="signed-in-switch">
          {t('signedIn.signOutAndContinue')}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => navigate('/', { replace: true })}>
          {t('signedIn.stay')}
        </button>
      </div>
    </div>
  );
}
