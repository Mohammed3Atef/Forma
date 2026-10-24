import { describe, expect, it } from 'vitest';
import type { CoachClientRelationship, Subscription, WeeklyCheckIn } from '@/types';
import { DAY_MS, type SourceState, type TodaySources, type TodaySummary } from './coachToday';
import { buildDirectory, bulkCheckInEligible, checkInStateOf, clientStateOf, displayNameOf, filterRows, sortRows, type DirectoryRow } from './coachDirectory';

/**
 * B3.3 Clients directory — every state from a stored fact, scoped to this
 * coach, unknown when its source failed (docs/product-audit/B3_CLIENTS_DIRECTORY.md).
 */
const COACH = 'coach-1';
const NOW = Date.UTC(2026, 9, 17, 9, 0, 0); // Sat 17 Oct 2026
const TODAY = '2026-10-17';
const WEEK = '2026-10-17'; // the app's week starts on Saturday
const ok = <T,>(data: T): SourceState<T> => ({ data, error: false });
const opts = { coachId: COACH, now: NOW, todayKey: TODAY, weekStart: WEEK };

const sub = (over: Partial<Subscription> = {}): Subscription => ({ status: 'active', startAt: NOW - 10 * DAY_MS, endAt: NOW + 20 * DAY_MS, updatedAt: NOW, ...over });
const rel = (clientId: string, over: Partial<CoachClientRelationship> = {}): CoachClientRelationship => ({
  id: `${COACH}__${clientId}`, coachId: COACH, clientId, status: 'active', createdBy: COACH, createdAt: NOW - 30 * DAY_MS, updatedAt: NOW, subscription: sub(), ...over,
});
const ci = (over: Partial<WeeklyCheckIn> = {}): WeeklyCheckIn => ({
  id: WEEK, clientId: 'a', coachId: COACH, weekStart: WEEK, weekEnd: '2026-10-23', status: 'requested', progressPhotos: {}, createdAt: NOW - DAY_MS, updatedAt: NOW, ...over,
});
const summary = (clientId: string, over: Partial<TodaySummary> = {}): TodaySummary => ({ clientId, lastActivity: '2026-10-15', workouts7d: 3, assessment: 'reviewed', hasWorkoutPlan: true, hasNutritionPlan: true, ...over });

function sources(ids: string[], over: Partial<TodaySources> = {}): TodaySources {
  return {
    roster: ok(ids.map((id) => ({ id, displayName: `Client ${id.toUpperCase()}`, email: `${id}@mail.test`, phone: `+2010000${id}`, accountStatus: 'active' }))),
    relationships: ok(ids.map((id) => rel(id))),
    summaries: ok(ids.map((id) => summary(id))),
    checkIns: ok(ids.map((id) => ({ clientId: id, latest: null, previous: null }))),
    threads: ok(ids.map((id) => ({ clientId: id, unreadForCoach: 0, last: null }))),
    transfers: ok([]),
    freezeRequests: ok([]),
    ...over,
  };
}

describe('client state (the coach\'s package with the client)', () => {
  it.each([
    ['no term', undefined, 'none', null],
    ['active, 20 days left', sub(), 'active', 20],
    ['trial', sub({ status: 'trial' }), 'trial', 20],
    ['active, exactly 7 days left → expiring', sub({ endAt: NOW + 7 * DAY_MS }), 'expiring', 7],
    ['trial, 2 days left → expiring', sub({ status: 'trial', endAt: NOW + 2 * DAY_MS }), 'expiring', 2],
    ['frozen now → paused', sub({ status: 'frozen', frozenFrom: NOW - DAY_MS, frozenUntil: NOW + DAY_MS, freezeCredit: 2 * DAY_MS }), 'paused', null],
    ['ran out → expired', sub({ endAt: NOW - DAY_MS }), 'expired', null],
    ['cancelled → expired', sub({ status: 'cancelled', cancelledAt: NOW - DAY_MS }), 'expired', null],
    ['ended → expired', sub({ status: 'ended' }), 'expired', null],
    ['pending', sub({ status: 'pending' }), 'pending', null],
  ] as const)('%s', (_n, s, state, days) => {
    expect(clientStateOf(rel('a', { subscription: s as Subscription | undefined }), NOW)).toEqual({ state, daysLeft: days });
  });
});

