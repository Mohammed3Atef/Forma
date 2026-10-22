/**
 * B3.9.0 — Cairo-anchored calendar helpers for the e2e3 specs.
 *
 * The browser runs in Africa/Cairo (`timezoneId` in playwright.e2e3.config.ts); the Node test process
 * runs in whatever zone the machine has. Every calendar date a spec writes or expects is therefore a
 * CAIRO date, and calendar arithmetic steps day KEYS, never instants: Egypt changes the clocks at
 * midnight (summer time ends on the last Thursday of October — a 25-hour day — and starts on the last
 * Friday of April — a 23-hour day), so `now - n × 24 h` can land on the wrong calendar day.
 *
 * Mirrors the app's rules: `src/lib/civilDate.ts` (zone-free key arithmetic, `startOfDay`) and
 * `src/lib/utils.ts` (`WEEK_STARTS_ON = 6`: the training week runs Saturday → Friday).
 *
 * Note: several of the app's "N days" counts are ELAPSED time, not calendar days (`trialDaysLeft`,
 * `subscriptionDaysLeft`, Today's renewal / lapsed rows: `ceil` / `floor` of ms ÷ 24 h). A fixture for
 * those stays `now ± N × DAY_MS` (minus a margin); only calendar-day fixtures use these helpers.
 */
export const CAIRO = 'Africa/Cairo';
export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

const wallFmt = new Intl.DateTimeFormat('en-US', { timeZone: CAIRO, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The Cairo calendar day (`YYYY-MM-DD`) an instant falls on. */
export function cairoDay(ms: number = Date.now()): string {
  const p: Record<string, string> = {};
  for (const part of wallFmt.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

function keyUtc(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new RangeError(`not a day key: ${key}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** `key` plus `n` calendar days (n may be negative) — arithmetic on the key, never on an instant. */
export function addDays(key: string, n: number): string {
  return new Date(keyUtc(key) + Math.round(n) * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyUtc(b) - keyUtc(a)) / DAY_MS);
}

/**
 * The first instant of Cairo day `key`: its local midnight, or — on the day summer time starts, when
 * midnight does not exist — the moment the clocks jump (01:00), exactly like the app's `startOfDay`.
 * Cairo is UTC+2 / UTC+3, so the boundary lies within a few hours of `key`T00:00Z; it is found by
 * bisection on whole minutes (the Cairo day of an instant never goes backwards, even when clocks do).
 */
export function cairoMidnight(key: string): number {
  const utc = keyUtc(key);
  let lo = utc - 6 * HOUR_MS; // 20:00 / 21:00 the day before in Cairo
  let hi = utc + 6 * HOUR_MS; // 08:00 / 09:00 on `key` in Cairo
  while (hi - lo > MINUTE_MS) {
    const mid = Math.floor((lo + hi) / 2 / MINUTE_MS) * MINUTE_MS;
    if (cairoDay(mid) < key) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Noon of Cairo day `key` — a day-relative fixture instant far from both midnights (where Egypt's DST changes happen). */
export function cairoNoon(key: string): number {
  return cairoMidnight(key) + 12 * HOUR_MS;
}

/** Noon of Cairo day `key`, or `now` while that noon is still ahead (today's fixture is never in the future). */
export function noonOrNow(key: string, now: number): number {
  return Math.min(cairoNoon(key), now);
}

/** The first day of the week containing `key` — by default the app's Saturday → Friday training week. */
export function weekStartOf(key: string, weekStartsOn = 6): string {
  const dow = new Date(keyUtc(key)).getUTCDay();
  return addDays(key, -((dow - weekStartsOn + 7) % 7));
}

/** The Cairo calendar month containing `ms`: its first day, first instant and last millisecond (the Business screen's month). */
export function cairoMonth(ms: number): { first: string; start: number; end: number } {
  const [y, m] = cairoDay(ms).split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { first, start: cairoMidnight(first), end: cairoMidnight(next) - 1 };
}

/** The instant a day-relative fixture was written for, and that instant's Cairo day ("today" for the fixture). */
export interface DayAnchor {
  now: number;
  today: string;
}

export function anchorAt(now: number = Date.now()): DayAnchor {
  return { now, today: cairoDay(now) };
}

/**
 * True when there is no anchor yet, or the Cairo calendar day has changed since it was taken — a long run
 * crossed midnight after the fixture was written, so the fixture's "today" is now the app's "yesterday".
 */
export function dayRolled(anchor: DayAnchor | null | undefined, now: number = Date.now()): boolean {
  return !anchor || cairoDay(now) !== anchor.today;
}
