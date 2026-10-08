import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';

/** B1.13 / PF-02 — the request path fails fast, and a failed connect is not cached forever. */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});

describe('Mongo connection', () => {
  it('an unreachable cluster fails within the timeout, and the next request connects once it is back', async () => {
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = '300';
    process.env.MONGODB_DB = 'forma_test_conn';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/?directConnection=true';
    const { getDb, mongoTimeouts } = await import('./mongodb.js');
    expect(mongoTimeouts().serverSelectionTimeoutMS).toBe(300);
    const t0 = Date.now();
    await expect(getDb()).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(5_000);
    // The failed connect must not be cached: point at a live server and retry.
    process.env.MONGODB_URI = mongod.getUri();
    const db = await getDb();
    expect(await db.collection('ping').countDocuments()).toBe(0);
  }, 20_000);
});
