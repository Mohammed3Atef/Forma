import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

/**
 * B4 — the library inventory (migration step A) classifies rows and references correctly and
 * changes nothing (fingerprint of every collection before / after).
 */
let mongod: MongoMemoryServer;
let client: MongoClient;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  const db = client.db('inv');
  await db.collection('coachExercises').insertMany([
    { coachId: 'c1', id: 'wger-73', name: 'Bench Press' },
    { coachId: 'c1', id: 'ex_mine', name: 'My move' },
    { coachId: 'c2', id: 'wger-73', name: 'Bench Press' },
    { coachId: 'c2', id: '3_4_Sit-Up', name: 'Sit-up', imageUrl: 'https://raw.githubusercontent.com/x/y.jpg' },
    { coachId: 'c2', id: 'cat-fx_barbell_bench_press', name: 'Barbell bench press', catalogId: 'fx_barbell_bench_press' },
  ]);
  await db.collection('coachFoods').insertMany([
    { coachId: 'c1', id: 'seed-food-white-rice' },
    { coachId: 'c1', id: 'food_x', catalogId: 'ff_banana' },
    { coachId: 'c2', id: 'food_y' },
  ]);
  await db.collection('coachWorkoutTemplates').insertOne({ coachId: 'c1', id: 't1', exercises: { a: { libraryExerciseId: 'wger-73', sourceProvider: 'wger' }, b: { catalogId: 'fx_x' } } });
  await db.collection('clientWorkoutPlans').insertOne({ _id: 'cl1' as never, exercises: { a: { imageUrl: 'https://raw.githubusercontent.com/a.jpg' } } });
  await db.collection('clientNutritionPlans').insertOne({ _id: 'cl1' as never, meals: [{ items: [{ id: 'f1', catalogId: 'ff_rice' }, { id: 'f2' }] }] });
}, 60_000);
afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

async function fingerprint() {
  const db = client.db('inv');
  const parts: string[] = [];
  for (const { name } of await db.listCollections().toArray()) parts.push(name, JSON.stringify(await db.collection(name).find().sort({ _id: 1 }).toArray()));
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

describe('library inventory', () => {
  it('classifies rows and references, read-only', async () => {
    const before = await fingerprint();
    const out = execFileSync(process.execPath, ['scripts/catalog/inventory.mjs', '--json'], { env: { ...process.env, MONGODB_URI: mongod.getUri(), MONGODB_DB: 'inv' }, encoding: 'utf8' });
    const r = JSON.parse(out);
    expect(await fingerprint()).toBe(before);
    expect(r.coachLibrary.exercises).toEqual({ 'seeded-wger': { rows: 2, coaches: 2 }, 'coach-own': { rows: 1, coaches: 1 }, 'legacy-github': { rows: 1, coaches: 1 }, 'catalog-copy': { rows: 1, coaches: 1 } });
    expect(r.coachLibrary.foods).toEqual({ seeded: { rows: 1, coaches: 1 }, 'catalog-copy': { rows: 1, coaches: 1 }, 'coach-own': { rows: 1, coaches: 1 } });
    expect(r.embeddedExerciseCopies.templates).toMatchObject({ copies: 2, libraryLinked: 1, catalogLinked: 1, wgerProvenance: 1, documents: 1 });
    expect(r.embeddedExerciseCopies.clientPlans).toMatchObject({ copies: 1, githubImages: 1 });
    expect(r.nutritionPlans).toEqual({ items: 2, catalogLinked: 1, plans: 1 });
    expect(r.target).not.toContain('@');
  });
});
