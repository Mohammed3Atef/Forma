import { describe, expect, it } from 'vitest';
import * as client from './civilDate';
import * as server from '../../api/_lib/civilDate';

/**
 * B3.8: fixed-day client terms are computed on the coach's device (the preview)
 * and on the server (the stored term). Both copies of the civil-date module
 * must agree on every case, in every zone, across DST changes, month ends,
 * leap years and year ends — and neither may depend on the zone the code runs in.
 */
const Z = (iso: string) => Date.parse(iso);

describe('civil dates — fixed-day arithmetic (zone-free)', () => {
  it('a 30-day term starting 1 October covers 1–30 October; the next starts 31 October', () => {
    expect(client.addDays('2026-10-01', 30)).toBe('2026-10-31');
    expect(client.addDays('2026-10-31', -1)).toBe('2026-10-30');
  });

  it('February, leap years and year ends', () => {
    expect(client.addDays('2027-02-01', 30)).toBe('2027-03-03');
    expect(client.addDays('2028-02-01', 30)).toBe('2028-03-02'); // 2028 is a leap year
    expect(client.addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(client.addDays('2026-12-15', 30)).toBe('2027-01-14');
    expect(client.addDays('2026-01-31', 90)).toBe('2026-05-01');
    expect(client.daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(client.daysBetween('2028-02-01', '2028-03-02')).toBe(30);
    expect(client.daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
  });

  it('only real calendar dates are date keys', () => {
    expect(client.isDateKey('2026-10-01')).toBe(true);
    expect(client.isDateKey('2028-02-29')).toBe(true);
    expect(client.isDateKey('2027-02-29')).toBe(false);
    expect(client.isDateKey('2026-02-30')).toBe(false);
    expect(client.isDateKey('2026-1-01')).toBe(false);
    expect(client.isDateKey(20261001)).toBe(false);
  });

  it('zones: known IANA names only, with Egypt as the default anchor', () => {
    expect(client.isTimeZone('Africa/Cairo')).toBe(true);
    expect(client.isTimeZone('Mars/Olympus')).toBe(false);
    expect(client.isTimeZone('')).toBe(false);
    expect(client.termZone(undefined)).toBe('Africa/Cairo');
    expect(client.termZone('Asia/Dubai')).toBe('Asia/Dubai');
  });
});

describe('civil dates — anchoring days to a zone', () => {
  it('Cairo midnight in summer (UTC+3) and winter (UTC+2)', () => {
    expect(client.startOfDay('2026-10-01', 'Africa/Cairo')).toBe(Z('2026-09-30T21:00:00Z'));
    expect(client.startOfDay('2026-12-01', 'Africa/Cairo')).toBe(Z('2026-11-30T22:00:00Z'));
  });

  it('a 30-day Cairo term across the end of summer time lasts 30 civil days (30 × 24 h + 1 h)', () => {
    const start = client.startOfDay('2026-10-01', 'Africa/Cairo');
    const end = client.startOfDay(client.addDays('2026-10-01', 30), 'Africa/Cairo');
    expect(end - start).toBe(30 * client.DAY_MS + 3_600_000);
    expect(client.dateKeyIn(end - 1, 'Africa/Cairo')).toBe('2026-10-30'); // the last covered day
    expect(client.dateKeyIn(end, 'Africa/Cairo')).toBe('2026-10-31'); // the next term's first day
  });

  it('a day that starts inside a DST gap starts at the jump (Egypt springs forward at midnight)', () => {
    // 24 April 2026: 00:00 EET does not exist — the clocks go to 01:00 EEST (= 22:00Z the day before).
    const t = client.startOfDay('2026-04-24', 'Africa/Cairo');
    expect(t).toBe(Z('2026-04-23T22:00:00Z'));
    expect(client.dateKeyIn(t, 'Africa/Cairo')).toBe('2026-04-24');
    expect(client.dateKeyIn(t - 1, 'Africa/Cairo')).toBe('2026-04-23');
  });

  it('the repeated hour when summer time ends belongs to the right day', () => {
    // Egypt falls back at the end of Thursday 29 October 2026: 30 October starts at 22:00Z.
    expect(client.startOfDay('2026-10-30', 'Africa/Cairo')).toBe(Z('2026-10-29T22:00:00Z'));
    expect(client.dateKeyIn(Z('2026-10-29T21:30:00Z'), 'Africa/Cairo')).toBe('2026-10-29');
  });

  it('zones far from UTC, half-hour offsets and a midnight gap elsewhere', () => {
    expect(client.startOfDay('2026-10-01', 'Pacific/Kiritimati')).toBe(Z('2026-09-30T10:00:00Z')); // UTC+14
    expect(client.startOfDay('2026-10-01', 'Pacific/Pago_Pago')).toBe(Z('2026-10-01T11:00:00Z')); // UTC−11
    expect(client.startOfDay('2026-10-01', 'Asia/Kolkata')).toBe(Z('2026-09-30T18:30:00Z')); // UTC+5:30
    expect(client.startOfDay('2026-03-08', 'America/New_York')).toBe(Z('2026-03-08T05:00:00Z'));
    const santiago = client.startOfDay('2026-09-06', 'America/Santiago'); // Chile springs forward at midnight
    expect(client.dateKeyIn(santiago, 'America/Santiago')).toBe('2026-09-06');
    expect(client.dateKeyIn(santiago - 1, 'America/Santiago')).toBe('2026-09-05');
  });

  it('reads the instants of a term written before B3.8: midnights (±DST) are boundaries; a midday moment keeps its day', () => {
    const oct1 = client.startOfDay('2026-10-01', 'Africa/Cairo');
    expect(client.dayOfStartInstant(oct1, 'Africa/Cairo')).toBe('2026-10-01');
    expect(client.dayOfStartInstant(oct1 - 3_600_000, 'Africa/Cairo')).toBe('2026-10-01'); // DST-drifted midnight
    expect(client.dayOfStartInstant(oct1 + 15 * 3_600_000, 'Africa/Cairo')).toBe('2026-10-01'); // a claim at 15:00
    expect(client.dayOfStartInstant(oct1 + 23 * 3_600_000, 'Africa/Cairo')).toBe('2026-10-02'); // 23:00 = next midnight drifted
    expect(client.dayAfterEndInstant(oct1, 'Africa/Cairo')).toBe('2026-10-01'); // ends at midnight: last day 30 Sep
    expect(client.dayAfterEndInstant(oct1 + 3_600_000, 'Africa/Cairo')).toBe('2026-10-01');
    expect(client.dayAfterEndInstant(oct1 + 9 * 3_600_000, 'Africa/Cairo')).toBe('2026-10-02'); // ends 09:00: 1 Oct is the last (partial) day
  });

  it('snaps an elapsed-time end (±1 h from DST) back to its day', () => {
    const start = client.startOfDay('2026-10-01', 'Africa/Cairo');
    expect(client.nearestDayKey(start + 30 * client.DAY_MS, 'Africa/Cairo')).toBe('2026-10-31'); // lands 23:00 on the 30th
    expect(client.nearestDayKey(start + 30 * client.DAY_MS + 3_600_000, 'Africa/Cairo')).toBe('2026-10-31');
  });
});

describe('civil dates — client and server copies agree', () => {
  const zones = ['Africa/Cairo', 'UTC', 'America/New_York', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Santiago', 'Europe/London', 'Asia/Dubai'];
  const keys = ['2026-01-01', '2026-02-28', '2026-03-08', '2026-03-29', '2026-04-24', '2026-09-06', '2026-10-25', '2026-10-30', '2026-10-31', '2026-12-31', '2028-02-29'];
  it('startOfDay / dateKeyIn / nearestDayKey / todayIn', () => {
    for (const z of zones) {
      for (const k of keys) {
        const t = server.startOfDay(k, z);
        expect(client.startOfDay(k, z), `${k} ${z}`).toBe(t);
        expect(client.dateKeyIn(t, z)).toBe(server.dateKeyIn(t, z));
        expect(client.dateKeyIn(t, z), `${k} ${z} round trip`).toBe(k);
        expect(client.nearestDayKey(t + 7 * client.DAY_MS, z)).toBe(server.nearestDayKey(t + 7 * server.DAY_MS, z));
        expect(client.todayIn(z, t + 3_600_000)).toBe(server.todayIn(z, t + 3_600_000));
        for (const off of [-3, -1, 0, 1, 5, 12, 21, 23]) {
          const m = t + off * 3_600_000;
          expect(client.dayOfStartInstant(m, z)).toBe(server.dayOfStartInstant(m, z));
          expect(client.dayAfterEndInstant(m, z)).toBe(server.dayAfterEndInstant(m, z));
        }
      }
    }
  });
  it('addDays / daysBetween / isDateKey / termZone', () => {
    for (const k of keys) {
      for (const n of [-400, -31, -1, 0, 1, 28, 30, 60, 90, 365, 366]) expect(client.addDays(k, n)).toBe(server.addDays(k, n));
      expect(client.daysBetween('2026-01-01', k)).toBe(server.daysBetween('2026-01-01', k));
    }
    for (const v of ['2026-02-29', '2028-02-29', 'x', '', null]) expect(client.isDateKey(v)).toBe(server.isDateKey(v));
    for (const v of ['Africa/Cairo', 'Nope/Zone', undefined, 42]) expect(client.termZone(v)).toBe(server.termZone(v));
  });
});
