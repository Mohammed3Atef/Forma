import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import type { Locale } from '@/types';

export function LandingFooter() {
  const { t, i18n } = useTranslation();
  const setLocale = useSettings((s) => s.setLocale);
  const next: Locale = i18n.language === 'ar' ? 'en' : 'ar';
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line/60 bg-black py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-start lg:px-8">
        <div>
          <img src="/landing_page/forma-wordmark.png" alt={t('app.name')} className="mx-auto h-12 w-auto sm:mx-0" />
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Link to="/login" className="text-sm text-earth-muted transition-colors hover:text-white">
            {t('landing.signIn')}
          </Link>
          <Link to="/login?signup=1" className="text-sm text-earth-muted transition-colors hover:text-white">
            {t('landing.getStarted')}
          </Link>
          <button
            type="button"
            onClick={() => void setLocale(next)}
            className="text-sm text-earth-muted transition-colors hover:text-white"
          >
            {t('landing.langToggle')}
          </button>
        </nav>
      </div>
      <p className="mt-8 text-center font-mono text-[11px] text-earth-subtle">
        © {year} {t('app.name')} — {t('landing.footerRights')}
      </p>
    </footer>
  );
}
