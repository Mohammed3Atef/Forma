import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

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
  return {
    _id: 'user-1',
    email: 'a@example.com',
    emailLower: 'a@example.com',
    passwordHash: 'irrelevant-for-these-tests',
    displayName: 'Test User',
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

function authedUser(overrides: Partial<UserDoc>): AuthedUser {
  const doc = userDoc(overrides);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

function ctxFor(user: AuthedUser | null): Context {
  return { req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
}

const coachA = authedUser({ _id: 'coach-a', role: 'coach' });
const coachB = authedUser({ _id: 'coach-b', role: 'coach' });
const client = authedUser({ _id: 'client-1', role: 'client' });
// Plain admin has 'users.read' via ROLE_PERMISSIONS — oversight read, not write.
const admin = authedUser({ _id: 'admin-1', role: 'admin' });

const exerciseInput = {
  id: 'ex-1',
  name: 'Bench Press',
  targetMuscle: 'Chest',
  warmupSets: '1 set',
  workingSets: 3,
  repRange: '8-12',
  rir: '1-2',
  tempo: '2010',
  notes: { en: '', ar: '' },
  restSec: 90,
  videoId: null,
};

describe('coachAssets router — exercises (stripMeta resource: no coachId/createdAt/updatedAt in response)', () => {
  it('a coach can create, list, update, and delete their own exercise', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));

    const created = await asCoachA.coachAssets.exercises.save(exerciseInput);
    expect(created.exercise.id).toBe('ex-1');
    expect(created.exercise).not.toHaveProperty('coachId');
    expect(created.exercise).not.toHaveProperty('createdAt');
    expect(created.sync).toEqual({ status: 'success', affectedTemplates: 0 });

    expect(await asCoachA.coachAssets.exercises.list({})).toHaveLength(1);

    const updated = await asCoachA.coachAssets.exercises.update({ id: 'ex-1', name: 'Barbell Bench Press' });
    expect(updated.exercise.name).toBe('Barbell Bench Press');

    await asCoachA.coachAssets.exercises.delete({ id: 'ex-1' });
    expect(await asCoachA.coachAssets.exercises.list({})).toHaveLength(0);
  });

  it('a suspended coach can still list/read their own library, but not save/update/delete — matches the old REST requireReadContext, which had no active check', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save(exerciseInput);

    const suspendedCoachA = { ...coachA, accountStatus: 'suspended' as const };
    const asSuspendedCoachA = appRouter.createCaller(ctxFor(suspendedCoachA));
    expect(await asSuspendedCoachA.coachAssets.exercises.list({})).toHaveLength(1);
    await expect(asSuspendedCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'ex-2' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('save is an upsert: saving the same id twice replaces rather than duplicates', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save(exerciseInput);
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, name: 'Renamed' });
    const list = await asCoachA.coachAssets.exercises.list({});
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Renamed');
  });

  it("a coach cannot write to another coach's library, but can read it if they hold users.read", async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save(exerciseInput);

    const asCoachB = appRouter.createCaller(ctxFor(coachB));
    // coachB has 'users.read' too (coach ROLE_PERMISSIONS includes it) — can read coachA's list...
    expect(await asCoachB.coachAssets.exercises.list({ coachId: coachA.id })).toHaveLength(1);
    // ...but cannot update/delete it (writes are always scoped to the caller's own id server-side).
    await expect(asCoachB.coachAssets.exercises.update({ id: 'ex-1', name: 'Hijacked' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(asCoachB.coachAssets.exercises.delete({ id: 'ex-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a client (no users.read) cannot list another user\'s library at all', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    await expect(asClient.coachAssets.exercises.list({ coachId: coachA.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a client cannot write (role-gated, not just ownership-gated)', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    await expect(asClient.coachAssets.exercises.save(exerciseInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('coachAssets router — billingPlans (keepMeta resource: response keeps coachId/createdAt/updatedAt)', () => {
  it('response keeps coachId/createdAt/updatedAt, and list sorts by order', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.billingPlans.save({ id: 'plan-b', name: 'B', unit: 'months', duration: 3, order: 2 });
    await asCoachA.coachAssets.billingPlans.save({ id: 'plan-a', name: 'A', unit: 'months', duration: 1, order: 1 });

    const list = await asCoachA.coachAssets.billingPlans.list({});
    expect(list.map((p) => p.id)).toEqual(['plan-a', 'plan-b']);
    expect(list[0]).toMatchObject({ coachId: coachA.id });
    expect(list[0].createdAt).toBeTypeOf('number');
  });

  it('an admin with users.read can read a specific coach\'s plan by (coachId, id); a bare id with no coachId now resolves against the admin\'s own coachId and 404s (a logical id is only unique PER COACH, so cross-coach lookup requires knowing which coach to ask)', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.billingPlans.save({ id: 'plan-a', name: 'A', unit: 'months', duration: 1 });

    const asAdmin = appRouter.createCaller(ctxFor(admin));
    const got = await asAdmin.coachAssets.billingPlans.get({ id: 'plan-a', coachId: coachA.id });
    expect(got.name).toBe('A');

    await expect(asAdmin.coachAssets.billingPlans.get({ id: 'plan-a' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(asAdmin.coachAssets.billingPlans.get({ id: 'does-not-exist', coachId: coachA.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('coachAssets router — seedStarterLibrary', () => {
  it('is idempotent: seeding twice only inserts once', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const first = await asCoachA.coachAssets.seedStarterLibrary();
    expect(first.exercises.inserted).toBeGreaterThan(0);

    const second = await asCoachA.coachAssets.seedStarterLibrary();
    expect(second.exercises.inserted).toBe(0);
    expect(second.exercises.skipped).toBe(first.exercises.inserted);

    const list = await asCoachA.coachAssets.exercises.list({});
    expect(list.length).toBe(first.exercises.inserted);
  });

  it('is role-gated to coaches', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    await expect(asClient.coachAssets.seedStarterLibrary()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('seeds all five categories in one call — exercises, foods, food groups, supplements, and templates (not exercises only)', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const result = await asCoachA.coachAssets.seedStarterLibrary();
    expect(result.exercises.inserted).toBeGreaterThan(0);
    expect(result.foods.inserted).toBeGreaterThan(0);
    expect(result.groups.inserted).toBeGreaterThan(0);
    expect(result.supplements.inserted).toBeGreaterThan(0);
    expect(result.templates.inserted).toBeGreaterThan(0);
    for (const key of ['exercises', 'foods', 'groups', 'supplements', 'templates'] as const) expect(result[key].error).toBeUndefined();

    expect((await asCoachA.coachAssets.foods.list({})).length).toBe(result.foods.inserted);
    expect((await asCoachA.coachAssets.foodGroups.list({})).length).toBe(result.groups.inserted);
    expect((await asCoachA.coachAssets.supplements.list({})).length).toBe(result.supplements.inserted);
    expect((await asCoachA.coachAssets.workoutTemplates.list({})).length).toBe(result.templates.inserted);
  });
});

describe('coachAssets router — library → template sync', () => {
  const baseEx = {
    id: 'lib-ex-1',
    name: 'Squat',
    targetMuscle: 'Quadriceps',
    warmupSets: '1 set',
    workingSets: 3,
    repRange: '8-12',
    rir: '1-2',
    tempo: '2010',
    notes: { en: 'Original', ar: '' },
    restSec: 90,
    videoId: null,
    videoUrl: 'https://example.com/original.mp4',
  };

  it('an edit to an existing library exercise propagates only synced fields into linked templates, scoped to the same coach', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const asCoachB = appRouter.createCaller(ctxFor(coachB));

    // NB: distinct ids per coach — `coachExercises._id` is the raw exercise
    // id with no coach-scoping (a separate, pre-existing multi-tenant bug
    // flagged in the implementation report, not something this test is
    // about), so two coaches can't share an id today without a real
    // duplicate-key collision.
    await asCoachA.coachAssets.exercises.save(baseEx);
    await asCoachB.coachAssets.exercises.save({ ...baseEx, id: 'lib-ex-1-b' });

    const templateBody = {
      id: 'tpl-1',
      name: 'Leg Day',
      goal: 'hypertrophy' as const,
      splitType: 'full_body' as const,
      days: [],
      exercises: {
        'tpl-ex-1': { ...baseEx, id: 'tpl-ex-1', libraryExerciseId: 'lib-ex-1', librarySyncEnabled: true, workingSets: 5, repRange: '5-5' },
      },
    };
    await asCoachA.coachAssets.workoutTemplates.save(templateBody);
    // Deliberately reuses the STRING "lib-ex-1" (coach A's exercise id) on
    // coach B's template — this is the real isolation test: it must NOT
    // match, because the propagation query also scopes by `coachId`, not
    // just by `libraryExerciseId` string equality.
    await asCoachB.coachAssets.workoutTemplates.save({
      ...templateBody,
      id: 'tpl-b-1',
      exercises: { 'tpl-ex-1': { ...baseEx, id: 'tpl-ex-1', libraryExerciseId: 'lib-ex-1', librarySyncEnabled: true } },
    });

    const result = await asCoachA.coachAssets.exercises.save({ ...baseEx, videoUrl: 'https://example.com/updated.mp4', name: 'Barbell Squat', workingSets: 4 });
    expect(result.sync.status).toBe('success');
    expect(result.sync.affectedTemplates).toBe(1);

    const tplA = await asCoachA.coachAssets.workoutTemplates.get({ id: 'tpl-1' });
    const exA = (tplA as { exercises: Record<string, { videoUrl: string; name: string; workingSets: number; repRange: string }> }).exercises['tpl-ex-1'];
    expect(exA.videoUrl).toBe('https://example.com/updated.mp4');
    expect(exA.name).toBe('Barbell Squat');
    // Programming fields never sync — the template's own 5x5 survives untouched.
    expect(exA.workingSets).toBe(5);
    expect(exA.repRange).toBe('5-5');

    // Coach B's identically-shaped template is untouched — same library
    // exercise id, but a DIFFERENT coach's library doc, never cross-synced.
    const tplB = await asCoachB.coachAssets.workoutTemplates.get({ id: 'tpl-b-1' });
    const exB = (tplB as { exercises: Record<string, { videoUrl: string }> }).exercises['tpl-ex-1'];
    expect(exB.videoUrl).toBe('https://example.com/original.mp4');
  });

  it('a detached (librarySyncEnabled: false) template exercise does not receive the propagated update', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save(baseEx);
    await asCoachA.coachAssets.workoutTemplates.save({
      id: 'tpl-2',
      name: 'Leg Day',
      goal: 'hypertrophy',
      splitType: 'full_body',
      days: [],
      exercises: { 'tpl-ex-2': { ...baseEx, id: 'tpl-ex-2', libraryExerciseId: 'lib-ex-1', librarySyncEnabled: false } },
    });

    const result = await asCoachA.coachAssets.exercises.save({ ...baseEx, videoUrl: 'https://example.com/updated.mp4' });
    expect(result.sync.affectedTemplates).toBe(0);

    const tpl = await asCoachA.coachAssets.workoutTemplates.get({ id: 'tpl-2' });
    const ex = (tpl as { exercises: Record<string, { videoUrl: string }> }).exercises['tpl-ex-2'];
    expect(ex.videoUrl).toBe('https://example.com/original.mp4');
  });

  it('saving a brand-new exercise (no prior doc) never propagates', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const result = await asCoachA.coachAssets.exercises.save(baseEx);
    expect(result.sync).toEqual({ status: 'success', affectedTemplates: 0 });
  });
});

describe('coachAssets router — multi-tenant asset identity ({coachId, id}, not a global _id)', () => {
  it('two coaches independently save an exercise with the identical logical id — no collision', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const asCoachB = appRouter.createCaller(ctxFor(coachB));
    const a = await asCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'bench_press' });
    const b = await asCoachB.coachAssets.exercises.save({ ...exerciseInput, id: 'bench_press', name: 'Bench Press (Coach B)' });
    expect(a.exercise.id).toBe('bench_press');
    expect(b.exercise.id).toBe('bench_press');
    expect(a.exercise).not.toHaveProperty('_id');
    expect(b.exercise).not.toHaveProperty('_id');
  });

  it('the database itself rejects a duplicate {coachId, id} pair — a raw insert bypassing the upsert path throws E11000, proving the unique index enforces this, not just app-level find-before-write', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'ex-dup' });
    const col = (await getDb()).collection('coachExercises');
    await expect(
      col.insertOne({ id: 'ex-dup', coachId: coachA.id, name: 'Duplicate attempt', createdAt: Date.now(), updatedAt: Date.now() } as never),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('re-saving the same coach\'s own exercise id is a normal upsert (update in place), never a duplicate', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'ex-1', name: 'First' });
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'ex-1', name: 'Second' });
    const list = await asCoachA.coachAssets.exercises.list({});
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Second');
  });

  it('an edit or delete by coach A never touches coach B\'s row with the identical logical id', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const asCoachB = appRouter.createCaller(ctxFor(coachB));
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'shared-id', name: 'Coach A version' });
    await asCoachB.coachAssets.exercises.save({ ...exerciseInput, id: 'shared-id', name: 'Coach B version' });

    await asCoachA.coachAssets.exercises.update({ id: 'shared-id', name: 'Coach A edited' });
    const bAfterAEdit = await asCoachB.coachAssets.exercises.list({});
    expect(bAfterAEdit.find((e) => e.id === 'shared-id')?.name).toBe('Coach B version');

    await asCoachA.coachAssets.exercises.delete({ id: 'shared-id' });
    const aAfterDelete = await asCoachA.coachAssets.exercises.list({});
    expect(aAfterDelete.find((e) => e.id === 'shared-id')).toBeUndefined();
    const bAfterADelete = await asCoachB.coachAssets.exercises.list({});
    expect(bAfterADelete.find((e) => e.id === 'shared-id')?.name).toBe('Coach B version');
  });

  it('workout templates, foods, and food groups with identical logical ids coexist across coaches (same guarantee as exercises)', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const asCoachB = appRouter.createCaller(ctxFor(coachB));

    await asCoachA.coachAssets.workoutTemplates.save({ id: 'tpl-shared', name: 'A', goal: 'hypertrophy', splitType: 'full_body', days: [], exercises: {} });
    await asCoachB.coachAssets.workoutTemplates.save({ id: 'tpl-shared', name: 'B', goal: 'hypertrophy', splitType: 'full_body', days: [], exercises: {} });
    expect((await asCoachA.coachAssets.workoutTemplates.get({ id: 'tpl-shared', coachId: coachA.id })).name).toBe('A');
    expect((await asCoachB.coachAssets.workoutTemplates.get({ id: 'tpl-shared', coachId: coachB.id })).name).toBe('B');

    const foodBody = { id: 'food-shared', name: { en: 'A', ar: 'A' }, quantity: '100 g', protein: 1, carbs: 1, fats: 1, calories: 10 };
    await asCoachA.coachAssets.foods.save(foodBody);
    await asCoachB.coachAssets.foods.save({ ...foodBody, name: { en: 'B', ar: 'B' } });
    expect((await asCoachA.coachAssets.foods.list({})).find((f) => f.id === 'food-shared')?.name.en).toBe('A');
    expect((await asCoachB.coachAssets.foods.list({})).find((f) => f.id === 'food-shared')?.name.en).toBe('B');

    const groupBody = { id: 'group-shared', name: 'A', foods: [] as never[] };
    await asCoachA.coachAssets.foodGroups.save(groupBody);
    await asCoachB.coachAssets.foodGroups.save({ ...groupBody, name: 'B' });
    expect((await asCoachA.coachAssets.foodGroups.list({})).find((g) => g.id === 'group-shared')?.name).toBe('A');
    expect((await asCoachB.coachAssets.foodGroups.list({})).find((g) => g.id === 'group-shared')?.name).toBe('B');
  });

  it('two different coaches can both seed the starter library without colliding, and each can safely re-seed themselves', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const asCoachB = appRouter.createCaller(ctxFor(coachB));

    const a1 = await asCoachA.coachAssets.seedStarterLibrary();
    expect(a1.exercises.inserted).toBeGreaterThan(0);

    // The bug this whole pass fixes: coach B seeding after coach A used to
    // throw E11000 on the very first shared starter id and insert nothing.
    const b1 = await asCoachB.coachAssets.seedStarterLibrary();
    expect(b1.exercises.inserted).toBe(a1.exercises.inserted);
    expect(b1.templates.inserted).toBe(a1.templates.inserted);

    // Re-seeding the SAME coach again stays idempotent (no duplicates).
    const a2 = await asCoachA.coachAssets.seedStarterLibrary();
    expect(a2.exercises.inserted).toBe(0);
    expect(a2.exercises.skipped).toBe(a1.exercises.inserted);

    const listA = await asCoachA.coachAssets.exercises.list({});
    const listB = await asCoachB.coachAssets.exercises.list({});
    expect(listA.length).toBe(a1.exercises.inserted);
    expect(listB.length).toBe(a1.exercises.inserted);
    // Editing coach A's seeded copy never touches coach B's copy of the same starter id.
    const sharedId = listA[0].id;
    await asCoachA.coachAssets.exercises.update({ id: sharedId, name: 'A-customized' });
    expect((await asCoachB.coachAssets.exercises.list({})).find((e) => e.id === sharedId)?.name).not.toBe('A-customized');
  });

  it('cross-coach save/update/delete attempts are rejected (FORBIDDEN or NOT_FOUND, never silently applied to the wrong coach)', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const asCoachB = appRouter.createCaller(ctxFor(coachB));
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'ex-1' });

    // Coach B "editing"/"deleting" an id that only exists under coach A's
    // tenancy just finds nothing under coach B's own scope — NOT_FOUND, and
    // critically never mutates coach A's row.
    await expect(asCoachB.coachAssets.exercises.update({ id: 'ex-1', name: 'Hijacked' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(asCoachB.coachAssets.exercises.delete({ id: 'ex-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await asCoachA.coachAssets.exercises.list({})).find((e) => e.id === 'ex-1')?.name).toBe(exerciseInput.name);

    const asClient = appRouter.createCaller(ctxFor(client));
    await expect(asClient.coachAssets.exercises.save({ ...exerciseInput, id: 'ex-2' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
