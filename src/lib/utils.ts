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

/** Day-of-week 0 (Sun) - 6 (Sat) for a day key. */
export function dowOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
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

/** Format seconds as M:SS or H:MM:SS. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Pretty short date label, e.g. "Mon 29 May". */
export function shortDate(key: string, locale = 'en'): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
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

/**
 * Parse a flexible rest-time input into seconds. Accepts:
 *  - "M:SS"          → minutes:seconds  ("1:30" → 90, "1.5:30" → 120)
 *  - decimal minutes → "1.5"            → 90
 *  - plain seconds   → "90"             → 90
 * Returns null when the input can't be parsed.
 */
export function parseRestInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes(':')) {
    const [mPart, sPart = '0'] = s.split(':');
    const mins = Number(mPart);
    const secs = Number(sPart);
    if (Number.isNaN(mins) || Number.isNaN(secs)) return null;
    return Math.max(0, Math.round(mins * 60 + secs));
  }
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  // A decimal value is interpreted as minutes (1.5 → 90s); an integer as seconds.
  return Math.max(0, Math.round(s.includes('.') ? n * 60 : n));
}

export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Parse a user-typed decimal. Mobile keyboards (especially Arabic locale) emit
 * "," or "٫" as the decimal separator and may use Arabic-Indic digits — plain
 * Number() returns NaN for those. Returns 0 when unparseable.
 */
export function parseDecimal(raw: string): number {
  const normalized = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[،,٫]/g, '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
