import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const list = vi.fn();
const submit = vi.fn();
vi.mock('@/services/trpc', () => ({
  trpc: {
    checkIns: {
      get: { query: (...a: unknown[]) => get(...a) },
      list: { query: (...a: unknown[]) => list(...a) },
      submit: { mutate: (...a: unknown[]) => submit(...a) },
    },
  },
}));

import { getCheckIn, listCheckIns, submitCheckIn } from './checkInApi';

const W = '2026-10-12';
// A mid-week hand-over week (B3.4): coach A's completed record and coach B's own open record.
const coachA = { _id: `c1__${W}`, clientId: 'c1', weekStart: W, coachId: 'coach-a', status: 'reviewed', coachFeedback: 'A says well done' };
const coachB = { _id: `c1__${W}__coach-b`, clientId: 'c1', weekStart: W, coachId: 'coach-b', status: 'requested' };

beforeEach(() => {
  get.mockReset();
  list.mockReset();
  submit.mockReset();
});

describe('same-week records with different owners (B3.4)', () => {
  it('the record key — not the calendar week — is the id: two records of one week never share an id', async () => {
    list.mockResolvedValue([coachB, coachA]);
    const rows = await listCheckIns('c1');
    expect(rows.map((r) => r.id)).toEqual([`${W}__coach-b`, W]);
    expect(rows.map((r) => r.weekStart)).toEqual([W, W]); // the week stays the week
    expect(rows[1]).toMatchObject({ coachId: 'coach-a', coachFeedback: 'A says well done' }); // history keeps the previous coach's review
    expect(list).toHaveBeenCalledWith({ clientId: 'c1', byKey: true });
  });

  it('opens exactly the record a key names, telling the server it is a key', async () => {
    get.mockResolvedValue(coachB);
    expect(await getCheckIn('c1', `${W}__coach-b`)).toMatchObject({ id: `${W}__coach-b`, coachId: 'coach-b' });
    expect(get).toHaveBeenCalledWith({ clientId: 'c1', weekStart: `${W}__coach-b`, byKey: true });
    get.mockResolvedValue(coachA);
    expect(await getCheckIn('c1', W)).toMatchObject({ id: W, coachId: 'coach-a' });
    expect(get).toHaveBeenLastCalledWith({ clientId: 'c1', weekStart: W, byKey: true });
  });

  it('a record without the client prefix (older rows) falls back to its week', async () => {
    get.mockResolvedValue({ ...coachA, _id: 'legacy-id' });
    expect(await getCheckIn('c1', W)).toMatchObject({ id: W });
  });

  it('a submission says `byKey` only when its caller knows the id is a key (older queued submissions carry a week)', async () => {
    submit.mockResolvedValue({});
    await submitCheckIn('c1', `${W}__coach-b`, { notes: 'x' }, 'op-1', true);
    expect(submit).toHaveBeenLastCalledWith({ clientId: 'c1', weekStart: `${W}__coach-b`, notes: 'x', opId: 'op-1', byKey: true });
    await submitCheckIn('c1', W, { notes: 'y' }, 'op-old');
    expect(submit).toHaveBeenLastCalledWith({ clientId: 'c1', weekStart: W, notes: 'y', opId: 'op-old' });
  });
});
