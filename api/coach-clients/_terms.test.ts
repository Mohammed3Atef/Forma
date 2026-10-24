import { describe, expect, it } from 'vitest';
import { archiveForRenewal, applyCorrection, buildTerm, calendarOf, extendDated, lengthInDays, renewalStart, snapToCalendar } from './_terms.js';
import { startOfDay } from '../_lib/civilDate.js';
import type { SubscriptionDoc } from './_types.js';

/**
 * B3.8 (owner decisions 2 + 3): fixed-day terms and Fix C, as pure rules. Every case runs the
 * same in any server time zone (the suite is also run with TZ=UTC) — nothing here reads it.
 */
const CAIRO = 'Africa/Cairo';
const DAY = 86_400_000;
const at = (iso: string) => Date.parse(iso);
const cairoDay = (d: string) => startOfDay(d, CAIRO);

describe('length — one month is exactly 30 days', () => {
  it('months × 30, explicit days win, one month by default', () => {
    expect(lengthInDays({ months: 1 })).toBe(30);
    expect(lengthInDays({ months: 3 })).toBe(90);
    expect(lengthInDays({ days: 45 })).toBe(45);
    expect(lengthInDays({ days: 45, months: 3 })).toBe(45);
    expect(lengthInDays({})).toBe(30);
  });
});

