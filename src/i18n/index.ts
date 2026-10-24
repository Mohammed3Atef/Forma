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
  interpolation: {
    escapeValue: false,
    // B3.9 (RTL-09): in Arabic, every interpolated piece of text (a client's Latin name, a template
    // title, a date) is isolated (FSI … PDI) so its punctuation never reorders the Arabic sentence —
    // inside the signed-in app only (`useAppSurface`); the website keeps its own copy as is. Counts
    // and other numbers pass through untouched (plural selection is unaffected).
    alwaysFormat: true,
    // (i18next types the result as a string; a number passed through is stringified by i18next itself.)
    format: (value: string, _format?: string, lng?: string) =>
      typeof value === 'string' && value !== '' && lng?.startsWith('ar') && typeof document !== 'undefined' && document.documentElement.dataset.surface === 'app'
        ? `\u2068${value}\u2069`
        : value,
  },
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

/**
 * The device's last applied language (B0 / PWA-02). Local data is now per
 * account, so the login screen / splash (no account open yet) and a brand-new
 * account database take their language from here instead of a shared store.
 */
const DEVICE_LOCALE_KEY = 'forma.locale';
export function deviceLocale(): Locale | null {
  try {
    const v = localStorage.getItem(DEVICE_LOCALE_KEY);
    return v === 'en' || v === 'ar' || v === 'ar-eg' ? v : null;
  } catch {
    return null;
  }
}

/** Apply locale to i18next and reflect direction/lang on <html>. Loads that locale's translation bundle first if it isn't already in memory. */
export async function applyLocale(locale: Locale): Promise<void> {
  await ensureBundleLoaded(locale);
  await i18n.changeLanguage(locale);
  const html = document.documentElement;
  html.lang = locale;
  html.dir = RTL.includes(locale) ? 'rtl' : 'ltr';
  try {
    localStorage.setItem(DEVICE_LOCALE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
}

export default i18n;
