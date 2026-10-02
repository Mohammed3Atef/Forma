/**
 * Coverage sweep for the leaf procedures no other suite exercised (see
 * docs/FORMA_FINAL_BACKEND_TRPC_AUDIT.md §36). Each block asserts a real
 * business result (persisted state / returned shape) AND at least one
 * negative — never just "didn't throw".
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb, usersCol } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientRelDoc } from '../../client/_lib/db.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
}, 60_000);

afterAll(async () => {
  await mongod.stop();
});

beforeEach(async () => {
  const db = await getDb();
  await db.dropDatabase();
});

function userDoc(overrides: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  const id = overrides._id ?? 'user-1';
  return {
    _id: id, email: `${id}@example.com`, emailLower: `${id}@example.com`, passwordHash: 'x', displayName: `Name ${id}`,
    role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now,
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
function ctxFor(user: AuthedUser | null): Context {
  return { req: { headers: {}, cookies: {} } as unknown as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
}
const caller = (doc: UserDoc | null) => appRouter.createCaller(ctxFor(doc ? authed(doc) : null));
async function assign(coachId: string, clientId: string): Promise<void> {
  const db = await getDb();
  await db.collection<CoachClientRelDoc>('coachClients').insertOne({ _id: `${coachId}__${clientId}`, coachId, clientId, status: 'active' });
}
const code = (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code ?? 'ERR');

const loc = { en: 'x', ar: 'x' };

describe('usage', () => {
  it('recordActiveDay is idempotent per user/day, bump counts searches, fetch aggregates DAU for admins only', async () => {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    const admin = await insertUser({ _id: 'admin', role: 'admin' });
    await caller(coach).usage.recordActiveDay();
    await caller(coach).usage.recordActiveDay();
    await caller(coach).usage.bump({ field: 'searches' });
    await caller(coach).usage.bump({ field: 'searches' });
    const db = await getDb();
    expect(await db.collection('activeDays').countDocuments({ uid: coach._id })).toBe(1);
    const stats = await caller(admin).usage.fetch();
    expect(stats.dau).toBe(1);
    expect(stats.searches7d).toBe(2);
    expect(stats.activeTrend).toHaveLength(8);
    expect(await code(caller(coach).usage.bump({ field: 'clicks' as never }))).toBe('BAD_REQUEST');
  });
});

describe('coachAssets — the factory-generated kinds not covered elsewhere', () => {
  it('nutritionTemplates: save/list/get/update/delete round-trip, cross-coach isolation', async () => {
    const a = await insertUser({ _id: 'a', role: 'coach' });
    const b = await insertUser({ _id: 'b', role: 'coach' });
    const body = { id: 'nt-1', name: 'Cut', meals: [], targets: { calories: 2000, protein: 150, carbs: 200, fats: 60 }, supplements: [], waterTargetMl: 3000 };
    await caller(a).coachAssets.nutritionTemplates.save(body);
    expect((await caller(a).coachAssets.nutritionTemplates.list({})).map((t) => t.id)).toEqual(['nt-1']);
    expect((await caller(a).coachAssets.nutritionTemplates.get({ id: 'nt-1' })).name).toBe('Cut');
    await caller(a).coachAssets.nutritionTemplates.update({ id: 'nt-1', name: 'Bulk' });
    expect((await caller(a).coachAssets.nutritionTemplates.get({ id: 'nt-1' })).name).toBe('Bulk');
    expect(await code(caller(b).coachAssets.nutritionTemplates.get({ id: 'nt-1', coachId: a._id }))).toBe('FORBIDDEN');
    expect(await code(caller(b).coachAssets.nutritionTemplates.update({ id: 'nt-1', name: 'Hijack' }))).toBe('NOT_FOUND');
    expect(await code(caller(b).coachAssets.nutritionTemplates.delete({ id: 'nt-1' }))).toBe('NOT_FOUND');
    await caller(a).coachAssets.nutritionTemplates.delete({ id: 'nt-1' });
    expect(await code(caller(a).coachAssets.nutritionTemplates.get({ id: 'nt-1' }))).toBe('NOT_FOUND');
    expect(await code(caller(a).coachAssets.nutritionTemplates.save({ ...body, name: '' }))).toBe('BAD_REQUEST');
  });

  it('foods / foodGroups / supplements / billingPlans / workoutTemplates: get/update/delete', async () => {
    const a = await insertUser({ _id: 'a', role: 'coach' });
    const b = await insertUser({ _id: 'b', role: 'coach' });
    const ca = caller(a);
    const food = { id: 'f-1', name: loc, quantity: '100 g', protein: 10, carbs: 10, fats: 1, calories: 90 };
    await ca.coachAssets.foods.save(food);
    expect((await ca.coachAssets.foods.get({ id: 'f-1' })).calories).toBe(90);
    await ca.coachAssets.foods.update({ id: 'f-1', calories: 95 });
    expect((await ca.coachAssets.foods.get({ id: 'f-1' })).calories).toBe(95);
    expect(await code(caller(b).coachAssets.foods.update({ id: 'f-1', calories: 1 }))).toBe('NOT_FOUND');

    await ca.coachAssets.foodGroups.save({ id: 'g-1', name: 'Proteins', foods: [food] });
    expect((await ca.coachAssets.foodGroups.get({ id: 'g-1' })).foods).toHaveLength(1);
    await ca.coachAssets.foodGroups.update({ id: 'g-1', name: 'Protein sources' });
    expect((await ca.coachAssets.foodGroups.get({ id: 'g-1' })).name).toBe('Protein sources');
    await ca.coachAssets.foodGroups.delete({ id: 'g-1' });
    expect(await code(ca.coachAssets.foodGroups.get({ id: 'g-1' }))).toBe('NOT_FOUND');

    await ca.coachAssets.supplements.save({ id: 's-1', name: 'Creatine', dose: loc });
    expect((await ca.coachAssets.supplements.get({ id: 's-1' })).name).toBe('Creatine');
    await ca.coachAssets.supplements.update({ id: 's-1', name: 'Creatine Mono' });
    expect((await ca.coachAssets.supplements.list({})).map((s) => s.name)).toEqual(['Creatine Mono']);
    await ca.coachAssets.supplements.delete({ id: 's-1' });
    expect(await ca.coachAssets.supplements.list({})).toHaveLength(0);
    expect(await code(caller(b).coachAssets.supplements.delete({ id: 's-1' }))).toBe('NOT_FOUND');

    await ca.coachAssets.billingPlans.save({ id: 'bp-1', name: 'Monthly', unit: 'months', duration: 1, price: 499 });
    await ca.coachAssets.billingPlans.update({ id: 'bp-1', price: 599 });
    expect((await ca.coachAssets.billingPlans.get({ id: 'bp-1' })).price).toBe(599);
    expect(await code(ca.coachAssets.billingPlans.save({ id: 'bp-2', name: 'Bad', unit: 'months', duration: 0 }))).toBe('BAD_REQUEST');
    await ca.coachAssets.billingPlans.delete({ id: 'bp-1' });
    expect(await code(ca.coachAssets.billingPlans.get({ id: 'bp-1' }))).toBe('NOT_FOUND');

    await ca.coachAssets.workoutTemplates.save({ id: 'wt-1', name: 'PPL', goal: 'hypertrophy', splitType: 'ppl', days: [], exercises: {} });
    await ca.coachAssets.workoutTemplates.update({ id: 'wt-1', name: 'PPL v2' });
    expect((await ca.coachAssets.workoutTemplates.get({ id: 'wt-1' })).name).toBe('PPL v2');
    expect(await code(caller(b).coachAssets.workoutTemplates.delete({ id: 'wt-1' }))).toBe('NOT_FOUND');
    await ca.coachAssets.workoutTemplates.delete({ id: 'wt-1' });
    expect(await ca.coachAssets.workoutTemplates.list({})).toHaveLength(0);
    // Every write stayed under coach A — coach B's library is empty.
    expect(await caller(b).coachAssets.foods.list({})).toHaveLength(0);
  });
});

describe('coachPlanTiers core features', () => {
  it('coreFeatures is public and seeded; saveCoreFeatures is super_admin-only and rejects an empty list', async () => {
    const admin = await insertUser({ _id: 'admin', role: 'admin' });
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    const seeded = await caller(null).coachPlanTiers.coreFeatures();
    expect(seeded.en.length).toBeGreaterThan(0);
    expect(seeded.ar.length).toBe(seeded.en.length);
    expect(await code(caller(admin).coachPlanTiers.saveCoreFeatures({ en: ['A'], ar: ['أ'] }))).toBe('FORBIDDEN');
    expect(await code(caller(sup).coachPlanTiers.saveCoreFeatures({ en: [], ar: [] }))).toBe('BAD_REQUEST');
    await caller(sup).coachPlanTiers.saveCoreFeatures({ en: ['A', 'B'], ar: ['أ', 'ب'] });
    expect(await caller(null).coachPlanTiers.coreFeatures()).toEqual({ en: ['A', 'B'], ar: ['أ', 'ب'] });
  });
});

describe('client plans + assessment + logs + check-ins + measurements', () => {
  async function pair() {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    const other = await insertUser({ _id: 'other', role: 'coach' });
    const client = await insertUser({ _id: 'client', role: 'client' });
    await assign(coach._id, client._id);
    return { coach, other, client };
  }

  it('nutritionPlan / cardioPlan: coach saves (full replace), client reads, client cannot write, unassigned coach cannot read', async () => {
    const { coach, other, client } = await pair();
    for (const kind of ['nutritionPlan', 'cardioPlan'] as const) {
      expect(await caller(client)[kind].get()).toBeNull();
      await caller(coach)[kind].save({ clientId: client._id, name: 'v1', extra: 1 });
      await caller(coach)[kind].save({ clientId: client._id, name: 'v2' });
      const got = await caller(client)[kind].get();
      expect(got?.name).toBe('v2');
      expect(got && 'extra' in got).toBe(false); // full replace, not merge
      expect(await code(caller(client)[kind].save({ name: 'mine' }))).toBe('FORBIDDEN');
      expect(await code(caller(other)[kind].get({ clientId: client._id }))).toBe('FORBIDDEN');
    }
  });

  it('assessment.get: null before any draft, then the saved draft; coach reads it; unassigned coach cannot', async () => {
    const { coach, other, client } = await pair();
    expect(await caller(client).assessment.get()).toBeNull();
    await caller(client).assessment.saveDraft({ basic: { fullName: 'Alex' } } as never);
    const mine = await caller(client).assessment.get();
    expect(mine).not.toBeNull();
    expect(await code(caller(coach).assessment.get({ clientId: client._id }))).toBe('OK');
    expect(await code(caller(other).assessment.get({ clientId: client._id }))).toBe('FORBIDDEN');
  });

  it('logsNutrition / logsWeight / logsCardio / logsChecklist: get + list read the synced records, bounded by limit', async () => {
    const { coach, other, client } = await pair();
    const c = caller(client);
    await c.sync.push({ collection: 'nutritionLogs', records: [{ id: '2026-01-01', updatedAt: 1, data: { kcal: 1 } }, { id: '2026-01-02', updatedAt: 2, data: { kcal: 2 } }] });
    await c.sync.push({ collection: 'weightLogs', records: [{ id: '2026-01-01', updatedAt: 1, data: { kg: 80 } }] });
    await c.sync.push({ collection: 'dailyChecklists', records: [{ id: '2026-01-01', updatedAt: 1, data: { done: true } }] });
    await c.sync.push({ collection: 'cardioLogs', records: [{ id: 'cl-1', updatedAt: 1, data: { date: '2026-01-01', minutes: 20 } }] });

    const co = caller(coach);
    const t = { clientId: client._id };
    expect((await co.logsNutrition.get({ ...t, date: '2026-01-02' }))?.kcal).toBe(2);
    expect(await co.logsNutrition.list({ ...t, limit: 1 })).toHaveLength(1);
    expect(await co.logsNutrition.list(t)).toHaveLength(2);
    expect((await co.logsWeight.get({ ...t, date: '2026-01-01' }))?.kg).toBe(80);
    expect(await co.logsWeight.list(t)).toHaveLength(1);
    expect((await co.logsChecklist.get({ ...t, date: '2026-01-01' }))?.done).toBe(true);
    expect(await co.logsChecklist.list(t)).toHaveLength(1);
    expect((await co.logsCardio.get({ ...t, id: 'cl-1' }))?.minutes).toBe(20);
    expect(await co.logsCardio.list({ ...t, date: '2026-01-01' })).toHaveLength(1);
    expect(await co.logsCardio.list({ ...t, date: '2030-01-01' })).toHaveLength(0);
    expect(await co.logsNutrition.get({ ...t, date: '1999-01-01' })).toBeNull();
    expect(await code(caller(other).logsWeight.list(t))).toBe('FORBIDDEN');
  });

  it('checkIns.get / delete: the assigned coach owns the week; a client can read but never delete', async () => {
    const { coach, other, client } = await pair();
    const t = { clientId: client._id, weekStart: '2026-01-05' };
    await caller(coach).checkIns.request({ ...t, weekEnd: '2026-01-11' });
    expect((await caller(client).checkIns.get({ weekStart: t.weekStart }))?.status).toBe('requested');
    expect((await caller(coach).checkIns.get(t))?.coachId).toBe(coach._id);
    expect(await code(caller(client).checkIns.delete({ weekStart: t.weekStart }))).toBe('FORBIDDEN');
    expect(await code(caller(other).checkIns.delete(t))).toBe('FORBIDDEN');
    await caller(coach).checkIns.delete(t);
    expect(await caller(coach).checkIns.get(t)).toBeNull();
  });

  it('measurements.get returns one dated entry (client and coach), FORBIDDEN across clients', async () => {
    const { coach, client } = await pair();
    const stranger = await insertUser({ _id: 'stranger', role: 'client' });
    await caller(client).measurements.save({ date: '2026-02-01', values: { waistCm: 80 } });
    expect((await caller(client).measurements.get({ date: '2026-02-01' }))?.values).toEqual({ waistCm: 80 });
    expect((await caller(coach).measurements.get({ clientId: client._id, date: '2026-02-01' }))?.values.waistCm).toBe(80);
    expect(await caller(client).measurements.get({ date: '1999-01-01' })).toBeNull();
    expect(await code(caller(stranger).measurements.get({ clientId: client._id, date: '2026-02-01' }))).toBe('FORBIDDEN');
  });
});

describe('foodSearch (external dependency stubbed)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps upstream rows, sanitises bad numbers, caches, and degrades to [] on failure — never a hard error', async () => {
    const coach = await insertUser({ _id: 'coach', role: 'coach' });
    const page = { results: [{ id: 7, name: 'Oats', energy: 389, protein: '16.9', carbohydrates: '66.3', fat: 'not-a-number' }] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => page });
    vi.stubGlobal('fetch', fetchMock);
    const first = await caller(coach).foodSearch.search({ query: 'oats-cov' });
    expect(first).toEqual([
      expect.objectContaining({ id: 'wger-food-7', name: 'Oats', calories: 389, protein: 16.9, carbs: 66.3, fats: 0, sourceProvider: 'wger', sourceNutrition: expect.objectContaining({ baseGrams: 100, fats: 0 }) }),
    ]);
    await caller(coach).foodSearch.search({ query: 'OATS-COV' }); // same normalised key → cache
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await caller(coach).foodSearch.search({ query: 'uncached-cov' })).toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await caller(coach).foodSearch.search({ query: 'uncached-cov-2' })).toEqual([]);
  });
});
