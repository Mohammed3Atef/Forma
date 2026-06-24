import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import type { Locale } from '@/types';

const NAV = [
  { id: 'features', key: 'landing.nav.features' },
  { id: 'how', key: 'landing.nav.how' },
  { id: 'showcase', key: 'landing.nav.showcase' },
] as const;

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function LandingHeader() {
  const { t, i18n } = useTranslation();
  const setLocale = useSettings((s) => s.setLocale);
  const next: Locale = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-black/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center"
          aria-label={t('app.name')}
        >
          <img src="/landing_page/forma-wordmark.png" alt={t('app.name')} className="h-7 w-auto sm:h-8" />
        </button>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => scrollTo(n.id)}
              className="font-mono text-[12px] uppercase tracking-[0.06em] text-earth-muted transition-colors hover:text-white"
            >
              {t(n.key)}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void setLocale(next)}
            data-testid="landing-lang-toggle"
            className="rounded-full border border-line px-3 py-1.5 font-mono text-[12px] text-earth-muted transition-colors hover:text-white"
          >
            {t('landing.langToggle')}
          </button>
          <Link
            to="/login"
            className="hidden rounded-full px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.04em] text-white/90 transition-colors hover:text-white sm:inline-block"
          >
            {t('landing.signIn')}
          </Link>
          <Link to="/login?signup=1" data-testid="landing-cta-primary" className="btn-primary !min-h-[2.6rem] !px-5">
            {t('landing.getStarted')}
          </Link>
        </div>
      </div>
    </header>
  );
}