describe('check-in state (this coach, this week)', () => {
  const start = NOW - 30 * DAY_MS;
  it.each([
    ['nothing ever', null, null, 'notRequested'],
    ['my request this week, open', ci(), null, 'awaiting'],
    ['my request, week over, still open → overdue', ci({ weekStart: '2026-10-10', weekEnd: '2026-10-16' }), null, 'overdue'],
    ['my submitted (latest) → review', ci({ status: 'submitted', submittedAt: NOW - 3600_000 }), null, 'review'],
    ['my submitted older week behind a newer request → review', ci(), ci({ weekStart: '2026-10-10', weekEnd: '2026-10-16', status: 'submitted' }), 'review'],
    ['reviewed this week → done', ci({ status: 'reviewed' }), null, 'done'],
    ['reviewed LAST week → not requested this week', ci({ weekStart: '2026-10-10', weekEnd: '2026-10-16', status: 'reviewed' }), null, 'notRequested'],
    ['another coach\'s submitted check-in → never mine', ci({ coachId: 'coach-old', status: 'submitted' }), null, 'notRequested'],
    ['another coach\'s open request → not mine', ci({ coachId: 'coach-old' }), null, 'notRequested'],
    ['legacy (no coachId) created before this relationship → not mine', ci({ coachId: '' as string, createdAt: start - 1, status: 'submitted', submittedAt: start - 1 }), null, 'notRequested'],
    ['legacy created after this relationship began → mine', ci({ coachId: '' as string, createdAt: start + 1, submittedAt: start + 2, status: 'submitted' }), null, 'review'],
  ] as const)('%s', (_n, latest, previous, state) => {
    expect(checkInStateOf(latest as WeeklyCheckIn | null, previous as WeeklyCheckIn | null, COACH, start, WEEK, TODAY)).toBe(state);
  });
});

describe('buildDirectory', () => {
  it('one row per active-roster client, reasons from the same queue as Today, honest unknowns', () => {
    const s = sources(['a', 'b', 'c'], {
      threads: ok([{ clientId: 'a', unreadForCoach: 2, last: { body: 'Hi', fromRole: 'client', createdAt: NOW } }]),
      relationships: ok([rel('a'), rel('b', { subscription: sub({ endAt: NOW + 2 * DAY_MS }) }), rel('c')]),
    });
    const d = buildDirectory(s, opts);
    expect(d.rows.map((r) => [r.id, r.state, r.needs.map((n) => n.kind)])).toEqual([
      ['a', 'active', ['message']],
      ['b', 'expiring', ['renewal']],
      ['c', 'active', []],
    ]);
    expect(d.rows[0]).toMatchObject({ workouts7d: 3, lastWorkout: '2026-10-15', daysSinceWorkout: 2, hasWorkoutPlan: true, checkIn: 'notRequested', addedAt: NOW - 30 * DAY_MS });
  });

  it('a failed source makes its fields unknown (null), never zero or "no plan"', () => {
    const s = sources(['a'], { summaries: { data: undefined, error: true }, checkIns: { data: undefined, error: true }, relationships: { data: undefined, error: true } });
    const [r] = buildDirectory(s, opts).rows;
    expect(r).toMatchObject({ state: null, workouts7d: null, lastWorkout: undefined, hasWorkoutPlan: null, hasNutritionPlan: null, checkIn: null });
  });

  it('the roster failing is a roster error (no rows)', () => {
    const d = buildDirectory(sources(['a'], { roster: { data: undefined, error: true } }), opts);
    expect(d.rows).toEqual([]);
    expect(d.rosterError).toBe(true);
  });

  it('display name: the assessment name replaces an email-prefix account name, never a real one', () => {
    expect(displayNameOf({ id: 'a', displayName: 'nour', email: 'nour@mail.test' }, 'Nour Ali')).toBe('Nour Ali');
    expect(displayNameOf({ id: 'a', displayName: 'Coach Pick', email: 'nour@mail.test' }, 'Nour Ali')).toBe('Coach Pick');
    expect(displayNameOf({ id: 'a', email: 'x@mail.test' }, null)).toBe('x@mail.test');
  });
});

