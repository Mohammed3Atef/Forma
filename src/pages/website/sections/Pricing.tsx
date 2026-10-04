import type { PublicFormaPlan } from '@/types';
import { useSiteT } from '../hooks/useSiteLang';
import { usePublicPlan } from '../hooks/usePublicPlan';
import { cx } from '../cx';
import { Icon } from '../components/Icon';
import { Halo } from '../components/layout';
import { Reveal } from '../components/Reveal';
import { Section, SectionWrap } from '../components/Section';
import { ButtonArrow, buttonClass } from '../components/SiteButton';
import { SiteLink } from '../nav';
import { SecHead } from '../components/type';
import { WORDMARK } from '../components/SiteNav';
import p from './pricing.module.css';

const cardClass = cx(
  p.card,
  'relative mx-auto flex max-w-[560px] flex-col gap-[18px] overflow-hidden rounded-[28px] bg-gradient-surface-hi p-[clamp(26px,4vw,40px)] shadow-[0_28px_70px_rgba(0,0,0,.55),0_0_120px_-30px_rgba(255,139,2,.4)] [&>*]:relative [&>*]:z-[1]',
);
const monoCaps = 'font-mono text-[12px] uppercase tracking-[.06em] rtl:font-site-ar rtl:text-[14px] rtl:normal-case rtl:tracking-normal';

/** The ONE Forma plan, from the live configuration (design site.js renderPricing). */
function PriceCard({ plan }: { plan: PublicFormaPlan }) {
  const { t, lang } = useSiteT();
  const ar = lang === 'ar';
  const pick = (o: { en: string; ar: string }) => (ar ? o.ar : o.en) || o.en;
  const features = (ar && plan.marketingFeatures.ar.length ? plan.marketingFeatures.ar : plan.marketingFeatures.en) ?? [];
  const vars = { days: plan.trialDurationDays, clients: plan.maxClients };
  return (
    <div className={cardClass} data-testid="website-pricing-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <img src={WORDMARK} alt={pick(plan.marketingTitle)} className="h-[34px] w-auto" />
        {plan.trialEnabled && (
          <span className={cx(monoCaps, 'rounded-full bg-gradient-gold px-[14px] py-[7px] text-brand-ink')} data-testid="website-pricing-trial">
            {t('pricing.card.trial', vars)}
          </span>
        )}
      </div>
      <p className="m-0 text-[16px] text-earth-muted">{t('pricing.card.desc')}</p>
      <div className="mt-[6px] flex flex-wrap items-baseline gap-[10px]" data-testid="website-pricing-price">
        <span className="font-mono text-[15px] text-earth-muted">{plan.currency}</span>
        <b className="font-display text-[clamp(54px,8vw,72px)] font-bold leading-[.9] tracking-[-.045em]">{plan.priceMonthly.toLocaleString(ar ? 'ar-EG' : 'en')}</b>
        <span className="text-[15px] text-site-tx3">{t('pricing.card.perMonth')}</span>
      </div>
      <p className="m-0 -mt-[6px] text-[14px] text-site-tx3" data-testid="website-pricing-after">
        {plan.trialEnabled ? t('pricing.card.after', vars) : t('pricing.card.upTo', vars)}
      </p>
      <ul className="mb-1 mt-[6px] grid list-none gap-x-[22px] gap-y-[11px] border-t border-site-line px-0 pb-0 pt-[18px] min-[560px]:grid-cols-2">
        {features.map((f) => (
          <li key={f} className="flex gap-[10px] text-[14px] leading-[1.45] text-earth-muted last:col-span-full last:font-medium last:text-earth">
            <Icon name="check" size={16} className="mt-[2px] text-brand-hover" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {plan.signupEnabled ? (
        <SiteLink to="" auth="signup" className={cx(buttonClass('primary'), 'w-full')} data-testid="website-pricing-cta">
          {plan.trialEnabled ? t('shell.start') : t('pricing.card.getStarted')}
          <ButtonArrow />
        </SiteLink>
      ) : (
        <>
          <div className="flex items-start gap-[10px] rounded-[14px] border border-[rgba(245,166,35,.25)] bg-site-warn-tint px-4 py-[14px] text-[14px] text-earth">
            <Icon name="lock" size={16} className="mt-[2px] text-warn" />
            <span>{t('pricing.card.closed')}</span>
          </div>
          <SiteLink to="/contact" className={cx(buttonClass('secondary'), 'w-full')}>
            {t('shell.nav.contact')}
          </SiteLink>
        </>
      )}
      <p className={cx(monoCaps, 'm-0 text-center text-site-tx3')}>{pick(plan.marketingDescription)}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className={cardClass} aria-busy="true" data-testid="website-pricing-loading">
      {['40%', '62%', '30%', '80%', '100%'].map((w) => (
        <div key={w} className={p.sk} style={{ width: w }} />
      ))}
    </div>
  );
}

/** Pricing — hidden entirely when the plan is hidden from the public site. */
export function Pricing({ k }: { k: number }) {
  const plan = usePublicPlan();
  return (
    <Section id="pricing" k={k} labelledBy="h-price" className={plan === null ? 'hidden' : undefined} glow={{ gx: '50%', gy: '45%', hx: '10%', hy: '15%', ga: 'rgba(255,139,2,.2)' }}>
      <Halo style={{ width: 700, height: 500, background: 'rgba(255,139,2,.16)', left: '50%', top: '40%', transform: 'translateX(-50%)' }} />
      <SectionWrap>
        <SecHead ns="pricing" id="h-price" center />
        <Reveal variant="scale">{plan ? <PriceCard plan={plan} /> : <Skeleton />}</Reveal>
      </SectionWrap>
    </Section>
  );
}
