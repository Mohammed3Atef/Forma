import { useRef, useState, type FormEvent } from 'react';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '@/lib/contact';
import { trpc } from '@/services/trpc';
import { useSiteT } from '../hooks/useSiteLang';
import { cx } from '../cx';
import { Field, FieldError, FieldHelp, FieldLabel, inputClass } from '../components/form';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { buttonClass, ButtonArrow } from '../components/SiteButton';
import { SiteLink } from '../nav';
import { d3Class, leadClass, Rich } from '../components/type';
import { PageHero } from './PageHero';

type Reason = 'use' | 'question' | 'support' | 'partner' | 'other';
const REASONS: Reason[] = ['use', 'question', 'support', 'partner', 'other'];
/** English role labels sent to the team inbox, whatever the page language. */
const ROLE_EN = ['', 'Independent coach', 'Online coach', 'Hybrid coach', 'Nutrition & fitness coach', 'Client of a coach', 'Other'];

type FieldKey = 'name' | 'email' | 'role' | 'reason' | 'message';
const RULES: Record<Exclude<FieldKey, 'reason'>, (v: string) => boolean> = {
  name: (v) => v.trim().length > 1,
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
  role: (v) => !!v,
  message: (v) => v.trim().length >= 10,
};

const SELECT_ARROW =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%237C726C' stroke-width='1.8' stroke-linecap='round'%3E%3Cpath d='m3 4.5 3 3 3-3'/%3E%3C/svg%3E\")] bg-no-repeat bg-[position:right_16px_center] rtl:bg-[position:left_16px_center]";

