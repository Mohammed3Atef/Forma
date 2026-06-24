import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { getInvite, claimInvite, unclaimInvite, isClaimable, buildClaimSubscription } from '@/services/platform/inviteApi';
import { fetchUserRecord } from '@/services/accounts/accountService';
import { passwordError } from '@/lib/password';
import type { SignupInvite, UserRecord } from '@/types';

type Phase = 'loading' | 'invalid' | 'ready' | 'joining' | 'done';

/**
 * Public invite-claim screen at `/invite/:code`. Mobile-first.
 *
 * Reveals ONLY the coach's display name (no PII), lets the visitor set their own
 * password (and optional name/phone), then performs an all-or-nothing join:
 *   1) create the auth user + sign in,
 *   2) provision `users/{uid}` with role:client, active, assignedCoachId = coach,
 *   3) create the `coachClients/{coachId__uid}` relationship,
 *   4) claim the invite (single-use; rules reject reuse/forgery).
 * If a later step fails the invite claim is rolled back so the code stays usable.
 */
export function AcceptInvite() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const refreshAccount = useSession((s) => s.refreshAccount);

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
        // Show the coach's display name only — denormalised onto the invite so
        // this works PRE-AUTH (no users read). Older invites without it fall back
        // to a best-effort read (succeeds only once the user is signed in).
        if (inv!.coachName) {
          setCoachName(inv!.coachName);
        } else {
          const coach = await fetchUserRecord(inv!.coachId).catch(() => null as UserRecord | null);
          if (mounted && coach?.displayName) setCoachName(coach.displayName);
        }
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
      const [{ firebaseAuth }, { ensureFirebase }, fs] = await Promise.all([
        import('@/services/auth/firebaseAuth'),
        import('@/data/adapters/firebase/firebase'),
        import('firebase/firestore'),
      ]);
      const user = await firebaseAuth.signUp(email, form.password);
      const { db } = ensureFirebase();
      const { doc, setDoc } = fs;
      const now = Date.now();
      const uid = user.uid;
      const record: UserRecord = {
        id: uid,
        email,
        displayName: form.name.trim() || email.split('@')[0],
        role: 'client',
        accountStatus: 'active',
        permissions: [],
        featureFlags: {},
        createdBy: 'self',
        assignedCoachId: invite.coachId,
        inviteCode: invite.code,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        createdAt: now,
        updatedAt: now,
      };
      try {
        await setDoc(doc(db, 'users', uid), record);
        await setDoc(doc(db, 'coachClients', `${invite.coachId}__${uid}`), {
          id: `${invite.coachId}__${uid}`,
          coachId: invite.coachId,
          clientId: uid,
          status: 'active',
          createdBy: uid,
          inviteCode: invite.code,
          // Always assign a subscription state (coach's invite choice or trial).
          subscription: buildClaimSubscription(invite, now),
          createdAt: now,
          updatedAt: now,
        });
        await claimInvite(invite.code, uid);
      } catch (joinErr) {
        // Roll back the claim so the code remains usable; surface the error.
        await unclaimInvite(invite.code);
        throw joinErr;
      }
      await refreshAccount();
      setPhase('done');
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setPhase('ready');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black px-5 py-12" data-testid="accept-invite">
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
