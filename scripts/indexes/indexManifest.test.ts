import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
// @ts-expect-error — plain .mjs script module (no types)
import { INDEXES } from './manifest.mjs';
// @ts-expect-error — plain .mjs script module (no types)
import { applyIndexes, formatPreflight, preflightIndexes, redactUri } from './preflight.mjs';

/**
 * B4 checkpoint 1 — index safety. The manifest is the one list; the preflight only reads; `--apply`
 * never builds a unique index over duplicates and never replaces a conflicting definition.
 */
type Spec = { collection: string; options: { name: string; unique?: boolean }; runtime?: boolean };
const specs = INDEXES as Spec[];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : tsFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

describe('index manifest', () => {
  it('lists every index the API self-ensures at runtime (a deploy builds those — they must be reviewed here)', () => {
    const runtime = new Set<string>();
    for (const file of tsFiles(join(process.cwd(), 'api'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/createIndex\([^;]*?name:\s*'([^']+)'/gs)) runtime.add(m[1]);
    }
    expect(runtime.size).toBeGreaterThan(10);
    for (const name of runtime) expect(specs.some((s) => s.options.name === name && s.runtime), `runtime index "${name}" missing from manifest (runtime: true)`).toBe(true);
  });

  it('has no duplicate (collection, name) and every unique index says how to look for duplicates', () => {
    const seen = new Set<string>();
    for (const s of INDEXES as (Spec & { uniqueGroup?: unknown })[]) {
      const id = `${s.collection}.${s.options.name}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
      if (s.options.unique) expect(s.uniqueGroup, `${id} needs uniqueGroup`).toBeTruthy();
    }
  });

  it('never prints credentials', () => {
    expect(redactUri('mongodb+srv://forma:s3cret@cluster0.example.net/forma?retryWrites=true')).toBe('mongodb+srv://***@cluster0.example.net');
    expect(redactUri('mongodb://127.0.0.1:27017')).toBe('mongodb://127.0.0.1:27017');
  });
});

describe('preflight and apply (real mongod)', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
  }, 60_000);
  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
  });
  beforeEach(async () => {
    db = client.db(`preflight_${Date.now()}`);
    const now = Date.now();
    // Two ACTIVE relationships for one client — the duplicate uniq_active_client must not be built over.
    await db.collection('coachClients').insertMany([
      { _id: 'c1__x' as never, coachId: 'c1', clientId: 'x', status: 'active', createdAt: now },
      { _id: 'c2__x' as never, coachId: 'c2', clientId: 'x', status: 'active', createdAt: now },
      { _id: 'c1__y' as never, coachId: 'c1', clientId: 'y', status: 'ended', createdAt: now },
      { _id: 'c2__y' as never, coachId: 'c2', clientId: 'y', status: 'active', createdAt: now },
    ]);
    await db.collection('users').insertMany([{ _id: 'x' as never, emailLower: 'x@t.test', role: 'client' }]);
    await db.collection('users').createIndex({ role: -1 }, { name: 'role' }); // same name, different key
  });

  async function fingerprint() {
    const out: string[] = [];
    for (const { name } of await db.listCollections().toArray()) {
      out.push(name, JSON.stringify(await db.collection(name).find().sort({ _id: 1 }).toArray()), JSON.stringify(await db.collection(name).listIndexes().toArray()));
    }
    return createHash('sha256').update(out.join('|')).digest('hex');
  }

  it('the preflight changes nothing and reports missing, conflicting and blocked-unique indexes', async () => {
    const before = await fingerprint();
    const r = await preflightIndexes(db);
    expect(await fingerprint()).toBe(before);

    const row = (c: string, n: string) => r.indexes.find((i: { collection: string; name: string }) => i.collection === c && i.name === n);
    expect(row('coachClients', 'uniq_active_client')).toMatchObject({ status: 'missing', unique: true, duplicates: 1, buildable: false });
    expect(row('coachClients', 'uniq_active_client').duplicateSample[0].ids.sort()).toEqual(['c1__x', 'c2__x']);
    expect(row('users', 'role')).toMatchObject({ status: 'conflict' });
    expect(row('users', 'uniq_emailLower')).toMatchObject({ status: 'missing', buildable: true });
    expect(row('messages', 'clientId_createdAt').status).toBe('missing (collection absent)');
    expect(r.counts.coachClients).toBe(4);
    expect(formatPreflight(r)).toContain('BLOCKED: 1 duplicate group');
  });

  it('apply builds only missing, buildable indexes: never over duplicates, never replacing a conflict; a re-run is a no-op', async () => {
    const docsBefore = await db.collection('coachClients').find().sort({ _id: 1 }).toArray();
    const first = await applyIndexes(db, { log: () => undefined });
    expect(first.created).toContain('coachClients.clientId');
    expect(first.created).not.toContain('coachClients.uniq_active_client');
    expect(first.skipped.map((s: { name: string }) => s.name).sort()).toEqual(['role', 'uniq_active_client']);
    expect(await db.collection('coachClients').find().sort({ _id: 1 }).toArray()).toEqual(docsBefore);
    const role = (await db.collection('users').listIndexes().toArray()).find((i) => i.name === 'role');
    expect(role?.key).toEqual({ role: -1 });

    const again = await applyIndexes(db, { log: () => undefined });
    expect(again.created).toEqual([]);

    const r = await preflightIndexes(db);
    const plan = (n: string) => r.plans.find((p: { name: string }) => p.name === n);
    expect(plan('active relationship of a client').ok).toBe(true);
    expect(plan('thread page').ok).toBe(true);
  });
});
