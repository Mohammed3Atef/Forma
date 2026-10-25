import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

/**
 * MD-02 (B4.3) — `media.sign` signs personal media only for a viewer who may see it: the owner, the
 * client's CURRENT coach, thread participants for attachments, a client for their coach's avatar,
 * oversight accounts. A coach the client has left, another coach or another client get nothing.
 * Off (no token key): nothing is signed and `status` says so.
 */
let mongod: MongoMemoryServer;
const CDN = 'https://cdn.forma.test';
const ENV = ['BUNNY_URL_TOKEN_KEY', 'BUNNY_CDN_URL'] as const;
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.BUNNY_URL_TOKEN_KEY = 'secret';
  process.env.BUNNY_CDN_URL = CDN;
  const db = await getDb();
  await db.dropDatabase();
  const now = Date.now();
  await db.collection('coachClients').insertMany([
    { _id: 'coach-a__client-1', coachId: 'coach-a', clientId: 'client-1', status: 'active', createdAt: now, updatedAt: now },
    { _id: 'coach-b__client-1', coachId: 'coach-b', clientId: 'client-1', status: 'ended', createdAt: now - 1e9, updatedAt: now - 1e8 },
  ] as never[]);
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function user(id: string, role: UserDoc['role']): AuthedUser {
  return { id, role, accountStatus: 'active', permissions: [], doc: { _id: id, role } as UserDoc };
}
const as = (id: string, role: UserDoc['role']) => appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: user(id, role) } as Context);
const URLS = {
  progress: `${CDN}/Forma/client-1/p1.jpg`,
  attachment: `${CDN}/Forma/client-1/messages/m1.jpg`,
  coachAvatar: `${CDN}/Forma/coach-a/avatar/a.webp`,
  otherAvatar: `${CDN}/Forma/client-2/avatar/z.webp`,
  library: `${CDN}/Forma/coach-a/exercises/demo.mp4`,
};
const signedFor = async (id: string, role: UserDoc['role']) => Object.keys((await as(id, role).media.sign({ urls: Object.values(URLS) })).signed).sort();

describe('media.sign (MD-02)', () => {
  it('the owner and their current coach get signed links to the client\'s photos and attachments; a former coach and other users do not', async () => {
    expect(await signedFor('client-1', 'client')).toEqual([URLS.attachment, URLS.coachAvatar, URLS.progress].sort()); // + their coach's avatar
    expect(await signedFor('coach-a', 'coach')).toEqual([URLS.attachment, URLS.coachAvatar, URLS.progress].sort());
    expect(await signedFor('coach-b', 'coach')).toEqual([]); // the client left coach B
    expect(await signedFor('client-2', 'client')).toEqual([URLS.otherAvatar]); // only their own
    const out = await as('coach-a', 'coach').media.sign({ urls: [URLS.progress] });
    expect(out.signed[URLS.progress].url).toMatch(/^https:\/\/cdn\.forma\.test\/Forma\/client-1\/p1\.jpg\?token=[\w-]+&expires=\d+$/);
  });

  it('oversight accounts may see personal media; library content is never signed (it stays public)', async () => {
    expect(await signedFor('admin-1', 'super_admin')).toEqual([URLS.attachment, URLS.coachAvatar, URLS.otherAvatar, URLS.progress].sort());
  });

  it('off (no token key): nothing is signed and status says so', async () => {
    delete process.env.BUNNY_URL_TOKEN_KEY;
    expect(await as('client-1', 'client').media.sign({ urls: [URLS.progress] })).toEqual({ enabled: false, signed: {} });
    expect((await as('client-1', 'client').media.status()).signedDelivery).toBe(false);
    process.env.BUNNY_URL_TOKEN_KEY = 'secret';
    expect((await as('client-1', 'client').media.status()).signedDelivery).toBe(true);
  });
});
