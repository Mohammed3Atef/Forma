import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';
import { coachExercisesCol, coachFavoritesCol, coachFoodsCol } from '../../coach-assets/_lib/db.js';
import { loadCatalog } from '../../catalog/_lib/dataset.js';
import type { CoachExerciseDoc, CoachFoodDoc } from '../../coach-assets/_lib/types.js';

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
  for (const id of ['coach-a', 'coach-b']) await ensureCoachPlan(id);
});

function authed(id: string, role: UserDoc['role']): AuthedUser {
  const now = Date.now();
  const doc: UserDoc = { _id: id, email: `${id}@example.com`, emailLower: `${id}@example.com`, passwordHash: 'x', displayName: id, role, accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now };
  return { id, role, accountStatus: 'active', permissions: [], doc };
}
const ctxFor = (user: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user });
const as = (id: string, role: UserDoc['role'] = 'coach') => appRouter.createCaller(ctxFor(authed(id, role)));

async function ownExercise(coachId: string, e: Partial<CoachExerciseDoc> & { id: string; name: string }) {
  const now = Date.now();
  await (await coachExercisesCol()).insertOne({ targetMuscle: 'Chest', warmupSets: '', workingSets: 3, repRange: '8-12', rir: '', tempo: '', notes: { en: '', ar: '' }, restSec: 90, videoId: null, coachId, createdAt: now, updatedAt: now, ...e } as unknown as CoachExerciseDoc);
}
async function ownFood(coachId: string, f: Partial<CoachFoodDoc> & { id: string; name: { en: string; ar: string } }) {
  const now = Date.now();
  await (await coachFoodsCol()).insertOne({ quantity: '100 g', protein: 10, carbs: 10, fats: 1, calories: 89, coachId, createdAt: now, updatedAt: now, ...f } as unknown as CoachFoodDoc);
}

const BENCH = 'fx_barbell_bench_press';
const BENCH_EDB = 'edb_EIeI8Vf'; // ExerciseDB's bench press, linked to the curated one
const RICE = 'ff_rice_white_medium_cooked';

