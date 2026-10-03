/**
 * Forma single-plan + client-capacity add-ons — the commercial model's
 * contract (spec §50–52, tests 1–37, plus config propagation / signup gates).
 * Real Mongo transactions on a one-member replica set; no production data.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { DAY_MS, coachPlanRequestsCol, coachPlansCol, type CoachPlanDoc } from '../../coach-plans/_data.js';
import { addMonths, capacityEntitlementsCol, recomputeCapacity } from '../../coach-plans/_capacity.js';
import { computeTermStart } from '../../coach-plans/_subscription.js';
import { expireCapacity, expireSubscriptions, expireStalePlanRequests } from '../../cron/daily-maintenance.js';
import type { SignupInviteDoc } from '../../coach-clients/_handlers/invites-types.js';

let mongod: MongoMemoryReplSet;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
}, 90_000);

afterAll(async () => {
  await mongod.stop();
});

beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

// ---- fixtures ---------------------------------------------------------------

function userDoc(overrides: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  const id = overrides._id ?? 'user-1';
  return {
    _id: id,
    email: `${id}@example.com`,
    emailLower: `${id}@example.com`,
    passwordHash: 'irrelevant',
    displayName: `Name ${id}`,
    role: 'coach',
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
const authed = (doc: UserDoc): AuthedUser => ({ id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc });
const ctxFor = (user: AuthedUser | null): Context => ({
  req: { headers: {} } as unknown as VercelRequest,
  res: { setHeader: () => undefined } as unknown as VercelResponse,
  user,
});
const caller = (doc: UserDoc | null) => appRouter.createCaller(ctxFor(doc ? authed(doc) : null));
const code = (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code ?? 'ERR');
/** The machine reason carried on a refusal (surfaced to HTTP clients as `error.data.reason`). */
const reason = (p: Promise<unknown>) => p.then(() => 'OK', (e: { cause?: { reason?: string } }) => e.cause?.reason ?? 'NONE');
const settle = <T,>(ps: Promise<T>[]) => Promise.allSettled(ps);

type FormaSave = Parameters<ReturnType<typeof caller>['coachPlanTiers']['save']>[0];
const formaInput = (o: Partial<FormaSave> = {}): FormaSave => ({
  trialEnabled: true,
  trialDurationDays: 15,
  trialClientLimit: null,
  maxClients: 25,
  priceMonthly: 499,
  currency: 'EGP',
  termDays: 30,
  publicVisible: true,
  signupEnabled: true,
  marketingTitle: { en: 'Forma', ar: 'فورما' },
  marketingDescription: { en: 'One plan. Everything included.', ar: 'خطة واحدة.' },
  marketingFeatures: { en: ['Everything'], ar: ['كل شيء'] },
  ...o,
});

type PackageSave = Parameters<ReturnType<typeof caller>['coachCommercial']['savePackage']>[0];
const pkgInput = (o: Partial<PackageSave> = {}): PackageSave => ({
  name: { en: '+20 clients', ar: '+٢٠ عميل' },
  additionalClients: 20,
  price: 199,
  currency: 'EGP',
  billingInterval: 'month',
  durationMonths: 1,
  active: true,
  coachVisible: true,
  ...o,
});

