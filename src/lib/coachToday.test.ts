import { describe, expect, it } from 'vitest';
import type { CoachClientRelationship, Subscription, WeeklyCheckIn } from '@/types';
import { buildTodayQueue, DAY_MS, isMyCheckIn, parseFocus, type SourceState, type TodayFreezeRequest, type TodaySources, type TodaySummary } from './coachToday';

/**
 * B3.2 Today queue — every item grounded in a stored fact, one per client per
 * kind, the exact route attached, and "nothing needs you" only when every
 * source loaded (docs/product-audit/B3_TODAY_QUEUE.md).
 */
const COACH = 'coach-1';
const NOW = Date.UTC(2026, 9, 17, 9, 0, 0); // Fri 17 Oct 2026, 09:00 UTC
const TODAY = '2026-10-17';
const ok = <T,>(data: T): SourceState<T> => ({ data, error: false });
const opts = { coachId: COACH, now: NOW, todayKey: TODAY };

function sub(over: Partial<Subscription> = {}): Subscription {
  return { status: 'active', startAt: NOW - 20 * DAY_MS, endAt: NOW + 20 * DAY_MS, updatedAt: NOW, ...over };
}
function rel(clientId: string, over: Partial<CoachClientRelationship> = {}): CoachClientRelationship {
  return { id: `${COACH}__${clientId}`, coachId: COACH, clientId, status: 'active', createdBy: COACH, createdAt: NOW - 30 * DAY_MS, updatedAt: NOW, subscription: sub(), ...over };
}
function summary(clientId: string, over: Partial<TodaySummary> = {}): TodaySummary {
  return { clientId, lastActivity: TODAY, assessment: 'reviewed', hasWorkoutPlan: true, hasNutritionPlan: true, ...over };
}
function checkIn(clientId: string, over: Partial<WeeklyCheckIn> = {}): WeeklyCheckIn {
  return { id: '2026-10-11', clientId, coachId: COACH, weekStart: '2026-10-11', weekEnd: '2026-10-17', status: 'submitted', submittedAt: NOW - 2 * DAY_MS, progressPhotos: {}, createdAt: NOW - 3 * DAY_MS, updatedAt: NOW, ...over };
}
function freeze(clientId: string, over: Partial<TodayFreezeRequest> = {}): TodayFreezeRequest {
  return { clientId, from: NOW + DAY_MS, until: NOW + 8 * DAY_MS, reason: 'Travelling for two weeks', requestedAt: NOW - DAY_MS, ...over };
}

/** A coach whose clients all load fine and need nothing. */
function quiet(ids: string[]): TodaySources {
  return {
    roster: ok(ids.map((id) => ({ id, accountStatus: 'active' }))),
    relationships: ok(ids.map((id) => rel(id))),
    summaries: ok(ids.map((id) => summary(id))),
    checkIns: ok(ids.map((id) => ({ clientId: id, latest: null, previous: null }))),
    threads: ok(ids.map((id) => ({ clientId: id, unreadForCoach: 0, last: null }))),
    transfers: ok([]),
    freezeRequests: ok([]),
  };
}

