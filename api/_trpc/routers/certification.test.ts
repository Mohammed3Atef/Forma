/**
 * Backend contract certification (see docs/FORMA_FINAL_BACKEND_TRPC_AUDIT.md).
 *
 * Cross-cutting guarantees the per-router suites don't pin down:
 *  - the authorization matrix per guard class (anonymous / client / coach /
 *    admin / super_admin × active / pending / suspended)
 *  - tenant isolation (coach↔coach, client↔client, unassigned coach)
 *  - the transfer-request ownership guard
 *  - idempotency + concurrency (message retry, starter seed, invite claim,
 *    payment confirm, transfer accept)
 *  - the cron endpoint's auth + behaviour
 *  - rate limiting, input validation, error-message semantics
 *
 * Runs on a one-member replica set: `coachPlanRequests.confirm` and
 * `auth.signup` use real Mongo transactions.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb, usersCol } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientRelDoc } from '../../client/_lib/db.js';
import { DAY_MS, TRIAL_GRACE_DAYS, coachPlanRequestsCol, coachPlansCol, type CoachPlanDoc } from '../../coach-plans/_data.js';
import { messagesCol } from '../../messages/_data.js';
import { coachExercisesCol } from '../../coach-assets/_lib/db.js';
import cronHandler from '../../cron/daily-maintenance.js';

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
  const db = await getDb();
  await db.dropDatabase();
});

// ---- fixtures ---------------------------------------------------------------

function userDoc(overrides: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  const id = overrides._id ?? 'user-1';
  return {
    _id: id,
    email: `${id}@example.com`,
    emailLower: `${id}@example.com`,
    passwordHash: 'irrelevant',
    displayName: `Name ${id}`,
    role: 'coach',
    accountStatus: 'active',
    permissions: [],
    featureFlags: {},
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function insertUser(overrides: Partial<UserDoc>): Promise<UserDoc> {
  const doc = userDoc(overrides);
  await (await usersCol()).insertOne(doc);
  return doc;
}

function authed(doc: UserDoc): AuthedUser {
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

function ctxFor(user: AuthedUser | null, headers: Record<string, string> = {}): Context {
  return {
    req: { headers, cookies: {} } as unknown as VercelRequest,
    res: { setHeader: () => undefined } as unknown as VercelResponse,
    user,
  };
}

const caller = (doc: UserDoc | null) => appRouter.createCaller(ctxFor(doc ? authed(doc) : null));

async function givePlan(coachId: string, maxClients = 10, overrides: Partial<CoachPlanDoc> = {}): Promise<void> {
  const now = Date.now();
  await (await coachPlansCol()).insertOne({
    _id: coachId,
    plan: 'trial',
    status: 'active',
    maxClients,
    startedAt: now,
    endsAt: now + 15 * DAY_MS,
    activeClientCount: 0,
    history: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function assign(coachId: string, clientId: string, status: CoachClientRelDoc['status'] = 'active'): Promise<void> {
  const db = await getDb();
  await db.collection<CoachClientRelDoc>('coachClients').insertOne({ _id: `${coachId}__${clientId}`, coachId, clientId, status });
  if (status === 'active') await (await usersCol()).updateOne({ _id: clientId }, { $set: { assignedCoachId: coachId } });
}

const code = (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code ?? 'ERR');

// ---- 1. authorization matrix ------------------------------------------------

describe('authorization matrix — one representative per guard class', () => {
  it('publicProcedure: anonymous may call', async () => {
    expect((await caller(null).health.ping()).ok).toBe(true);
    expect(Array.isArray(await caller(null).coachPlanTiers.public())).toBe(true);
  });

  it('authedProcedure: anonymous is UNAUTHORIZED; pending/suspended accounts still reach it (own-data reads + offline flush)', async () => {
    const pending = await insertUser({ _id: 'p', role: 'coach', accountStatus: 'pending' });
    const suspended = await insertUser({ _id: 's', role: 'client', accountStatus: 'suspended' });
    expect(await code(caller(null).sync.pull({ collection: 'x' }))).toBe('UNAUTHORIZED');
    expect(await code(caller(pending).sync.pull({ collection: 'x' }))).toBe('OK');
    expect(await code(caller(suspended).sync.pull({ collection: 'x' }))).toBe('OK');
    expect(await code(caller(suspended).profile.get())).toBe('OK');
  });

  it('protectedProcedure: a non-active account is FORBIDDEN with a status-specific message', async () => {
    const pending = await insertUser({ _id: 'p', role: 'coach', accountStatus: 'pending' });
    await expect(caller(pending).usage.recordActiveDay()).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Account is not active' });
    await expect(caller(pending).coachClients.assign({ clientId: 'c', subscription: { status: 'trial' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('roleProcedure(coach): every other role is FORBIDDEN, including super_admin', async () => {
    const client = await insertUser({ _id: 'c', role: 'client' });
    const admin = await insertUser({ _id: 'a', role: 'admin' });
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    const coach = await insertUser({ _id: 'co', role: 'coach' });
    expect(await code(caller(client).coachPlanRequests.get())).toBe('FORBIDDEN');
    expect(await code(caller(admin).coachPlanRequests.get())).toBe('FORBIDDEN');
    expect(await code(caller(sup).coachPlanRequests.get())).toBe('FORBIDDEN');
    expect(await code(caller(coach).coachPlanRequests.get())).toBe('OK');
  });

  it('roleProcedureNoActive(coach): a suspended coach still reaches coachPlans.me (NOT_FOUND, not FORBIDDEN)', async () => {
    const coach = await insertUser({ _id: 'co', role: 'coach', accountStatus: 'suspended' });
    expect(await code(caller(coach).coachPlans.me())).toBe('NOT_FOUND');
  });

  it('roleProcedure(super_admin): plain admin is FORBIDDEN', async () => {
    const admin = await insertUser({ _id: 'a', role: 'admin' });
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    expect(await code(caller(admin).coachPlanTiers.save({ key: 'x', maxClients: 1, priceMonthly: 1 }))).toBe('FORBIDDEN');
    expect(await code(caller(admin).coachPlanRequests.listPending())).toBe('FORBIDDEN');
    expect(await code(caller(sup).coachPlanRequests.listPending())).toBe('OK');
  });

  it('permissionProcedure: a COACH holds no platform-wide permission — every admin oversight read is FORBIDDEN (was a cross-tenant leak)', async () => {
    const coach = await insertUser({ _id: 'co', role: 'coach' });
    const client = await insertUser({ _id: 'c', role: 'client' });
    const admin = await insertUser({ _id: 'a', role: 'admin' });
    const c = caller(coach);
    expect(await code(c.adminUsers.list({}))).toBe('FORBIDDEN');
    expect(await code(c.adminUsers.byRole({ role: 'client' }))).toBe('FORBIDDEN');
    expect(await code(c.adminMembers.get())).toBe('FORBIDDEN');
    expect(await code(c.adminGrowth.get())).toBe('FORBIDDEN');
    expect(await code(c.adminStats.get())).toBe('FORBIDDEN');
    expect(await code(c.usage.fetch())).toBe('FORBIDDEN');
    expect(await code(c.flags.list())).toBe('FORBIDDEN');
    expect(await code(c.adminAudit.list({}))).toBe('FORBIDDEN');
    expect(await code(c.transfers.list({ type: 'pending' }))).toBe('FORBIDDEN');
    expect(await code(caller(client).adminUsers.list({}))).toBe('FORBIDDEN');
    // …while the real oversight role keeps them.
    const a = caller(admin);
    expect(await code(a.adminUsers.list({}))).toBe('OK');
    expect(await code(a.adminMembers.get())).toBe('OK');
    expect(await code(a.adminStats.get())).toBe('OK');
    expect(await code(a.flags.list())).toBe('OK');
  });

  it('adminUsers.searchClients: the one lookup a coach legitimately needs stays open to coaches (and admins), never clients', async () => {
    const coach = await insertUser({ _id: 'co', role: 'coach' });
    const client = await insertUser({ _id: 'c', role: 'client' });
    const admin = await insertUser({ _id: 'a', role: 'admin' });
    expect(await code(caller(coach).adminUsers.searchClients({ value: 'c@example.com' }))).toBe('OK');
    expect(await code(caller(admin).adminUsers.searchClients({ value: 'c@example.com' }))).toBe('OK');
    expect(await code(caller(client).adminUsers.searchClients({ value: 'c@example.com' }))).toBe('FORBIDDEN');
  });

  it('plain admin (clients.readAll, no writeAll) can READ client data but cannot write it or enter a message thread; super_admin can', async () => {
    const admin = await insertUser({ _id: 'a', role: 'admin' });
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    const client = await insertUser({ _id: 'c', role: 'client' });
    expect(await code(caller(admin).profile.get({ clientId: client._id }))).toBe('OK');
    expect(await code(caller(admin).coachTargets.set({ clientId: client._id, calories: 2000 } as never))).toBe('FORBIDDEN');
    expect(await code(caller(admin).messages.list({ clientId: client._id }))).toBe('FORBIDDEN');
    expect(await code(caller(sup).messages.list({ clientId: client._id }))).toBe('OK');
  });
});

// ---- 2. tenant isolation ----------------------------------------------------

describe('tenant isolation', () => {
  it('coach B cannot read coach A: assets, roster, dashboard summaries, check-ins, relationships — an admin can', async () => {
    const coachA = await insertUser({ _id: 'coachA', role: 'coach' });
    const coachB = await insertUser({ _id: 'coachB', role: 'coach' });
    const admin = await insertUser({ _id: 'admin', role: 'admin' });
    const client = await insertUser({ _id: 'client', role: 'client' });
    await givePlan(coachA._id);
    await assign(coachA._id, client._id);
    await caller(coachA).coachAssets.exercises.save({
      id: 'ex-1', name: 'Squat', targetMuscle: 'Legs', warmupSets: '1 set', workingSets: 3, repRange: '8-12', rir: '1-2', tempo: '2010', notes: { en: '', ar: '' }, restSec: 90, videoId: null,
    });

    const b = caller(coachB);
    expect(await code(b.coachAssets.exercises.list({ coachId: coachA._id }))).toBe('FORBIDDEN');
    expect(await code(b.coachAssets.workoutTemplates.list({ coachId: coachA._id }))).toBe('FORBIDDEN');
    expect(await code(b.coachClients.listMyClientUsers({ coachId: coachA._id }))).toBe('FORBIDDEN');
    expect(await code(b.coachClients.dashboardSummaries({ coachId: coachA._id }))).toBe('FORBIDDEN');
    expect(await code(b.checkIns.listForCoachClients({ coachId: coachA._id }))).toBe('FORBIDDEN');
    expect(await code(b.coachClients.get({ id: `${coachA._id}__${client._id}` }))).toBe('FORBIDDEN');
    expect(await code(b.messages.coachThreadsSummary({ coachId: coachA._id }))).toBe('FORBIDDEN');
    expect(await code(b.invites.list({ coachId: coachA._id }))).toBe('FORBIDDEN');

    const a = caller(admin);
    expect(await code(a.coachAssets.exercises.list({ coachId: coachA._id }))).toBe('OK');
    expect(await code(a.coachClients.listMyClientUsers({ coachId: coachA._id }))).toBe('OK');
    expect(await code(a.checkIns.listForCoachClients({ coachId: coachA._id }))).toBe('OK');
  });

  it("an unassigned coach cannot read or write a client's data; the assigned coach can; a different client never can", async () => {
    const coachA = await insertUser({ _id: 'coachA', role: 'coach' });
    const coachB = await insertUser({ _id: 'coachB', role: 'coach' });
    const clientA = await insertUser({ _id: 'clientA', role: 'client' });
    const clientB = await insertUser({ _id: 'clientB', role: 'client' });
    await assign(coachA._id, clientA._id);

    const target = { clientId: clientA._id };
    for (const who of [coachB, clientB]) {
      const c = caller(who);
      expect(await code(c.profile.get(target))).toBe('FORBIDDEN');
      expect(await code(c.logsWorkout.list(target))).toBe('FORBIDDEN');
      expect(await code(c.photos.list(target))).toBe('FORBIDDEN');
      expect(await code(c.checkIns.list(target))).toBe('FORBIDDEN');
      expect(await code(c.measurements.list(target))).toBe('FORBIDDEN');
      expect(await code(c.coachNotes.list(target))).toBe('FORBIDDEN');
      expect(await code(c.messages.list(target))).toBe('FORBIDDEN');
      expect(await code(c.messages.send({ ...target, text: 'hi' }))).toBe('FORBIDDEN');
      expect(await code(c.coachTargets.set({ ...target, calories: 1 } as never))).toBe('FORBIDDEN');
      expect(await code(c.workoutPlan.get(target))).toBe('FORBIDDEN');
    }
    const a = caller(coachA);
    expect(await code(a.profile.get(target))).toBe('OK');
    expect(await code(a.messages.list(target))).toBe('OK');
    expect(await code(a.checkIns.list(target))).toBe('OK');
  });

  it('a client cannot reach another client even by naming them; their own reads work regardless of account status', async () => {
    const clientA = await insertUser({ _id: 'clientA', role: 'client', accountStatus: 'suspended' });
    const clientB = await insertUser({ _id: 'clientB', role: 'client' });
    expect(await code(caller(clientB).profile.get({ clientId: clientA._id }))).toBe('FORBIDDEN');
    expect(await code(caller(clientB).subscriptionRequest.get({ clientId: clientA._id }))).toBe('FORBIDDEN');
    expect(await code(caller(clientA).profile.get())).toBe('OK');
    // …but a suspended client cannot WRITE their own data.
    expect(await code(caller(clientA).measurements.save({ date: '2026-01-01', values: { weightKg: 80 } }))).toBe('FORBIDDEN');
  });

  it('sync: every write lands under the caller id (no user-supplied owner field), reads never cross users', async () => {
    const a = await insertUser({ _id: 'ua', role: 'client' });
    const b = await insertUser({ _id: 'ub', role: 'client' });
    await caller(a).sync.push({ collection: 'weightLogs', records: [{ id: '2026-01-01', updatedAt: 1, data: { kg: 80 } }] });
    const db = await getDb();
    const rows = await db.collection('syncRecords').find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].clientId).toBe(a._id);
    expect((await caller(b).sync.pull({ collection: 'weightLogs' })).records).toHaveLength(0);
    expect((await caller(a).sync.pull({ collection: 'weightLogs' })).records).toHaveLength(1);
    await caller(b).sync.wipe();
    expect((await caller(a).sync.pull({ collection: 'weightLogs' })).records).toHaveLength(1); // B's wipe never touches A
  });

  it('adminUsers.get returns contact details only to self / related users / users.read holders — a name card to everyone else', async () => {
    const coachA = await insertUser({ _id: 'coachA', role: 'coach', phone: '111' });
    const coachB = await insertUser({ _id: 'coachB', role: 'coach', phone: '222' });
    const client = await insertUser({ _id: 'client', role: 'client', phone: '333' });
    const admin = await insertUser({ _id: 'admin', role: 'admin' });
    await assign(coachA._id, client._id, 'ended'); // even an ENDED relationship keeps the two mutually visible

    const unrelated = await caller(coachB).adminUsers.get({ id: coachA._id });
    expect(unrelated.displayName).toBe(coachA.displayName);
    expect(unrelated.email).toBe('');
    expect(unrelated.phone).toBeUndefined();

    expect((await caller(coachA).adminUsers.get({ id: client._id })).phone).toBe('333');
    expect((await caller(client).adminUsers.get({ id: coachA._id })).phone).toBe('111');
    expect((await caller(client).adminUsers.get({ id: coachB._id })).phone).toBeUndefined();
    expect((await caller(admin).adminUsers.get({ id: coachB._id })).phone).toBe('222');
    expect((await caller(coachB).adminUsers.get({ id: coachB._id })).phone).toBe('222');
  });
});

// ---- 3. transfer requests ---------------------------------------------------

describe('transfer requests — ownership is asserted, not trusted', () => {
  async function scenario() {
    const coachC = await insertUser({ _id: 'coachC', role: 'coach' }); // the real coach
    const coachA = await insertUser({ _id: 'coachA', role: 'coach' }); // wants the client
    const coachB = await insertUser({ _id: 'coachB', role: 'coach' }); // colluding "from"
    const client = await insertUser({ _id: 'client', role: 'client' });
    await givePlan(coachA._id);
    await givePlan(coachB._id);
    await givePlan(coachC._id);
    await assign(coachC._id, client._id);
    return { coachA, coachB, coachC, client };
  }

  it('create refuses a fromCoachId that does not currently coach the client (the collusion/hijack path)', async () => {
    const { coachA, coachB, coachC, client } = await scenario();
    await expect(
      caller(coachA).transfers.create({ clientId: client._id, fromCoachId: coachB._id, reason: 'x' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    // Naming the REAL coach works.
    const req = await caller(coachA).transfers.create({ clientId: client._id, fromCoachId: coachC._id, reason: 'x' });
    expect(req.status).toBe('pending');
  });

  it('accept re-checks the relationship at approval time and rolls the request back if the move fails', async () => {
    const { coachA, coachC, client } = await scenario();
    const req = await caller(coachA).transfers.create({ clientId: client._id, fromCoachId: coachC._id, reason: 'x' });
    // The relationship ends between request and approval.
    await caller(coachC).coachClients.end({ id: `${coachC._id}__${client._id}` });
    await expect(caller(coachC).transfers.resolve({ id: req._id, action: 'accept' })).rejects.toMatchObject({ code: 'CONFLICT' });
    const after = await caller(coachA).transfers.list({ type: 'outgoing' });
    expect(after[0].status).toBe('pending'); // put back, not left falsely 'accepted'
    const rels = await (await getDb()).collection<CoachClientRelDoc>('coachClients').find({ clientId: client._id, status: 'active' }).toArray();
    expect(rels).toHaveLength(0); // and nothing moved
  });

  it('two concurrent accepts: exactly one moves the client, the other is CONFLICT, the client ends with ONE active coach', async () => {
    const { coachA, coachC, client } = await scenario();
    const req = await caller(coachA).transfers.create({ clientId: client._id, fromCoachId: coachC._id, reason: 'x' });
    const results = await Promise.allSettled([
      caller(coachC).transfers.resolve({ id: req._id, action: 'accept' }),
      caller(coachC).transfers.resolve({ id: req._id, action: 'accept' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && (r.reason as { code: string }).code === 'CONFLICT')).toHaveLength(1);
    const rels = await (await getDb()).collection<CoachClientRelDoc>('coachClients').find({ clientId: client._id, status: 'active' }).toArray();
    expect(rels.map((r) => r.coachId)).toEqual([coachA._id]);
    expect((await (await usersCol()).findOne({ _id: client._id }))?.assignedCoachId).toBe(coachA._id);
  });
});

// ---- 4. idempotency + concurrency -------------------------------------------

describe('idempotency and races', () => {
  it('messages.send: N concurrent retries with the same clientMsgId create exactly ONE message', async () => {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    const client = await insertUser({ _id: 'client', role: 'client' });
    await assign(coach._id, client._id);
    const c = caller(client);
    const sends = await Promise.all(Array.from({ length: 6 }, () => c.messages.send({ clientId: client._id, text: 'hello', clientMsgId: 'k-1' })));
    expect(new Set(sends.map((m) => m.id)).size).toBe(1);
    expect(await (await messagesCol()).countDocuments({ clientId: client._id })).toBe(1);
    // A different key is a different message.
    await c.messages.send({ clientId: client._id, text: 'hello', clientMsgId: 'k-2' });
    expect(await (await messagesCol()).countDocuments({ clientId: client._id })).toBe(2);
  });

  it('messages.send: an empty message (no text, no attachment) is rejected server-side', async () => {
    const client = await insertUser({ _id: 'client', role: 'client' });
    await expect(caller(client).messages.send({ clientId: client._id, text: '   ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await code(caller(client).messages.send({ clientId: client._id, text: '', attachment: { url: 'https://x/y.png', kind: 'image' } }))).toBe('OK');
  });

  it('seedStarterLibrary: two concurrent seeds never duplicate a row (unique {coachId,id}) and converge to one full library', async () => {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    await Promise.allSettled([caller(coach).coachAssets.seedStarterLibrary(), caller(coach).coachAssets.seedStarterLibrary()]);
    const third = await caller(coach).coachAssets.seedStarterLibrary(); // fills any gap the race left
    expect(third.exercises.inserted).toBe(0);
    const col = await coachExercisesCol();
    const total = await col.countDocuments({ coachId: coach._id });
    const distinct = await col.distinct('id', { coachId: coach._id });
    expect(total).toBeGreaterThan(0);
    expect(total).toBe(distinct.length);
  });

  it('invites.claim: two concurrent claims of ONE code → exactly one account + one relationship', async () => {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    await givePlan(coach._id);
    const invite = await caller(coach).invites.create({});
    const pub = caller(null);
    const results = await Promise.allSettled([
      pub.invites.claim({ code: invite._id, email: 'one@example.com', phone: '1', password: 'password123' }),
      pub.invites.claim({ code: invite._id, email: 'two@example.com', phone: '2', password: 'password123' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const db = await getDb();
    expect(await db.collection('users').countDocuments({ role: 'client' })).toBe(1);
    expect(await db.collection('coachClients').countDocuments({ coachId: coach._id })).toBe(1);
    expect((await (await coachPlansCol()).findOne({ _id: coach._id }))?.activeClientCount).toBe(1);
  });

  it('coachPlanRequests.confirm: two concurrent confirms → one confirmed, one CONFLICT, the plan applied once', async () => {
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    await caller(sup).coachPlanTiers.save({ key: 'pro', label: 'Pro', maxClients: 25, priceMonthly: 499 });
    await caller(coach).coachPlans.createTrial();
    const req = await caller(coach).coachPlanRequests.submit({ tierKey: 'pro' });
    const results = await Promise.allSettled([
      caller(sup).coachPlanRequests.confirm({ requestId: req.id }),
      caller(sup).coachPlanRequests.confirm({ requestId: req.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && (r.reason as { code: string }).code === 'CONFLICT')).toHaveLength(1);
    const plan = await (await coachPlansCol()).findOne({ _id: coach._id });
    expect(plan?.plan).toBe('pro');
    expect(plan?.history?.filter((h) => h.action === 'request.confirmed')).toHaveLength(1);
  });

  it('an unconfirmed paid request never changes the coach entitlements the cap check reads', async () => {
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    await caller(sup).coachPlanTiers.save({ key: 'pro', label: 'Pro', maxClients: 25, priceMonthly: 499 });
    const trial = await caller(coach).coachPlans.createTrial();
    await caller(coach).coachPlanRequests.submit({ tierKey: 'pro' });
    const plan = await (await coachPlansCol()).findOne({ _id: coach._id });
    expect(plan?.maxClients).toBe(trial.maxClients);
    expect(plan?.plan).toBe('trial');
  });
});

// ---- 5. cron endpoint -------------------------------------------------------

describe('cron /api/cron/daily-maintenance', () => {
  function mockHttp(headers: Record<string, string> = {}) {
    let status = 0;
    let body: unknown;
    const req = { headers } as unknown as VercelRequest;
    const res = {
      status(s: number) {
        status = s;
        return res;
      },
      json(b: unknown) {
        body = b;
        return res;
      },
    } as unknown as VercelResponse;
    return { req, res, status: () => status, body: () => body };
  }

  it('fails CLOSED when CRON_SECRET is unset, rejects a wrong bearer, and never writes in either case', async () => {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    await givePlan(coach._id, 2, { endsAt: Date.now() - 10 * DAY_MS });
    const saved = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      const a = mockHttp({ authorization: 'Bearer anything' });
      await cronHandler(a.req, a.res);
      expect(a.status()).toBe(503);

      process.env.CRON_SECRET = 'top-secret';
      const b = mockHttp({ authorization: 'Bearer wrong' });
      await cronHandler(b.req, b.res);
      expect(b.status()).toBe(401);
      const c = mockHttp({});
      await cronHandler(c.req, c.res);
      expect(c.status()).toBe(401);

      expect(await (await coachPlanRequestsCol()).countDocuments({})).toBe(0);
      expect((await (await usersCol()).findOne({ _id: coach._id }))?.accountStatus).toBe('active');
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });

  it('with the right secret: raises ONE trial_expired request, pends the account only after the grace period, and is idempotent', async () => {
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    await caller(sup).coachPlanTiers.save({ key: 'pro', label: 'Pro', maxClients: 25, priceMonthly: 499, signupEnabled: true, publicVisible: true });
    const justExpired = await insertUser({ _id: 'c1', role: 'coach' });
    const longExpired = await insertUser({ _id: 'c2', role: 'coach' });
    const stillOnTrial = await insertUser({ _id: 'c3', role: 'coach' });
    await givePlan(justExpired._id, 2, { endsAt: Date.now() - 1 });
    await givePlan(longExpired._id, 2, { endsAt: Date.now() - (TRIAL_GRACE_DAYS + 1) * DAY_MS });
    await givePlan(stillOnTrial._id, 2, { endsAt: Date.now() + DAY_MS });

    const saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'top-secret';
    try {
      const run = async () => {
        const h = mockHttp({ authorization: 'Bearer top-secret' });
        await cronHandler(h.req, h.res);
        expect(h.status()).toBe(200);
        return h.body() as { trialExpiry: { requestsCreated: number; accountsPended: number } };
      };
      const first = await run();
      expect(first.trialExpiry.requestsCreated).toBe(2);
      expect(first.trialExpiry.accountsPended).toBe(1);

      const reqs = await (await coachPlanRequestsCol()).find({}).toArray();
      expect(reqs.map((r) => r.coachId).sort()).toEqual(['c1', 'c2']);
      expect(reqs.every((r) => r.type === 'trial_expired' && r.status === 'awaiting')).toBe(true);
      const users = await usersCol();
      expect((await users.findOne({ _id: 'c1' }))?.accountStatus).toBe('active'); // inside grace
      expect((await users.findOne({ _id: 'c2' }))?.accountStatus).toBe('pending'); // past grace
      expect((await users.findOne({ _id: 'c3' }))?.accountStatus).toBe('active');
      expect(await (await coachPlanRequestsCol()).countDocuments({ coachId: 'c3' })).toBe(0);

      const second = await run(); // idempotent
      expect(second.trialExpiry.requestsCreated).toBe(0);
      expect(second.trialExpiry.accountsPended).toBe(0);
      expect(await (await coachPlanRequestsCol()).countDocuments({})).toBe(2);

      // Confirming payment un-pends the long-expired coach in the same transaction that activates Pro.
      const c2Req = reqs.find((r) => r.coachId === 'c2')!;
      await caller(sup).coachPlanRequests.confirm({ requestId: c2Req._id });
      expect((await users.findOne({ _id: 'c2' }))?.accountStatus).toBe('active');
      expect((await (await coachPlansCol()).findOne({ _id: 'c2' }))?.plan).toBe('pro');
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });
});

// ---- 6. rate limiting, validation, error semantics --------------------------

describe('rate limits, validation, error semantics', () => {
  it('auth.login: the 11th attempt for one (ip, email) inside the window is TOO_MANY_REQUESTS — before any password work', async () => {
    await insertUser({ _id: 'u', role: 'coach', email: 'u@example.com', emailLower: 'u@example.com' });
    const pub = caller(null);
    for (let i = 0; i < 10; i += 1) {
      await expect(pub.auth.login({ email: 'u@example.com', password: 'wrong-password' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    await expect(pub.auth.login({ email: 'u@example.com', password: 'wrong-password' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    // A different email is a different bucket.
    await expect(pub.auth.login({ email: 'other@example.com', password: 'x' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('zod rejects the obvious garbage: zero/negative terms, invalid enums, negative limits, bad cursors are tolerated', async () => {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    const client = await insertUser({ _id: 'client', role: 'client' });
    const admin = await insertUser({ _id: 'admin', role: 'admin' });
    await givePlan(coach._id);
    await assign(coach._id, client._id);
    const c = caller(coach);
    expect(await code(c.coachClients.assign({ clientId: 'x', subscription: { status: 'active', months: 0 } }))).toBe('BAD_REQUEST');
    expect(await code(c.coachClients.assign({ clientId: 'x', subscription: { status: 'bogus' as never } }))).toBe('BAD_REQUEST');
    expect(await code(c.invites.create({ ttlMs: -5 }))).toBe('BAD_REQUEST');
    expect(await code(c.logsWorkout.list({ clientId: client._id, limit: -1 }))).toBe('BAD_REQUEST');
    expect(await code(c.logsWorkout.list({ clientId: client._id, limit: 1.5 }))).toBe('BAD_REQUEST');
    expect(await code(c.messages.react({ clientId: client._id, id: 'm', value: '🔥' as never }))).toBe('BAD_REQUEST');
    expect(await code(c.sync.pull({ collection: 'x', since: -1 }))).toBe('BAD_REQUEST');
    expect(await code(c.coachClients.end({ id: 'no-separator' }))).toBe('BAD_REQUEST');
    expect(await code(c.foodSearch.search({ query: 'a' }))).toBe('BAD_REQUEST'); // min 2 chars
    // A garbage cursor is tolerated (first page), not a crash.
    expect(await code(caller(admin).adminUsers.list({ cursor: 'not-a-cursor' }))).toBe('OK');
  });

  it('error semantics: a coach with NO plan is told that, not "at their client limit"; an already-resolved request is CONFLICT, not NOT_FOUND', async () => {
    const coachNoPlan = await insertUser({ _id: 'coach', role: 'coach' });
    const client = await insertUser({ _id: 'client', role: 'client' });
    await expect(caller(coachNoPlan).coachClients.assign({ clientId: client._id, subscription: { status: 'trial' } })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This coach has no active plan yet',
    });
    await givePlan(coachNoPlan._id, 1, { activeClientCount: 1 });
    await expect(caller(coachNoPlan).coachClients.assign({ clientId: client._id, subscription: { status: 'trial' } })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Coach is at their client limit',
    });

    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    await caller(sup).coachPlanTiers.save({ key: 'pro', label: 'Pro', maxClients: 25, priceMonthly: 499 });
    const coach2 = await insertUser({ _id: 'coach2', role: 'coach' });
    await caller(coach2).coachPlans.createTrial();
    const req = await caller(coach2).coachPlanRequests.submit({ tierKey: 'pro' });
    await caller(sup).coachPlanRequests.reject({ requestId: req.id });
    await expect(caller(sup).coachPlanRequests.confirm({ requestId: req.id })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(caller(sup).coachPlanRequests.confirm({ requestId: 'does-not-exist' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('legacy data: a plan doc missing activeClientCount is treated as "no plan", never as unlimited; a message without mimeType lists fine', async () => {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    const client = await insertUser({ _id: 'client', role: 'client' });
    const now = Date.now();
    await (await coachPlansCol()).insertOne({ _id: coach._id, plan: 'trial', status: 'active', maxClients: 5, startedAt: now, endsAt: null, createdAt: now, updatedAt: now });
    await expect(caller(coach).coachClients.assign({ clientId: client._id, subscription: { status: 'trial' } })).rejects.toMatchObject({ code: 'CONFLICT' });
    await assign(coach._id, client._id);
    await (await messagesCol()).insertOne({ _id: 'old', clientId: client._id, fromUserId: coach._id, fromRole: 'coach', body: '', attachment: { url: 'https://x/f.bin', kind: 'file' }, seenAt: null, createdAt: now, updatedAt: now });
    const list = await caller(client).messages.list({ clientId: client._id });
    expect(list.messages[0].attachment?.mimeType).toBeUndefined();
  });
});
