/**
 * The ONE formatting service (B1.8 / RTL-02, RTL-03). Every product date,
 * time, number, unit and count goes through here instead of scattered
 * `toLocaleDateString()` calls.
 *
 * Locale resolution: `en` → en-GB (day-first, "8 Oct"); `ar` and `ar-eg` →
 * ar-EG (Arabic month and weekday names for both).
 *
 * DIGIT POLICY (decided once): Latin digits (0–9) in every language. Weights,
 * reps, timers and every interpolated number in the app are Latin, and the
 * numeric inputs normalise Arabic-Indic digits to Latin — so dates must not be
 * the one place that renders ٠–٩ (ar-EG's Intl default). Enforced with the
 * Unicode `-u-nu-latn` extension on every formatter.
 *
 * Day keys (`YYYY-MM-DD`) are LOCAL calendar days, never parsed as UTC (which
 * shifts the day for anyone east or west of Greenwich).
 */
export type AppLanguage = 'en' | 'ar' | 'ar-eg' | (string & {});

const isArabic = (lang: string | undefined) => !!lang && lang.toLowerCase().startsWith('ar');

/** BCP-47 tag for Intl, digit policy included. */
export function intlLocale(lang: AppLanguage | undefined): string {
  return isArabic(lang) ? 'ar-EG-u-nu-latn' : 'en-GB-u-nu-latn';
}
export function isRtlLanguage(lang: AppLanguage | undefined): boolean {
  return isArabic(lang);
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A Date for a timestamp, a Date, or a `YYYY-MM-DD` day key (local midnight). */
export function toDate(value: Date | number | string): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const m = DAY_KEY.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** Local `YYYY-MM-DD` for a timestamp (never `toISOString().slice`, which is the UTC day). */
export function dayKeyOf(value: Date | number): string {
  const d = toDate(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.PluralRules>();
function cached<T>(key: string, make: () => T): T {
  let v = cache.get(key) as T | undefined;
  if (!v) {
    v = make();
    cache.set(key, v as never);
  }
  return v;
}

export type DateStyle = 'short' | 'medium' | 'long' | 'full' | 'weekday' | 'weekdayAbbrev' | 'weekdayShort' | 'weekdayDayMonth' | 'monthYear' | 'dayMonth' | 'iso';
const DATE_OPTS: Record<Exclude<DateStyle, 'iso'>, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short' }, // 8 Oct
  medium: { day: 'numeric', month: 'short', year: 'numeric' }, // 8 Oct 2026
  long: { day: 'numeric', month: 'long', year: 'numeric' }, // 8 October 2026
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  weekday: { weekday: 'long' },
  weekdayAbbrev: { weekday: 'short' }, // Thu
  weekdayDayMonth: { weekday: 'long', day: 'numeric', month: 'long' }, // Thursday 8 October
  weekdayShort: { weekday: 'short', day: 'numeric', month: 'short' }, // Thu, 8 Oct
  monthYear: { month: 'long', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'long' },
};

export function formatDate(value: Date | number | string, lang: AppLanguage | undefined, style: DateStyle = 'medium'): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  if (style === 'iso') return dayKeyOf(d);
  const loc = intlLocale(lang);
  return cached(`d|${loc}|${style}`, () => new Intl.DateTimeFormat(loc, DATE_OPTS[style])).format(d);
}

export function formatTime(value: Date | number, lang: AppLanguage | undefined): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  const loc = intlLocale(lang);
  return cached(`t|${loc}`, () => new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' })).format(d);
}

export function formatDateTime(value: Date | number, lang: AppLanguage | undefined): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  const loc = intlLocale(lang);
  return cached(`dt|${loc}`, () => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })).format(d);
}

/** "5 minutes ago", "yesterday", "in 3 days" — in the app language. */
export function formatRelative(value: Date | number, lang: AppLanguage | undefined, now: number = Date.now()): string {
  const t = toDate(value).getTime();
  if (Number.isNaN(t)) return '';
  const diffSec = Math.round((t - now) / 1000);
  const abs = Math.abs(diffSec);
  const loc = intlLocale(lang);
  const rtf = cached(`r|${loc}`, () => new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }));
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 6 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(t, lang, 'short');
}

export function formatNumber(n: number, lang: AppLanguage | undefined, opts: { maxFractionDigits?: number; minFractionDigits?: number } = {}): string {
  if (!Number.isFinite(n)) return '';
  const loc = intlLocale(lang);
  const max = opts.maxFractionDigits ?? 1;
  const min = Math.min(opts.minFractionDigits ?? 0, max);
  return cached(`n|${loc}|${min}|${max}`, () => new Intl.NumberFormat(loc, { minimumFractionDigits: min, maximumFractionDigits: max })).format(n);
}

/** Percent from a 0–100 value. */
export function formatPercent(value0to100: number, lang: AppLanguage | undefined): string {
  if (!Number.isFinite(value0to100)) return '';
  const loc = intlLocale(lang);
  return cached(`p|${loc}`, () => new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 0 })).format(value0to100 / 100);
}

export function formatCurrency(amount: number, currency: string, lang: AppLanguage | undefined): string {
  if (!Number.isFinite(amount)) return '';
  const loc = intlLocale(lang);
  try {
    return cached(`c|${loc}|${currency}`, () => new Intl.NumberFormat(loc, { style: 'currency', currency, maximumFractionDigits: 2 })).format(amount);
  } catch {
    return `${formatNumber(amount, lang, { maxFractionDigits: 2 })} ${currency}`; // not an ISO currency code
  }
}

/** Unicode isolation so "80 kg" or a Latin name never reorders inside Arabic text (FSI … PDI). */
export function isolate(text: string): string {
  return `\u2068${text}\u2069`;
}

/**
 * A number with its unit, isolated for bidi. Unit labels come from i18n
 * (`units.*`) when given, so Arabic shows "كجم" — never a hard-coded "kg".
 */
export function formatUnit(n: number, unitLabel: string, lang: AppLanguage | undefined, maxFractionDigits = 1): string {
  return isolate(`${formatNumber(n, lang, { maxFractionDigits })} ${unitLabel}`);
}

/** m:ss / h:mm:ss timers (Latin digits by policy). */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function formatBytes(bytes: number, lang: AppLanguage | undefined): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const ar = isArabic(lang);
  const units = ar ? ['بايت', 'ك.ب', 'م.ب', 'ج.ب'] : ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return isolate(`${formatNumber(v, lang, { maxFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`);
}

/** CLDR plural category for a count (Arabic has zero/one/two/few/many/other). */
export function pluralCategory(count: number, lang: AppLanguage | undefined): Intl.LDMLPluralRule {
  const loc = intlLocale(lang);
  return cached(`pl|${loc}`, () => new Intl.PluralRules(loc)).select(count);
}

/** Saturday-first narrow weekday initials in the app language (no slicing of localized names). */
export function weekdayInitials(lang: AppLanguage | undefined): string[] {
  const loc = intlLocale(lang);
  const fmt = cached(`wd|${loc}`, () => new Intl.DateTimeFormat(loc, { weekday: 'narrow' }));
  // 2026-01-03 is a Saturday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, 3 + i)));
}
