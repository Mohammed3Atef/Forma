import type { LocalizedText } from '@/types';

/**
 * Editing bilingual text without destroying the other language (B1.8 /
 * EX-06, FD-01). Every form that edits a `{ en, ar }` value through ONE text
 * box goes through here; before B1 they all saved `{ en: v, ar: v }`, which
 * wiped real Arabic (coach editors) or real English (the client's food edit).
 *
 * Rule: the edited language takes the new value. The OTHER language follows
 * only when it was a copy of the edited one (or empty) — i.e. nobody ever wrote
 * a real translation. A real translation is kept; the form shows it so the
 * author can update it (`secondLanguageStale`).
 */
export type TextLang = 'en' | 'ar';

export const langOf = (uiLanguage: string | undefined): TextLang => ((uiLanguage ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en');
export const otherLang = (l: TextLang): TextLang => (l === 'en' ? 'ar' : 'en');

export function applyLocalizedEdit(orig: LocalizedText | undefined | null, value: string, edited: TextLang): LocalizedText {
  const prev: LocalizedText = { en: orig?.en ?? '', ar: orig?.ar ?? '' };
  const v = value.trim();
  const other = otherLang(edited);
  const otherWasCopy = !prev[other].trim() || prev[other].trim() === prev[edited].trim();
  return { ...prev, [edited]: v, [other]: otherWasCopy ? v : prev[other] } as LocalizedText;
}

/**
 * The same rule while typing in a live field (B3.5): the value is not trimmed, so a space can be
 * typed (trimming on every keystroke turned "Big b" into "Bigb"). Trim when saving.
 */
export function typeLocalized(orig: LocalizedText | undefined | null, value: string, edited: TextLang): LocalizedText {
  const prev: LocalizedText = { en: orig?.en ?? '', ar: orig?.ar ?? '' };
  const other = otherLang(edited);
  const otherWasCopy = !prev[other].trim() || prev[other].trim() === prev[edited].trim();
  return { ...prev, [edited]: value, [other]: otherWasCopy ? value : prev[other] } as LocalizedText;
}

/** Both languages set explicitly (a form that shows both fields). */
export function setLocalized(en: string, ar: string): LocalizedText {
  return { en: en.trim(), ar: ar.trim() };
}

export function localizedEqual(a: LocalizedText | undefined | null, b: LocalizedText | undefined | null): boolean {
  return (a?.en ?? '').trim() === (b?.en ?? '').trim() && (a?.ar ?? '').trim() === (b?.ar ?? '').trim();
}

/** True when the edited language changed but a distinct translation was kept — show it to the author. */
export function secondLanguageStale(orig: LocalizedText | undefined | null, currentEdited: string, edited: TextLang): boolean {
  if (!orig) return false;
  const other = otherLang(edited);
  const distinct = !!orig[other]?.trim() && orig[other].trim() !== orig[edited]?.trim();
  return distinct && currentEdited.trim() !== (orig[edited] ?? '').trim();
}
