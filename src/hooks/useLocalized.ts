import { useTranslation } from 'react-i18next';
import type { LocalizedText, LocalizedTextList, Locale } from '@/types';

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

/** Same as `useLocalized()`, for an ordered bilingual list (e.g. plan feature bullets). */
export function useLocalizedList() {
  const { i18n } = useTranslation();
  const locale = (i18n.language as Locale) ?? 'en';
  return (text: LocalizedTextList): string[] => {
    const value = locale === 'ar' || locale === 'ar-eg' ? text.ar : text.en;
    return value?.length ? value : text.en?.length ? text.en : text.ar;
  };
}
