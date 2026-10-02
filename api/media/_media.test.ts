import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './[action].js';
import { appRouter } from '../_trpc/router.js';
import type { AuthedUser, Context } from '../_trpc/context.js';
import { getDb } from '../_lib/mongodb.js';
import { signAccessToken } from '../_lib/tokens.js';
import type { UserDoc } from '../_lib/types.js';
import type { CoachClientDoc } from '../coach-clients/_types.js';

/**
 * Media upload proxy — authorization, path ownership, type/size policy and
 * the chunked path. Bunny is stubbed at `fetch`, so every test asserts the
 * exact storage path + that the zone password only ever appears in the
 * SERVER's outbound request (never in anything returned to the caller).
 */

const ZONE = 'forma-zone';
const KEY = 'server-only-zone-password';
const CDN = 'https://cdn.example.com';

let mongod: MongoMemoryServer;
let puts: { url: string; headers: Record<string, string>; bodyLength: number }[] = [];
let listings: Record<string, unknown[]> = {};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
  process.env.BUNNY_STORAGE_ZONE = ZONE;
  process.env.BUNNY_API_KEY = KEY;
  process.env.BUNNY_CDN_URL = `${CDN}/`;
  process.env.BUNNY_STORAGE_REGION = '';
}, 60_000);

afterAll(async () => {
  await mongod.stop();
});