/** A coach on the PAID Forma subscription with an explicit base capacity. */
async function givePaidPlan(coachId: string, base = 25, overrides: Partial<CoachPlanDoc> = {}) {
  const now = Date.now();
  await (await coachPlansCol()).insertOne({
    _id: coachId,
    plan: 'forma',
    status: 'active',
    maxClients: base,
    baseMaxClients: base,
    addonClientCapacity: 0,
    manualCapacityAdjustment: 0,
    startedAt: now,
    endsAt: now + 30 * DAY_MS,
    activeClientCount: 0,
    history: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}
const planOf = async (id: string) => (await coachPlansCol()).findOne({ _id: id });

let sup: UserDoc;
let admin: UserDoc;
beforeEach(async () => {
  sup = await insertUser({ _id: 'sa', role: 'super_admin' });
  admin = await insertUser({ _id: 'admin', role: 'admin' });
});

async function signupCoach(email: string) {
  await caller(null).auth.signup({ email, password: 'password123', displayName: email.split('@')[0], role: 'coach' });
  const u = await (await getDb()).collection<UserDoc>('users').findOne({ emailLower: email });
  return u!;
}

async function requestAndConfirmPackage(coach: UserDoc, packageId: string) {
  const r = await caller(coach).coachPlanRequests.submitCapacity({ packageId });
  await caller(sup).coachPlanRequests.confirm({ requestId: r.id });
  return r;
}

async function assignClients(coach: UserDoc, n: number, prefix = 'cl') {
  for (let i = 0; i < n; i += 1) {
    const c = await insertUser({ _id: `${prefix}-${coach._id}-${i}`, role: 'client' });
    await caller(coach).coachClients.assign({ clientId: c._id, subscription: { status: 'trial', trialDays: 14 } });
  }
}
const activeRelCount = async (coachId: string) => (await getDb()).collection('coachClients').countDocuments({ coachId, status: 'active' });

// ---- §50 base subscription --------------------------------------------------

describe('Forma — one public product, Trial-first', () => {
  it('1. exactly one public Forma product; hidden when the Super Admin turns public visibility off; no capacity packages leak', async () => {
    await caller(sup).coachCommercial.savePackage(pkgInput());
    const pub = await caller(null).coachPlanTiers.public();
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ key: 'forma', maxClients: 25, priceMonthly: 499, currency: 'EGP', trialEnabled: true, trialDurationDays: 15 });
    expect(JSON.stringify(pub)).not.toContain('+20 clients');
    await caller(sup).coachPlanTiers.save(formaInput({ publicVisible: false }));
    expect(await caller(null).coachPlanTiers.public()).toEqual([]);
  });

  it('2–4. signup always starts the Trial, with duration and client limit taken from the Admin config', async () => {
    await caller(sup).coachPlanTiers.save(formaInput({ trialDurationDays: 10, trialClientLimit: 5 }));
    const before = Date.now();
    const coach = await signupCoach('new@example.com');
    const plan = (await planOf(coach._id))!;
    expect(plan.plan).toBe('trial');
    expect(plan.status).toBe('active');
    expect(plan.maxClients).toBe(5);
    expect(plan.baseMaxClients).toBe(5);
    expect(plan.endsAt! - plan.startedAt).toBe(10 * DAY_MS);
    expect(plan.startedAt).toBeGreaterThanOrEqual(before);
    expect(await (await coachPlanRequestsCol()).countDocuments({ coachId: coach._id })).toBe(0); // no payment request at signup
  });

  it('signup is refused when the Super Admin closes it; with the Trial disabled the coach gets an already-ended plan (no free access)', async () => {
    await caller(sup).coachPlanTiers.save(formaInput({ signupEnabled: false }));
    expect(await code(caller(null).auth.signup({ email: 'x@example.com', password: 'password123', displayName: 'x', role: 'coach' }))).toBe('FORBIDDEN');
    await caller(sup).coachPlanTiers.save(formaInput({ trialEnabled: false }));
    const coach = await signupCoach('nt@example.com');
    const plan = (await planOf(coach._id))!;
    expect(plan.status).toBe('expired');
    expect((await caller(coach).coachPlans.me()).state).toBe('expired');
  });

  it('5. the Trial uses all Forma features — the same feature list, and paid-level actions work during the Trial', async () => {
    const coach = await signupCoach('t@example.com');
    const pub = (await caller(null).coachPlanTiers.public())[0];
    const ov = await caller(coach).coachCommercial.myOverview();
    expect(ov.config.marketingFeatures).toEqual(pub.marketingFeatures);
    expect(ov.plan?.phase).toBe('trial');
    // Inviting and adding clients are available on the Trial.
    expect(await code(caller(coach).invites.create({}))).toBe('OK');
    await assignClients(coach, 2);
    expect(await activeRelCount(coach._id)).toBe(2);
  });

  it('6. an expired Trial keeps the account usable (login, My Plan, request) but blocks adding clients with SUBSCRIPTION_EXPIRED', async () => {
    const coach = await signupCoach('e@example.com');
    await (await coachPlansCol()).updateOne({ _id: coach._id }, { $set: { endsAt: Date.now() - 1 } });
    await expireSubscriptions();
    expect((await (await getDb()).collection<UserDoc>('users').findOne({ _id: coach._id }))?.accountStatus).toBe('active');
    expect((await caller(coach).coachPlans.me()).state).toBe('expired');
    expect((await caller(coach).coachCommercial.myOverview()).plan?.state).toBe('expired');
    const c = await insertUser({ _id: 'cl-x', role: 'client' });
    const attempt = caller(coach).coachClients.assign({ clientId: c._id, subscription: { status: 'trial' } });
    expect(await reason(attempt)).toBe('SUBSCRIPTION_EXPIRED');
    // The cron already raised a subscription request; a manual submit is "pending", not a duplicate.
    expect(await reason(caller(coach).coachPlanRequests.submitSubscription())).toBe('SUBSCRIPTION_REQUEST_PENDING');
    expect((await caller(coach).coachPlanRequests.mine())[0]).toMatchObject({ type: 'trial_expired', status: 'awaiting' });
  });

  it('7–10. the request snapshots the CURRENT price; later edits never change it; confirm activates Forma with the term starting at confirmation', async () => {
    const coach = await signupCoach('p@example.com');
    const req = await caller(coach).coachPlanRequests.submitSubscription();
    expect(req.planSnapshot).toMatchObject({ priceMonthly: 499, currency: 'EGP', maxClients: 25, termDays: 30 });
    await caller(sup).coachPlanTiers.save(formaInput({ priceMonthly: 799, termDays: 60 }));
    const stored = await (await coachPlanRequestsCol()).findOne({ _id: req.id });
    expect(stored?.planSnapshot?.priceMonthly).toBe(499);

    const before = Date.now();
    await caller(sup).coachPlanRequests.confirm({ requestId: req.id });
    const plan = (await planOf(coach._id))!;
    expect(plan.plan).toBe('forma');
    expect(plan.status).toBe('active');
    expect(plan.subscription).toMatchObject({ priceMonthly: 499, termDays: 30, requestId: req.id });
    expect(plan.startedAt).toBeGreaterThanOrEqual(before);
    expect(plan.endsAt! - plan.startedAt).toBe(30 * DAY_MS);
    expect(plan.maxClients).toBe(25);
    const audit = await (await getDb()).collection('adminAuditLogs').findOne({ action: 'subscription.confirmed', targetUserId: coach._id });
    expect(audit).toBeTruthy();
  });

  it('11–12. renewal: one open renewal at a time, concurrent confirms apply exactly once', async () => {
    const coach = await insertUser({ _id: 'paid', role: 'coach' });
    await givePaidPlan(coach._id);
    const r = await caller(coach).coachPlanRequests.submitSubscription();
    expect(r.type).toBe('renewal');
    expect(await reason(caller(coach).coachPlanRequests.submitSubscription())).toBe('SUBSCRIPTION_REQUEST_PENDING');
    const rs = await settle([caller(sup).coachPlanRequests.confirm({ requestId: r.id }), caller(sup).coachPlanRequests.confirm({ requestId: r.id })]);
    expect(rs.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const plan = (await planOf(coach._id))!;
    expect(plan.history?.filter((h) => h.action === 'subscription.renewed')).toHaveLength(1);
    expect(await (await getDb()).collection('adminAuditLogs').countDocuments({ action: 'subscription.renewed' })).toBe(1);
  });

  it('a past-deadline request cannot be confirmed and expires without touching the plan', async () => {
    const coach = await signupCoach('d@example.com');
    const r = await caller(coach).coachPlanRequests.submitSubscription();
    await (await coachPlanRequestsCol()).updateOne({ _id: r.id }, { $set: { confirmationDeadline: Date.now() - 1 } });
    expect(await reason(caller(sup).coachPlanRequests.confirm({ requestId: r.id }))).toBe('REQUEST_ALREADY_RESOLVED');
    expect((await expireStalePlanRequests()).expired).toBe(1);
    expect((await planOf(coach._id))?.plan).toBe('trial');
  });

  it('config: a HIGHER base limit lifts existing coaches (keeping add-ons); a LOWER one never reduces anyone', async () => {
    const coach = await insertUser({ _id: 'paid', role: 'coach' });
    await givePaidPlan(coach._id, 25, { addonClientCapacity: 20, maxClients: 45 });
    const up = await caller(sup).coachPlanTiers.save(formaInput({ maxClients: 30 }));
    expect(up.raisedPaidCoaches).toBe(1);
    expect(await planOf(coach._id)).toMatchObject({ baseMaxClients: 30, maxClients: 50 });
    await caller(sup).coachPlanTiers.save(formaInput({ maxClients: 10 }));
    expect(await planOf(coach._id)).toMatchObject({ baseMaxClients: 30, maxClients: 50 });
  });
});

// ---- §51 capacity -----------------------------------------------------------

describe('Client-capacity add-ons', () => {
  let coach: UserDoc;
  let p20: string;
  let p30: string;
  beforeEach(async () => {
    coach = await insertUser({ _id: 'coach', role: 'coach' });
    await givePaidPlan(coach._id, 25);
    p20 = (await caller(sup).coachCommercial.savePackage(pkgInput())).id;
    p30 = (await caller(sup).coachCommercial.savePackage(pkgInput({ name: { en: '+30 clients', ar: '+٣٠' }, additionalClients: 30, price: 279 }))).id;
  });

  it('13–17. base 25 → 25; unconfirmed +20 changes nothing; confirmed +20 → 45; +20 and +30 → 75', async () => {
    expect((await caller(coach).coachCommercial.myOverview()).plan?.maxClients).toBe(25);
    const r = await caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 });
    expect((await planOf(coach._id))?.maxClients).toBe(25);
    await caller(sup).coachPlanRequests.confirm({ requestId: r.id });
    expect(await planOf(coach._id)).toMatchObject({ maxClients: 45, baseMaxClients: 25, addonClientCapacity: 20 });
    await requestAndConfirmPackage(coach, p30);
    expect((await planOf(coach._id))?.maxClients).toBe(75);
    const ov = await caller(coach).coachCommercial.myOverview();
    expect(ov.activeEntitlements.map((e) => e.snapshot.additionalClients).sort()).toEqual([20, 30]);
  });

  it('18–20. rejected, expired and cancelled requests change nothing', async () => {
    const a = await caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 });
    await caller(sup).coachPlanRequests.reject({ requestId: a.id, adminNote: 'no payment' });
    const b = await caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 });
    await (await coachPlanRequestsCol()).updateOne({ _id: b.id }, { $set: { confirmationDeadline: Date.now() - 1 } });
    await expireStalePlanRequests();
    const c = await caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 });
    await caller(coach).coachPlanRequests.cancel({ id: c.id });
    expect((await planOf(coach._id))?.maxClients).toBe(25);
    expect(await (await capacityEntitlementsCol()).countDocuments({})).toBe(0);
    const statuses = (await caller(coach).coachPlanRequests.mine()).map((r) => r.status).sort();
    expect(statuses).toEqual(['cancelled', 'expired', 'rejected']);
  });

  it('21–22. the snapshot survives later package price and additionalClients edits', async () => {
    const r = await caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 });
    await caller(sup).coachCommercial.savePackage(pkgInput({ id: p20, price: 999, additionalClients: 5 }));
    await caller(sup).coachPlanRequests.confirm({ requestId: r.id });
    const ent = await (await capacityEntitlementsCol()).findOne({ coachId: coach._id });
    expect(ent?.snapshot).toMatchObject({ price: 199, additionalClients: 20 });
    expect((await planOf(coach._id))?.maxClients).toBe(45);
  });

  it('23–26. expiry drops capacity; the over-cap coach keeps every client but cannot add, invite-join or transfer in', async () => {
    await caller(sup).coachPlanTiers.save(formaInput({ maxClients: 2 }));
    const small = await insertUser({ _id: 'small', role: 'coach' });
    await givePaidPlan(small._id, 2);
    await requestAndConfirmPackage(small, p20);
    await assignClients(small, 5);
    expect(await planOf(small._id)).toMatchObject({ maxClients: 22, activeClientCount: 5 });

    await (await capacityEntitlementsCol()).updateMany({ coachId: small._id }, { $set: { endsAt: Date.now() - 1 } });
    const res = await expireCapacity();
    expect(res.expired).toBe(1);
    expect(await planOf(small._id)).toMatchObject({ maxClients: 2, activeClientCount: 5 });
    expect(await activeRelCount(small._id)).toBe(5); // nobody removed

    const extra = await insertUser({ _id: 'extra', role: 'client' });
    expect(await reason(caller(small).coachClients.assign({ clientId: extra._id, subscription: { status: 'trial' } }))).toBe('CLIENT_CAPACITY_REACHED');
    const invite: SignupInviteDoc = { _id: 'INVT2222', coachId: small._id, status: 'pending', claimedByUid: null, createdAt: Date.now(), claimedAt: null, expiresAt: null, subStatus: 'trial' };
    await (await getDb()).collection<SignupInviteDoc>('signupInvites').insertOne(invite);
    expect(await reason(caller(null).invites.claim({ code: 'INVT2222', email: 'z@example.com', phone: '1', password: 'password123' }))).toBe('CLIENT_CAPACITY_REACHED');
    expect(await activeRelCount(small._id)).toBe(5);
  });

  it('removing an add-on (admin) never deletes clients and reports before/after', async () => {
    await requestAndConfirmPackage(coach, p20);
    await assignClients(coach, 3);
    const ent = (await (await capacityEntitlementsCol()).findOne({ coachId: coach._id }))!;
    const out = await caller(sup).coachCommercial.cancelEntitlement({ entitlementId: ent._id, reason: 'refund' });
    expect(out).toMatchObject({ before: 45, after: 25, activeClients: 3 });
    expect(await activeRelCount(coach._id)).toBe(3);
    expect(await code(caller(sup).coachCommercial.cancelEntitlement({ entitlementId: ent._id }))).toBe('CONFLICT');
  });

  it('27. manual adjustment (positive and negative) with a mandatory reason; floored at zero', async () => {
    await caller(sup).coachCommercial.setManualAdjustment({ coachId: coach._id, value: 5, reason: 'goodwill' });
    expect((await planOf(coach._id))?.maxClients).toBe(30);
    await caller(sup).coachCommercial.setManualAdjustment({ coachId: coach._id, value: -100, reason: 'clamp test' });
    expect((await planOf(coach._id))?.maxClients).toBe(0);
    expect(await code(caller(sup).coachCommercial.setManualAdjustment({ coachId: coach._id, value: 1, reason: '' }))).toBe('BAD_REQUEST');
    expect((await planOf(coach._id))?.manualCapacityNote).toMatchObject({ reason: 'clamp test', by: sup._id });
  });

  it('28. a direct custom grant creates a real entitlement, history and an audit row', async () => {
    const out = await caller(sup).coachCommercial.grantCustom({ coachId: coach._id, additionalClients: 7, billingInterval: 'one_time', note: 'event partner', price: 0, currency: 'EGP' });
    expect(out).toMatchObject({ before: 25, after: 32 });
    expect(out.entitlement).toMatchObject({ source: 'admin_custom', sourcePackageId: null, endsAt: null });
    const audit = await (await getDb()).collection('adminAuditLogs').findOne({ action: 'capacity.granted_custom', targetUserId: coach._id });
    expect(audit?.metadata).toMatchObject({ before: 25, after: 32, note: 'event partner' });
    expect((await planOf(coach._id))?.history?.some((h) => h.action === 'capacity.granted')).toBe(true);
  });

  it('29. one active entitlement per package: a second purchase RENEWS (extends) instead of stacking; duplicate open requests are refused', async () => {
    await requestAndConfirmPackage(coach, p20);
    const first = (await (await capacityEntitlementsCol()).findOne({ coachId: coach._id }))!;
    const r = await caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 });
    expect(await reason(caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 }))).toBe('CAPACITY_REQUEST_PENDING');
    await caller(sup).coachPlanRequests.confirm({ requestId: r.id });
    const ents = await (await capacityEntitlementsCol()).find({ coachId: coach._id, status: 'active' }).toArray();
    expect(ents).toHaveLength(1);
    expect(ents[0].endsAt!).toBeGreaterThan(first.endsAt!);
    expect(ents[0].renewals).toHaveLength(1);
    expect((await planOf(coach._id))?.maxClients).toBe(45);
  });

  it('30. concurrent confirmations of one capacity request apply once', async () => {
    const r = await caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 });
    const rs = await settle([0, 1, 2].map(() => caller(sup).coachPlanRequests.confirm({ requestId: r.id })));
    expect(rs.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await (await capacityEntitlementsCol()).countDocuments({ coachId: coach._id })).toBe(1);
    expect((await planOf(coach._id))?.maxClients).toBe(45);
  });

  it('31. one free slot (base + add-on) and concurrent joins → exactly one succeeds', async () => {
    await caller(sup).coachCommercial.grantCustom({ coachId: coach._id, additionalClients: 1, billingInterval: 'one_time', note: 'slot' });
    await (await coachPlansCol()).updateOne({ _id: coach._id }, { $set: { activeClientCount: 25 } });
    const a = await insertUser({ _id: 'ja', role: 'client' });
    const b = await insertUser({ _id: 'jb', role: 'client' });
    const rs = await settle([
      caller(coach).coachClients.assign({ clientId: a._id, subscription: { status: 'trial' } }),
      caller(coach).coachClients.assign({ clientId: b._id, subscription: { status: 'trial' } }),
    ]);
    expect(rs.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await planOf(coach._id))?.activeClientCount).toBe(26);
  });

  it('32. recomputing the effective limit never touches activeClientCount', async () => {
    await (await coachPlansCol()).updateOne({ _id: coach._id }, { $set: { activeClientCount: 7 } });
    await requestAndConfirmPackage(coach, p20);
    await caller(sup).coachCommercial.setManualAdjustment({ coachId: coach._id, value: 3, reason: 'x3x' });
    await recomputeCapacity(coach._id);
    expect(await planOf(coach._id)).toMatchObject({ activeClientCount: 7, maxClients: 48 });
  });

  it('an expired subscription cannot buy capacity (SUBSCRIPTION_EXPIRED)', async () => {
    await (await coachPlansCol()).updateOne({ _id: coach._id }, { $set: { endsAt: Date.now() - 1 } });
    expect(await reason(caller(coach).coachPlanRequests.submitCapacity({ packageId: p20 }))).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('admin "Renew Forma" confirms the open subscription request if any, else records one with the live snapshot', async () => {
    const out = await caller(sup).coachCommercial.renewSubscription({ coachId: coach._id, note: 'cash' });
    expect(out.request).toMatchObject({ status: 'confirmed', type: 'renewal' });
    const r = await caller(coach).coachPlanRequests.submitSubscription();
    const out2 = await caller(sup).coachCommercial.renewSubscription({ coachId: coach._id });
    expect(out2.request.id).toBe(r.id);
    expect(await (await coachPlanRequestsCol()).countDocuments({ coachId: coach._id, status: 'confirmed' })).toBe(2);
  });
});

