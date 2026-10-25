import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';

/**
 * B0 / CO-01 — a coach's plan save can never silently replace a newer (or an
 * unloaded) plan, and every save is recoverable from version history.
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_plans';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

async function user(_id: string, role: UserDoc['role']): Promise<AuthedUser> {
  const now = Date.now();
  const doc: UserDoc = { _id, email: `${_id}@t.test`, emailLower: `${_id}@t.test`, passwordHash: 'x', displayName: _id, role, accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  if (doc.role === 'coach') await ensureCoachPlan(doc._id); // B38F-R3: a real coach always has a plan
  return { id: _id, role, accountStatus: 'active', permissions: [], doc };
}
const ctx = (u: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u });

async function setup() {
  const coach = await user('coach-1', 'coach');
  const client = await user('client-1', 'client');
  await (await getDb()).collection('coachClients').insertOne({ _id: 'coach-1__client-1', coachId: 'coach-1', clientId: 'client-1', status: 'active' } as never);
  return { asCoach: appRouter.createCaller(ctx(coach)), asClient: appRouter.createCaller(ctx(client)) };
}

describe('plan save safety (CO-01)', () => {
  it('create → edit → save works with the loaded revision', async () => {
    const { asCoach } = await setup();
    const created = await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'Block 1', days: [], exercises: {}, baseUpdatedAt: null });
    const loaded = await asCoach.workoutPlan.get({ clientId: 'client-1' });
    expect(loaded?.updatedAt).toBe(created.updatedAt);
    const saved = await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'Block 1 (edited)', days: [], exercises: {}, baseUpdatedAt: loaded!.updatedAt as number });
    expect(saved.name).toBe('Block 1 (edited)');
    expect(saved.updatedAt as number).toBeGreaterThan(created.updatedAt as number);
  });

  it('a save without a base revision is refused (an unloaded editor can never write)', async () => {
    const { asCoach } = await setup();
    await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'Real plan', days: [], baseUpdatedAt: null });
    await expect(asCoach.workoutPlan.save({ clientId: 'client-1', name: 'Empty', days: [] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await asCoach.workoutPlan.get({ clientId: 'client-1' }))?.name).toBe('Real plan');
  });

  it('"create" cannot replace an existing plan (the failed-load wipe, BV-11)', async () => {
    const { asCoach } = await setup();
    await asCoach.workoutPlan.save({ clientId: 'client-1', name: '4-day plan', days: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }], baseUpdatedAt: null });
    await expect(asCoach.workoutPlan.save({ clientId: 'client-1', name: 'Week 5 plan', days: [{ id: 'x' }], baseUpdatedAt: null })).rejects.toMatchObject({ code: 'CONFLICT' });
    const plan = await asCoach.workoutPlan.get({ clientId: 'client-1' });
    expect(plan?.name).toBe('4-day plan');
    expect((plan?.days as unknown[]).length).toBe(4);
  });

  it('a stale editor cannot overwrite a newer server plan', async () => {
    const { asCoach } = await setup();
    const v1 = await asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut', meals: [], baseUpdatedAt: null });
    // Device B saves first…
    await asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut (device B)', meals: [], baseUpdatedAt: v1.updatedAt as number });
    // …device A still holds v1's revision.
    await expect(asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut (device A)', meals: [], baseUpdatedAt: v1.updatedAt as number })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await asCoach.nutritionPlan.get({ clientId: 'client-1' }))?.name).toBe('Cut (device B)');
  });

  it('every save creates a version, and earlier versions can be read and restored', async () => {
    const { asCoach, asClient } = await setup();
    const a = await asCoach.cardioPlan.save({ clientId: 'client-1', name: 'Base', sessions: [], baseUpdatedAt: null });
    const b = await asCoach.cardioPlan.save({ clientId: 'client-1', name: 'Base + intervals', sessions: [], baseUpdatedAt: a.updatedAt as number });
    await asCoach.cardioPlan.save({ clientId: 'client-1', name: 'Peak', sessions: [], baseUpdatedAt: b.updatedAt as number });
    const versions = await asCoach.planVersions.list({ clientId: 'client-1', kind: 'cardio' });
    expect(versions.map((v) => v.name)).toEqual(['Peak', 'Base + intervals', 'Base']);
    expect(versions.filter((v) => v.active)).toHaveLength(1);
    expect(versions[0].active).toBe(true);
    const base = versions.find((v) => v.name === 'Base')!;
    await asCoach.planVersions.restore({ clientId: 'client-1', versionId: base._id });
    expect((await asClient.cardioPlan.get({ clientId: 'client-1' }))?.name).toBe('Base');
  });

  it('a legacy plan with no history is captured before it is replaced', async () => {
    const { asCoach } = await setup();
    await (await getDb()).collection('clientWorkoutPlans').insertOne({ _id: 'client-1', clientId: 'client-1', id: 'legacy', name: 'Legacy plan', days: [], exercises: {}, updatedAt: 1000 } as never);
    await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'New plan', days: [], baseUpdatedAt: 1000 });
    const versions = await asCoach.planVersions.list({ clientId: 'client-1', kind: 'workout' });
    expect(versions.map((v) => v.name)).toEqual(['New plan', 'Legacy plan']);
    expect(versions[1].active).toBe(false);
  });

  it('template assignment (replaceExisting) replaces deliberately and keeps the previous plan restorable', async () => {
    const { asCoach } = await setup();
    await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'Custom plan', days: [], baseUpdatedAt: null });
    await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'Template PPL', days: [], replaceExisting: true, versionReason: 'Assigned template "PPL"' });
    const versions = await asCoach.planVersions.list({ clientId: 'client-1', kind: 'workout' });
    expect(versions[0]).toMatchObject({ name: 'Template PPL', reason: 'Assigned template "PPL"', active: true });
    expect(versions.some((v) => v.name === 'Custom plan')).toBe(true);
  });

  it('"save as new version" is guarded by the same revision check', async () => {
    const { asCoach } = await setup();
    const p = await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'P', days: [], baseUpdatedAt: null });
    await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'P2', days: [], baseUpdatedAt: p.updatedAt as number });
    await expect(asCoach.planVersions.save({ clientId: 'client-1', kind: 'workout', plan: { name: 'Stale', days: [] }, baseUpdatedAt: p.updatedAt as number })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('control fields are never stored in the plan, and other roles cannot write', async () => {
    const { asCoach, asClient } = await setup();
    const p = await asCoach.workoutPlan.save({ clientId: 'client-1', name: 'P', days: [], baseUpdatedAt: null, versionReason: 'x' });
    const stored = await (await getDb()).collection('clientWorkoutPlans').findOne({ _id: 'client-1' } as never);
    expect(stored).not.toHaveProperty('baseUpdatedAt');
    expect(stored).not.toHaveProperty('versionReason');
    await expect(asClient.workoutPlan.save({ clientId: 'client-1', name: 'Hack', days: [], baseUpdatedAt: p.updatedAt as number })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const other = appRouter.createCaller(ctx(await user('coach-2', 'coach')));
    await expect(other.workoutPlan.save({ clientId: 'client-1', name: 'Hack', days: [], baseUpdatedAt: p.updatedAt as number })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

/**
 * B4.1 — a meal item's picture: the plan coach's own upload, or nothing. A client's private media
 * (progress photos share the CDN host) or another coach's photo is refused on save; an older plan
 * version keeps the picture it was saved with when the library food's picture changes later.
 */
