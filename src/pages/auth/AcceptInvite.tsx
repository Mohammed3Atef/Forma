import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { setAccessToken } from '@/services/platformApi';
import { trpc } from '@/services/trpc';
import { getInvite, isClaimable } from '@/services/platform/inviteApi';
import { passwordError } from '@/lib/password';
import type { SignupInvite } from '@/types';

type Phase = 'loading' | 'invalid' | 'ready' | 'joining' | 'done';

/**
 * Public invite-claim screen at `/invite/:code`. Mobile-first.
 *
 * Reveals ONLY the coach's display name (no PII), lets the visitor set their own
 * password (and optional name/phone), then performs an all-or-nothing join via
 * the single public `POST /api/invites/claim` call:
 *   1) validates the code + creates the client's Mongo `users` doc,
 *   2) creates the `coachClients` relationship (with a subscription derived
 *      from the coach's invite settings),
 *   3) claims the invite (single-use; the server rejects reuse/a double-claim),
 *   4) issues a session (access token + refresh cookie) for the new client.
 * On success we store the access token and hydrate `useSession` directly, so
 * the browser is immediately treated as signed in — no separate sign-in step.
 * If the claim fails server-side, the whole thing rolls back atomically (the
 * server never leaves an orphaned account or a burned invite code behind).
 */
export function AcceptInvite() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const hydrate = useSession((s) => s.hydrate);

  const [phase, setPhase] = useState<Phase>('loading');
  const [invite, setInvite] = useState<SignupInvite | null>(null);
  const [coachName, setCoachName] = useState<string>('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const inv = await getInvite(code);
        if (!mounted) return;
        if (!isClaimable(inv)) {
          setPhase('invalid');
          return;
        }
        setInvite(inv);
        // Show the coach's display name only — denormalised onto the invite at
        // creation time so this works PRE-AUTH (no users read possible here).
        if (inv!.coachName) setCoachName(inv!.coachName);
        if (!mounted) return;
        setForm((f) => ({
          ...f,
          name: f.name || (inv!.displayName ?? ''),
          email: f.email || (inv!.email ?? ''),
          phone: f.phone || (inv!.phone ?? ''),
        }));
        setPhase('ready');
      } catch {
        if (mounted) setPhase('invalid');
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const valid = useMemo(
    () => !!form.email.trim() && !!form.phone.trim() && !passwordError(form.password) && form.password === form.confirm,
    [form],
  );

  const validateLocal = (): string | null => {
    if (!form.email.trim()) return t('auth.enterEmailFirst');
    if (!form.phone.trim()) return t('auth.phoneRequired');
    const pwErr = passwordError(form.password);
    if (pwErr) return t(`auth.pw${pwErr}`);
    if (form.password !== form.confirm) return t('auth.pwMismatch');
    return null;
  };

  const join = async () => {
    setError(null);
    const localErr = validateLocal();
    if (localErr) { setError(localErr); return; }
    if (!invite) return;
    setPhase('joining');
    const email = (invite.email?.trim() || form.email.trim());
    try {
      const { user, accessToken } = await trpc.invites.claim.mutate({
        code: invite.code,
        email,
        phone: form.phone.trim(),
        password: form.password,
        ...(form.name.trim() ? { displayName: form.name.trim() } : {}),
      });
      // Same pattern as `mongoAuth.signIn` inside `sessionStore.signIn`: store
      // the token first, then push the identity into the session so the rest
      // of the app immediately treats this browser as signed in.
      setAccessToken(accessToken);
      hydrate(user);
      setPhase('done');
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setPhase('ready');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface px-5 py-12" data-testid="accept-invite">
      <div className="anim-rise mx-auto max-w-md space-y-5">
        <img src="/Forma-logo.png" alt="Forma" className="mx-auto w-48 max-w-[56%] rounded-2xl" />

        {phase === 'loading' && <p className="text-center text-sm text-earth-muted">{t('auth.working')}</p>}

        {phase === 'invalid' && (
          <div className="card space-y-3 text-center" data-testid="invite-invalid">
            <h1 className="h1">{t('invite.invalidTitle')}</h1>
            <p className="text-sm text-earth-muted">{t('invite.invalidBody')}</p>
            <button type="button" className="btn-ghost w-full" onClick={() => navigate('/login')}>{t('onboard.signIn')}</button>
          </div>
        )}

        {(phase === 'ready' || phase === 'joining' || phase === 'done') && (
          <>
            <h1 className="h1">{t('invite.title')}</h1>
            <p className="text-sm text-earth-muted" data-testid="invite-coach-name">
              {coachName ? t('invite.fromCoach', { coach: coachName }) : t('invite.intro')}
            </p>
            <form
              className="card space-y-3"
              data-testid="invite-form"
              onSubmit={(e) => { e.preventDefault(); void join(); }}
            >
              <input className="input" data-testid="invite-name" placeholder={t('settings.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="input" type="email" autoComplete="email" data-testid="invite-email" placeholder={t('settings.email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} readOnly={!!invite?.email} />
              <input className="input" type="tel" inputMode="tel" dir="ltr" data-testid="invite-phone" placeholder={t('settings.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className="input" type="password" autoComplete="new-password" data-testid="invite-password" placeholder={t('settings.password')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <input className="input" type="password" autoComplete="new-password" data-testid="invite-confirm" placeholder={t('auth.confirmPassword')} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
              <p className="text-[12px] text-earth-subtle">{t('auth.pwHint')}</p>
              {error && <p className="text-sm text-danger" data-testid="invite-error">{error}</p>}
              {phase === 'joining' && <p className="text-sm text-earth-muted">{t('auth.working')}</p>}
              <button type="submit" disabled={!valid || phase === 'joining'} data-testid="invite-submit" className="btn-primary btn-lg w-full disabled:opacity-40">
                {t('invite.join')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
