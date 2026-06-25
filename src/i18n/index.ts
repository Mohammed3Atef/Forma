import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@/types';
import en from './en.json';
import ar from './ar.json';
import arEg from './ar-eg.json';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar }, // Modern Standard Arabic (GCC)
    'ar-eg': { translation: arEg }, // Egyptian Arabic dialect
  },
  lng: 'en',
  // ar-eg → MSA → English fallback chain (ar-eg is complete, this is a safety net).
  fallbackLng: { 'ar-eg': ['ar', 'en'], default: ['en'] },
  lowerCaseLng: true, // so the hyphenated 'ar-eg' code resolves to its resource (not 'ar-EG')
  interpolation: { escapeValue: false },
  returnNull: false,
});

const RTL: Locale[] = ['ar', 'ar-eg'];

/** Apply locale to i18next and reflect direction/lang on <html>. */
export function applyLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
  const html = document.documentElement;
  html.lang = locale;
  html.dir = RTL.includes(locale) ? 'rtl' : 'ltr';
}

export default i18n;