// ---- Renewal semantics: new term starts at max(current endsAt, confirmedAt) ----

describe('Renewal semantics', () => {
  let coach: UserDoc;
  beforeEach(async () => {
    coach = await insertUser({ _id: 'renew', role: 'coach' });
  });
  const renewAndConfirm = async () => {
    const r = await caller(coach).coachPlanRequests.submitSubscription();
    await caller(sup).coachPlanRequests.confirm({ requestId: r.id });
    return r;
  };

  it('1 + 4. early renewal starts at the old endsAt — no remaining days are lost; access/startedAt untouched', async () => {
    const oldEnd = Date.now() + 10 * DAY_MS;
    await givePaidPlan(coach._id, 25, { endsAt: oldEnd, startedAt: Date.now() - 20 * DAY_MS });
    const before = (await planOf(coach._id))!;
    const r = await renewAndConfirm();
    const after = (await planOf(coach._id))!;
    expect(r.type).toBe('renewal');
    expect(after.endsAt).toBe(oldEnd + 30 * DAY_MS);
    expect(after.subscription?.termStartsAt).toBe(oldEnd);
    expect(after.startedAt).toBe(before.startedAt);
    expect(after.status).toBe('active');
    // Remaining days preserved: new end − now = (old remaining) + full term.
    expect(after.endsAt! - Date.now()).toBeGreaterThan(39 * DAY_MS);
    const audit = await (await getDb()).collection('adminAuditLogs').findOne({ action: 'subscription.renewed', targetUserId: coach._id });
    expect(audit?.metadata).toMatchObject({ requestId: r.id, previousEndsAt: oldEnd, termStartsAt: oldEnd, newEndsAt: oldEnd + 30 * DAY_MS, extended: true, planSnapshot: { priceMonthly: 499 } });
    expect(typeof audit?.metadata.confirmedAt).toBe('number');
    expect(after.history?.at(-1)).toMatchObject({ action: 'subscription.renewed' });
  });

  it('2. late renewal (term ended before confirmation) starts at confirmation — no backdating', async () => {
    await givePaidPlan(coach._id, 25, { endsAt: Date.now() + DAY_MS });
    const r = await caller(coach).coachPlanRequests.submitSubscription();
    expect(r.type).toBe('renewal');
    await (await coachPlansCol()).updateOne({ _id: coach._id }, { $set: { endsAt: Date.now() - 5 * DAY_MS } }); // lapsed while awaiting
    const t0 = Date.now();
    await caller(sup).coachPlanRequests.confirm({ requestId: r.id });
    const after = (await planOf(coach._id))!;
    expect(after.subscription!.termStartsAt!).toBeGreaterThanOrEqual(t0);
    expect(after.startedAt).toBe(after.subscription!.termStartsAt);
    expect(after.endsAt).toBe(after.subscription!.termStartsAt! + 30 * DAY_MS);
  });

  it('3. exact-day renewal: endsAt == confirmedAt → starts exactly then (no gap, no overlap)', () => {
    const T = 1_800_000_000_000;
    expect(computeTermStart('renewal', { plan: 'forma', endsAt: T }, T)).toEqual({ termStartsAt: T, extended: false });
    expect(computeTermStart('renewal', { plan: 'forma', endsAt: T + 1 }, T)).toEqual({ termStartsAt: T + 1, extended: true });
    expect(computeTermStart('renewal', { plan: 'forma', endsAt: T - 1 }, T)).toEqual({ termStartsAt: T, extended: false });
    // First activation never waits for the old Trial end.
    expect(computeTermStart('subscription', { plan: 'trial', endsAt: T + 5 * DAY_MS }, T)).toEqual({ termStartsAt: T, extended: false });
    expect(computeTermStart('trial_expired', { plan: 'trial', endsAt: T - DAY_MS }, T)).toEqual({ termStartsAt: T, extended: false });
  });

  it('5. a second early renewal stacks after the already-extended end', async () => {
    const oldEnd = Date.now() + 10 * DAY_MS;
    await givePaidPlan(coach._id, 25, { endsAt: oldEnd });
    await renewAndConfirm();
    await renewAndConfirm();
    expect((await planOf(coach._id))?.endsAt).toBe(oldEnd + 60 * DAY_MS);
  });

  it('6. the request snapshot term controls the extension even if the Forma config changes later', async () => {
    const oldEnd = Date.now() + 10 * DAY_MS;
    await givePaidPlan(coach._id, 25, { endsAt: oldEnd });
    const r = await caller(coach).coachPlanRequests.submitSubscription();
    await caller(sup).coachPlanTiers.save(formaInput({ termDays: 60, priceMonthly: 999 }));
    await caller(sup).coachPlanRequests.confirm({ requestId: r.id });
    const after = (await planOf(coach._id))!;
    expect(after.endsAt).toBe(oldEnd + 30 * DAY_MS);
    expect(after.subscription).toMatchObject({ termDays: 30, priceMonthly: 499 });
  });

  it('7. concurrent confirmations extend the term exactly once', async () => {
    const oldEnd = Date.now() + 10 * DAY_MS;
    await givePaidPlan(coach._id, 25, { endsAt: oldEnd });
    const r = await caller(coach).coachPlanRequests.submitSubscription();
    const rs = await settle([0, 1, 2].map(() => caller(sup).coachPlanRequests.confirm({ requestId: r.id })));
    expect(rs.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await planOf(coach._id))?.endsAt).toBe(oldEnd + 30 * DAY_MS);
  });

  it('8. rejected and cancelled renewals never alter endsAt', async () => {
    const oldEnd = Date.now() + 10 * DAY_MS;
    await givePaidPlan(coach._id, 25, { endsAt: oldEnd });
    const a = await caller(coach).coachPlanRequests.submitSubscription();
    await caller(sup).coachPlanRequests.reject({ requestId: a.id });
    const b = await caller(coach).coachPlanRequests.submitSubscription();
    await caller(coach).coachPlanRequests.cancel({ id: b.id });
    expect((await planOf(coach._id))?.endsAt).toBe(oldEnd);
  });

  it('9. recurring add-on renewed early extends from its existing endsAt', async () => {
    await givePaidPlan(coach._id);
    const pkg = (await caller(sup).coachCommercial.savePackage(pkgInput())).id;
    await requestAndConfirmPackage(coach, pkg);
    const ents = await capacityEntitlementsCol();
    const early = Date.now() + 10 * DAY_MS;
    await ents.updateOne({ coachId: coach._id }, { $set: { endsAt: early } });
    await requestAndConfirmPackage(coach, pkg);
    const e = (await ents.findOne({ coachId: coach._id, status: 'active' }))!;
    expect(e.endsAt).toBe(addMonths(early, 1));
    expect(await ents.countDocuments({ coachId: coach._id })).toBe(1);
    expect((await planOf(coach._id))?.maxClients).toBe(45);
    const audit = await (await getDb()).collection('adminAuditLogs').find({ action: 'capacity.request_confirmed', targetUserId: coach._id }).sort({ createdAt: -1 }).limit(1).next();
    expect(audit?.metadata).toMatchObject({ previousEndsAt: early, newEndsAt: addMonths(early, 1), extended: true });
  });

  it('10. an expired add-on renewed later starts from confirmation time', async () => {
    await givePaidPlan(coach._id);
    const pkg = (await caller(sup).coachCommercial.savePackage(pkgInput())).id;
    await requestAndConfirmPackage(coach, pkg);
    await (await capacityEntitlementsCol()).updateOne({ coachId: coach._id }, { $set: { endsAt: Date.now() - DAY_MS } });
    await expireCapacity();
    const t0 = Date.now();
    await requestAndConfirmPackage(coach, pkg);
    const e = (await (await capacityEntitlementsCol()).findOne({ coachId: coach._id, status: 'active' }))!;
    expect(e.startsAt).toBeGreaterThanOrEqual(t0);
    expect(e.endsAt).toBe(addMonths(e.startsAt, 1));
  });

  it('11. one-time / permanent add-ons are unaffected by renewal (no end date, no stacking)', async () => {
    await givePaidPlan(coach._id);
    const pkg = (await caller(sup).coachCommercial.savePackage(pkgInput({ billingInterval: 'one_time', additionalClients: 10 }))).id;
    await requestAndConfirmPackage(coach, pkg);
    await requestAndConfirmPackage(coach, pkg);
    const ents = await (await capacityEntitlementsCol()).find({ coachId: coach._id }).toArray();
    expect(ents).toHaveLength(1);
    expect(ents[0].endsAt).toBeNull();
    expect((await planOf(coach._id))?.maxClients).toBe(35);
  });
});