describe('buildTodayQueue — states', () => {
  it('a quiet roster that fully loaded is complete and empty (the only honest "nothing needs you")', () => {
    const q = buildTodayQueue(quiet(['a', 'b']), opts);
    expect(q.items).toEqual([]);
    expect(q.complete).toBe(true);
    expect(q.stale).toBe(false);
    expect(q.rosterSize).toBe(2);
  });

  it('a failed source makes its kinds "error", never empty — and the queue is not complete', () => {
    const s = quiet(['a']);
    s.checkIns = { data: undefined, error: true };
    const q = buildTodayQueue(s, opts);
    expect(q.status.checkin).toBe('error');
    expect(q.status.assessment).toBe('ready');
    expect(q.complete).toBe(false);
  });

  it('a source still loading leaves its kinds "loading"; the roster failing fails everything', () => {
    const s = quiet(['a']);
    s.threads = { data: undefined, error: false };
    expect(buildTodayQueue(s, opts).status.message).toBe('loading');
    const r = quiet(['a']);
    r.roster = { data: undefined, error: true };
    const q = buildTodayQueue(r, opts);
    expect(Object.values(q.status).every((v) => v === 'error')).toBe(true);
    expect(q.rosterSize).toBeNull();
  });

  it('data from a fetch that later failed is shown but marked stale', () => {
    const s = quiet(['a']);
    s.summaries = { data: [summary('a', { assessment: 'submitted' })], error: true };
    const q = buildTodayQueue(s, opts);
    expect(q.stale).toBe(true);
    expect(q.items.map((i) => i.kind)).toEqual(['assessment']);
  });

  it('zero clients: complete, empty, rosterSize 0 (the screen shows onboarding, not "caught up")', () => {
    const q = buildTodayQueue(quiet([]), opts);
    expect(q.rosterSize).toBe(0);
    expect(q.items).toEqual([]);
  });
});

describe('check-ins', () => {
  it('a submitted check-in this coach requested is one item, reviewable in place, routed to the client check-ins', () => {
    const s = quiet(['a']);
    s.checkIns = ok([{ clientId: 'a', latest: checkIn('a'), previous: checkIn('a', { id: '2026-10-04', weekStart: '2026-10-04', status: 'reviewed' }) }]);
    const [it] = buildTodayQueue(s, opts).items;
    expect(it).toMatchObject({ kind: 'checkin', clientId: 'a', to: '/coach/client/a/checkins', count: 1, dayKey: '2026-10-11' });
    expect(it.checkIn?.weekStart).toBe('2026-10-11');
    expect(it.previousCheckIn?.weekStart).toBe('2026-10-04');
  });

  it('another coach\'s check-in (pre-transfer) is not this coach\'s to review; a legacy one counts only after the relationship began', () => {
    const relStart = NOW - 10 * DAY_MS;
    expect(isMyCheckIn(checkIn('a', { coachId: 'coach-old' }), COACH, relStart)).toBe(false);
    expect(isMyCheckIn(checkIn('a', { coachId: '' as string, submittedAt: relStart - 1 }), COACH, relStart)).toBe(false);
    expect(isMyCheckIn(checkIn('a', { coachId: '' as string, submittedAt: relStart + 1 }), COACH, relStart)).toBe(true);
    expect(isMyCheckIn(checkIn('a', { status: 'requested' }), COACH, relStart)).toBe(false);
    expect(isMyCheckIn(checkIn('a', { status: 'reviewed' }), COACH, relStart)).toBe(false);

    const s = quiet(['a']);
    s.checkIns = ok([{ clientId: 'a', latest: checkIn('a', { coachId: 'coach-old' }), previous: null }]);
    expect(buildTodayQueue(s, opts).items).toEqual([]);
  });

  it('an older submitted week behind a newer requested one still waits — counted, routed to the page (not reviewable in place)', () => {
    const s = quiet(['a']);
    s.checkIns = ok([{ clientId: 'a', latest: checkIn('a', { id: '2026-10-11', status: 'requested', submittedAt: undefined }), previous: checkIn('a', { id: '2026-10-04', weekStart: '2026-10-04' }) }]);
    const [it] = buildTodayQueue(s, opts).items;
    expect(it).toMatchObject({ kind: 'checkin', count: 1, dayKey: '2026-10-04', to: '/coach/client/a/checkins' });
    expect(it.checkIn).toBeUndefined();
  });

  it('two submitted weeks = one row with count 2 (no duplicate rows)', () => {
    const s = quiet(['a']);
    s.checkIns = ok([{ clientId: 'a', latest: checkIn('a'), previous: checkIn('a', { id: '2026-10-04', weekStart: '2026-10-04', submittedAt: NOW - 9 * DAY_MS }) }]);
    const q = buildTodayQueue(s, opts);
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ count: 2, at: NOW - 9 * DAY_MS, dayKey: '2026-10-04' });
  });

  it('a check-in for a client no longer on the roster never shows', () => {
    const s = quiet(['a']);
    s.checkIns = ok([{ clientId: 'gone', latest: checkIn('gone'), previous: null }]);
    expect(buildTodayQueue(s, opts).items).toEqual([]);
  });
});

