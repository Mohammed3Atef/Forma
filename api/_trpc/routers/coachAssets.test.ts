import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';

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
  // B38F-R3: the coaches these tests act as are real coaches, so they have a Forma plan.
  for (const id of ['coach-a', 'coach-b']) await ensureCoachPlan(id);
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

  it('B0 / MD-09: a video link must be https — javascript:/data:/http are refused, https YouTube and files kept', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'http://example.com/a.mp4', 'http://localhost@evil.com/a.mp4', 'http://127.0.0.1.evil.com/a.mp4']) {
      await expect(asCoachA.coachAssets.exercises.save({ ...exerciseInput, videoUrl: bad })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    // Loopback http is the local/test CDN only.
    const local = await asCoachA.coachAssets.exercises.save({ ...exerciseInput, videoUrl: 'http://127.0.0.1:5287/cdn/Forma/a.mp4' });
    expect(local.exercise.videoUrl).toBe('http://127.0.0.1:5287/cdn/Forma/a.mp4');
    const yt = await asCoachA.coachAssets.exercises.save({ ...exerciseInput, videoUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(yt.exercise.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    const cleared = await asCoachA.coachAssets.exercises.save({ ...exerciseInput, videoUrl: null });
    expect(cleared.exercise.videoUrl ?? null).toBeNull();
  });

  it('B3-S11 / B4: attribution and catalog links survive a full save — exercise source, catalog id, names, instructions and media credits; food provenance', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const instructions = { en: { setup: ['Lie on the bench.'], steps: ['Lower.', 'Press.'], cues: ['Feet down.'], mistakes: ['Bouncing.'], safety: [] }, ar: { setup: ['استلقِ.'], steps: ['أنزل.', 'ادفع.'], cues: ['القدمان ثابتتان.'], mistakes: ['الارتداد.'], safety: [] } };
    const credits = [{ url: 'https://wger.de/media/a.png', kind: 'image' as const, author: 'Everkinetic', license: 'CC-BY-SA-3.0', sourcePage: 'https://wger.de/en/exercise/73/view/' }];
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'wger-73', source: 'wger.de (CC BY-SA 3.0)' });
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, id: 'cat-fx_barbell_bench_press', catalogId: 'fx_barbell_bench_press', catalogRev: 2, names: { en: 'Barbell bench press', ar: 'ضغط البار على البنش المستوي' }, instructions, mediaCredits: credits });
    const byId = new Map((await asCoachA.coachAssets.exercises.list({})).map((e) => [e.id, e]));
    expect(byId.get('wger-73')?.source).toBe('wger.de (CC BY-SA 3.0)');
    expect(byId.get('cat-fx_barbell_bench_press')).toMatchObject({ catalogId: 'fx_barbell_bench_press', catalogRev: 2, names: { ar: 'ضغط البار على البنش المستوي' }, instructions, mediaCredits: credits });

    const provenance = {
      catalogId: 'ff_rice_white_long_cooked',
      catalogRev: 1,
      per100g: { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28 },
      portion: { id: 'cup', amount: 1, grams: 158, label: { en: '1 cup', ar: 'كوب' } },
      foodState: 'cooked' as const,
      verification: 'source-values' as const,
      source: { provider: 'forma-catalog' as const, license: 'CC0-1.0', attribution: 'Source: USDA FoodData Central (CC0)' },
    };
    await asCoachA.coachAssets.foods.save({ id: 'food-rice', name: { en: 'White rice, cooked', ar: 'أرز أبيض مطبوخ' }, quantity: '1 cup (158 g)', protein: 4.3, carbs: 44.5, fats: 0.4, calories: 205, ...provenance });
    expect((await asCoachA.coachAssets.foods.list({})).find((f) => f.id === 'food-rice')).toMatchObject(provenance);
  });

  it('save is an upsert: saving the same id twice replaces rather than duplicates', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save(exerciseInput);
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, name: 'Renamed' });
    const list = await asCoachA.coachAssets.exercises.list({});
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Renamed');
  });

  it("a coach can neither read nor write another coach's library — libraries are per-tenant", async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save(exerciseInput);

    const asCoachB = appRouter.createCaller(ctxFor(coachB));
    // Coaches hold no platform-wide permission (rbac.ts), so coachB cannot even LIST coachA's library...
    await expect(asCoachB.coachAssets.exercises.list({ coachId: coachA.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asCoachB.coachAssets.exercises.get({ id: 'ex-1', coachId: coachA.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // ...and writes are always scoped to the caller's own id server-side, so these are NOT_FOUND, never a cross-tenant edit.
    await expect(asCoachB.coachAssets.exercises.update({ id: 'ex-1', name: 'Hijacked' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(asCoachB.coachAssets.exercises.delete({ id: 'ex-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // coachA's own row is untouched.
    expect(await asCoachA.coachAssets.exercises.list({})).toHaveLength(1);
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

describe('coachAssets router — no starter import (B4.3)', () => {
  it('the bulk "starter library" seed is retired: no such procedure, and a new coach owns no copied rows', async () => {
    expect(Object.keys(appRouter._def.procedures).filter((p) => /starter/i.test(p))).toEqual([]);
    const real = appRouter.createCaller(ctxFor(coachA));
    expect(await real.coachAssets.exercises.list({})).toEqual([]);
    expect(await real.coachAssets.foods.list({})).toEqual([]);
    // …yet the shared library is all there (library.test.ts covers the lists in full).
    expect((await real.library.exercises.list({ limit: 1 })).total).toBeGreaterThan(1300);
    expect((await real.library.foods.list({ limit: 1 })).total).toBe(190);
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

    // Phase-3 E-B-2: fields the library exercise doesn't have must be ABSENT on
    // the synced copy (not null), and the template must still save afterwards.
    const synced = (tplA as unknown as { exercises: Record<string, Record<string, unknown>> }).exercises['tpl-ex-1'];
    for (const f of ['category', 'equipment', 'images', 'muscles', 'secondaryMuscles', 'equipmentList', 'sourceCategory']) {
      expect(synced[f], `${f} must not be stored as null`).not.toBeNull();
    }
    const { id: _id, ...tplRest } = tplA as Record<string, unknown> & { id: string };
    void _id;
    await expect(asCoachA.coachAssets.workoutTemplates.save({ ...(tplRest as typeof templateBody), id: 'tpl-1', name: 'Leg Day v2' })).resolves.toBeTruthy();
  });

  it('a template carrying legacy nulls from an older sync can still be saved', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const legacyEx = { ...exerciseInput, id: 'tpl-ex-legacy', category: null, equipment: null, images: null, muscles: null, secondaryMuscles: null, equipmentList: null, sourceCategory: null };
    await expect(
      asCoachA.coachAssets.workoutTemplates.save({
        id: 'tpl-legacy',
        name: 'Legacy',
        goal: 'hypertrophy',
        splitType: 'full_body',
        days: [],
        exercises: { 'tpl-ex-legacy': legacyEx as unknown as typeof exerciseInput },
      }),
    ).resolves.toBeTruthy();
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

  it('two coaches can both customise the same Forma exercise (same id) without colliding; each edits only their own', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const asCoachB = appRouter.createCaller(ctxFor(coachB));
    // A customised catalog item is the coach's own row `cat-<catalogId>` — the same id for every coach.
    const sharedId = 'cat-fx_barbell_bench_press';
    const custom = { ...exerciseInput, id: sharedId, catalogId: 'fx_barbell_bench_press' };
    await asCoachA.coachAssets.exercises.save(custom);
    await asCoachB.coachAssets.exercises.save(custom);
    await asCoachA.coachAssets.exercises.save(custom); // saving again replaces, never duplicates
    expect((await asCoachA.coachAssets.exercises.list({})).filter((e) => e.id === sharedId)).toHaveLength(1);
    expect((await asCoachB.coachAssets.exercises.list({})).filter((e) => e.id === sharedId)).toHaveLength(1);
    await asCoachA.coachAssets.exercises.update({ id: sharedId, name: 'A-customized' });
    expect((await asCoachB.coachAssets.exercises.list({})).find((e) => e.id === sharedId)?.name).toBe(exerciseInput.name);
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

describe('coachAssets router — food pictures (B4.1)', () => {
  const CDN = 'https://media.forma.test';
  const saved = process.env.BUNNY_CDN_URL;
  beforeEach(() => {
    process.env.BUNNY_CDN_URL = CDN;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.BUNNY_CDN_URL;
    else process.env.BUNNY_CDN_URL = saved;
  });
  const food = (image: unknown) => ({ id: 'food-rice', name: { en: 'Rice', ar: 'أرز' }, quantity: '1 cup', protein: 4, carbs: 45, fats: 0, calories: 205, image });
  const pic = (coach: string, rev = 1) => ({ source: 'upload', url: `${CDN}/Forma/${coach}/foods/rice-r${rev}.webp`, thumbUrl: `${CDN}/Forma/${coach}/foods/rice-r${rev}-t.webp`, rev, uploadedAt: 1 });

  it('a coach adds, replaces and removes the picture of THEIR food; another coach’s photo is refused on save and on update', async () => {
    const asA = appRouter.createCaller(ctxFor(coachA));
    expect((await asA.coachAssets.foods.save(food(pic('coach-a')))).image).toMatchObject({ rev: 1 });
    await expect(asA.coachAssets.foods.save(food(pic('coach-b')))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await asA.coachAssets.foods.update({ id: 'food-rice', image: pic('coach-a', 2) })).image).toMatchObject({ rev: 2 }); // replaced
    await expect(asA.coachAssets.foods.update({ id: 'food-rice', image: pic('coach-b') })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await asA.coachAssets.foods.update({ id: 'food-rice', image: null })).image).toBeNull(); // removed
    // Coach B can never touch coach A's food (its own row with the same id is a different food).
    const asB = appRouter.createCaller(ctxFor(coachB));
    await expect(asB.coachAssets.foods.update({ id: 'food-rice', image: pic('coach-b') })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await asA.coachAssets.foods.get({ id: 'food-rice' })).image).toBeNull();
  });
});

describe('coachAssets router — exercise demonstrations (B4.2)', () => {
  const CDN = 'https://media.forma.test';
  const saved = process.env.BUNNY_CDN_URL;
  beforeEach(() => {
    process.env.BUNNY_CDN_URL = CDN;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.BUNNY_CDN_URL;
    else process.env.BUNNY_CDN_URL = saved;
  });
  const own = (coach: string, f = 'demo.gif') => `${CDN}/Forma/${coach}/exercises/${f}`;

  it('a coach adds, replaces and removes THEIR demonstration and restores the original; another coach’s or a client’s file is refused', async () => {
    const asA = appRouter.createCaller(ctxFor(coachA));
    const original = { imageUrl: 'https://static.exercisedb.dev/media/EIeI8Vf.gif', images: ['https://static.exercisedb.dev/media/EIeI8Vf.gif'], thumbUrl: '/catalog/edb/EIeI8Vf.webp', videoUrl: null, videoPosterUrl: null, mediaCredits: [{ url: 'https://static.exercisedb.dev/media/EIeI8Vf.gif', kind: 'image' as const, author: 'ExerciseDB (AscendAPI)', license: 'EXERCISEDB', sourcePage: 'https://ascendapi.com' }] };
    const copy = { ...exerciseInput, id: 'cat-edb_EIeI8Vf', imageUrl: original.imageUrl, images: original.images, thumbUrl: original.thumbUrl, sourceMedia: original };
    expect((await asA.coachAssets.exercises.save(copy)).exercise).toMatchObject({ thumbUrl: '/catalog/edb/EIeI8Vf.webp' });
    // Replace with their own upload, then with a link of their choosing.
    expect((await asA.coachAssets.exercises.update({ id: copy.id, imageUrl: own('coach-a'), images: [own('coach-a')], thumbUrl: own('coach-a', 'demo-t.webp') })).exercise.imageUrl).toBe(own('coach-a'));
    expect((await asA.coachAssets.exercises.update({ id: copy.id, videoUrl: 'https://www.youtube.com/watch?v=abc' })).exercise.videoUrl).toBe('https://www.youtube.com/watch?v=abc');
    await expect(asA.coachAssets.exercises.update({ id: copy.id, imageUrl: own('coach-b') })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(asA.coachAssets.exercises.update({ id: copy.id, images: [`${CDN}/Forma/client-1/progress.jpg`] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(asA.coachAssets.exercises.update({ id: copy.id, imageUrl: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // Remove, then restore the ExerciseDB demonstration from the kept snapshot.
    expect((await asA.coachAssets.exercises.update({ id: copy.id, imageUrl: null, images: [], thumbUrl: null })).exercise.imageUrl).toBeNull();
    const restored = (await asA.coachAssets.exercises.update({ id: copy.id, imageUrl: original.imageUrl, images: original.images, thumbUrl: original.thumbUrl, videoUrl: null, mediaCredits: original.mediaCredits })).exercise;
    expect(restored).toMatchObject({ imageUrl: original.imageUrl, thumbUrl: original.thumbUrl, sourceMedia: original });
    // Coach B can never change coach A's exercise.
    await expect(appRouter.createCaller(ctxFor(coachB)).coachAssets.exercises.update({ id: copy.id, imageUrl: own('coach-b') })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a workout template is checked the same way', async () => {
    const asA = appRouter.createCaller(ctxFor(coachA));
    const tpl = (videoUrl: string) => ({ id: 'tpl-demo', name: 'Demo', goal: 'hypertrophy' as const, splitType: 'full_body' as const, days: [], exercises: { e1: { ...exerciseInput, id: 'e1', videoUrl } } });
    await expect(asA.coachAssets.workoutTemplates.save(tpl(own('coach-a', 'v.mp4')))).resolves.toBeTruthy();
    await expect(asA.coachAssets.workoutTemplates.save(tpl(`${CDN}/Forma/client-1/messages/v.mp4`))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
