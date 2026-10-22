/**
 * B3.8 (owner, 2026-10-21): calendar-day ("civil date") arithmetic for client
 * subscription terms — fixed-day periods anchored to a named time zone, never
 * to the server's own zone (UTC on Vercel, the developer's zone locally).
 *
 * A term is a run of whole calendar days `[startDate, endDate)` — `endDate` is
 * EXCLUSIVE: a 30-day term starting 2026-10-01 covers 1–30 October and the
 * next one starts 2026-10-31. The stored instants (`startAt` / `endAt`) are
 * the first instant of those days in the term's zone, so every existing
 * instant-based rule (status, days left, the sync gate) keeps working and is
 * correct across DST changes, month ends and leap years.
 *
 * KEEP IDENTICAL to `src/lib/civilDate.ts` (shared vector:
 * `src/lib/civilDateParity.test.ts`). Pure, dependency-free (Intl only).
 */

export const DAY_MS = 86_400_000;

/**
 * The zone a term is anchored in when it carries none (terms written before
 * B3.8, or a caller that sent no zone). Forma launches in Egypt (EGP-only,
 * owner decision 8), so Egypt's civil calendar is the only safe default.
 */
export const DEFAULT_TERM_ZONE = 'Africa/Cairo';

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date written `YYYY-MM-DD` (2026-02-30 is not). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_KEY.exec(value);
  if (!m) return false;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === value;
}

function utcOf(key: string): number {
  const m = DATE_KEY.exec(key);
  if (!m) throw new RangeError(`Not a date: ${key}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** `key` plus `n` calendar days (n may be negative). Zone-free. */
export function addDays(key: string, n: number): string {
  return new Date(utcOf(key) + Math.round(n) * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (positive when `b` is later). Zone-free. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
}

const zoneOk = new Map<string, boolean>();
/** True for an IANA zone this runtime knows (e.g. `Africa/Cairo`). */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  let ok = zoneOk.get(zone);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      ok = true;
    } catch {
      ok = false;
    }
    zoneOk.set(zone, ok);
  }
  return ok;
}

/** The zone to anchor a term in: the given one when valid, else the default. */
export function termZone(zone: unknown): string {
  return isTimeZone(zone) ? zone : DEFAULT_TERM_ZONE;
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function fmtFor(zone: string): Intl.DateTimeFormat {
  let f = partsFmt.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    partsFmt.set(zone, f);
  }
  return f;
}

function wallClock(ms: number, zone: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const out: Record<string, number> = {};
  for (const p of fmtFor(zone).formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { y: out.year, mo: out.month, d: out.day, h: out.hour === 24 ? 0 : out.hour, mi: out.minute, s: out.second };
}

/** The calendar date (`YYYY-MM-DD`) an instant falls on in `zone`. */
export function dateKeyIn(ms: number, zone: string): string {
  const w = wallClock(ms, zone);
  return `${String(w.y).padStart(4, '0')}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** `zone`'s offset from UTC at an instant, in ms (Cairo summer time = +3 h). */
function offsetAt(ms: number, zone: string): number {
  const w = wallClock(ms, zone);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The first instant of calendar day `key` in `zone` — local midnight, or the
 * moment the clocks jump forward when that day starts inside a DST gap
 * (Egypt's summer time begins AT midnight: that day starts at 01:00).
 */
export function startOfDay(key: string, zone: string): number {
  const guess = utcOf(key);
  const candidates = [guess - offsetAt(guess - 12 * 3_600_000, zone), guess - offsetAt(guess + 12 * 3_600_000, zone)];
  const valid = candidates.filter((t) => dateKeyIn(t, zone) === key && dateKeyIn(t - 1, zone) !== key);
  if (valid.length) return Math.min(...valid);
  // Midnight does not exist that day: the day begins at the transition. Find
  // it between the two candidates (minute precision is exact for every zone).
  let lo = Math.min(...candidates);
  let hi = Math.max(...candidates) + 2 * 3_600_000;
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2 / 60_000) * 60_000;
    if (dateKeyIn(mid, zone) < key) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Today's date in `zone`. */
export function todayIn(zone: string, now = Date.now()): string {
  return dateKeyIn(now, zone);
}

/**
 * The calendar day an instant that should sit on a day boundary belongs to —
 * tolerant of the ±1 h a DST change adds to elapsed-time arithmetic (an end
 * computed as `start + n × 24 h` lands at 23:00 or 01:00). Used to snap the
 * results of the elapsed-ms freeze rules back onto midnights.
 */
export function nearestDayKey(ms: number, zone: string): string {
  return dateKeyIn(ms + 12 * 3_600_000, zone);
}

/** Within this distance of a midnight, an instant is read as that day boundary (DST drift is ±1 h). */
const BOUNDARY_SLACK_MS = 2 * 3_600_000;

/**
 * The first calendar day of a term that only has a start INSTANT (written before B3.8): a
 * midnight (or a DST-shifted one) is that day; any other moment (a term that started "now")
 * starts on the day it falls on.
 */
export function dayOfStartInstant(ms: number, zone: string): string {
  const near = nearestDayKey(ms, zone);
  return Math.abs(ms - startOfDay(near, zone)) <= BOUNDARY_SLACK_MS ? near : dateKeyIn(ms, zone);
}

/**
 * The day AFTER the last day of a term that only has an end INSTANT (its exclusive end day): a
 * midnight (or a DST-shifted one) is that boundary; an end in the middle of a day keeps that day
 * as the (partial) last day.
 */
export function dayAfterEndInstant(ms: number, zone: string): string {
  const near = nearestDayKey(ms, zone);
  return Math.abs(ms - startOfDay(near, zone)) <= BOUNDARY_SLACK_MS ? near : addDays(dateKeyIn(ms, zone), 1);
}