describe('assessments, freeze and transfer requests, messages', () => {
  it('assessments: submitted and updated-after-review only; the update is flagged', () => {
    const s = quiet(['a', 'b', 'c', 'd']);
    s.summaries = ok([summary('a', { assessment: 'submitted' }), summary('b', { assessment: 'updated_after_review' }), summary('c', { assessment: 'in_progress' }), summary('d')]);
    const items = buildTodayQueue(s, opts).items.filter((i) => i.kind === 'assessment');
    expect(items.map((i) => [i.clientId, i.flag ?? null, i.to])).toEqual([
      ['a', null, '/coach/client/a/assessment'],
      ['b', 'updated', '/coach/client/b/assessment'],
    ]);
  });

  it('freeze (B32-P1): the canonical pending requests — one row per client, the reason and the dates, never a client off the roster', () => {
    const s = quiet(['a', 'b']);
    s.freezeRequests = ok([
      freeze('a', { requestedAt: NOW - 3 * DAY_MS, reason: 'old reason' }),
      freeze('a', { requestedAt: NOW - DAY_MS, reason: 'new reason' }), // defensive: the server keeps one per client
      freeze('stranger'),
    ]);
    const items = buildTodayQueue(s, opts).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'freeze', clientId: 'a', text: 'new reason', to: '/coach/client/a/subscription', range: { from: NOW + DAY_MS, until: NOW + 8 * DAY_MS } });
  });

  it('freeze: the list failing is an error for that kind, never "no requests"', () => {
    const s = quiet(['a']);
    s.freezeRequests = { data: undefined, error: true };
    const q = buildTodayQueue(s, opts);
    expect(q.status.freeze).toBe('error');
    expect(q.complete).toBe(false);
  });

  it('transfer: pending requests for MY client only', () => {
    const s = quiet(['a']);
    const t = { id: 'coach-2__a', clientId: 'a', fromCoachId: COACH, toCoachId: 'coach-2', reason: 'Moving gyms', status: 'pending', requestedAt: NOW - DAY_MS };
    s.transfers = ok([t, { ...t, id: 'x', status: 'rejected' }, { ...t, id: 'y', fromCoachId: 'coach-3' }]);
    const items = buildTodayQueue(s, opts).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'transfer', text: 'Moving gyms', transfer: t });
  });

  it('messages: unread threads only, count + the client\'s own words; attachments and deleted lines are not previewed', () => {
    const s = quiet(['a', 'b', 'c']);
    s.threads = ok([
      { clientId: 'a', unreadForCoach: 2, last: { body: 'Can we move Friday?', fromRole: 'client', createdAt: NOW - 3600_000 } },
      { clientId: 'b', unreadForCoach: 1, last: { body: '', fromRole: 'client', attachment: { kind: 'image' }, createdAt: NOW - 60_000 } },
      { clientId: 'c', unreadForCoach: 0, last: { body: 'thanks', fromRole: 'client', createdAt: NOW } },
    ]);
    const items = buildTodayQueue(s, opts).items;
    expect(items.map((i) => [i.clientId, i.count, i.text ?? null, i.to])).toEqual([
      ['b', 1, null, '/coach/messages/b'], // newest first
      ['a', 2, 'Can we move Friday?', '/coach/messages/a'],
    ]);
  });
});

