import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { getPublicForma } from '@/services/platform/coachPlanTiersApi';
import { useLocalized, useLocalizedList } from '@/hooks/useLocalized';
import { Reveal } from '../Reveal';

/**
 * Marketing pricing — ONE card for the one Forma product. Every value
 * (title, trial length, client limit, price, features, whether sign-up is
 * open) comes from the Super Admin's Forma configuration; nothing is
 * hardcoded here. Capacity add-ons are internal and never shown publicly.
 */
export function Pricing() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const locList = useLocalizedList();
  const q = useQuery({ queryKey: ['publicForma'], queryFn: getPublicForma, staleTime: 300_000 });
  const plan = q.data;
  if (!q.isLoading && !plan) return null;
  const features = plan ? locList(plan.marketingFeatures) : [];

  return (
    <section id="pricing" data-testid="landing-pricing" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t('forma.pricing.eyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">{t('forma.pricing.title')}</h2>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-[13px] font-semibold text-brand">
            <Icon name="user" size={14} />
            {t('forma.pricing.coachLed')}
          </p>
        </Reveal>

        {plan && (
          <Reveal className="mx-auto mt-12 max-w-lg">
            <div className="card-featured flex flex-col text-center" data-testid="landing-pricing-card">
              <h3 className="font-display text-2xl font-bold uppercase tracking-[0.08em]" data-testid="pricing-title">{loc(plan.marketingTitle)}</h3>
              {plan.trialEnabled && plan.trialDurationDays != null && (
                <p className="mt-2 text-sm font-semibold text-brand" data-testid="pricing-trial">{t('forma.pricing.trialDays', { n: plan.trialDurationDays })}</p>
              )}
              <p className="mt-1 text-sm text-earth-muted" data-testid="pricing-clients">{t('forma.pricing.upToClients', { n: plan.maxClients })}</p>
              <p className="mt-5 font-display text-4xl font-bold leading-none" data-testid="pricing-price">
                {plan.priceMonthly} {plan.currency}
                <span className="ms-1 text-base font-normal text-earth-muted">{t('forma.perMonth')}</span>
              </p>
              {plan.trialEnabled && <p className="mt-2 text-sm text-earth-muted">{t('forma.pricing.afterTrial')}</p>}
              <p className="mt-4 text-sm font-semibold">{t('forma.pricing.allFeatures')}</p>
              {loc(plan.marketingDescription) && <p className="mt-1 text-sm text-earth-muted">{loc(plan.marketingDescription)}</p>}

              {features.length > 0 && (
                <ul className="mx-auto mt-6 space-y-2 text-start text-sm text-earth-muted" data-testid="pricing-features">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Icon name="check" size={15} className="mt-0.5 shrink-0 text-brand" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}

              {plan.signupEnabled ? (
                <Link to="/login?signup=1" className="btn-primary mt-8 w-full" data-testid="pricing-cta">
                  {plan.trialEnabled ? t('forma.pricing.startTrial') : t('forma.pricing.getStarted')}
                </Link>
              ) : (
                <p className="mt-8 text-sm text-earth-muted" data-testid="pricing-signup-closed">{t('forma.pricing.signupClosed')}</p>
              )}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
