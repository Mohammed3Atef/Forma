import { formatDate, formatDuration as fmtDuration, weekdayInitials as fmtWeekdayInitials } from './format';

/** Small dependency-free helpers shared across the app. */

/** Local calendar day key `YYYY-MM-DD` for a given Date (defaults to now). */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's day key. */
export function today(): string {
  return dayKey();
}

/** Returns the day key `n` days before the given key (n can be negative). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return dayKey(date);
}

/**
 * First day of the week in this app's calendar: 6 = Saturday (JS getDay value).
 * The training week runs Saturday → Friday (Friday is the rest day).
 */
export const WEEK_STARTS_ON = 6;

/** How many slots a given JS weekday sits past the week start (Sat = 0 … Fri = 6). */
export function weekdayOffset(jsDay: number): number {
  return (jsDay - WEEK_STARTS_ON + 7) % 7;
}

/** Midnight of the week-start (Saturday) on or before the given date. */
export function weekStartOf(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayOffset(d.getDay()));
  s.setHours(0, 0, 0, 0);
  return s;
}

/**
 * The training-week range (start..end, inclusive) for a day key, following the
 * app's Saturday→Friday convention (see WEEK_STARTS_ON). Used as the weekly
 * check-in's deterministic id (weekStart) + label.
 */
export function weekRange(key = today()): { weekStart: string; weekEnd: string } {
  const [y, m, d] = key.split('-').map(Number);
  const weekStart = dayKey(weekStartOf(new Date(y, m - 1, d)));
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

/** Inclusive difference in whole days between two day keys (a - b). */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((da - db) / 86_400_000);
}

let counter = 0;
/**
 * Collision-resistant id without external deps.
 * NB: avoids Math.random in hot paths but fine here for client-only ids.
 */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Format seconds as M:SS or H:MM:SS (the formatting service owns it — B1.8). */
export function formatDuration(totalSec: number): string {
  return fmtDuration(totalSec);
}

/** Pretty short date label for a day key, e.g. "Mon 29 May" (via the formatting service — B1.8). */
export function shortDate(key: string, locale = 'en'): string {
  return formatDate(key, locale, 'weekdayShort');
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Run a pending invocation immediately (no-op if none pending). */
  flush: () => void;
  /** Drop a pending invocation without running it. */
  cancel: () => void;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): Debounced<A> {
  let t: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;
  const base = (...args: A) => {
    lastArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      const a = lastArgs;
      lastArgs = undefined;
      if (a) fn(...a);
    }, ms);
  };
  return Object.assign(base, {
    flush: () => {
      if (t) clearTimeout(t);
      t = undefined;
      const a = lastArgs;
      lastArgs = undefined;
      if (a) fn(...a);
    },
    cancel: () => {
      if (t) clearTimeout(t);
      t = undefined;
      lastArgs = undefined;
    },
  });
}

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * The region locale for the app language (B0 / RTL-02): BOTH Arabic locales
 * (`ar`, `ar-eg`) map to Egyptian Arabic.
 * @deprecated Format through `@/lib/format` (B1.8) — it also applies the
 * Latin-digit policy, which a bare `toLocaleDateString(dateLocale(…))` misses.
 */
export function dateLocale(lang: string | undefined, fallback = 'en-GB'): string {
  return (lang ?? '').toLowerCase().startsWith('ar') ? 'ar-EG' : fallback;
}

/** Saturday-first narrow weekday labels in the app language (via the formatting service — B1.8). */
export function weekdayInitials(lang: string | undefined): string[] {
  return fmtWeekdayInitials(lang);
}

/**
 * Normalise what a phone keyboard types into a plain ASCII number string
 * (B0 / RTL-04): Arabic-Indic (٠-٩) and Persian (۰-۹) digits → 0-9, the
 * Arabic decimal separator / comma (٫ , ،) → ".", and invisible direction
 * marks removed. Validation then runs on the normalised text.
 */
export function normalizeNumericText(raw: string): string {
  return raw
    .replace(/[\u200e\u200f\u061c\u2066-\u2069\s]/g, '') // direction marks + isolates (pasted from RTL text)
    .replace(/\u066c/g, '') // the Arabic thousands separator
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[،,٫]/g, '.');
}

/**
 * `Number()` for typed text, through the shared normaliser (B1.8): Arabic-Indic
 * digits and separators parse; empty or unreadable text is NaN (callers keep
 * their own `>= 0` / `|| fallback` validation). Before B1 the coach/admin money
 * and duration fields used bare `Number()`, so an Arabic "١٠٠" became 0.
 */
export function parseNumber(raw: string): number {
  const n = normalizeNumericText(raw ?? '');
  return n === '' ? Number.NaN : Number(n);
}

/** Like `parseDecimal`, but `null` for empty or unparseable input (never a silent 0). */
export function parseDecimalOrNull(raw: string): number | null {
  const n = normalizeNumericText(raw);
  if (n === '' || n === '.') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/**
 * Parse a user-typed decimal. Mobile keyboards (especially Arabic locale) emit
 * "," or "٫" as the decimal separator and may use Arabic-Indic digits — plain
 * Number() returns NaN for those. Returns 0 when unparseable.
 */
export function parseDecimal(raw: string): number {
  // One normaliser for every number entry (B1.8): digits, separators, bidi marks.
  const n = Number(normalizeNumericText(raw));
  return Number.isFinite(n) ? n : 0;
}
