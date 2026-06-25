import { useTranslation } from 'react-i18next';
import type { LocalizedText, Locale } from '@/types';

/** Returns a function that picks the right language from a LocalizedText. */
export function useLocalized() {
  const { i18n } = useTranslation();
  const locale = (i18n.language as Locale) ?? 'en';
  // LocalizedText (coach-authored data) only has en/ar — Egyptian Arabic uses the ar field.
  return (text: LocalizedText): string => {
    const value = locale === 'ar' || locale === 'ar-eg' ? text.ar : text.en;
    return value || text.en || text.ar;
  };
}
