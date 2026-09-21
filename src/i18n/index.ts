import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@/types';
import en from './en.json';

/**
 * Only English is bundled eagerly — it's the fallback language and the one
 * every session needs before the user's saved locale preference has loaded
 * from storage. `ar`/`ar-eg` (~160KB combined) are fetched on demand the first
 * time `applyLocale` actually needs one, instead of shipping both to every
 * user regardless of language. See `applyLocale` below.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  // ar-eg → MSA → English fallback chain (ar-eg is complete, this is a safety net).
  fallbackLng: { 'ar-eg': ['ar', 'en'], default: ['en'] },
  lowerCaseLng: true, // so the hyphenated 'ar-eg' code resolves to its resource (not 'ar-EG')
  interpolation: { escapeValue: false },
  returnNull: false,
});

const RTL: Locale[] = ['ar', 'ar-eg'];

const LOCALE_LOADERS: Partial<Record<Locale, () => Promise<{ default: Record<string, unknown> }>>> = {
  ar: () => import('./ar.json'),
  'ar-eg': () => import('./ar-eg.json'),
};

const loadedBundles = new Set<Locale>(['en']);
// Dedupe concurrent requests for the same not-yet-loaded locale (e.g. a fast
// double-tap of the language toggle) so it's only ever fetched once.
const inFlight = new Map<Locale, Promise<void>>();

async function ensureBundleLoaded(locale: Locale): Promise<void> {
  if (loadedBundles.has(locale)) return;
  const existing = inFlight.get(locale);
  if (existing) return existing;
  const loader = LOCALE_LOADERS[locale];
  if (!loader) return; // unknown locale — fall through to the fallback chain
  const promise = loader().then((mod) => {
    i18n.addResourceBundle(locale, 'translation', mod.default, true, true);
    loadedBundles.add(locale);
  });
  inFlight.set(locale, promise);
  try {
    await promise;
  } finally {
    inFlight.delete(locale);
  }
}

/** Apply locale to i18next and reflect direction/lang on <html>. Loads that locale's translation bundle first if it isn't already in memory. */
export async function applyLocale(locale: Locale): Promise<void> {
  await ensureBundleLoaded(locale);
  await i18n.changeLanguage(locale);
  const html = document.documentElement;
  html.lang = locale;
  html.dir = RTL.includes(locale) ? 'rtl' : 'ltr';
}

export default i18n;