describe('subscriptions', () => {
  it('renewal due: a running term ending within 7 days (inclusive), trial flagged; beyond it is "coming up", not counted', () => {
    const s = quiet(['a', 'b', 'c', 'd']);
    s.relationships = ok([
      rel('a', { subscription: sub({ endAt: NOW + 7 * DAY_MS }) }),
      rel('b', { subscription: sub({ status: 'trial', endAt: NOW + 2 * DAY_MS + 1 }) }),
      rel('c', { subscription: sub({ endAt: NOW + 7 * DAY_MS + 1 }) }),
      rel('d', { subscription: sub({ endAt: NOW + 31 * DAY_MS }) }),
    ]);
    const q = buildTodayQueue(s, opts);
    expect(q.items.map((i) => [i.clientId, i.days, i.flag ?? null])).toEqual([
      ['b', 3, 'trial'],
      ['a', 7, null],
    ]);
    expect(q.comingUp.map((c) => [c.clientId, c.days])).toEqual([['c', 8]]);
    expect(q.counts.renewal).toBe(2);
  });

  it('lapsed: ran out on its own within 30 days; cancelled / ended / frozen / older lapses are not queued', () => {
    const s = quiet(['a', 'b', 'c', 'd', 'e']);
    s.relationships = ok([
      rel('a', { subscription: sub({ endAt: NOW - 4 * DAY_MS }) }),
      rel('b', { subscription: sub({ status: 'cancelled', endAt: NOW - DAY_MS, cancelledAt: NOW - DAY_MS }) }),
      rel('c', { subscription: sub({ status: 'ended', endAt: NOW - DAY_MS }) }),
      rel('d', { subscription: sub({ endAt: NOW - 31 * DAY_MS }) }),
      rel('e', { subscription: sub({ status: 'frozen', frozenFrom: NOW - DAY_MS, frozenUntil: NOW + 5 * DAY_MS, endAt: NOW + 3 * DAY_MS, freezeCredit: 6 * DAY_MS }) }),
    ]);
    const items = buildTodayQueue(s, opts).items;
    expect(items.map((i) => [i.kind, i.clientId, i.days])).toEqual([['lapsed', 'a', 4]]);
  });

  it('only active relationships of this coach count (an ended one never does)', () => {
    const s = quiet(['a']);
    s.relationships = ok([rel('a', { status: 'ended', subscription: sub({ endAt: NOW + DAY_MS }) }), rel('a', { coachId: 'coach-9', subscription: sub({ endAt: NOW + DAY_MS }) })]);
    expect(buildTodayQueue(s, opts).items).toEqual([]);
  });
});

describe('coaching: needs a plan, no workout in 7 days (O-7, O-20)', () => {
  it('needs a plan: no training AND no nutrition plan, running term, assessment reviewed — routed to the workout editor', () => {
    const s = quiet(['a', 'b', 'c', 'd']);
    s.summaries = ok([
      summary('a', { hasWorkoutPlan: false, hasNutritionPlan: false }),
      summary('b', { hasWorkoutPlan: false, hasNutritionPlan: true }), // nutrition-only coaching: not a gap
      summary('c', { hasWorkoutPlan: false, hasNutritionPlan: false, assessment: 'in_progress' }), // waiting on the client
      summary('d', { hasWorkoutPlan: false, hasNutritionPlan: false, assessment: 'submitted' }), // the review item comes first
    ]);
    const items = buildTodayQueue(s, opts).items;
    expect(items.filter((i) => i.kind === 'noPlan').map((i) => [i.clientId, i.to])).toEqual([['a', '/coach/client/a/workout']]);
    expect(items.filter((i) => i.kind === 'assessment').map((i) => i.clientId)).toEqual(['d']);
  });

  it('an older server without the plan fields: no plan-based items at all (never guessed)', () => {
    const s = quiet(['a']);
    s.summaries = ok([{ clientId: 'a', lastActivity: null, assessment: 'reviewed' }]);
    expect(buildTodayQueue(s, opts).items).toEqual([]);
  });

  it('no workout in 7 days: plan + running term + onboarded ≥ 7 days; exactly 7 days counts, 6 does not; never logged counts', () => {
    const s = quiet(['a', 'b', 'c', 'd']);
    s.summaries = ok([
      summary('a', { lastActivity: '2026-10-10' }), // 7 days
      summary('b', { lastActivity: '2026-10-11' }), // 6 days
      summary('c', { lastActivity: null }),
      summary('d', { lastActivity: null }),
    ]);
    s.relationships = ok([rel('a'), rel('b'), rel('c'), rel('d', { createdAt: NOW - 6 * DAY_MS })]); // d joined 6 days ago
    const items = buildTodayQueue(s, opts).items;
    expect(items.map((i) => [i.kind, i.clientId, i.days ?? null, i.to])).toEqual([
      ['inactive', 'c', null, '/coach/messages/c'], // never logged first
      ['inactive', 'a', 7, '/coach/messages/a'],
    ]);
  });

  it('frozen, expired, no-term and non-active accounts are never "inactive" or "needs a plan"', () => {
    const s = quiet(['f', 'x', 'n', 'z']);
    s.summaries = ok(['f', 'x', 'n', 'z'].map((id) => summary(id, { lastActivity: null })));
    s.relationships = ok([
      rel('f', { subscription: sub({ status: 'frozen', frozenFrom: NOW - DAY_MS, frozenUntil: NOW + DAY_MS, freezeCredit: 2 * DAY_MS }) }),
      rel('x', { subscription: sub({ endAt: NOW - 40 * DAY_MS }) }),
      rel('n', { subscription: undefined }),
      rel('z'),
    ]);
    s.roster = ok([{ id: 'f' }, { id: 'x' }, { id: 'n' }, { id: 'z', accountStatus: 'suspended' }]);
    expect(buildTodayQueue(s, opts).items).toEqual([]);
  });

  it('no training plan but a nutrition plan: neither "needs a plan" nor "inactive"', () => {
    const s = quiet(['a']);
    s.summaries = ok([summary('a', { hasWorkoutPlan: false, hasNutritionPlan: true, lastActivity: null })]);
    expect(buildTodayQueue(s, opts).items).toEqual([]);
  });
});

