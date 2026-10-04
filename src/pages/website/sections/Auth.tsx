import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useLoginForm, type AuthMode } from '@/pages/auth/useLoginForm';
import { useSiteT } from '../hooks/useSiteLang';
import { usePublicPlan } from '../hooks/usePublicPlan';
import { cx } from '../cx';
import { Field, FieldHelp, FieldLabel, inputClass } from '../components/form';
import { Icon } from '../components/Icon';
import type { IconName } from '../icons';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { ButtonArrow, buttonClass } from '../components/SiteButton';
import { WORDMARK } from '../components/SiteNav';
import { SiteLink } from '../nav';
import { capClass, leadClass, Rich } from '../components/type';
import { PageHero } from './PageHero';

type Form = ReturnType<typeof useLoginForm>;

/** Log in / Create account switch at the top of the card. */
function ModeSwitch({ mode, setMode }: { mode: AuthMode; setMode: (m: AuthMode) => void }) {
  const { t } = useSiteT();
  return (
    <div role="tablist" aria-label={t('auth.tabs.label')} className="grid grid-cols-2 gap-[2px] rounded-full border border-site-line2 bg-surface-raised p-1">
      {(['signin', 'signup'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          data-testid={`auth-tab-${m}`}
          onClick={() => setMode(m)}
          className={cx(
            'min-h-[44px] cursor-pointer rounded-full border-0 px-4 font-mono text-[12px] uppercase leading-[normal] tracking-[.06em] transition-all duration-[250ms] ease-card rtl:font-site-ar rtl:text-[14px] rtl:normal-case rtl:tracking-normal',
            mode === m ? 'bg-surface-strong text-earth shadow-[0_1px_2px_rgba(0,0,0,.4)]' : 'bg-transparent text-earth-muted hover:text-earth',
          )}
        >
          {t(`auth.tabs.${m}`)}
        </button>
      ))}
    </div>
  );
}

/** The sign-in / sign-up form card (website styling, app copy + logic). */
export function AuthCard({ form }: { form: Form }) {
  const { t } = useTranslation();
  const { t: st } = useSiteT();
  const { mode, setMode, creds, setCreds, busy, error, submit, google, forgot } = form;
  const signup = mode === 'signup';
  const errId = error ? 'login-error' : undefined;
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-site-line2 bg-gradient-surface-hi p-[clamp(22px,4vw,36px)] shadow-site-3 after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:opacity-70 after:content-[''] [&>*]:relative [&>*]:z-[1]">
      <ModeSwitch mode={mode} setMode={setMode} />
      <form
        data-testid="login-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-6 flex flex-col gap-[18px]"
      >
        {signup && <p className="m-0 text-[14px] text-earth-muted">{t('auth.roleHint.coach')}</p>}
        <Field>
          <FieldLabel htmlFor="auth-email" label={t('settings.email')} />
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            dir="ltr"
            data-testid="login-email"
            value={creds.email}
            onChange={(e) => setCreds({ ...creds, email: e.target.value })}
            aria-describedby={errId}
            className={inputClass()}
          />
        </Field>
        {signup && (
          <Field>
            <FieldLabel htmlFor="auth-phone" label={t('settings.phone')} />
            <input
              id="auth-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              dir="ltr"
              data-testid="login-phone"
              value={creds.phone}
              onChange={(e) => setCreds({ ...creds, phone: e.target.value })}
              className={inputClass()}
            />
          </Field>
        )}
        <Field>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor="auth-password" label={t('settings.password')} />
            {!signup && (
              <button
                type="button"
                data-testid="login-forgot"
                onClick={() => void forgot()}
                disabled={busy}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] leading-[normal] text-brand-hover hover:text-brand-light disabled:opacity-50"
              >
                {t('auth.forgotPassword')}
              </button>
            )}
          </div>
          <input
            id="auth-password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            data-testid="login-password"
            value={creds.password}
            onChange={(e) => setCreds({ ...creds, password: e.target.value })}
            aria-describedby={errId}
            className={inputClass()}
          />
        </Field>
        {signup && (
          <Field>
            <FieldLabel htmlFor="auth-confirm" label={t('auth.confirmPassword')} />
            <input
              id="auth-confirm"
              type="password"
              autoComplete="new-password"
              data-testid="login-confirm"
              value={creds.confirm}
              onChange={(e) => setCreds({ ...creds, confirm: e.target.value })}
              aria-describedby="auth-pw-hint"
              className={inputClass()}
            />
            <FieldHelp id="auth-pw-hint">{t('auth.pwHint')}</FieldHelp>
          </Field>
        )}
        {error && (
          <p
            id="login-error"
            role="alert"
            data-testid="login-error"
            className="m-0 flex items-start gap-[10px] rounded-[14px] border border-[rgba(240,72,62,.28)] bg-site-bad-tint px-4 py-[14px] text-[14px] text-earth"
          >
            <Icon name="alert" className="mt-[2px] text-danger" />
            <span>{error}</span>
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy || undefined}
          data-testid="login-submit"
          className={cx(
            buttonClass('primary'),
            'w-full leading-[normal]',
            "aria-busy:!text-transparent aria-busy:after:absolute aria-busy:after:h-4 aria-busy:after:w-4 aria-busy:after:animate-spin aria-busy:after:rounded-full aria-busy:after:border-2 aria-busy:after:border-[rgba(26,14,5,.25)] aria-busy:after:border-t-brand-ink aria-busy:after:content-['']",
          )}
        >
          <span>{t(signup ? 'settings.signUp' : 'onboard.signIn')}</span>
          <ButtonArrow />
        </button>
      </form>
      {!signup && (
        <div className="mt-5 flex flex-col items-center gap-4">
          <div className="flex w-full items-center gap-3 font-mono text-[11px] uppercase tracking-[.08em] text-site-tx3 rtl:font-site-ar rtl:text-[13px] rtl:normal-case rtl:tracking-normal">
            <span className="h-px flex-1 bg-site-line" />
            {st('auth.or')}
            <span className="h-px flex-1 bg-site-line" />
          </div>
          <GoogleSignInButton onCredential={(idToken) => void google(idToken)} disabled={busy} />
        </div>
      )}
      <button
        type="button"
        data-testid="login-toggle-mode"
        onClick={() => setMode(signup ? 'signin' : 'signup')}
        className="mt-5 w-full cursor-pointer border-0 bg-transparent p-2 text-center text-[14px] leading-[normal] text-earth-muted hover:text-earth"
      >
        {t(signup ? 'auth.haveAccount' : 'auth.needAccount')}
      </button>
    </div>
  );
}

