import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function Hero() {
  const { t } = useTranslation();
  return (
    <section data-testid="landing-hero" className="relative overflow-hidden">
      {/* ambient copper glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="glow-pulse absolute -top-32 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand/20 blur-[130px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:px-8 lg:py-28">
        <div className="anim-rise text-center lg:text-start">
          <p className="eyebrow">{t('landing.eyebrow')}</p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
            {t('landing.heroTitle')}{' '}
            <span className="bg-gradient-to-r from-gold via-brand to-brand-dark bg-clip-text text-transparent">
              {t('landing.heroTitleAccent')}
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-earth-muted sm:text-lg lg:mx-0">
            {t('landing.heroSub')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link to="/login?signup=1" className="btn-primary btn-lg w-full sm:w-auto">
              {t('landing.heroPrimary')}
            </Link>
            <button
              type="button"
              onClick={() => scrollTo('how')}
              className="btn-ghost btn-lg w-full sm:w-auto"
            >
              {t('landing.heroSecondary')}
            </button>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-earth-subtle lg:justify-start">
            <span className="tracking-[0.2em] text-gold">★★★★★</span>
            <span>{t('landing.trustLoved')}</span>
            <span className="h-1 w-1 rounded-full bg-earth-subtle/50" />
            <span>{t('landing.trustReliable')}</span>
            <span className="hidden h-1 w-1 rounded-full bg-earth-subtle/50 sm:block" />
            <span className="hidden sm:inline">{t('landing.trustFirebase')}</span>
          </div>
        </div>

        {/* dashboard visual */}
        <div className="relative">
          <div
            aria-hidden
            className="glow-pulse pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-brand/15 blur-3xl"
          />
          <div className="float-y overflow-hidden rounded-2xl border border-line bg-surface-card shadow-card lg:rotate-1">
            <div className="flex items-center gap-1.5 border-b border-line-soft px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            </div>
            <img
              src="/landing_page/hero-dashboard.png"
              alt={t('landing.heroImageAlt')}
              width={1536}
              height={1024}
              decoding="async"
              className="block w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