describe('library.exercises.list — one shared library, no import', () => {
  it('a brand-new coach (no records at all) sees the whole shared catalog', async () => {
    const c = loadCatalog();
    const res = await as('coach-a').library.exercises.list({ limit: 50 });
    expect(res.total).toBe(c.exerciseCount);
    expect(res.total).toBeGreaterThan(1300);
    expect(res.items).toHaveLength(50);
    expect(res.items.every((r) => r.kind === 'shared')).toBe(true);
    expect(await (await coachExercisesCol()).countDocuments({ coachId: 'coach-a' })).toBe(0);
  });

  it('pages without gaps or repeats', async () => {
    const a = await as('coach-a').library.exercises.list({ limit: 30, offset: 0 });
    const b = await as('coach-a').library.exercises.list({ limit: 30, offset: 30 });
    const ids = [...a.items, ...b.items].map((r) => r.id);
    expect(new Set(ids).size).toBe(60);
  });

  it('English, Arabic and Egyptian Arabic find the same exercise first; a typo still does (B4 search, moved here in B4.3)', async () => {
    const first = async (q: string) => (await as('coach-a').library.exercises.list({ q, limit: 5 })).items[0]?.id;
    expect(await first('bench press')).toBe(BENCH);
    expect(await first('ضغط البار على البنش المستوي')).toBe(BENCH);
    expect(await first('بنش مستوي')).toBe(BENCH);
    expect(await first('bnech press')).toBe(BENCH);
    expect(await first('incline db press')).toBe('fx_incline_dumbbell_press');
    expect(await first('بنش عالي دمبل')).toBe('fx_incline_dumbbell_press');
  });

  it('rows are light (a card: no instructions, no GIF) and pages are capped at 50', async () => {
    const r = await as('coach-a').library.exercises.list({ equipment: 'dumbbell', limit: 50 });
    expect(r.items.every((x) => x.kind === 'shared' && x.card.equipment.includes('dumbbell'))).toBe(true);
    expect(r.items[0]).not.toHaveProperty('card.instructions');
    expect(JSON.stringify(r).length / r.items.length).toBeLessThan(850); // bytes per row
    await expect(as('coach-a').library.exercises.list({ limit: 500 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('an ExerciseDB row shows its light still (never the GIF); a shoulder filter finds both vocabularies', async () => {
    const r = await as('coach-a').library.exercises.list({ q: 'reverse grip pull up', limit: 10 });
    const row = r.items.find((x) => x.kind === 'shared' && x.card.name.en === 'Reverse-grip pull-up');
    if (row?.kind !== 'shared') throw new Error('Reverse-grip pull-up not listed');
    expect(row.card).toMatchObject({ origin: 'exercisedb', media: 'animation', difficulty: null, pattern: null });
    expect(row.card.thumb?.url).toMatch(/^\/catalog\/edb\/[A-Za-z0-9]+\.webp$/);
    const side = await as('coach-a').library.exercises.list({ q: 'raise', muscle: 'side-delts', limit: 50 });
    const origins = new Set(side.items.map((x) => (x.kind === 'shared' ? x.card.origin : 'own')));
    expect(origins.has('exercisedb')).toBe(true);
    expect(origins.has('forma')).toBe(true);
  });

  it('own exercises join the list (ranked first among equals); "mine" shows only them', async () => {
    await ownExercise('coach-a', { id: 'ex-own', name: 'Bench press (coach cue)' });
    const all = await as('coach-a').library.exercises.list({ q: 'bench press', limit: 50 });
    expect(all.items.find((r) => r.id === 'ex-own')?.kind).toBe('own');
    const mine = await as('coach-a').library.exercises.list({ scope: 'mine' });
    expect(mine.total).toBe(1);
    expect(mine.items[0]).toMatchObject({ kind: 'own', id: 'ex-own', customized: false, catalogId: null });
  });

  it('a customised catalog exercise is listed ONCE, as the coach version — also when keyed by a linked ExerciseDB id', async () => {
    const c = loadCatalog();
    await ownExercise('coach-a', { id: `cat-${BENCH}`, name: 'Barbell bench press', catalogId: BENCH });
    const res = await as('coach-a').library.exercises.list({ limit: 50, q: 'barbell bench press' });
    expect(res.items.filter((r) => r.id === BENCH)).toHaveLength(0);
    expect(res.items.find((r) => r.id === `cat-${BENCH}`)).toMatchObject({ kind: 'own', customized: true, catalogId: BENCH });
    const total = (await as('coach-a').library.exercises.list({})).total;
    expect(total).toBe(c.exerciseCount); // replaced, not added

    await (await coachExercisesCol()).deleteMany({});
    await ownExercise('coach-a', { id: `cat-${BENCH_EDB}`, name: 'My EDB bench', catalogId: BENCH_EDB });
    const again = await as('coach-a').library.exercises.list({ limit: 50, q: 'bench' });
    expect(again.items.some((r) => r.id === BENCH)).toBe(false);
  });

  it("never shows another coach's exercises", async () => {
    await ownExercise('coach-b', { id: 'ex-b', name: 'Secret B move' });
    const res = await as('coach-a').library.exercises.list({ q: 'secret b move' });
    expect(res.items.some((r) => r.id === 'ex-b')).toBe(false);
    expect((await as('coach-a').library.exercises.list({ scope: 'mine' })).total).toBe(0);
  });

  it('"has a demonstration" for own exercises follows the app rule: a playable link or a picture — never a Drive link', async () => {
    await ownExercise('coach-a', { id: 'own-yt', name: 'Zz own youtube', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } as never);
    await ownExercise('coach-a', { id: 'own-drive', name: 'Zz own drive', videoUrl: 'https://drive.google.com/file/d/x/view' } as never);
    await ownExercise('coach-a', { id: 'own-pic', name: 'Zz own picture', images: ['https://img.test/a.png'] } as never);
    const ids = (await as('coach-a').library.exercises.list({ scope: 'mine', demo: true })).items.map((r) => r.id).sort();
    expect(ids).toEqual(['own-pic', 'own-yt']);
  });

  it('filters by muscle, equipment and "has a demonstration"', async () => {
    const res = await as('coach-a').library.exercises.list({ muscle: 'chest', equipment: 'barbell', limit: 50 });
    expect(res.total).toBeGreaterThan(0);
    for (const r of res.items) if (r.kind === 'shared') expect(r.card.equipment).toContain('barbell');
    const demo = await as('coach-a').library.exercises.list({ demo: true, limit: 50 });
    for (const r of demo.items) if (r.kind === 'shared') expect(r.card.media).not.toBe('none');
  });

  it('is for active coaches only', async () => {
    await expect(as('client-1', 'client').library.exercises.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(as('client-1', 'client').library.foods.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(as('client-1', 'client').library.favorites.set({ kind: 'food', id: 'ff_banana', on: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const suspended = appRouter.createCaller(ctxFor({ ...authed('coach-a', 'coach'), accountStatus: 'suspended' }));
    await expect(suspended.library.exercises.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('library.favorites — light references', () => {
  it('stars a shared exercise without copying it; "favorites" lists it; unstar removes it', async () => {
    await as('coach-a').library.favorites.set({ kind: 'exercise', id: BENCH, on: true });
    expect(await (await coachExercisesCol()).countDocuments({})).toBe(0);
    const favs = await as('coach-a').library.exercises.list({ scope: 'favorites' });
    expect(favs.items.map((r) => r.id)).toEqual([BENCH]);
    expect(favs.items[0].favorite).toBe(true);
    // Another coach's favourites are their own.
    expect((await as('coach-b').library.exercises.list({ scope: 'favorites' })).total).toBe(0);
    await as('coach-a').library.favorites.set({ kind: 'exercise', id: BENCH, on: false });
    expect((await as('coach-a').library.exercises.list({ scope: 'favorites' })).total).toBe(0);
  });

  it('a linked ExerciseDB id is one favourite with its curated exercise (set and unset either way)', async () => {
    await as('coach-a').library.favorites.set({ kind: 'exercise', id: BENCH_EDB, on: true });
    const rows = await (await coachFavoritesCol()).find({ coachId: 'coach-a' }).toArray();
    expect(rows.map((r) => r.refId)).toEqual([BENCH]);
    await as('coach-a').library.favorites.set({ kind: 'exercise', id: BENCH_EDB, on: false });
    expect(await (await coachFavoritesCol()).countDocuments({})).toBe(0);
  });

  it('a favourite survives customising the item (keyed by the catalog id) and shows on the coach version', async () => {
    await as('coach-a').library.favorites.set({ kind: 'exercise', id: BENCH, on: true });
    await ownExercise('coach-a', { id: `cat-${BENCH}`, name: 'My bench', catalogId: BENCH });
    const favs = await as('coach-a').library.exercises.list({ scope: 'favorites' });
    expect(favs.items.map((r) => r.id)).toEqual([`cat-${BENCH}`]);
  });

  it('refuses an id that is neither in the catalog nor the coach own', async () => {
    await ownExercise('coach-b', { id: 'ex-b', name: 'B only' });
    await expect(as('coach-a').library.favorites.set({ kind: 'exercise', id: 'ex-b', on: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(as('coach-a').library.favorites.set({ kind: 'food', id: 'ff_nope', on: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('library.foods.list — all 190 foods, with their pictures', () => {
  it('a new coach sees every catalog food, and the ones with an approved picture carry it', async () => {
    const c = loadCatalog();
    const first = await as('coach-a').library.foods.list({ limit: 50 });
    expect(first.total).toBe(c.foodById.size);
    expect(first.total).toBe(190);
    let withPicture = 0;
    for (let offset = 0; offset < first.total; offset += 50) {
      const page = await as('coach-a').library.foods.list({ limit: 50, offset });
      withPicture += page.items.filter((r) => r.kind === 'shared' && r.card.image?.thumbUrl).length;
    }
    expect(withPicture).toBeGreaterThanOrEqual(127);
  });

  it('category filter, Arabic search, own and customised foods', async () => {
    const grains = await as('coach-a').library.foods.list({ category: 'grains', limit: 50 });
    expect(grains.items.every((r) => r.kind !== 'shared' || r.card.category === 'grains')).toBe(true);
    const ar = await as('coach-a').library.foods.list({ q: 'رز', limit: 50 });
    expect(ar.items.some((r) => r.id === RICE)).toBe(true);

    await ownFood('coach-a', { id: `cat-${RICE}`, name: { en: 'My rice', ar: 'رز المدرب' }, catalogId: RICE } as never);
    await ownFood('coach-a', { id: 'fd-own', name: { en: 'Grandma koshari', ar: 'كشري' } });
    const all = await as('coach-a').library.foods.list({ q: 'rice', limit: 50 });
    expect(all.items.some((r) => r.id === RICE)).toBe(false);
    const mineRice = all.items.find((r) => r.id === `cat-${RICE}`);
    expect(mineRice).toMatchObject({ kind: 'own', customized: true });
    // No picture of its own → Forma's picture shows on the coach's version.
    if (mineRice?.kind === 'own') expect(mineRice.image?.thumbUrl).toBeTruthy();
    expect((await as('coach-a').library.foods.list({ scope: 'mine' })).total).toBe(2);
    expect((await as('coach-b').library.foods.list({ scope: 'mine' })).total).toBe(0);
  });
});