function SideCard({ icon, title, children, hi }: { icon: IconName; title: string; children: ReactNode; hi?: boolean }) {
  return (
    <div className={cx('flex items-start gap-[14px] rounded-[18px] border p-5', hi ? 'border-site-line2 bg-gradient-surface-hi' : 'border-site-line bg-surface-card')}>
      <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-site-brand-tint text-brand-hover">
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <b className="block text-[15px] font-semibold">{title}</b>
        {children}
      </div>
    </div>
  );
}

/** Beside the form: the trial terms (sign-up) or a way in for newcomers and a person to talk to (log in). */
function AuthSide({ mode, setMode }: { mode: AuthMode; setMode: (m: AuthMode) => void }) {
  const { t } = useSiteT();
  const plan = usePublicPlan();
  if (mode === 'signup') {
    return (
      <SideCard icon="bolt" title={t('auth.side.getTitle')} hi>
        {plan && (
          <div className="mt-2 flex flex-col gap-1 text-[14px] text-earth-muted" data-testid="auth-plan">
            {plan.trialEnabled && <span className="font-medium text-brand-hover">{t('auth.side.trial', { days: plan.trialDurationDays })}</span>}
            <span>{t('auth.side.clients', { clients: plan.maxClients })}</span>
            <span>{t('auth.side.price', { currency: plan.currency, price: plan.priceMonthly.toLocaleString() })}</span>
          </div>
        )}
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {(t('auth.side.points', { returnObjects: true }) as string[]).map((point) => (
            <li key={point} className="flex items-start gap-2 text-[14px] text-earth-muted">
              <Icon name="check" size={16} className="mt-[3px] text-brand-hover" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </SideCard>
    );
  }
  return (
    <>
      <SideCard icon="bolt" title={t('auth.side.newTitle')} hi>
        <span className="block text-[14px] text-earth-muted">{t('auth.side.newBody')}</span>
        <button type="button" onClick={() => setMode('signup')} className={cx(buttonClass('primary', true), 'mt-[14px] leading-[normal]')}>
          <span>{t('shell.start')}</span>
        </button>
      </SideCard>
      <SideCard icon="mail" title={t('auth.side.helpTitle')}>
        <span className="block text-[14px] text-earth-muted">{t('auth.side.helpBody')}</span>
        <div className="mt-[14px] flex flex-wrap gap-2">
          <SiteLink to="/contact" className={buttonClass('secondary', true)}>
            {t('shell.nav.contact')}
          </SiteLink>
          <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className={cx(buttonClass('ghost', true), '!font-sans !normal-case !tracking-normal')}>
            {SUPPORT_EMAIL}
          </a>
        </div>
      </SideCard>
    </>
  );
}

/** /login and /login?signup=1 — the website's sign-in / sign-up page. */
export function AuthPage() {
  const { t } = useSiteT();
  const form = useLoginForm();
  const ns = form.mode === 'signup' ? 'auth.signup' : 'auth.signin';
  return (
    <>
      <PageHero eyebrow={t(`${ns}.eyebrow`)} title={<Rich k={`${ns}.title`} />} titleSize="clamp(40px,6vw,76px)" grain halo>
        <p className={leadClass}>{t(`${ns}.lead`)}</p>
      </PageHero>
      <Section
        k={1}
        sec={false}
        positioned={false}
        className="mx-auto grid w-full max-w-[1240px] gap-[clamp(32px,5vw,64px)] px-[clamp(20px,5vw,40px)] pb-[clamp(90px,10vw,140px)] min-[1000px]:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] min-[1000px]:items-start"
      >
        <Reveal>
          <AuthCard form={form} />
        </Reveal>
        <Reveal d={1} className="flex flex-col gap-[14px]">
          <AuthSide mode={form.mode} setMode={form.setMode} />
        </Reveal>
      </Section>
    </>
  );
}

/**
 * Installed PWA: the app icon should open like an app, not a brochure — the
 * same card, centred under the wordmark, without the marketing nav/footer.
 */
export function AuthStandalone() {
  const form = useLoginForm();
  const { t } = useSiteT();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-7 px-5 py-12">
      <img src={WORDMARK} alt="Forma" width={125} height={40} className="mx-auto h-10 w-auto" />
      <p className={cx(capClass, 'm-0 text-center')}>{t(form.mode === 'signup' ? 'auth.signup.eyebrow' : 'auth.signin.eyebrow')}</p>
      <AuthCard form={form} />
    </div>
  );
}
