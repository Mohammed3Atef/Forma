import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Reveal } from '../Reveal';

export function FinalCta() {
  const { t } = useTranslation();
  return (
    <section className="px-5 pb-20 sm:px-6 sm:pb-28 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal className="relative overflow-hidden rounded-[1.75rem] border border-brand/30 bg-gradient-to-br from-brand/15 via-surface-card to-surface-card p-10 text-center sm:p-16">
          <div
            aria-hidden
            className="glow-pulse pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/25 blur-[100px]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
              {t('landing.ctaTitle')}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-earth-muted">{t('landing.ctaSub')}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/login?signup=1" className="btn-primary btn-lg w-full sm:w-auto">
                {t('landing.ctaButton')}
              </Link>
              <Link to="/login" data-testid="landing-cta-signin" className="btn-ghost btn-lg w-full sm:w-auto">
                {t('landing.signIn')}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