describe('buildTerm — calendar days in the coach’s zone', () => {
  const now = at('2026-10-21T10:00:00Z');
  it('a 1-month term from 1 Oct covers 1–30 Oct; the next starts 31 Oct (Cairo, across the end of summer time)', () => {
    const t = buildTerm({ status: 'active', startDate: '2026-10-01', months: 1, price: 900, zone: CAIRO }, now);
    expect(t).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-31', days: 30, months: 1, zone: CAIRO, price: 900, currency: 'EGP', status: 'active' });
    expect(t.startAt).toBe(cairoDay('2026-10-01'));
    expect(t.endAt).toBe(cairoDay('2026-10-31'));
    expect(t.termId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('February, leap years and the year end', () => {
    expect(buildTerm({ status: 'active', startDate: '2027-02-01', months: 1, zone: CAIRO }, now).endDate).toBe('2027-03-03');
    expect(buildTerm({ status: 'active', startDate: '2028-02-01', months: 1, zone: CAIRO }, now).endDate).toBe('2028-03-02');
    expect(buildTerm({ status: 'active', startDate: '2026-12-15', months: 1, zone: CAIRO }, now).endDate).toBe('2027-01-14');
  });
  it('an app older than B3.8 sends an instant (its local midnight): same day, same result', () => {
    const t = buildTerm({ status: 'active', startAt: cairoDay('2026-03-01'), months: 1, zone: CAIRO }, now);
    expect(t).toMatchObject({ startDate: '2026-03-01', endDate: '2026-03-31' });
  });
  it('no zone → Egypt; an unknown zone → Egypt; no start → today in that zone', () => {
    expect(buildTerm({ status: 'active', startDate: '2026-10-01', months: 1 }, now).zone).toBe(CAIRO);
    expect(buildTerm({ status: 'active', startDate: '2026-10-01', months: 1, zone: 'Nope/Nowhere' }, now).zone).toBe(CAIRO);
    // 23:30 UTC on 21 Oct is already 22 Oct in Cairo.
    expect(buildTerm({ status: 'trial', zone: CAIRO }, at('2026-10-21T23:30:00Z')).startDate).toBe('2026-10-22');
  });
  it('trial terms keep their own day count (14 by default); other statuses get no term math', () => {
    expect(buildTerm({ status: 'trial', startDate: '2026-10-01', zone: CAIRO }, now)).toMatchObject({ days: 14, endDate: '2026-10-15' });
    expect(buildTerm({ status: 'trial', startDate: '2026-10-01', trialDays: 7, zone: CAIRO }, now).endDate).toBe('2026-10-08');
    const pending = buildTerm({ status: 'pending' }, now);
    expect(pending.startDate).toBeUndefined();
    expect(pending.startAt).toBe(now);
  });
  it('a free term carries no currency; a priced one is EGP', () => {
    expect(buildTerm({ status: 'active', startDate: '2026-10-01', zone: CAIRO }, now).currency).toBeUndefined();
    expect(buildTerm({ status: 'active', startDate: '2026-10-01', price: 0, zone: CAIRO }, now).currency).toBe('EGP');
  });
  it('the same result whatever zone the coach is in — the dates are the coach’s calendar days', () => {
    const ny = buildTerm({ status: 'active', startDate: '2026-11-01', months: 1, zone: 'America/New_York' }, now);
    expect(ny).toMatchObject({ startDate: '2026-11-01', endDate: '2026-12-01' });
    expect(ny.endAt - ny.startAt).toBe(30 * DAY + 3_600_000); // New York falls back on 1 Nov 2026
  });
});

const running = (over: Partial<SubscriptionDoc> = {}): SubscriptionDoc => ({
  ...buildTerm({ status: 'active', startDate: '2026-10-01', months: 1, price: 900, zone: CAIRO }, at('2026-10-01T08:00:00Z')),
  ...over,
});

describe('renewal (Fix C) — the next term, never an overlap', () => {
  it('a running term is renewed from its end: the next term starts the day after its last day', () => {
    const cur = running();
    const now = at('2026-10-21T10:00:00Z');
    expect(renewalStart(cur, undefined, CAIRO, now)).toEqual({ ok: true, startDate: '2026-10-31' });
    expect(renewalStart(cur, '2026-10-31', CAIRO, now)).toEqual({ ok: true, startDate: '2026-10-31' });
    // A different start for a running term is refused, not silently moved.
    expect(renewalStart(cur, '2026-10-01', CAIRO, now)).toEqual({ ok: false, reason: 'RENEWAL_STARTS_AFTER_TERM' });
    expect(renewalStart(cur, '2026-10-21', CAIRO, now)).toEqual({ ok: false, reason: 'RENEWAL_STARTS_AFTER_TERM' });
  });
  it('a lapsed, ended or cancelled term is renewed from the day picked (default today)', () => {
    const now = at('2026-11-05T10:00:00Z');
    expect(renewalStart(running(), undefined, CAIRO, now)).toEqual({ ok: true, startDate: '2026-11-05' });
    expect(renewalStart(running(), '2026-11-01', CAIRO, now)).toEqual({ ok: true, startDate: '2026-11-01' });
    expect(renewalStart(running({ status: 'cancelled' }), undefined, CAIRO, at('2026-10-21T10:00:00Z'))).toEqual({ ok: true, startDate: '2026-10-21' });
  });
  it('a frozen term (end pushed by its compensation) is renewed from its pushed end', () => {
    const frozen = running({ status: 'frozen', endDate: '2026-11-07', endAt: cairoDay('2026-11-07') });
    expect(renewalStart(frozen, undefined, CAIRO, at('2026-10-21T10:00:00Z'))).toEqual({ ok: true, startDate: '2026-11-07' });
  });
  it('the archived term keeps its REAL end (no history gap, BE-3) and says it was renewed', () => {
    const cur = running();
    const now = at('2026-10-21T10:00:00Z');
    const a = archiveForRenewal(cur, now);
    expect(a).toMatchObject({ startAt: cur.startAt, endAt: cur.endAt, startDate: '2026-10-01', endDate: '2026-10-31', price: 900, termId: cur.termId, status: 'ended', archivedBy: 'renew', endedAt: now });
    expect(archiveForRenewal(cur, at('2026-11-02T10:00:00Z')).status).toBe('expired');
  });
});

describe('correction (Fix C) — the same economic term, edited in place', () => {
  const now = at('2026-10-21T10:00:00Z');
  it('a save that changes nothing changes nothing', () => {
    const cur = running();
    const r = applyCorrection(cur, { startDate: '2026-10-01', months: 1, price: 900, planName: null }, now);
    expect(r.changed).toBe(false);
    expect(r.next).toBe(cur);
  });
  it('correcting the start keeps the term id and the length', () => {
    const cur = running();
    const r = applyCorrection(cur, { startDate: '2026-10-05' }, now);
    expect(r.changed).toBe(true);
    expect(r.next).toMatchObject({ termId: cur.termId, startDate: '2026-10-05', endDate: '2026-11-04', days: 30, price: 900 });
  });
  it('a price-only correction never touches the dates', () => {
    const cur = running({ startDate: undefined, endDate: undefined, days: undefined, zone: undefined }); // written before B3.8
    const r = applyCorrection(cur, { price: 1200 }, now);
    expect(r.next).toMatchObject({ startAt: cur.startAt, endAt: cur.endAt, price: 1200, currency: 'EGP' });
    expect(r.next.startDate).toBeUndefined();
    expect(r.next.termId).toBeTruthy(); // the legacy term gets its id now
  });
  it('a package change (length + price) keeps extension / freeze days on top', () => {
    const cur = running({ endDate: '2026-11-07', endAt: cairoDay('2026-11-07') }); // 7 days added earlier
    const r = applyCorrection(cur, { months: 3, price: 2400, planName: 'Quarterly' }, now);
    expect(r.next).toMatchObject({ termId: cur.termId, startDate: '2026-10-01', days: 90, endDate: '2027-01-06', months: 3, price: 2400, planName: 'Quarterly' });
  });
  it('making a term free removes its price and currency', () => {
    const r = applyCorrection(running(), { price: null }, now);
    expect(r.changed).toBe(true);
    expect(r.next.price).toBeUndefined();
    expect(r.next.currency).toBeUndefined();
  });
});

describe('extend and freeze on calendar days', () => {
  it('a running term extends from its end; a lapsed one from today', () => {
    expect(extendDated(running(), 7, at('2026-10-21T10:00:00Z'))).toEqual({ endDate: '2026-11-07', endAt: cairoDay('2026-11-07') });
    expect(extendDated(running(), 7, at('2026-11-05T10:00:00Z'))).toEqual({ endDate: '2026-11-12', endAt: cairoDay('2026-11-12') });
    expect(extendDated(running({ endDate: undefined }), 7, at('2026-10-21T10:00:00Z'))).toBeNull(); // legacy: the ms rule applies
  });
  it('an end moved by whole 24 h days across a DST change snaps back to midnight', () => {
    const cur = running();
    const pushed = { ...cur, endAt: cur.endAt + 7 * DAY };
    expect(snapToCalendar(pushed)).toMatchObject({ endDate: '2026-11-07', endAt: cairoDay('2026-11-07') });
  });
  it('calendarOf reads a legacy term from its instants (whole span booked)', () => {
    const legacy = running({ startDate: undefined, endDate: undefined, days: undefined, zone: undefined });
    expect(calendarOf(legacy)).toMatchObject({ zone: CAIRO, startDate: '2026-10-01', endDate: '2026-10-31', days: 30, bonus: 0 });
  });
});
