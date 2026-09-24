import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { getCoreFeatures, getPublicPlanTiers } from '@/services/platform/coachPlanTiersApi';
import { useLocalizedList } from '@/hooks/useLocalized';
import { Reveal } from '../Reveal';

/**
 * Marketing pricing — one plan: a free Trial, then Pro. Every coach signs up
 * the same way (no plan to pick); the Trial's own cap/duration and Pro's own
 * price/cap are read live from the two tiers so this card never drifts out
 * of sync with what `AdminPlans.tsx` actually has configured.
 */
export function Pricing() {
  const { t } = useTranslation();
  const locList = useLocalizedList();
  const q = useQuery({ queryKey: ['publicPlanTiers'], queryFn: getPublicPlanTiers, staleTime: 300_000 });
  const coreQ = useQuery({ queryKey: ['publicPlanTiers', 'coreFeatures'], queryFn: getCoreFeatures, staleTime: 300_000 });
  const tiers = q.data ?? [];
  const trialTier = tiers.find((t) => t.isDefaultSignupPlan);
  const proTier = tiers.find((t) => !t.isDefaultSignupPlan);
  const features = coreQ.data ? locList(coreQ.data) : [];
  if (!q.isLoading && (!trialTier || !proTier)) return null;

  return (
    <section id="pricing" data-testid="landing-pricing" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{t('landing.pricingEyebrow')}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">{t('landing.pricingTitle')}</h2>
        </Reveal>

        {trialTier && proTier && (
          <Reveal className="mx-auto mt-12 max-w-lg">
            <div className="card-featured flex flex-col text-center" data-testid="landing-pricing-card">
              <p className="mt-1 text-sm text-earth-muted">{t('landing.pricingTrialDays', { n: trialTier.trialDurationDays ?? 15 })}</p>
              <p className="mt-4 font-display text-4xl font-bold leading-none">
                {proTier.priceMonthly} {proTier.currency}
                <span className="ms-1 text-base font-normal text-earth-muted">{t('admin.perMonth')}</span>
              </p>
              <p className="mt-2 text-sm text-earth-muted">{t('landing.pricingAfterTrial')}</p>

              <ul className="mx-auto mt-6 space-y-2 text-start text-sm text-earth-muted">
                <li className="flex items-center gap-2"><Icon name="user" size={15} className="shrink-0 text-brand" />{t('landing.pricingTrialClients', { n: trialTier.maxClients })}</li>
                <li className="flex items-center gap-2"><Icon name="user" size={15} className="shrink-0 text-brand" />{t('landing.pricingProClients', { n: proTier.maxClients })}</li>
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2"><Icon name="check" size={15} className="shrink-0 text-brand" />{f}</li>
                ))}
              </ul>

              <Link to="/login?signup=1" className="btn-primary mt-8 w-full">
                {t('landing.pricingStartTrial')}
              </Link>
              <p className="mt-3 text-[12px] text-earth-subtle">{t('admin.pricingNote')}</p>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
