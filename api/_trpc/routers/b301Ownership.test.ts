import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';
import { maskEmail } from './invites.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';

/**
 * B3.0.1 — B3-S01 / S01b (relationship records and contact details), B3-S02
 * (author-private notes + the per-author assessment note, owner O-16 / R-1),
 * B3-S03 (public invite lookup), B3-S05 (ended relationships, owner R-2).
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b301_ownership';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod'; // invites.claim signs a real session
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

function userDoc(o: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: `Name ${o._id}`, role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
}
async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const doc = userDoc(o);
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  if (doc.role === 'coach') await ensureCoachPlan(doc._id); // B38F-R3: a real coach always has a plan
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const ctxFor = (user: AuthedUser | null, ip = '203.0.113.7'): Context => ({
  req: { headers: { 'x-forwarded-for': ip } } as unknown as VercelRequest,
  res: { setHeader: () => undefined } as unknown as VercelResponse,
  user,
});
const as = (u: AuthedUser | null, ip?: string) => appRouter.createCaller(ctxFor(u, ip));
const reasonOf = async (p: Promise<unknown>): Promise<{ code: string; reason?: string }> => {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    const err = e as { code?: string; cause?: { reason?: string } };
    return { code: String(err.code), reason: err.cause?.reason };
  }
};
const coachClients = async () => (await getDb()).collection<CoachClientDoc>('coachClients');
const DAY = 86_400_000;

async function relate(coachId: string, clientId: string, over: Partial<CoachClientDoc> = {}) {
  const now = Date.now();
  const o = Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined)) as Partial<CoachClientDoc>;
  const doc: CoachClientDoc = {
    _id: `${coachId}__${clientId}`,
    coachId,
    clientId,
    status: 'active',
    createdBy: 'admin-x',
    createdAt: now - 10 * DAY,
    updatedAt: now,
    inviteCode: `INV-${coachId}`,
    subscription: { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, price: 1200, currency: 'EGP', updatedAt: 1 },
    subscriptionHistory: [{ startAt: now - 40 * DAY, endAt: now - 10 * DAY, price: 1000, status: 'expired', endedAt: now - 10 * DAY }],
    ...o,
  };
  if ('subscriptionHistory' in over && over.subscriptionHistory === undefined) delete doc.subscriptionHistory;
  await (await coachClients()).insertOne(doc);
  if ((o.status ?? 'active') === 'active') await (await getDb()).collection<UserDoc>('users').updateOne({ _id: clientId }, { $set: { assignedCoachId: coachId } });
}
async function transfer(fromCoach: string, toCoach: string, clientId: string) {
  const now = Date.now();
  await (await coachClients()).updateOne({ _id: `${fromCoach}__${clientId}` }, { $set: { status: 'ended', endedAt: now, endReason: 'transferred', mode: 'keep_plans' } });
  await relate(toCoach, clientId, { createdAt: now, subscriptionHistory: undefined });
}

describe('B3-S01 — coachClients.list({ clientId })', () => {
  async function world() {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const stranger = await insertUser({ _id: 'coach-z', role: 'coach' });
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    await relate(coachA.id, client.id, { createdAt: Date.now() - 30 * DAY });
    await transfer(coachA.id, coachB.id, client.id);
    return { client, coachA, coachB, stranger, admin };
  }

  it('the active coach: own record in full, other coaches as timeline facts only (no price, history, invite code, creator)', async () => {
    const { client, coachA, coachB } = await world();
    const rows = await as(coachB).coachClients.list({ clientId: client.id });
    const own = rows.find((r) => r.coachId === coachB.id)!;
    const other = rows.find((r) => r.coachId === coachA.id)!;
    expect(own.subscription?.price).toBe(1200);
    expect(Object.keys(other).sort()).toEqual(['_id', 'clientId', 'coachId', 'createdAt', 'endReason', 'endedAt', 'mode', 'status', 'updatedAt']);
    expect(other).toMatchObject({ status: 'ended', endReason: 'transferred', mode: 'keep_plans' });
  });

  it('a former (transferred-away or released) coach gets only their own record', async () => {
    const { client, coachA, coachB } = await world();
    const rows = await as(coachA).coachClients.list({ clientId: client.id });
    expect(rows.map((r) => r.coachId)).toEqual([coachA.id]);
    expect(rows.some((r) => r.coachId === coachB.id)).toBe(false);
  });

  it('a suspended coach with an active relationship keeps the read (owner R-3); an unrelated coach is FORBIDDEN', async () => {
    const { client, coachB, stranger } = await world();
    const rows = await as({ ...coachB, accountStatus: 'suspended' }).coachClients.list({ clientId: client.id });
    expect(rows).toHaveLength(2);
    expect((await reasonOf(as(stranger).coachClients.list({ clientId: client.id }))).code).toBe('FORBIDDEN');
  });

  it('the client themself gets every record in full; users.read admins get every record without the coaches’ package economics (B38F-R2)', async () => {
    const { client, admin } = await world();
    const own = await as(client).coachClients.list({ clientId: client.id });
    expect(own).toHaveLength(2);
    expect(own.every((r) => r.subscription?.price === 1200)).toBe(true);
    const adminRows = await as(admin).coachClients.list({ clientId: client.id });
    expect(adminRows).toHaveLength(2);
    expect(adminRows.every((r) => r.subscription?.price === undefined && typeof r.subscription?.endAt === 'number')).toBe(true);
  });
});

describe('B3-S01b — adminUsers.get contact details follow ACTIVE relationships only', () => {
  it('active coach ⇄ client: full; former coach ⇄ client: name card (both directions); transfer peers: name card', async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client', phone: '+20100', whatsapp: '+20100' });
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach', phone: '+20111' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach', phone: '+20122' });
    await relate(coachA.id, client.id);
    expect((await as(coachA).adminUsers.get({ id: client.id })).phone).toBe('+20100');
    await transfer(coachA.id, coachB.id, client.id);

    const card = await as(coachA).adminUsers.get({ id: client.id });
    expect(card).toMatchObject({ displayName: 'Name client-1', email: '' });
    expect(card.phone).toBeUndefined();
    expect(card.whatsapp).toBeUndefined();
    expect((await as(client).adminUsers.get({ id: coachA.id })).phone).toBeUndefined();
    expect((await as(client).adminUsers.get({ id: coachB.id })).phone).toBe('+20122');
    expect((await as(coachB).adminUsers.get({ id: client.id })).phone).toBe('+20100');
    expect((await as(coachB).adminUsers.get({ id: coachA.id })).email).toBe('');
  });
});

describe('B3-S02 — coach notes are author-private', () => {
  async function world() {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    const superAdmin = await insertUser({ _id: 'sa-1', role: 'super_admin' });
    await relate(coachA.id, client.id, { createdAt: Date.now() - 30 * DAY });
    const priv = await as(coachA).coachNotes.create({ clientId: client.id, body: 'A private: knee injury' });
    const shared = await as(coachA).coachNotes.create({ clientId: client.id, body: 'A shared: great week', visibility: 'client' });
    await transfer(coachA.id, coachB.id, client.id);
    return { client, coachA, coachB, admin, superAdmin, priv, shared };
  }

  it("after a transfer the new coach sees A's shared note but never A's private one", async () => {
    const { client, coachB } = await world();
    const mine = await as(coachB).coachNotes.create({ clientId: client.id, body: 'B private' });
    const list = await as(coachB).coachNotes.list({ clientId: client.id });
    expect(list.map((n) => n.body).sort()).toEqual(['A shared: great week', 'B private']);
    expect(list.find((n) => n._id === mine._id)?.authorId).toBe(coachB.id);
  });

  it("the new coach cannot edit or delete A's notes: private → NOT_FOUND (no existence leak), shared → FORBIDDEN", async () => {
    const { client, coachB, priv, shared } = await world();
    expect((await reasonOf(as(coachB).coachNotes.update({ clientId: client.id, id: priv._id, body: 'x' }))).code).toBe('NOT_FOUND');
    expect((await reasonOf(as(coachB).coachNotes.delete({ clientId: client.id, id: priv._id }))).code).toBe('NOT_FOUND');
    expect((await reasonOf(as(coachB).coachNotes.update({ clientId: client.id, id: shared._id, body: 'x' }))).code).toBe('FORBIDDEN');
    expect((await reasonOf(as(coachB).coachNotes.delete({ clientId: client.id, id: shared._id }))).code).toBe('FORBIDDEN');
    expect((await reasonOf(as(coachB).coachNotes.update({ clientId: client.id, id: 'no-such-note', body: 'x' }))).code).toBe('NOT_FOUND');
    const raw = await (await getDb()).collection('coachNotes').find({}).toArray();
    expect(raw.map((n) => n.body).sort()).toEqual(['A private: knee injury', 'A shared: great week']);
  });

  it('the author can still edit and delete their own note; the former coach has no access at all', async () => {
    const { client, coachA, coachB } = await world();
    const mine = await as(coachB).coachNotes.create({ clientId: client.id, body: 'B draft' });
    expect((await as(coachB).coachNotes.update({ clientId: client.id, id: mine._id, body: 'B final' })).body).toBe('B final');
    await as(coachB).coachNotes.delete({ clientId: client.id, id: mine._id });
    expect((await reasonOf(as(coachA).coachNotes.list({ clientId: client.id }))).code).toBe('FORBIDDEN');
    expect((await reasonOf(as(coachA).coachNotes.create({ clientId: client.id, body: 'x' }))).code).toBe('FORBIDDEN');
  });

  it('the client still sees only shared notes', async () => {
    const { client } = await world();
    expect((await as(client).coachNotes.list()).map((n) => n.body)).toEqual(['A shared: great week']);
  });

  it('admin oversight reads every note and is AUDITED when it shows another author\'s private note (ids and counts only)', async () => {
    const { client, admin, superAdmin, priv } = await world();
    const all = await as(admin).coachNotes.list({ clientId: client.id });
    expect(all).toHaveLength(2);
    const audit = await (await getDb()).collection('adminAuditLogs').find({ action: 'coachNotes.readPrivate' }).toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: admin.id, targetUserId: client.id, metadata: { count: 1, noteIds: [priv._id] } });
    expect(JSON.stringify(audit[0])).not.toContain('knee');
    // writeAll may correct any note.
    expect((await as(superAdmin).coachNotes.update({ clientId: client.id, id: priv._id, body: 'corrected' })).body).toBe('corrected');
  });

  it('legacy notes (no authorId) belong to the coach whose relationship covered them — admin-only otherwise', async () => {
    const { client, coachB } = await world();
    const notes = (await getDb()).collection('coachNotes');
    await notes.insertOne({ _id: 'legacy-before', clientId: client.id, body: 'legacy from A era', createdAt: Date.now() - 20 * DAY, updatedAt: 1 } as never);
    await notes.insertOne({ _id: 'legacy-mine', clientId: client.id, body: 'legacy in B era', createdAt: Date.now() + 1000, updatedAt: 1 } as never);
    const bodies = (await as(coachB).coachNotes.list({ clientId: client.id })).map((n) => n.body);
    expect(bodies).toContain('legacy in B era');
    expect(bodies).not.toContain('legacy from A era');
    expect((await reasonOf(as(coachB).coachNotes.delete({ clientId: client.id, id: 'legacy-before' }))).code).toBe('NOT_FOUND');
    expect((await reasonOf(as(coachB).coachNotes.update({ clientId: client.id, id: 'legacy-mine', body: 'edited' }))).code).toBe('OK');
  });
});

describe('B3-S02 — the assessment private note is per author', () => {
  const assessment = { basic: { fullName: 'Client One' }, goals: {}, lifestyle: {}, training: {}, health: {}, nutrition: {}, motivation: {}, progressPhotos: {} };
  async function world() {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    await relate(coachA.id, client.id, { createdAt: Date.now() - 30 * DAY });
    await as(client).assessment.submit({ assessment });
    return { client, coachA, coachB, admin };
  }
  const profile = async () => (await getDb()).collection('clientProfiles').findOne({ _id: 'client-1' } as never);

  it("A writes, the client is transferred: B reads nothing; B's write never touches A's note", async () => {
    const { client, coachA, coachB } = await world();
    await as(coachA).assessment.setCoachNotes({ clientId: client.id, coachNotes: 'A: watch the left shoulder' });
    await transfer(coachA.id, coachB.id, client.id);
    expect((await as(coachB).assessment.get({ clientId: client.id }))?.coachNotes).toBeUndefined();
    const bView = await as(coachB).assessment.setCoachNotes({ clientId: client.id, coachNotes: 'B: start light' });
    expect(bView?.coachNotes).toBe('B: start light');
    const raw = await profile();
    expect(raw?.privateNotes?.assessmentByAuthor).toMatchObject({ [coachA.id]: { text: 'A: watch the left shoulder' }, [coachB.id]: { text: 'B: start light' } });
    expect(await as(client).assessment.get()).not.toHaveProperty('coachNotes');
  });

  it('legacy single note WITH an author: only that author reads it; their next write supersedes it, nobody else erases it', async () => {
    const { client, coachA, coachB } = await world();
    await (await getDb()).collection('clientProfiles').updateOne({ _id: client.id } as never, { $set: { 'privateNotes.assessment': 'legacy A note', 'privateNotes.updatedBy': coachA.id, 'privateNotes.updatedAt': 1 } });
    expect((await as(coachA).assessment.get({ clientId: client.id }))?.coachNotes).toBe('legacy A note');
    await transfer(coachA.id, coachB.id, client.id);
    expect((await as(coachB).assessment.get({ clientId: client.id }))?.coachNotes).toBeUndefined();
    await as(coachB).assessment.setCoachNotes({ clientId: client.id, coachNotes: 'B note' });
    expect((await profile())?.privateNotes?.assessment).toBe('legacy A note');
  });

  it("the author's own write migrates the legacy note into their entry", async () => {
    const { client, coachA } = await world();
    await (await getDb()).collection('clientProfiles').updateOne({ _id: client.id } as never, { $set: { 'privateNotes.assessment': 'old text', 'privateNotes.updatedBy': coachA.id } });
    await as(coachA).assessment.setCoachNotes({ clientId: client.id, coachNotes: 'new text' });
    const raw = await profile();
    expect(raw?.privateNotes?.assessment).toBeUndefined();
    expect(raw?.privateNotes?.assessmentByAuthor?.[coachA.id]?.text).toBe('new text');
  });

  it('legacy note WITHOUT an author: visible to a coach only if the client never had another coach; kept for admins', async () => {
    const { client, coachA, coachB, admin } = await world();
    await (await getDb()).collection('clientProfiles').updateOne({ _id: client.id } as never, { $set: { 'assessment.coachNotes': 'pre-B0 inline note' } });
    expect((await as(coachA).assessment.get({ clientId: client.id }))?.coachNotes).toBe('pre-B0 inline note');
    await transfer(coachA.id, coachB.id, client.id);
    expect((await as(coachB).assessment.get({ clientId: client.id }))?.coachNotes).toBeUndefined();
    // B writes its own note: the inline legacy note is MOVED (not deleted) out of the client-written object.
    await as(coachB).assessment.setCoachNotes({ clientId: client.id, coachNotes: 'B note' });
    const raw = await profile();
    expect(raw?.assessment).not.toHaveProperty('coachNotes');
    expect(raw?.privateNotes?.assessment).toBe('pre-B0 inline note');
    expect((await as(coachB).assessment.get({ clientId: client.id }))?.coachNotes).toBe('B note');
    // Admin oversight: the current coach's note, audited.
    expect((await as(admin).assessment.get({ clientId: client.id }))?.coachNotes).toBe('B note');
    expect(await (await getDb()).collection('adminAuditLogs').countDocuments({ action: 'assessment.readPrivateNote', actorId: admin.id })).toBe(1);
  });
});

describe('B3-S03 — public invite lookup', () => {
  async function invite(o: Record<string, unknown> = {}) {
    const coach = await insertUser({ _id: 'coach-a', role: 'coach' });
    await (await getDb()).collection('coachPlans').updateOne({ _id: 'coach-a' as never }, { $set: { plan: 'trial', status: 'active', maxClients: 5, activeClientCount: 0, endsAt: null } }, { upsert: true });
    const created = await as(coach).invites.create({ email: 'mona.client@gmail.com', displayName: 'Mona', phone: '+201234', subPrice: 1500, subStatus: 'active', subMonths: 1, ...o });
    return { coach, code: created._id };
  }

  it('returns only what the claim screen needs — no email, phone, coach id, price or creator', async () => {
    const { code } = await invite();
    const pub = await as(null).invites.getByCode({ code });
    expect(pub).toEqual({ _id: code, status: 'pending', claimable: true, expiresAt: expect.any(Number), coachName: 'Name coach-a', displayName: 'Mona', hasEmail: true, emailHint: 'm•••@gmail.com' });
    const wire = JSON.stringify(pub);
    for (const secret of ['mona.client', '+201234', '1500', 'coachId', 'subPrice', 'createdBy', 'claimedByUid']) expect(wire).not.toContain(secret);
  });

  it('the masked hint format; an invite without email says so', async () => {
    expect(maskEmail('ab@x.io')).toBe('a•••@x.io');
    expect(maskEmail('broken')).toBe('•••');
    const { code } = await invite({ email: undefined });
    expect(await as(null).invites.getByCode({ code })).toMatchObject({ hasEmail: false });
    expect(await as(null).invites.getByCode({ code })).not.toHaveProperty('emailHint');
  });

  it('claim still works: an emailed invite needs no email input (the server uses its own); a no-email invite takes the typed one', async () => {
    const { code } = await invite();
    const joined = await as(null).invites.claim({ code, phone: '+20999', password: 'password123' });
    expect(joined.user.email).toBe('mona.client@gmail.com');
    await (await getDb()).collection('signupInvites').insertOne({ _id: 'NOEMAIL1', coachId: 'coach-a', status: 'pending', claimedByUid: null, createdAt: Date.now(), claimedAt: null, expiresAt: null, subStatus: 'trial' } as never);
    expect((await as(null).invites.claim({ code: 'NOEMAIL1', email: 'typed@x.io', phone: '+20888', password: 'password123' })).user.email).toBe('typed@x.io');
  });

  it('per-IP rate limits: lookup 30 / 10 min, claim 10 / 10 min (TOO_MANY_REQUESTS), other IPs unaffected', async () => {
    const { code } = await invite();
    for (let i = 0; i < 30; i += 1) await as(null, '198.51.100.1').invites.getByCode({ code });
    expect((await reasonOf(as(null, '198.51.100.1').invites.getByCode({ code }))).code).toBe('TOO_MANY_REQUESTS');
    expect((await reasonOf(as(null, '198.51.100.2').invites.getByCode({ code }))).code).toBe('OK');
    for (let i = 0; i < 10; i += 1) await reasonOf(as(null, '198.51.100.3').invites.claim({ code: 'NOPE0000', phone: '1', password: 'password123' }));
    expect((await reasonOf(as(null, '198.51.100.3').invites.claim({ code, phone: '1', password: 'password123' }))).code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('B3-S05 — an ended relationship is no longer the former coach\'s to change', () => {
  it('former coach → CONFLICT RELATIONSHIP_ENDED (nothing written); an admin correction succeeds and is audited', async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const superAdmin = await insertUser({ _id: 'sa-1', role: 'super_admin' });
    await relate(coachA.id, client.id);
    await transfer(coachA.id, coachB.id, client.id);
    const id = `${coachA.id}__${client.id}`;
    const before = await (await coachClients()).findOne({ _id: id });
    for (const sub of [{ op: 'extend' as const, days: 5 }, { op: 'correct' as const, price: 1 }, { op: 'renew' as const }, { op: 'cancel' as const }]) {
      expect(await reasonOf(as(coachA).coachClients.updateSubscription({ id, sub }))).toEqual({ code: 'CONFLICT', reason: 'RELATIONSHIP_ENDED' });
    }
    expect((await (await coachClients()).findOne({ _id: id }))?.subscription).toEqual(before?.subscription);

    const corrected = await as(superAdmin).coachClients.updateSubscription({ id, sub: { op: 'correct', price: 999 } });
    expect(corrected.subscription?.price).toBe(999);
    const audit = await (await getDb()).collection('adminAuditLogs').findOne({ action: 'subscription.correct' });
    expect(audit).toMatchObject({ actorId: superAdmin.id, targetUserId: client.id, metadata: { relationshipId: id, relationshipStatus: 'ended' } });
    expect(corrected.subscriptionEvents?.at(-1)).toMatchObject({ op: 'correct', actorRole: 'admin' });
    // The active coach is unaffected.
    await expect(as(coachB).coachClients.updateSubscription({ id: `${coachB.id}__${client.id}`, sub: { op: 'correct', price: 1300 } })).resolves.toBeTruthy();
  });
});