describe('order, counts, focus', () => {
  it('kinds follow the blueprint priority; counts add up per kind', () => {
    const s = quiet(['a', 'b', 'c']);
    s.checkIns = ok([{ clientId: 'c', latest: checkIn('c'), previous: null }]);
    s.threads = ok([{ clientId: 'a', unreadForCoach: 1, last: { body: 'hi', fromRole: 'client', createdAt: NOW } }]);
    s.relationships = ok([rel('a'), rel('b', { subscription: sub({ endAt: NOW + DAY_MS }) }), rel('c')]);
    s.summaries = ok([summary('a'), summary('b', { assessment: 'submitted' }), summary('c')]);
    const q = buildTodayQueue(s, opts);
    expect(q.items.map((i) => i.kind)).toEqual(['checkin', 'assessment', 'message', 'renewal']);
    expect(q.items.map((i) => i.section)).toEqual(['reviews', 'reviews', 'messages', 'subscriptions']);
    expect(q.counts).toMatchObject({ checkin: 1, assessment: 1, message: 1, renewal: 1, lapsed: 0 });
    expect(new Set(q.items.map((i) => i.key)).size).toBe(q.items.length);
  });

  it('?focus accepts a kind and the two legacy page names', () => {
    expect(parseFocus('checkins')).toBe('checkin');
    expect(parseFocus('assessments')).toBe('assessment');
    expect(parseFocus('message')).toBe('message');
    expect(parseFocus('bogus')).toBeNull();
    expect(parseFocus(null)).toBeNull();
  });

  it('a busy coach: 40 clients across every state stay one row per client per kind', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `c${i}`);
    const s = quiet(ids);
    s.threads = ok(ids.map((id, i) => ({ clientId: id, unreadForCoach: i % 3, last: { body: 'x', fromRole: 'client', createdAt: NOW - i } })));
    s.checkIns = ok(ids.map((id, i) => ({ clientId: id, latest: i % 4 === 0 ? checkIn(id) : null, previous: null })));
    const q = buildTodayQueue(s, opts);
    expect(q.counts.message).toBe(ids.filter((_, i) => i % 3 !== 0).length);
    expect(q.counts.checkin).toBe(10);
    expect(new Set(q.items.map((i) => i.key)).size).toBe(q.items.length);
  });
});