/** Contact form (design Contact page script): validates like the design, posts to the team, falls back to mailto. */
function ContactForm() {
  const { t } = useSiteT();
  const [values, setValues] = useState({ name: '', email: '', phone: '', role: '', reason: '' as Reason | '', message: '', website: '' });
  const [bad, setBad] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [alert, setAlert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const valid = (k: FieldKey, v = values) => (k === 'reason' ? !!v.reason : RULES[k](v[k]));
  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) => {
    const next = { ...values, [k]: v };
    setValues(next);
    // Like the design: once a field is flagged, it re-checks as you fix it.
    if (k !== 'phone' && k !== 'website' && bad[k as FieldKey]) setBad((b) => ({ ...b, [k]: !valid(k as FieldKey, next) }));
  };

  const finish = () => {
    setBusy(false);
    setSent(true);
    requestAnimationFrame(() => doneRef.current?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const keys: FieldKey[] = ['name', 'email', 'role', 'reason', 'message'];
    const result = Object.fromEntries(keys.map((k) => [k, !valid(k)])) as Record<FieldKey, boolean>;
    setBad(result);
    const anyBad = keys.some((k) => result[k]);
    setAlert(anyBad);
    if (anyBad) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-bad] input')?.focus());
      return;
    }
    setBusy(true);
    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      role: ROLE_EN[Number(values.role)] ?? values.role,
      reason: values.reason as Reason,
      message: values.message.trim(),
      website: values.website,
    };
    try {
      await trpc.contact.submit.mutate(payload);
    } catch {
      // Endpoint unavailable → hand the message to the visitor's mail app instead of losing it.
      const body = `${payload.message}\n\n— ${payload.name} · ${payload.email}${payload.phone ? ' · ' + payload.phone : ''}\n${payload.role} · ${payload.reason}`;
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Forma contact — ${payload.name}`)}&body=${encodeURIComponent(body)}`;
    }
    finish();
  };

  const again = () => {
    setValues({ name: '', email: '', phone: '', role: '', reason: '', message: '', website: '' });
    setBad({});
    setAlert(false);
    setSent(false);
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const roles = t('contact.roles', { returnObjects: true }) as string[];

  return (
    <Reveal
      as="div"
      className="relative overflow-hidden rounded-[28px] border border-site-line2 bg-gradient-surface-hi p-[clamp(22px,4vw,40px)] shadow-site-3 after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:opacity-70 after:content-[''] [&>*]:relative [&>*]:z-[1]"
    >
      <form ref={formRef} id="ctForm" noValidate onSubmit={submit} className="flex flex-col gap-[22px]">
        {/* Honeypot: invisible to people, tempting to bots — the server rejects any value. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={values.website}
          onChange={(e) => set('website', e.target.value)}
          className="pointer-events-none absolute -start-[9999px] h-px w-px opacity-0"
        />
        {!sent ? (
          <div className="flex flex-col gap-[22px]">
            <div id="ctAlert" role="alert" className={cx('items-start gap-[10px] rounded-[14px] border border-[rgba(240,72,62,.28)] bg-site-bad-tint px-4 py-[14px] text-[14px]', alert ? 'flex' : 'hidden')}>
              <Icon name="alert" className="mt-[2px] text-danger" />
              <span>{t('contact.alert')}</span>
            </div>
            <div className="grid gap-[22px] min-[640px]:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="f-name" label={t('contact.name')} required />
                <input
                  ref={nameRef}
                  id="f-name"
                  name="name"
                  autoComplete="name"
                  required
                  aria-describedby="e-name"
                  aria-invalid={bad.name ?? false}
                  value={values.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={inputClass(bad.name)}
                />
                <FieldError id="e-name" show={!!bad.name}>
                  {t('contact.nameErr')}
                </FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="f-email" label={t('contact.email')} required />
                <input
                  id="f-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  dir="ltr"
                  required
                  aria-describedby="e-email"
                  aria-invalid={bad.email ?? false}
                  value={values.email}
                  onChange={(e) => set('email', e.target.value)}
                  className={inputClass(bad.email)}
                />
                <FieldError id="e-email" show={!!bad.email}>
                  {t('contact.emailErr')}
                </FieldError>
              </Field>
            </div>
            <div className="grid gap-[22px] min-[640px]:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="f-phone" label={t('contact.phone')} optional={t('contact.optional')} />
                <input
                  id="f-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  dir="ltr"
                  value={values.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  className={inputClass()}
                />
                <FieldHelp>{t('contact.phoneHelp')}</FieldHelp>
              </Field>
              <Field>
                <FieldLabel htmlFor="f-role" label={t('contact.role')} required />
                <select
                  id="f-role"
                  name="role"
                  required
                  aria-describedby="e-role"
                  aria-invalid={bad.role ?? false}
                  value={values.role}
                  onChange={(e) => set('role', e.target.value)}
                  className={cx(inputClass(bad.role), 'appearance-none pe-10', SELECT_ARROW)}
                >
                  {roles.map((label, i) => (
                    <option key={i} value={i === 0 ? '' : String(i)}>
                      {label}
                    </option>
                  ))}
                </select>
                <FieldError id="e-role" show={!!bad.role}>
                  {t('contact.roleErr')}
                </FieldError>
              </Field>
            </div>
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" data-bad={bad.reason || undefined}>
              <legend className="mb-[10px] p-0 text-[14px] font-medium text-earth">
                <span>{t('contact.reason')}</span>{' '}
                <span className="text-brand-hover" aria-hidden="true">
                  *
                </span>
              </legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {REASONS.map((r, i) => (
                  <span key={r} className="contents">
                    <input
                      type="radio"
                      name="reason"
                      id={`r${i + 1}`}
                      value={r}
                      checked={values.reason === r}
                      onChange={() => set('reason', r)}
                      className="peer pointer-events-none absolute opacity-0"
                    />
                    <label
                      htmlFor={`r${i + 1}`}
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-full border border-site-line2 bg-surface-raised px-[18px] text-[14px] font-normal text-earth-muted transition-all duration-200 hover:border-site-line3 hover:text-earth peer-checked:border-[rgba(255,139,2,.5)] peer-checked:bg-site-brand-tint peer-checked:text-brand-light peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-hover"
                    >
                      {t(`contact.reasons.${r}`)}
                    </label>
                  </span>
                ))}
              </div>
              <FieldError show={!!bad.reason} style={{ marginTop: 8 }}>
                {t('contact.reasonErr')}
              </FieldError>
            </fieldset>
            <Field>
              <FieldLabel htmlFor="f-msg" label={t('contact.message')} required />
              <textarea
                id="f-msg"
                name="message"
                required
                aria-describedby="h-msg e-msg"
                aria-invalid={bad.message ?? false}
                placeholder={t('contact.messagePh')}
                value={values.message}
                onChange={(e) => set('message', e.target.value)}
                className={cx(inputClass(bad.message), '!min-h-[150px] resize-y leading-[1.55]')}
              />
              <FieldHelp id="h-msg">{t('contact.messageHelp')}</FieldHelp>
              <FieldError id="e-msg" show={!!bad.message}>
                {t('contact.messageErr')}
              </FieldError>
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-[14px] pt-[6px]">
              <p className="m-0 max-w-[30em] text-[13px] text-site-tx3">
                <Rich k="contact.consent" components={{ privacy: <SiteLink to="/privacy" className="text-brand-hover hover:text-brand-light" /> }} />
              </p>
              <button
                id="ctSend"
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className={cx(
                  buttonClass('primary'),
                  'leading-[normal]',
                  "aria-busy:!text-transparent aria-busy:after:absolute aria-busy:after:h-4 aria-busy:after:w-4 aria-busy:after:animate-spin aria-busy:after:rounded-full aria-busy:after:border-2 aria-busy:after:border-[rgba(26,14,5,.25)] aria-busy:after:border-t-brand-ink aria-busy:after:content-['']",
                )}
              >
                <span>{t('contact.send')}</span>
                <ButtonArrow />
              </button>
            </div>
          </div>
        ) : (
          <div role="status" aria-live="polite" className="flex flex-col items-start gap-4 py-2">
            <span className="grid h-14 w-14 place-items-center rounded-full border border-[rgba(63,178,127,.3)] bg-site-ok-tint text-success">
              <Icon name="check" size={26} />
            </span>
            <h2 ref={doneRef} tabIndex={-1} className={d3Class}>
              {t('contact.doneTitle')}
            </h2>
            <p className="m-0 text-earth-muted [text-wrap:pretty]">{t('contact.doneBody')}</p>
            <div className="flex flex-wrap gap-[10px]">
              <SiteLink to="/" className={buttonClass('secondary', true)}>
                {t('contact.backHome')}
              </SiteLink>
              <button type="button" id="ctAgain" onClick={again} className={cx(buttonClass('ghost', true), 'leading-[normal]')}>
                {t('contact.again')}
              </button>
            </div>
          </div>
        )}
      </form>
    </Reveal>
  );
}

const cardClass = 'flex items-start gap-[14px] rounded-[18px] border p-5 text-earth no-underline';
const cardIcon = 'grid h-[42px] w-[42px] flex-none place-items-center rounded-xl';

/** Contact page (design Forma Website - Contact.html). */
export function ContactPage() {
  const { t } = useSiteT();
  return (
    <>
      <PageHero eyebrow={t('contact.eyebrow')} title={<Rich k="contact.title" />} titleSize="clamp(40px,6vw,76px)" grain halo>
        <p className={leadClass}>{t('contact.lead')}</p>
      </PageHero>
      <Section
        k={1}
        sec={false}
        positioned={false}
        className="mx-auto grid w-full max-w-[1240px] gap-[clamp(32px,5vw,64px)] px-[clamp(20px,5vw,40px)] pb-[clamp(90px,10vw,140px)] min-[1000px]:grid-cols-[minmax(0,1.35fr)_minmax(0,.65fr)] min-[1000px]:items-start"
      >
        <ContactForm />
        <Reveal d={1} className="flex flex-col gap-[14px]">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className={cx(cardClass, 'border-site-line bg-surface-card transition-[border-color,transform] duration-300 ease-card hover:-translate-y-0.5 hover:border-site-line3 hover:text-earth')}
          >
            <span className={cx(cardIcon, 'bg-site-brand-tint text-brand-hover')}>
              <Icon name="mail" />
            </span>
            <div>
              <b className="block text-[15px] font-semibold">{t('contact.cardEmail')}</b>
              <span dir="ltr" className="text-[14px] text-earth-muted">
                {SUPPORT_EMAIL}
              </span>
            </div>
          </a>
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noopener"
            className={cx(cardClass, 'border-site-line bg-surface-card transition-[border-color,transform] duration-300 ease-card hover:-translate-y-0.5 hover:border-site-line3 hover:text-earth')}
          >
            <span className={cx(cardIcon, 'bg-site-brand-tint text-brand-hover')}>
              <Icon name="msg" />
            </span>
            <div>
              <b className="block text-[15px] font-semibold">WhatsApp</b>
              <span dir="ltr" className="text-[14px] text-earth-muted">
                0155 332 0453
              </span>
            </div>
          </a>
          <div className={cx(cardClass, 'border-site-line2 bg-gradient-surface-hi')}>
            <span className={cx(cardIcon, 'bg-surface-hover text-earth')}>
              <Icon name="bolt" />
            </span>
            <div>
              <b className="block text-[15px] font-semibold">{t('contact.cardTry')}</b>
              <span className="text-[14px] text-earth-muted">{t('contact.cardTryBody')}</span>{' '}
              {/* the design's `.ct-card span` rule also reaches the button label: 14px, secondary colour */}
              <SiteLink to="" auth="signup" className={buttonClass('primary', true)} style={{ marginTop: 14 }}>
                <span className="text-[14px] text-earth-muted">{t('shell.start')}</span>
              </SiteLink>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
