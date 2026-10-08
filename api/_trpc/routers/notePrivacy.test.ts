import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

/**
 * B0 / CO-02, CO-21 — private coach notes never reach the client API. Only a
 * note the coach explicitly shares is returned to (or notifies) the client;
 * legacy notes with no visibility are treated as private.
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_note_privacy';
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
  return { id: _id, role, accountStatus: 'active', permissions: [], doc };
}
const ctx = (u: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u });

async function setup() {
  const coach = await user('coach-1', 'coach');
  const client = await user('client-1', 'client');
  await (await getDb()).collection('coachClients').insertOne({ _id: 'coach-1__client-1', coachId: 'coach-1', clientId: 'client-1', status: 'active' } as never);
  return { asCoach: appRouter.createCaller(ctx(coach)), asClient: appRouter.createCaller(ctx(client)) };
}

const PRIVATE_TEXT = 'Suspect knee injury — do not mention yet';

describe('coach notes visibility (CO-02 / CO-21)', () => {
  it('a note is private by default: the coach sees it, the client API never returns it', async () => {
    const { asCoach, asClient } = await setup();
    const note = await asCoach.coachNotes.create({ clientId: 'client-1', body: PRIVATE_TEXT });
    expect(note.visibility).toBe('private');
    expect((await asCoach.coachNotes.list({ clientId: 'client-1' })).map((n) => n.body)).toEqual([PRIVATE_TEXT]);
    expect(await asClient.coachNotes.list()).toEqual([]);
    expect(JSON.stringify(await asClient.coachNotes.list({ clientId: 'client-1' }))).not.toContain('knee');
  });

  it('a private note creates no client notification, so its text cannot leak through the bell', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.coachNotes.create({ clientId: 'client-1', body: PRIVATE_TEXT });
    const feed = await asClient.notifications.list();
    expect(feed.notifications.filter((n) => n.type === 'coach_note')).toHaveLength(0);
    expect(JSON.stringify(feed)).not.toContain('knee');
  });

  it('a note explicitly shared with the client is returned and notified', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.coachNotes.create({ clientId: 'client-1', body: PRIVATE_TEXT });
    await asCoach.coachNotes.create({ clientId: 'client-1', body: 'Great week — keep the deload', visibility: 'client' });
    const list = await asClient.coachNotes.list();
    expect(list.map((n) => n.body)).toEqual(['Great week — keep the deload']);
    const feed = await asClient.notifications.list();
    const notes = feed.notifications.filter((n) => n.type === 'coach_note');
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe('Great week — keep the deload');
  });

  it('legacy notes with no visibility are treated as private', async () => {
    const { asCoach, asClient } = await setup();
    await (await getDb()).collection('coachNotes').insertOne({ _id: 'legacy-1', clientId: 'client-1', authorId: 'coach-1', authorRole: 'coach', body: 'Legacy private text', kind: 'note', createdAt: 1, updatedAt: 1 } as never);
    expect(await asClient.coachNotes.list()).toEqual([]);
    expect((await asCoach.coachNotes.list({ clientId: 'client-1' })).map((n) => n._id)).toEqual(['legacy-1']);
  });

  it('old coach_note notifications without the shared marker are returned without their text', async () => {
    const { asClient } = await setup();
    await (await getDb()).collection('notifications').insertOne({ _id: 'n-old', clientId: 'client-1', forRole: 'client', type: 'coach_note', body: 'Legacy private excerpt', seenAt: null, createdAt: 5, createdBy: 'coach-1', updatedAt: 5 } as never);
    const feed = await asClient.notifications.list();
    expect(feed.notifications).toHaveLength(1);
    expect(feed.notifications[0].body).toBeUndefined();
    expect(JSON.stringify(feed)).not.toContain('Legacy private excerpt');
  });

  it('a coach can change a note to client-visible (and back); the client sees only the current state', async () => {
    const { asCoach, asClient } = await setup();
    const n = await asCoach.coachNotes.create({ clientId: 'client-1', body: 'Draft feedback' });
    await asCoach.coachNotes.update({ clientId: 'client-1', id: n._id, body: 'Draft feedback', visibility: 'client' });
    expect((await asClient.coachNotes.list()).map((x) => x._id)).toEqual([n._id]);
    await asCoach.coachNotes.update({ clientId: 'client-1', id: n._id, body: 'Draft feedback', visibility: 'private' });
    expect(await asClient.coachNotes.list()).toEqual([]);
  });

  it('a client cannot create, edit or share notes, and another coach cannot read them', async () => {
    const { asCoach, asClient } = await setup();
    const n = await asCoach.coachNotes.create({ clientId: 'client-1', body: PRIVATE_TEXT });
    await expect(asClient.coachNotes.create({ clientId: 'client-1', body: 'x', visibility: 'client' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asClient.coachNotes.update({ clientId: 'client-1', id: n._id, body: 'x', visibility: 'client' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const other = appRouter.createCaller(ctx(await user('coach-2', 'coach')));
    await expect(other.coachNotes.list({ clientId: 'client-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('assessment review notes are private (CO-02)', () => {
  const assessment = {
    basic: { fullName: 'Client One' },
    goals: {},
    lifestyle: {},
    training: {},
    health: {},
    nutrition: {},
    motivation: {},
    progressPhotos: {},
  };

  it('the coach reads their note back; every client-bound assessment response omits it', async () => {
    const { asCoach, asClient } = await setup();
    await asClient.assessment.submit({ assessment });
    const coachView = await asCoach.assessment.setCoachNotes({ clientId: 'client-1', coachNotes: PRIVATE_TEXT });
    expect(coachView?.coachNotes).toBe(PRIVATE_TEXT);
    expect((await asCoach.assessment.get({ clientId: 'client-1' }))?.coachNotes).toBe(PRIVATE_TEXT);

    expect(await asClient.assessment.get()).not.toHaveProperty('coachNotes');
    expect(await asClient.assessment.saveDraft({ goals: { primary: 'strength' } })).not.toHaveProperty('coachNotes');
    expect(await asClient.assessment.submit({ assessment })).not.toHaveProperty('coachNotes');
    // The note survives the client's resubmission.
    expect((await asCoach.assessment.get({ clientId: 'client-1' }))?.coachNotes).toBe(PRIVATE_TEXT);
  });

  it('the note is stored outside the client-written assessment object', async () => {
    const { asCoach, asClient } = await setup();
    await asClient.assessment.submit({ assessment });
    await asCoach.assessment.setCoachNotes({ clientId: 'client-1', coachNotes: PRIVATE_TEXT });
    const raw = await (await getDb()).collection('clientProfiles').findOne({ _id: 'client-1' } as never);
    expect(raw?.assessment).not.toHaveProperty('coachNotes');
    expect(raw?.privateNotes?.assessment).toBe(PRIVATE_TEXT);
  });

  it('a legacy note stored inside the assessment is still hidden from the client and kept for the coach', async () => {
    const { asCoach, asClient } = await setup();
    await (await getDb()).collection('clientProfiles').insertOne({ _id: 'client-1', clientId: 'client-1', assessment: { ...assessment, status: 'reviewed', coachNotes: 'Legacy review note' }, updatedAt: 1 } as never);
    expect(await asClient.assessment.get()).not.toHaveProperty('coachNotes');
    expect((await asCoach.assessment.get({ clientId: 'client-1' }))?.coachNotes).toBe('Legacy review note');
    // Resubmitting moves it into the private field instead of dropping it.
    expect(await asClient.assessment.submit({ assessment })).not.toHaveProperty('coachNotes');
    expect((await asCoach.assessment.get({ clientId: 'client-1' }))?.coachNotes).toBe('Legacy review note');
  });

  it('review / reset responses (coach-only) never leak to a client caller', async () => {
    const { asClient } = await setup();
    await expect(asClient.assessment.setCoachNotes({ clientId: 'client-1', coachNotes: 'self note' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asClient.assessment.review({ clientId: 'client-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
