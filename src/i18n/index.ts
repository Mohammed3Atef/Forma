import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@/types';
import en from './en.json';
import ar from './ar.json';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Apply locale to i18next and reflect direction/lang on <html>. */
export function applyLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
  const html = document.documentElement;
  html.lang = locale;
  html.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export default i18n;