// ---- §52 security -----------------------------------------------------------

describe('Commercial access control', () => {
  it('33–34. a coach only ever sees / requests for themself', async () => {
    const a = await insertUser({ _id: 'ca', role: 'coach' });
    const b = await insertUser({ _id: 'cb', role: 'coach' });
    await givePaidPlan(a._id);
    await givePaidPlan(b._id);
    const pkg = (await caller(sup).coachCommercial.savePackage(pkgInput())).id;
    await requestAndConfirmPackage(a, pkg);
    const ovB = await caller(b).coachCommercial.myOverview();
    expect(ovB.activeEntitlements).toHaveLength(0);
    expect(ovB.requests).toHaveLength(0);
    expect(await code(caller(b).coachCommercial.adminCoachOverview({ coachId: a._id }))).toBe('FORBIDDEN');
    // An injected coachId is ignored (not part of the input schema) — the request is the caller's own.
    const r = await caller(b).coachPlanRequests.submitCapacity({ packageId: pkg, coachId: a._id } as never);
    expect(r.coachId).toBe(b._id);
    // B cannot cancel A's request.
    const ra = await caller(a).coachPlanRequests.submitSubscription();
    expect(await code(caller(b).coachPlanRequests.cancel({ id: ra.id }))).toBe('NOT_FOUND');
  });

  it('35. a plain Admin cannot use any Super Admin commercial mutation or read', async () => {
    const coach = await insertUser({ _id: 'c', role: 'coach' });
    await givePaidPlan(coach._id);
    const a = caller(admin);
    expect(await code(a.coachCommercial.savePackage(pkgInput()))).toBe('FORBIDDEN');
    expect(await code(a.coachCommercial.listPackages())).toBe('FORBIDDEN');
    expect(await code(a.coachCommercial.setPackageState({ id: 'x', active: false }))).toBe('FORBIDDEN');
    expect(await code(a.coachCommercial.grantCustom({ coachId: coach._id, additionalClients: 1, billingInterval: 'one_time', note: 'n' }))).toBe('FORBIDDEN');
    expect(await code(a.coachCommercial.setManualAdjustment({ coachId: coach._id, value: 1, reason: 'abc' }))).toBe('FORBIDDEN');
    expect(await code(a.coachCommercial.renewSubscription({ coachId: coach._id }))).toBe('FORBIDDEN');
    expect(await code(a.coachPlanRequests.list())).toBe('FORBIDDEN');
    expect(await code(a.coachPlanTiers.save(formaInput()))).toBe('FORBIDDEN');
    expect(await code(a.coachPlans.adminUpdate({ coachId: coach._id, status: 'suspended' }))).toBe('FORBIDDEN');
  });

  it('36. anonymous users cannot query capacity packages or overviews', async () => {
    await caller(sup).coachCommercial.savePackage(pkgInput());
    const anon = caller(null);
    expect(await code(anon.coachCommercial.listPackages())).toBe('UNAUTHORIZED');
    expect(await code(anon.coachCommercial.myOverview())).toBe('UNAUTHORIZED');
    expect(await code(anon.coachPlanRequests.mine())).toBe('UNAUTHORIZED');
  });

  it('37. package and coach ids are validated server-side: unknown / inactive / hidden / out-of-window / targeted-elsewhere packages are unavailable', async () => {
    const coach = await insertUser({ _id: 'c', role: 'coach' });
    await givePaidPlan(coach._id);
    const s = caller(sup);
    const inactive = (await s.coachCommercial.savePackage(pkgInput({ active: false }))).id;
    const hidden = (await s.coachCommercial.savePackage(pkgInput({ coachVisible: false }))).id;
    const future = (await s.coachCommercial.savePackage(pkgInput({ validFrom: Date.now() + DAY_MS }))).id;
    const targeted = (await s.coachCommercial.savePackage(pkgInput({ targetCoachIds: ['someone-else'] }))).id;
    const archived = (await s.coachCommercial.savePackage(pkgInput())).id;
    await s.coachCommercial.setPackageState({ id: archived, archived: true });
    for (const id of ['nope', inactive, hidden, future, targeted, archived]) {
      expect(await reason(caller(coach).coachPlanRequests.submitCapacity({ packageId: id }))).toBe('CAPACITY_PACKAGE_UNAVAILABLE');
    }
    expect((await caller(coach).coachCommercial.myOverview()).availablePackages).toHaveLength(0);
    expect(await code(s.coachCommercial.grantCustom({ coachId: 'ghost', additionalClients: 1, billingInterval: 'one_time', note: 'n' }))).toBe('NOT_FOUND');
    expect(await code(s.coachCommercial.grantPackage({ coachId: coach._id, packageId: 'nope' }))).toBe('BAD_REQUEST');
    // Hidden (admin-only) packages can still be granted directly by the Super Admin.
    expect((await s.coachCommercial.grantPackage({ coachId: coach._id, packageId: hidden })).after).toBe(45);
  });

  it('coachPlans.me / createTrial stay reachable for non-active coaches; adminUpdate can suspend and re-open a lapsed term', async () => {
    const suspended = await insertUser({ _id: 'cs', role: 'coach', accountStatus: 'suspended' });
    expect((await caller(suspended).coachPlans.createTrial()).plan).toBe('trial');
    const coach = await insertUser({ _id: 'c', role: 'coach' });
    await givePaidPlan(coach._id, 25, { status: 'expired', endsAt: Date.now() - 1 });
    const reopened = await caller(sup).coachPlans.adminUpdate({ coachId: coach._id, endsAt: Date.now() + 5 * DAY_MS });
    expect(reopened.status).toBe('active');
    const s = await caller(sup).coachPlans.adminUpdate({ coachId: coach._id, status: 'suspended', reason: 'abuse' });
    expect(s.state).toBe('suspended');
    const c = await insertUser({ _id: 'cl', role: 'client' });
    expect(await reason(caller(coach).coachClients.assign({ clientId: c._id, subscription: { status: 'trial' } }))).toBe('SUBSCRIPTION_SUSPENDED');
  });
});

describe('error formatter', () => {
  it('surfaces the machine reason as error.data.reason over HTTP', async () => {
    const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
    const coach = await insertUser({ _id: 'full', role: 'coach' });
    await givePaidPlan(coach._id, 1, { activeClientCount: 1 });
    await (await getDb()).collection<SignupInviteDoc>('signupInvites').insertOne({ _id: 'FULL2222', coachId: coach._id, status: 'pending', claimedByUid: null, createdAt: Date.now(), claimedAt: null, expiresAt: null, subStatus: 'trial' });
    const res = await fetchRequestHandler({
      endpoint: '/api/trpc',
      router: appRouter,
      req: new Request('http://x/api/trpc/invites.claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'FULL2222', email: 'q@example.com', phone: '1', password: 'password123' }) }),
      createContext: () => ctxFor(null),
    });
    const body = (await res.json()) as { error: { data: { reason?: string; code: string } } };
    expect(body.error.data).toMatchObject({ code: 'CONFLICT', reason: 'CLIENT_CAPACITY_REACHED' });
  });
});
