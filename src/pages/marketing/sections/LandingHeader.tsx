import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import type { Locale } from '@/types';

const NAV = [
  { id: 'features', key: 'landing.nav.features' },
  { id: 'how', key: 'landing.nav.how' },
  { id: 'showcase', key: 'landing.nav.showcase' },
] as const;

const HEADER_H = 64; // h-16 — offset anchor scrolls so the fixed bar never covers the section
const scrollTo = (id: string) => {
  const el = document.getElementById(id);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER_H, behavior: 'smooth' });
};

export function LandingHeader() {
  const { t, i18n } = useTranslation();
  const setLocale = useSettings((s) => s.setLocale);
  const next: Locale = i18n.language.startsWith('ar') ? 'en' : 'ar';

  // Premium glass bar: nearly transparent at the top of the page, then settles
  // to a more opaque frosted panel with a soft shadow once the user scrolls.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 border-b backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow,border-color] duration-300 supports-[backdrop-filter]:bg-surface/55 ${
        scrolled ? 'border-white/10 bg-surface/85 shadow-elevated' : 'border-white/5 bg-surface/40'
      }`}
    >
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
