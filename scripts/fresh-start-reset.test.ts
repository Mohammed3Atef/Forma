import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
// @ts-expect-error — a plain .mjs script (no type declarations); the pieces are tested directly.
import { CLASSES, parseArgs, refusals } from './fresh-start-reset.mjs';

/**
 * B4.3 — the fresh-start reset is a dry run unless every guard passes, refuses production outright,
 * keeps configuration, admins and (by default) audit + financial records, and empties the rest.
 */
let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const DB = 'forma_reset_test';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  db = client.db(DB);
}, 60_000);
afterAll(async () => {
  await client.close();
  await mongod.stop();
});

async function seed() {
  await db.dropDatabase();
  await db.collection('coachPlanTiers').insertOne({ _id: 'forma' as never, priceMonthly: 499 });
  await db.collection('featureFlags').insertOne({ key: 'x', on: true });
  await db.collection('users').insertMany([
    { _id: 'admin' as never, role: 'super_admin' },
    { _id: 'coach' as never, role: 'coach' },
    { _id: 'client' as never, role: 'client' },
  ]);
  await db.collection('refreshTokens').insertOne({ userId: 'coach' });
  await db.collection('coachClients').insertOne({ coachId: 'coach', clientId: 'client', status: 'active' });
  await db.collection('messages').insertOne({ clientId: 'client', text: 'hi' });
  await db.collection('coachExercises').insertOne({ coachId: 'coach', id: 'cat-fx_bench' });
  await db.collection('coachFavorites').insertOne({ coachId: 'coach', id: 'exercise:fx_bench' });
  await db.collection('clientPayments').insertOne({ coachId: 'coach', amount: 100 });
  await db.collection('adminAuditLogs').insertOne({ action: 'old' });
  await db.collection('coachNutritionTemplates').insertOne({ coachId: 'coach', id: 'nt' });
  await db.collection('rateLimits').insertOne({ key: 'k' });
}
const counts = async () => Object.fromEntries(await Promise.all((await db.listCollections().toArray()).map(async (c) => [c.name, await db.collection(c.name).countDocuments()] as const)));
function run(args: string[], env: Record<string, string> = {}) {
  try {
    const out = execFileSync(process.execPath, ['scripts/fresh-start-reset.mjs', ...args], { env: { ...process.env, MONGODB_URI: mongod.getUri(), MONGODB_DB: DB, VERCEL_ENV: '', FORMA_PRODUCTION_DBS: '', ...env }, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

beforeEach(seed);

describe('guards', () => {
  it('production is refused in this phase, however it is named', () => {
    const base = { MONGODB_URI: 'mongodb://x', MONGODB_DB: 'forma' };
    expect(refusals(parseArgs(['--env', 'production']), base)).toContain('production resets are not approved in this phase (B4.3) — use a new database per the plan');
    expect(refusals(parseArgs(['--env', 'preview']), { ...base, VERCEL_ENV: 'production' }).length).toBeGreaterThan(0);
    expect(refusals(parseArgs(['--env', 'preview']), { ...base, FORMA_PRODUCTION_DBS: 'forma_live, forma' }).length).toBeGreaterThan(0);
    expect(refusals(parseArgs([]), base)).toContain('--env is required (local | e2e | preview | staging)');
  });

  it('--execute needs the exact database, a backup and the explicit acknowledgement', () => {
    const base = { MONGODB_URI: 'mongodb://x', MONGODB_DB: 'forma_preview' };
    expect(refusals(parseArgs(['--env', 'preview', '--execute']), base)).toHaveLength(3);
    expect(refusals(parseArgs(['--env', 'preview', '--execute', '--confirm-db', 'forma', '--backup-taken', '--i-understand-this-deletes-data']), base)).toEqual(['--confirm-db must equal MONGODB_DB (forma_preview)']);
    expect(refusals(parseArgs(['--env', 'preview', '--execute', '--confirm-db', 'forma_preview', '--backup-taken', '--i-understand-this-deletes-data']), base)).toEqual([]);
  });

  it('every collection the API uses is in exactly one class', () => {
    const all = Object.values(CLASSES as Record<string, { collections: string[] }>).flatMap((c) => c.collections);
    expect(new Set(all).size).toBe(all.length);
    for (const name of ['users', 'coachClients', 'coachFavorites', 'clientPayments', 'adminAuditLogs', 'coachPlanTiers', 'coachNutritionTemplates']) expect(all).toContain(name);
  });
});

describe('the script against a database', () => {
  it('a dry run changes nothing', async () => {
    const before = await counts();
    const r = run(['--env', 'e2e']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('DRY RUN');
    expect(r.out).toContain('Dry run — nothing was changed.');
    expect(await counts()).toEqual(before);
  });

  it('a refused execute changes nothing', async () => {
    const before = await counts();
    expect(run(['--env', 'production', '--execute', '--confirm-db', DB, '--backup-taken', '--i-understand-this-deletes-data']).code).toBe(2);
    expect(run(['--env', 'e2e', '--execute']).code).toBe(2);
    expect(await counts()).toEqual(before);
  });

  it('execute: data and sessions go; admins, configuration, audit and payments stay; retired collections are dropped; the reset is audited', async () => {
    const r = run(['--env', 'e2e', '--execute', '--confirm-db', DB, '--backup-taken', '--i-understand-this-deletes-data']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Verification: OK');
    const c = await counts();
    expect(await db.collection('users').find().map((u) => u._id).toArray()).toEqual(['admin']);
    for (const name of ['coachClients', 'messages', 'coachExercises', 'coachFavorites', 'refreshTokens']) expect(c[name] ?? 0).toBe(0);
    expect(c.coachPlanTiers).toBe(1);
    expect(c.featureFlags).toBe(1);
    expect(c.clientPayments).toBe(1);
    expect('coachNutritionTemplates' in c).toBe(false);
    expect('rateLimits' in c).toBe(false);
    expect(await db.collection('adminAuditLogs').countDocuments({ action: 'system.fresh_start_reset' })).toBe(1);
    expect(await db.collection('adminAuditLogs').countDocuments({ action: 'old' })).toBe(1);
  });

  it('--include-audit-financial also clears class D (the reset entry is the new trail)', async () => {
    const r = run(['--env', 'e2e', '--execute', '--include-audit-financial', '--confirm-db', DB, '--backup-taken', '--i-understand-this-deletes-data']);
    expect(r.code).toBe(0);
    expect(await db.collection('clientPayments').countDocuments()).toBe(0);
    expect(await db.collection('adminAuditLogs').find().map((a) => a.action).toArray()).toEqual(['system.fresh_start_reset']);
  });
});
