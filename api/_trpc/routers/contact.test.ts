import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import { sendContactEmail } from '../../_lib/email.js';

vi.mock('../../_lib/email.js', () => ({ sendContactEmail: vi.fn() }));

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
  vi.mocked(sendContactEmail).mockReset();
  vi.mocked(sendContactEmail).mockResolvedValue(undefined);
});

function ctxFor(ip = '203.0.113.7'): Context {
  return {
    req: { headers: { 'x-forwarded-for': ip } } as unknown as VercelRequest,
    res: { setHeader: () => undefined } as unknown as VercelResponse,
    user: null,
  };
}

const valid = {
  name: 'Sara Coach',
  email: 'sara@example.com',
  phone: '+20 155 000 0000',
  role: 'Online coach',
  reason: 'use' as const,
  message: 'I coach about 30 clients online.',
};

describe('contact router', () => {
  it('sends a valid message to the team inbox, signed out', async () => {
    const caller = appRouter.createCaller(ctxFor());
    expect(await caller.contact.submit(valid)).toEqual({ ok: true });
    expect(sendContactEmail).toHaveBeenCalledWith({ ...valid });
  });

  it('rejects input the page would also reject', async () => {
    const caller = appRouter.createCaller(ctxFor());
    await expect(caller.contact.submit({ ...valid, name: 'S' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.contact.submit({ ...valid, email: 'not-an-email' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.contact.submit({ ...valid, message: 'too short' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // @ts-expect-error — not one of the design's reasons
    await expect(caller.contact.submit({ ...valid, reason: 'spam' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it('rejects a filled honeypot without sending', async () => {
    const caller = appRouter.createCaller(ctxFor());
    await expect(caller.contact.submit({ ...valid, website: 'http://spam.example' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it('rate-limits to 5 messages per hour per IP', async () => {
    const caller = appRouter.createCaller(ctxFor('198.51.100.1'));
    for (let i = 0; i < 5; i++) await caller.contact.submit(valid);
    await expect(caller.contact.submit(valid)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    // A different visitor is unaffected.
    await expect(appRouter.createCaller(ctxFor('198.51.100.2')).contact.submit(valid)).resolves.toEqual({ ok: true });
  });

  it('reports CONTACT_UNAVAILABLE when delivery fails (the page then falls back to mailto:)', async () => {
    vi.mocked(sendContactEmail).mockRejectedValueOnce(new Error('Resend down'));
    const caller = appRouter.createCaller(ctxFor());
    await expect(caller.contact.submit(valid)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'CONTACT_UNAVAILABLE' });
  });
});