describe('food pictures in a nutrition plan (B4.1)', () => {
  const CDN = 'https://media.forma.test';
  const saved = process.env.BUNNY_CDN_URL;
  beforeEach(() => {
    process.env.BUNNY_CDN_URL = CDN;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.BUNNY_CDN_URL;
    else process.env.BUNNY_CDN_URL = saved;
  });
  const meal = (url: string) => [{ id: 'm1', slot: 'lunch', label: { en: 'Lunch', ar: 'غداء' }, items: [{ id: 'i1', name: { en: 'Rice', ar: 'أرز' }, quantity: '1 cup', protein: 4, carbs: 45, fats: 0, calories: 205, image: { source: 'upload', url, thumbUrl: url, rev: 1, uploadedAt: 1 } }] }];

  it('the coach’s own photo is kept; a client’s progress photo or another coach’s photo is refused', async () => {
    const { asCoach } = await setup();
    const ok = await asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut', meals: meal(`${CDN}/Forma/coach-1/foods/rice-r1.webp`), baseUpdatedAt: null });
    expect((ok as { meals: { items: { image: { url: string } }[] }[] }).meals[0].items[0].image.url).toBe(`${CDN}/Forma/coach-1/foods/rice-r1.webp`);
    await expect(asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut', meals: meal(`${CDN}/Forma/client-1/progress-front.jpg`), baseUpdatedAt: ok.updatedAt as number })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut', meals: meal(`${CDN}/Forma/coach-2/foods/rice.webp`), baseUpdatedAt: ok.updatedAt as number })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await asCoach.nutritionPlan.get({ clientId: 'client-1' }))?.updatedAt).toBe(ok.updatedAt); // nothing was written
  });

  it('a replaced picture is a new file: the earlier plan version still shows the picture it was saved with', async () => {
    const { asCoach } = await setup();
    const v1 = await asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut', meals: meal(`${CDN}/Forma/coach-1/foods/rice-r1.webp`), baseUpdatedAt: null });
    await asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut', meals: meal(`${CDN}/Forma/coach-1/foods/rice-r2.webp`), baseUpdatedAt: v1.updatedAt as number, versionReason: 'new photo' });
    const versions = (await asCoach.planVersions.list({ clientId: 'client-1', kind: 'nutrition' })) as unknown as { snapshot: { meals: { items: { image: { url: string } }[] }[] } }[];
    const urls = versions.map((v) => v.snapshot.meals[0].items[0].image.url);
    expect(urls).toContain(`${CDN}/Forma/coach-1/foods/rice-r1.webp`);
    expect((await asCoach.nutritionPlan.get({ clientId: 'client-1' }) as { meals: { items: { image: { url: string } }[] }[] }).meals[0].items[0].image.url).toBe(`${CDN}/Forma/coach-1/foods/rice-r2.webp`);
  });

  it('a picture already in the stored plan does not lock it when it would no longer be accepted as new', async () => {
    const { asCoach } = await setup();
    const v1 = await asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut', meals: meal(`${CDN}/Forma/coach-1/foods/rice-r1.webp`), baseUpdatedAt: null });
    delete process.env.BUNNY_CDN_URL; // uploads unavailable here now
    const v2 = await asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut v2', meals: meal(`${CDN}/Forma/coach-1/foods/rice-r1.webp`), baseUpdatedAt: v1.updatedAt as number });
    expect(v2.name).toBe('Cut v2');
    await expect(asCoach.nutritionPlan.save({ clientId: 'client-1', name: 'Cut v3', meals: meal(`${CDN}/Forma/coach-1/foods/rice-r3.webp`), baseUpdatedAt: v2.updatedAt as number })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('exercise demonstrations in a workout plan (B4.2)', () => {
  const CDN = 'https://media.forma.test';
  const saved = process.env.BUNNY_CDN_URL;
  beforeEach(() => {
    process.env.BUNNY_CDN_URL = CDN;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.BUNNY_CDN_URL;
    else process.env.BUNNY_CDN_URL = saved;
  });
  const plan = (imageUrl: string) => ({ clientId: 'client-1', name: 'Block', days: [], exercises: { e1: { id: 'e1', name: 'Curl', imageUrl, thumbUrl: '/catalog/edb/X1.webp' } } });

  it('an ExerciseDB GIF and the coach’s own upload are kept; a client’s private photo or another coach’s file is refused', async () => {
    const { asCoach } = await setup();
    const ok = await asCoach.workoutPlan.save({ ...plan('https://static.exercisedb.dev/media/X1.gif'), baseUpdatedAt: null });
    const v2 = await asCoach.workoutPlan.save({ ...plan(`${CDN}/Forma/coach-1/exercises/curl.gif`), baseUpdatedAt: ok.updatedAt as number });
    await expect(asCoach.workoutPlan.save({ ...plan(`${CDN}/Forma/client-1/progress-front.jpg`), baseUpdatedAt: v2.updatedAt as number })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(asCoach.workoutPlan.save({ ...plan(`${CDN}/Forma/coach-2/exercises/x.gif`), baseUpdatedAt: v2.updatedAt as number })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await asCoach.workoutPlan.get({ clientId: 'client-1' }))?.updatedAt).toBe(v2.updatedAt); // nothing written
  });
});
