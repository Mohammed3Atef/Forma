import { describe, expect, it } from 'vitest';
import {
  dayKeyOf,
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  formatTime,
  formatUnit,
  intlLocale,
  isolate,
  pluralCategory,
  toDate,
  weekdayInitials,
} from './format';

const ARABIC_INDIC = /[٠-٩۰-۹]/;
const NOON = new Date(2026, 9, 8, 12, 30).getTime(); // Thu 8 Oct 2026 12:30 local

describe('formatting service (B1.8)', () => {
  it('resolves both Arabic locales to Egyptian Arabic with LATIN digits (one digit policy)', () => {
    expect(intlLocale('en')).toBe('en-GB-u-nu-latn');
    expect(intlLocale('ar')).toBe('ar-EG-u-nu-latn');
    expect(intlLocale('ar-eg')).toBe('ar-EG-u-nu-latn');
    for (const lang of ['ar', 'ar-eg']) {
      const samples = [
        formatDate(NOON, lang, 'medium'),
        formatDate('2026-10-08', lang, 'weekdayShort'),
        formatTime(NOON, lang),
        formatDateTime(NOON, lang),
        formatNumber(12345.5, lang),
        formatPercent(80, lang),
        formatUnit(80.5, 'كجم', lang),
        formatBytes(2_500_000, lang),
      ];
      for (const v of samples) expect(v, `${lang}: ${v}`).not.toMatch(ARABIC_INDIC);
      // …while names stay Arabic.
      expect(formatDate(NOON, lang, 'long')).toMatch(/[؀-ۿ]/);
    }
  });

  it('English dates are day-first and localized', () => {
    expect(formatDate(NOON, 'en', 'medium')).toBe('8 Oct 2026');
    expect(formatDate('2026-10-08', 'en', 'short')).toBe('8 Oct');
    expect(formatDate(NOON, 'en', 'monthYear')).toBe('October 2026');
    expect(formatDate(NOON, 'ar-eg', 'medium')).not.toMatch(/Oct/);
  });

  it('day keys are LOCAL days — never the UTC day', () => {
    const lateEvening = new Date(2026, 9, 8, 23, 50).getTime();
    expect(dayKeyOf(lateEvening)).toBe('2026-10-08');
    const earlyMorning = new Date(2026, 9, 9, 0, 10).getTime();
    expect(dayKeyOf(earlyMorning)).toBe('2026-10-09');
    // A day key parses as local midnight (not UTC midnight).
    const d = toDate('2026-10-08');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 8, 0]);
    expect(formatDate('2026-10-08', 'en', 'iso')).toBe('2026-10-08');
  });

  it('relative time is in the app language', () => {
    const now = NOON;
    expect(formatRelative(now - 10_000, 'en', now)).toBe('now');
    expect(formatRelative(now - 5 * 60_000, 'en', now)).toBe('5 minutes ago');
    expect(formatRelative(now - 3 * 3600_000, 'en', now)).toBe('3 hours ago');
    expect(formatRelative(now - 86_400_000, 'en', now)).toBe('yesterday');
    expect(formatRelative(now - 5 * 60_000, 'ar-eg', now)).toMatch(/[؀-ۿ]/);
    expect(formatRelative(now - 30 * 86_400_000, 'en', now)).toBe('8 Sept'); // older → a date
  });

  it('plural categories follow CLDR (Arabic has six forms)', () => {
    expect(pluralCategory(1, 'en')).toBe('one');
    expect(pluralCategory(2, 'en')).toBe('other');
    expect([0, 1, 2, 3, 11, 100].map((n) => pluralCategory(n, 'ar'))).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
    expect(pluralCategory(3, 'ar-eg')).toBe('few');
  });

  it('numbers, units and sizes isolate for bidi and use the app language', () => {
    expect(formatNumber(12345.67, 'en', { maxFractionDigits: 1 })).toBe('12,345.7');
    expect(formatUnit(80.5, 'kg', 'en')).toBe(isolate('80.5 kg'));
    expect(formatBytes(512, 'en')).toBe(isolate('512 B'));
    expect(formatBytes(2_621_440, 'en')).toBe(isolate('2.5 MB'));
    expect(formatBytes(2_621_440, 'ar')).toContain('م.ب');
    expect(formatCurrency(199, 'EGP', 'en')).toMatch(/199/);
    expect(formatCurrency(199, 'not-a-code', 'en')).toBe('199 not-a-code'); // never throws
  });

  it('timers are m:ss / h:mm:ss', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3_725)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('weekday initials start on Saturday and are localized', () => {
    expect(weekdayInitials('en')).toEqual(['S', 'S', 'M', 'T', 'W', 'T', 'F']);
    expect(weekdayInitials('ar').join('')).not.toMatch(/[A-Z]/);
  });
});