beforeEach(async () => {
  await (await getDb()).dropDatabase();
  puts = [];
  listings = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (init?.method === 'PUT') {
        const body = init.body as Uint8Array;
        puts.push({ url, headers, bodyLength: body.byteLength });
        return new Response(null, { status: 201 });
      }
      // Directory listing
      const rel = url.replace(`https://storage.bunnycdn.com/${ZONE}/`, '');
      return new Response(JSON.stringify(listings[rel] ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function userDoc(overrides: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  const id = overrides._id ?? 'user-1';
  return {
    _id: id,
    email: `${id}@example.com`,
    emailLower: `${id}@example.com`,
    passwordHash: 'irrelevant',
    displayName: id,
    role: 'client',
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
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return doc;
}

function tokenFor(u: UserDoc): string {
  return signAccessToken({ id: u._id, role: u.role, accountStatus: u.accountStatus });
}

async function assign(coachId: string, clientId: string) {
  const doc: CoachClientDoc = { _id: `${coachId}__${clientId}`, coachId, clientId, status: 'active', createdBy: coachId, createdAt: 1, updatedAt: 1 };
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne(doc);
}

interface CallOpts {
  token?: string;
  body?: Buffer | string;
  contentType?: string;
  query?: Record<string, string>;
  method?: string;
}

async function call(action: string, opts: CallOpts = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const body = typeof opts.body === 'string' ? Buffer.from(opts.body) : (opts.body ?? Buffer.alloc(0));
  const qs = new URLSearchParams(opts.query ?? {}).toString();
  const req = Object.assign(Readable.from([body]), {
    method: opts.method ?? 'POST',
    url: `/api/media/${action}${qs ? `?${qs}` : ''}`,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      'content-type': opts.contentType ?? 'application/octet-stream',
      'content-length': String(body.length),
    },
    cookies: {},
  }) as unknown as VercelRequest;
  let status = 0;
  let json: Record<string, unknown> = {};
  const res = {
    status(s: number) {
      status = s;
      return res;
    },
    json(b: unknown) {
      json = b as Record<string, unknown>;
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as VercelResponse;
  await handler(req, res);
  return { status, json };
}

const png = (bytes = 1024) => Buffer.alloc(bytes, 1);

describe('media upload — gate', () => {
  it('rejects non-POST, unauthenticated and non-active callers, and unknown actions', async () => {
    const client = await insertUser({ _id: 'client-1' });
    const pending = await insertUser({ _id: 'pending-1', accountStatus: 'pending' });
    expect((await call('upload', { method: 'GET', token: tokenFor(client) })).status).toBe(405);
    expect((await call('upload', { body: png(), contentType: 'image/png', query: { category: 'avatar' } })).status).toBe(401);
    expect((await call('upload', { token: 'garbage', body: png(), contentType: 'image/png', query: { category: 'avatar' } })).status).toBe(401);
    expect((await call('upload', { token: tokenFor(pending), body: png(), contentType: 'image/png', query: { category: 'avatar' } })).status).toBe(403);
    expect((await call('nope', { token: tokenFor(client), body: png() })).status).toBe(404);
    expect(puts).toHaveLength(0);
  });

  it('is 503 (no work, no Bunny call) when the server-side Bunny config is missing', async () => {
    const client = await insertUser({ _id: 'client-1' });
    const saved = process.env.BUNNY_API_KEY;
    delete process.env.BUNNY_API_KEY;
    try {
      const r = await call('upload', { token: tokenFor(client), body: png(), contentType: 'image/png', query: { category: 'avatar' } });
      expect(r.status).toBe(503);
      expect(r.json.error).toBe('notConfigured');
      const anon = appRouter.createCaller({ req: {} as VercelRequest, res: {} as VercelResponse, user: { id: client._id, role: 'client', accountStatus: 'active', permissions: [], doc: client } });
      expect(await anon.media.status()).toEqual({ configured: false });
    } finally {
      process.env.BUNNY_API_KEY = saved;
    }
    expect(puts).toHaveLength(0);
  });
});

describe('media upload — path ownership', () => {
  it('self-namespace categories land under the SESSION id, whatever the request claims', async () => {
    const client = await insertUser({ _id: 'client-1' });
    const r = await call('upload', {
      token: tokenFor(client),
      body: png(),
      contentType: 'image/webp',
      // A forged clientId must not move the file into someone else's folder.
      query: { category: 'avatar', clientId: 'victim-9' },
    });
    expect(r.status).toBe(200);
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toMatch(new RegExp(`^https://storage\\.bunnycdn\\.com/${ZONE}/Forma/client-1/avatar/[A-Za-z0-9_-]+\\.webp$`));
    expect(puts[0].headers.AccessKey).toBe(KEY);
    expect(r.json.url).toMatch(new RegExp(`^${CDN}/Forma/client-1/avatar/[A-Za-z0-9_-]+\\.webp$`));
    expect(JSON.stringify(r.json)).not.toContain(KEY);
    expect(r.json.kind).toBe('image');

    const progress = await call('upload', { token: tokenFor(client), body: png(), contentType: 'image/jpeg', query: { category: 'progress' } });
    expect(puts[1].url).toMatch(new RegExp(`/Forma/client-1/[A-Za-z0-9_-]+\\.jpg$`));
    expect(progress.status).toBe(200);
    const assessment = await call('upload', { token: tokenFor(client), body: png(), contentType: 'image/png', query: { category: 'assessment' } });
    expect(assessment.status).toBe(200);
    expect(puts[2].url).toMatch(/\/Forma\/client-1\/assessment\/[A-Za-z0-9_-]+\.png$/);
  });

  it('check-in photos: the check-in id is a pinned path segment — traversal is refused', async () => {
    const client = await insertUser({ _id: 'client-1' });
    const ok = await call('upload', { token: tokenFor(client), body: png(), contentType: 'image/png', query: { category: 'checkin', checkInId: 'ci_2026-09-21' } });
    expect(ok.status).toBe(200);
    expect(puts[0].url).toMatch(/\/Forma\/client-1\/checkin\/ci_2026-09-21\/[A-Za-z0-9_-]+\.png$/);
    for (const bad of ['../coach-1', 'a/b', '', 'x'.repeat(65)]) {
      const r = await call('upload', { token: tokenFor(client), body: png(), contentType: 'image/png', query: { category: 'checkin', checkInId: bad } });
      expect(r.status).toBe(400);
    }
    expect(puts).toHaveLength(1);
  });

  it('exercise media: coaches only, under their own id; a client is refused', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const client = await insertUser({ _id: 'client-1' });
    const r = await call('upload', { token: tokenFor(coach), body: png(2048), contentType: 'video/mp4', query: { category: 'exercise', name: 'squat.mp4' } });
    expect(r.status).toBe(200);
    expect(puts[0].url).toMatch(/\/Forma\/coach-1\/exercises\/[A-Za-z0-9_-]+\.mp4$/);
    expect(r.json.kind).toBe('video');
    expect(r.json.name).toBe('squat.mp4');
    const denied = await call('upload', { token: tokenFor(client), body: png(), contentType: 'video/mp4', query: { category: 'exercise' } });
    expect(denied.status).toBe(403);
    expect(puts).toHaveLength(1);
  });

  it('message attachments: only thread participants (client, assigned coach, clients.writeAll) — never another coach or a plain admin', async () => {
    const client = await insertUser({ _id: 'client-1' });
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const otherCoach = await insertUser({ _id: 'coach-2', role: 'coach' });
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    const superAdmin = await insertUser({ _id: 'sa-1', role: 'super_admin' });
    await assign(coach._id, client._id);
    const q = { category: 'message', clientId: client._id, name: 'notes.pdf' };

    expect((await call('upload', { token: tokenFor(client), body: png(), contentType: 'application/pdf', query: q })).status).toBe(200);
    expect((await call('upload', { token: tokenFor(coach), body: png(), contentType: 'application/pdf', query: q })).status).toBe(200);
    expect((await call('upload', { token: tokenFor(superAdmin), body: png(), contentType: 'application/pdf', query: q })).status).toBe(200);
    expect((await call('upload', { token: tokenFor(otherCoach), body: png(), contentType: 'application/pdf', query: q })).status).toBe(403);
    expect((await call('upload', { token: tokenFor(admin), body: png(), contentType: 'application/pdf', query: q })).status).toBe(403);
    expect((await call('upload', { token: tokenFor(coach), body: png(), contentType: 'application/pdf', query: { category: 'message' } })).status).toBe(400);
    expect(puts).toHaveLength(3);
    for (const p of puts) expect(p.url).toMatch(/\/Forma\/client-1\/messages\/[A-Za-z0-9_-]+\.pdf$/);
  });
});

describe('media upload — type & size policy', () => {
  it('refuses the wrong kind for a category, scriptable types anywhere, and unknown categories', async () => {
    const client = await insertUser({ _id: 'client-1' });
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    await assign(coach._id, client._id);
    const t = tokenFor(client);
    expect((await call('upload', { token: t, body: png(), contentType: 'application/pdf', query: { category: 'avatar' } })).status).toBe(415);
    expect((await call('upload', { token: t, body: png(), contentType: 'video/mp4', query: { category: 'progress' } })).status).toBe(415);
    expect((await call('upload', { token: t, body: png(), contentType: 'image/svg+xml', query: { category: 'avatar' } })).status).toBe(415);
    expect((await call('upload', { token: t, body: png(), contentType: 'text/html', query: { category: 'message', clientId: client._id } })).status).toBe(415);
    expect((await call('upload', { token: t, body: png(), contentType: 'application/octet-stream', query: { category: 'message', clientId: client._id, name: 'evil.html' } })).status).toBe(415);
    expect((await call('upload', { token: t, body: png(), contentType: 'image/png', query: { category: 'secrets' } })).status).toBe(400);
    expect((await call('upload', { token: t, body: Buffer.alloc(0), contentType: 'image/png', query: { category: 'avatar' } })).status).toBe(400);
    expect(puts).toHaveLength(0);
  });

  it('cuts an oversized body off at the category limit (avatar 2 MB) with the per-kind code', async () => {
    const client = await insertUser({ _id: 'client-1' });
    const r = await call('upload', { token: tokenFor(client), body: Buffer.alloc(2 * 1024 * 1024 + 1, 1), contentType: 'image/png', query: { category: 'avatar' } });
    expect(r.status).toBe(413);
    expect(r.json.error).toBe('tooLarge');
    expect(puts).toHaveLength(0);
  });
});

describe('media upload — chunked path', () => {
  it('init → chunks → finalize assembles one object in order and cleans up the staging rows', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const t = tokenFor(coach);
    const chunkSize = 4 * 1024 * 1024;
    const size = chunkSize * 2 + 12_345; // 3 chunks, last one partial
    const initRes = await call('init', { token: t, contentType: 'application/json', body: JSON.stringify({ category: 'exercise', mimeType: 'video/mp4', size, name: 'demo.mp4' }) });
    expect(initRes.status).toBe(200);
    expect(initRes.json.totalChunks).toBe(3);
    const uploadId = String(initRes.json.uploadId);

    // Out of order + a wrong-sized middle chunk (refused) + a resend (idempotent upsert).
    expect((await call('chunk', { token: t, body: Buffer.alloc(12_345, 3), query: { uploadId, index: '2' } })).status).toBe(200);
    expect((await call('chunk', { token: t, body: Buffer.alloc(100, 9), query: { uploadId, index: '1' } })).status).toBe(400);
    expect((await call('finalize', { token: t, contentType: 'application/json', body: JSON.stringify({ uploadId }) })).status).toBe(409);
    expect((await call('chunk', { token: t, body: Buffer.alloc(chunkSize, 1), query: { uploadId, index: '0' } })).status).toBe(200);
    expect((await call('chunk', { token: t, body: Buffer.alloc(chunkSize, 2), query: { uploadId, index: '1' } })).status).toBe(200);
    expect((await call('chunk', { token: t, body: Buffer.alloc(chunkSize, 2), query: { uploadId, index: '1' } })).status).toBe(200);
    expect((await call('chunk', { token: t, body: Buffer.alloc(10, 2), query: { uploadId, index: '3' } })).status).toBe(400);

    const fin = await call('finalize', { token: t, contentType: 'application/json', body: JSON.stringify({ uploadId }) });
    expect(fin.status).toBe(200);
    expect(fin.json.size).toBe(size);
    expect(fin.json.url).toMatch(new RegExp(`^${CDN}/Forma/coach-1/exercises/[A-Za-z0-9_-]+\\.mp4$`));
    expect(puts).toHaveLength(1);
    expect(puts[0].bodyLength).toBe(size);
    expect(puts[0].headers['Content-Type']).toBe('video/mp4');

    const db = await getDb();
    expect(await db.collection('mediaUploads').countDocuments({})).toBe(0);
    expect(await db.collection('mediaUploadChunks').countDocuments({})).toBe(0);
    // Finalizing again is a clean 404, not a second PUT.
    expect((await call('finalize', { token: t, contentType: 'application/json', body: JSON.stringify({ uploadId }) })).status).toBe(404);
    expect(puts).toHaveLength(1);
  });

  it('a session belongs to who opened it — another user cannot add chunks to it or finalize it', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const other = await insertUser({ _id: 'coach-2', role: 'coach' });
    const initRes = await call('init', { token: tokenFor(coach), contentType: 'application/json', body: JSON.stringify({ category: 'exercise', mimeType: 'video/mp4', size: 10 }) });
    const uploadId = String(initRes.json.uploadId);
    expect((await call('chunk', { token: tokenFor(other), body: Buffer.alloc(10), query: { uploadId, index: '0' } })).status).toBe(404);
    expect((await call('finalize', { token: tokenFor(other), contentType: 'application/json', body: JSON.stringify({ uploadId }) })).status).toBe(404);
    expect((await call('chunk', { token: tokenFor(coach), body: Buffer.alloc(10), query: { uploadId: 'not-a-uuid', index: '0' } })).status).toBe(400);
    expect(puts).toHaveLength(0);
  });

  it('init applies the same policy as a direct upload (authorization, type, size)', async () => {
    const client = await insertUser({ _id: 'client-1' });
    const t = tokenFor(client);
    const j = (body: object) => ({ token: t, contentType: 'application/json', body: JSON.stringify(body) });
    expect((await call('init', j({ category: 'exercise', mimeType: 'video/mp4', size: 10 }))).status).toBe(403);
    expect((await call('init', j({ category: 'message', clientId: 'client-1', mimeType: 'video/mp4', size: 51 * 1024 * 1024 }))).status).toBe(413);
    expect((await call('init', j({ category: 'message', clientId: 'client-1', mimeType: 'text/html', size: 10 }))).status).toBe(415);
    expect((await call('init', { token: t, contentType: 'application/json', body: '{not json' })).status).toBe(400);
    expect(await (await getDb()).collection('mediaUploads').countDocuments({})).toBe(0);
  });
});

describe('media.listImages (tRPC)', () => {
  function ctxFor(u: UserDoc): Context {
    const user: AuthedUser = { id: u._id, role: u.role, accountStatus: u.accountStatus, permissions: u.permissions, doc: u };
    return { req: {} as VercelRequest, res: {} as VercelResponse, user };
  }

  it('super_admin only; walks the zone server-side and classifies by folder', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    const sa = await insertUser({ _id: 'sa-1', role: 'super_admin' });
    listings = {
      'Forma/': [{ ObjectName: 'client-1', IsDirectory: true, Length: 0 }],
      'Forma/client-1/': [
        { ObjectName: 'a.webp', IsDirectory: false, Length: 10, LastChanged: '2026-09-01' },
        { ObjectName: 'assessment', IsDirectory: true, Length: 0 },
        { ObjectName: 'messages', IsDirectory: true, Length: 0 },
      ],
      'Forma/client-1/assessment/': [{ ObjectName: 'b.png', IsDirectory: false, Length: 20, LastChanged: '2026-09-02' }],
      'Forma/client-1/messages/': [{ ObjectName: 'doc.pdf', IsDirectory: false, Length: 30, LastChanged: '2026-09-03' }],
    };
    await expect(appRouter.createCaller(ctxFor(coach)).media.listImages()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(appRouter.createCaller(ctxFor(admin)).media.listImages()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const imgs = await appRouter.createCaller(ctxFor(sa)).media.listImages();
    expect(imgs.map((i) => [i.path, i.clientId, i.context])).toEqual([
      ['Forma/client-1/assessment/b.png', 'client-1', 'assessment'],
      ['Forma/client-1/a.webp', 'client-1', 'progress'],
    ]);
    expect(imgs[0].url).toBe(`${CDN}/Forma/client-1/assessment/b.png`);
    expect(JSON.stringify(imgs)).not.toContain(KEY);
  });
});
