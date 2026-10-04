import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import { SITE_NS } from '../i18n';

export type SiteLang = 'en' | 'ar';

/** The website's copy + language, driven by the app locale (ar / ar-eg → Arabic copy). */
export function useSiteT() {
  const { t, i18n } = useTranslation(SITE_NS);
  const lang: SiteLang = i18n.language.startsWith('ar') ? 'ar' : 'en';
  return { t, lang };
}

/** Flip EN ⇄ AR — the app language follows (and persists), exactly like the in-app toggle. */
export function useToggleLang() {
  const setLocale = useSettings((s) => s.setLocale);
  const { lang } = useSiteT();
  return () => void setLocale(lang === 'ar' ? 'en' : 'ar');
}