describe('filters and sorting', () => {
  const rowsFor = () => {
    const s = sources(['a', 'b', 'c', 'd'], {
      relationships: ok([rel('a'), rel('b', { subscription: sub({ endAt: NOW + 3 * DAY_MS }) }), rel('c', { subscription: sub({ endAt: NOW - 2 * DAY_MS }) }), rel('d', { subscription: undefined })]),
      summaries: ok([
        summary('a', { lastActivity: '2026-10-16', workouts7d: 4 }),
        summary('b', { lastActivity: '2026-10-01', workouts7d: 0 }),
        summary('c', { lastActivity: null, workouts7d: 0, hasNutritionPlan: false }),
        summary('d', { lastActivity: '2026-10-12', workouts7d: 1, hasWorkoutPlan: false }),
      ]),
      checkIns: ok([{ clientId: 'a', latest: ci({ clientId: 'a', status: 'submitted', submittedAt: NOW - DAY_MS }), previous: null }]),
    });
    return buildDirectory(s, opts).rows;
  };

  it('search matches name, email and phone (contact details are searchable, never shown in rows)', () => {
    const rows = rowsFor();
    expect(filterRows(rows, { q: 'client b' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRows(rows, { q: 'c@mail' }).map((r) => r.id)).toEqual(['c']);
    expect(filterRows(rows, { q: '+2010000d' }).map((r) => r.id)).toEqual(['d']);
  });

  it('task, state, check-in and plan filters', () => {
    const rows = rowsFor();
    expect(filterRows(rows, { task: 'needs' }).map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(filterRows(rows, { task: 'checkin' }).map((r) => r.id)).toEqual(['a']);
    expect(filterRows(rows, { task: 'renewal' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRows(rows, { task: 'lapsed' }).map((r) => r.id)).toEqual(['c']);
    expect(filterRows(rows, { state: 'none' }).map((r) => r.id)).toEqual(['d']);
    expect(filterRows(rows, { checkin: 'review' }).map((r) => r.id)).toEqual(['a']);
    expect(filterRows(rows, { plan: 'noWorkout' }).map((r) => r.id)).toEqual(['d']);
    expect(filterRows(rows, { plan: 'noNutrition' }).map((r) => r.id)).toEqual(['c']);
  });

  it('sort: needs first (most urgent reason), then by name; last workout recent → never; days left with unknowns last; workouts high → low', () => {
    const rows = rowsFor();
    expect(sortRows(rows, 'needs').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']); // check-in, renewal, lapsed, then the rest
    expect(sortRows(rows, 'lastWorkout').map((r) => r.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(sortRows(rows, 'lastWorkout', 'desc').map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(sortRows(rows, 'daysLeft').map((r) => r.id)).toEqual(['b', 'a', 'c', 'd']); // 3, 20, then no running term
    expect(sortRows(rows, 'workouts').map((r) => r.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(sortRows(rows, 'name', 'desc').map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('bulk weekly request: running term + active account + nothing requested by this coach this week', () => {
    const rows = rowsFor();
    expect(rows.filter(bulkCheckInEligible).map((r) => r.id)).toEqual(['b']); // a has a check-in; c expired; d no term
    const suspended = { ...rows[1], accountStatus: 'suspended' } as DirectoryRow;
    expect(bulkCheckInEligible(suspended)).toBe(false);
  });

  it('a 500-client roster: one row each, filters and sorts stay consistent', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `c${String(i).padStart(3, '0')}`);
    const s = sources(ids, { threads: ok(ids.map((id, i) => ({ clientId: id, unreadForCoach: i % 5 === 0 ? 1 : 0, last: { body: 'x', fromRole: 'client', createdAt: NOW - i } }))) });
    const d = buildDirectory(s, opts);
    expect(d.rows).toHaveLength(500);
    expect(new Set(d.rows.map((r) => r.id)).size).toBe(500);
    expect(filterRows(d.rows, { task: 'needs' })).toHaveLength(100);
    expect(sortRows(d.rows, 'needs').slice(0, 100).every((r) => r.needs.length > 0)).toBe(true);
  });
});
