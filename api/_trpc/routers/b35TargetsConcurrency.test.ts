import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachPlanDoc } from '../../coach-plans/_data.js';

/**
 * B3.5 owner review (B35-R2): daily targets are written with per-field optimistic concurrency
 * (`coachTargets.update`). A stale editor never overwrites a newer save; a change to another
 * target never conflicts; untouched targets are kept; authorization and the client notice are
 * unchanged.
 */
let mongod: MongoMemoryReplSet;
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

async function insertUser(over: Partial<UserDoc>): Promise<UserDoc> {
  const now = Date.now();
  const doc: UserDoc = {
    _id: 'user-1', email: `${over._id}@example.com`, emailLower: `${over._id}@example.com`, passwordHash: 'x', displayName: String(over._id), role: 'coach',
    accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...over,
  };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return doc;
}
const caller = (d: UserDoc) =>
  appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: { id: d._id, role: d.role, accountStatus: d.accountStatus, permissions: d.permissions, doc: d } as AuthedUser } as Context);
async function givePlan(coachId: string) {
  const now = Date.now();
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').insertOne({ _id: coachId, plan: 'trial', status: 'active', maxClients: 10, activeClientCount: 0, startedAt: now, endsAt: null, createdAt: now, updatedAt: now });
}
const outcome = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; message?: string; cause?: { reason?: string } }) => e.cause?.reason ?? e.code ?? 'ERR');
const doc = async (id: string) => (await getDb()).collection<Record<string, unknown>>('coachTargets').findOne({ _id: id } as never);
const notices = async (clientId: string) => (await getDb()).collection('notifications').countDocuments({ clientId, type: 'targets_updated' });

async function people() {
  const a = await insertUser({ _id: 'coach-a', role: 'coach' });
  const x = await insertUser({ _id: 'client-x', role: 'client' });
  await givePlan(a._id);
  await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
  return { a, x };
}

describe('daily targets — per-field compare-and-set (B35-R2)', () => {
  it('creates when nothing is set; a second editor that also thought nothing was set gets CONFLICT and writes nothing', async () => {
    const { a, x } = await people();
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 9000 }, expected: { steps: null } }))).toBe('OK');
    expect(await doc(x._id)).toMatchObject({ steps: 9000, updatedBy: a._id });
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 5000 }, expected: { steps: null } }))).toBe('TARGETS_CONFLICT');
    expect(await doc(x._id)).toMatchObject({ steps: 9000 });
  });

  it('two tabs editing from the same values: exactly one save lands, the other conflicts — never a silent overwrite', async () => {
    const { a, x } = await people();
    await caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 8000, cardioMin: 20 }, expected: { steps: null, cardioMin: null } });
    const results = await Promise.all([
      outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 10000 }, expected: { steps: 8000 } })),
      outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 6000 }, expected: { steps: 8000 } })),
    ]);
    expect(results.sort()).toEqual(['OK', 'TARGETS_CONFLICT']);
    expect([10000, 6000]).toContain((await doc(x._id))!.steps);
    // The loser reloads, reviews and retries from what is there now.
    const now = (await doc(x._id))!.steps as number;
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 7000 }, expected: { steps: now } }))).toBe('OK');
  });

  it('a change to another target never conflicts, and untouched targets (water, calories, protein) are kept', async () => {
    const { a, x } = await people();
    await (await getDb()).collection('coachTargets').insertOne({ _id: x._id, clientId: x._id, waterMl: 3000, steps: 8000, calories: 2100, protein: 150, updatedBy: 'someone', updatedAt: 1 } as never);
    // Someone else changes water meanwhile — the cardio editor's steps / minutes save is unaffected.
    await (await getDb()).collection('coachTargets').updateOne({ _id: x._id } as never, { $set: { waterMl: 3500 } });
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 9000, cardioMin: 25 }, expected: { steps: 8000, cardioMin: null } }))).toBe('OK');
    expect(await doc(x._id)).toMatchObject({ waterMl: 3500, steps: 9000, cardioMin: 25, calories: 2100, protein: 150 });
    // Clearing one target removes only it.
    await caller(a).coachTargets.update({ clientId: x._id, patch: { cardioMin: null }, expected: { cardioMin: 25 } });
    const d = await doc(x._id);
    expect(d).not.toHaveProperty('cardioMin');
    expect(d).toMatchObject({ waterMl: 3500, steps: 9000 });
    expect(await notices(x._id)).toBe(2); // the client is told, as with `set`
  });

  it('targets cleared elsewhere (a fresh-start transfer) after the editor read them: CONFLICT, nothing recreated', async () => {
    const { a, x } = await people();
    await caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 8000 }, expected: { steps: null } });
    await (await getDb()).collection('coachTargets').deleteOne({ _id: x._id } as never);
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 9000 }, expected: { steps: 8000 } }))).toBe('TARGETS_CONFLICT');
    expect(await doc(x._id)).toBeNull();
  });

  it('a write through the older whole-document `set` is detected by an editor that read before it', async () => {
    const { a, x } = await people();
    await caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 8000 }, expected: { steps: null } });
    await caller(a).coachTargets.set({ clientId: x._id, steps: 12000, waterMl: 2500 });
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 9000 }, expected: { steps: 8000 } }))).toBe('TARGETS_CONFLICT');
    expect(await doc(x._id)).toMatchObject({ steps: 12000, waterMl: 2500 });
  });

  it('authorization is unchanged: the client and an unrelated coach are refused; an admin may write; bad input is refused', async () => {
    const { a, x } = await people();
    const z = await insertUser({ _id: 'coach-z', role: 'coach' });
    await givePlan(z._id); // B38F-R3: a real coach with a live plan — the refusal is ownership
    const admin = await insertUser({ _id: 'admin-1', role: 'admin', permissions: ['clients.writeAll'] as never });
    expect(await outcome(caller(x).coachTargets.update({ patch: { steps: 1 }, expected: { steps: null } }))).toBe('FORBIDDEN');
    expect(await outcome(caller(z).coachTargets.update({ clientId: x._id, patch: { steps: 1 }, expected: { steps: null } }))).toBe('FORBIDDEN');
    expect(await outcome(caller(admin).coachTargets.update({ clientId: x._id, patch: { steps: 4000 }, expected: { steps: null } }))).toBe('OK');
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: {}, expected: {} }))).toBe('BAD_REQUEST');
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: 1 }, expected: {} }))).toBe('BAD_REQUEST');
    expect(await outcome(caller(a).coachTargets.update({ clientId: x._id, patch: { steps: -5 }, expected: { steps: 4000 } }))).toBe('BAD_REQUEST');
    expect(await doc(x._id)).toMatchObject({ steps: 4000 });
  });
});
