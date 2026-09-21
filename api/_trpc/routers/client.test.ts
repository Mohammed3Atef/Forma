import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { syncRecordsCol, recordId } from '../../sync/_data.js';
import type { CoachClientRelDoc } from '../../client/_lib/db.js';

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
});

function userDoc(overrides: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return {
    _id: 'user-1',
    email: 'a@example.com',
    emailLower: 'a@example.com',
    passwordHash: 'irrelevant-for-these-tests',
    displayName: 'Test User',
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
  const db = await getDb();
  await db.collection<UserDoc>('users').insertOne(doc);
  return doc;
}

function authedUser(doc: UserDoc): AuthedUser {
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

function ctxFor(user: AuthedUser | null): Context {
  return { req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
}

async function assignCoach(coachId: string, clientId: string): Promise<void> {
  const db = await getDb();
  const rel: CoachClientRelDoc = { _id: `${coachId}__${clientId}`, coachId, clientId, status: 'active' };
  await db.collection<CoachClientRelDoc>('coachClients').insertOne(rel);
}

const profileFields = {
  name: 'Alex Athlete',
  age: 30,
  weightKg: 80,
  heightCm: 180,
  goal: 'muscle_gain' as const,
  activityLevel: 'moderate' as const,
  locale: 'en' as const,
};

describe('client module — profile', () => {
  it('client can save+read their own profile; unassigned coach is rejected; assigned coach can read+write', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const otherCoach = await insertUser({ _id: 'coach-2', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);

    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    const saved = await asClient.profile.save({ clientId: clientDoc._id, ...profileFields });
    expect(saved?.name).toBe('Alex Athlete');

    const got = await asClient.profile.get({ clientId: clientDoc._id });
    expect(got?.weightKg).toBe(80);

    const asOtherCoach = appRouter.createCaller(ctxFor(authedUser(otherCoach)));
    await expect(asOtherCoach.profile.get({ clientId: clientDoc._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    const updated = await asCoach.profile.save({ clientId: clientDoc._id, ...profileFields, age: 31 });
    expect(updated?.age).toBe(31);
  });

  it('a suspended client can still read their own profile, but not write it — matches the old REST access.ts, which had no active check on the self-read branch', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client', accountStatus: 'suspended' });
    const asSuspendedSelf = appRouter.createCaller(ctxFor(authedUser(clientDoc)));

    const got = await asSuspendedSelf.profile.get({ clientId: clientDoc._id });
    expect(got).toBeNull(); // no profile saved yet, but the read itself must not throw

    await expect(
      asSuspendedSelf.profile.save({ clientId: clientDoc._id, ...profileFields }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('client module — assessment', () => {
  it('client saves a draft, submits, coach reviews, then client can resubmit as updated_after_review', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));

    const draft = await asClient.assessment.saveDraft({ clientId: clientDoc._id, basic: { fullName: 'Alex A' } });
    expect(draft?.status).toBe('in_progress');

    const fullAssessment = {
      basic: { fullName: 'Alex Athlete' },
      goals: {},
      lifestyle: {},
      training: {},
      health: {},
      nutrition: {},
      motivation: {},
      progressPhotos: {},
    };
    const submitted = await asClient.assessment.submit({ clientId: clientDoc._id, assessment: fullAssessment });
    expect(submitted?.status).toBe('submitted');

    const db = await getDb();
    const user = await db.collection<UserDoc>('users').findOne({ _id: clientDoc._id });
    expect(user?.displayName).toBe('Alex Athlete');

    await asCoach.assessment.setCoachNotes({ clientId: clientDoc._id, coachNotes: 'Great start' });
    const reviewed = await asCoach.assessment.review({ clientId: clientDoc._id });
    expect(reviewed?.status).toBe('reviewed');
    expect(reviewed?.coachNotes).toBe('Great start');

    const resubmitted = await asClient.assessment.submit({ clientId: clientDoc._id, assessment: fullAssessment });
    expect(resubmitted?.status).toBe('updated_after_review');

    const reset = await asCoach.assessment.reset({ clientId: clientDoc._id });
    expect(reset?.status).toBe('in_progress');
  });
});

describe('client module — plans + plan versions', () => {
  it('coach saves a workout plan; client reads it but cannot write; version history save/restore works', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));

    const plan = await asCoach.workoutPlan.save({ clientId: clientDoc._id, name: 'Push Pull Legs', days: [] });
    expect(plan.name).toBe('Push Pull Legs');

    const readBack = await asClient.workoutPlan.get({ clientId: clientDoc._id });
    expect(readBack?.name).toBe('Push Pull Legs');

    await expect(asClient.workoutPlan.save({ clientId: clientDoc._id, name: 'Hack Attempt' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const v1 = await asCoach.planVersions.save({ clientId: clientDoc._id, kind: 'workout', plan: { name: 'Push Pull Legs' } });
    expect(v1.versionNumber).toBe(1);
    const v2 = await asCoach.planVersions.save({ clientId: clientDoc._id, kind: 'workout', plan: { name: 'PPL v2' } });
    expect(v2.versionNumber).toBe(2);

    const list = await asClient.planVersions.list({ clientId: clientDoc._id, kind: 'workout' });
    expect(list).toHaveLength(2);
    expect(list[0].versionNumber).toBe(2);

    const restored = await asCoach.planVersions.restore({ clientId: clientDoc._id, versionId: v1._id });
    expect(restored?.active).toBe(true);
    const currentPlan = await asClient.workoutPlan.get({ clientId: clientDoc._id });
    expect(currentPlan?.name).toBe('Push Pull Legs');
  });

  it('updateExerciseFromLibrary refreshes only synced fields, preserves programming, never auto-applies, and fails gracefully when the source is gone', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));

    const libExercise = {
      id: 'lib-ex-1',
      name: 'Bench Press',
      targetMuscle: 'Chest',
      warmupSets: '1 set',
      workingSets: 3,
      repRange: '8-12',
      rir: '1-2',
      tempo: '2010',
      notes: { en: 'Original notes', ar: '' },
      restSec: 90,
      videoId: null,
      videoUrl: 'https://example.com/original.mp4',
    };
    await asCoach.coachAssets.exercises.save(libExercise);

    // Embed a linked copy into the client's plan (as ExercisePickerSheet's
    // `pickFromLibrary` would), with its OWN programming (5x5, not 3x8-12).
    await asCoach.workoutPlan.save({
      clientId: clientDoc._id,
      name: 'Push Pull Legs',
      days: [],
      exercises: {
        'plan-ex-1': {
          ...libExercise,
          id: 'plan-ex-1',
          libraryExerciseId: 'lib-ex-1',
          librarySyncEnabled: true,
          workingSets: 5,
          repRange: '5-5',
        },
      },
    });

    // Coach edits the library exercise's video — the client's ALREADY-ASSIGNED
    // plan must NOT change on its own (only templates auto-sync).
    await asCoach.coachAssets.exercises.save({ ...libExercise, videoUrl: 'https://example.com/updated.mp4', name: 'Barbell Bench Press' });
    const untouched = await asClient.workoutPlan.get({ clientId: clientDoc._id });
    const untouchedEx = (untouched as { exercises: Record<string, { videoUrl: string; name: string; workingSets: number }> }).exercises['plan-ex-1'];
    expect(untouchedEx.videoUrl).toBe('https://example.com/original.mp4');
    expect(untouchedEx.name).toBe('Bench Press');

    // Manual "update from library" — refreshes the synced fields, keeps 5x5.
    const updated = await asCoach.workoutPlan.updateExerciseFromLibrary({ clientId: clientDoc._id, exerciseId: 'plan-ex-1' });
    expect((updated as { videoUrl: string }).videoUrl).toBe('https://example.com/updated.mp4');
    expect((updated as { name: string }).name).toBe('Barbell Bench Press');
    expect((updated as { workingSets: number }).workingSets).toBe(5);
    expect((updated as { repRange: string }).repRange).toBe('5-5');
    expect((updated as { librarySyncEnabled: boolean }).librarySyncEnabled).toBe(true);

    // An unrelated coach can't touch this client's plan.
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const asCoachB = appRouter.createCaller(ctxFor(authedUser(coachB)));
    await expect(asCoachB.workoutPlan.updateExerciseFromLibrary({ clientId: clientDoc._id, exerciseId: 'plan-ex-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Deleting the source library exercise fails the refresh gracefully.
    await asCoach.coachAssets.exercises.delete({ id: 'lib-ex-1' });
    await expect(asCoach.workoutPlan.updateExerciseFromLibrary({ clientId: clientDoc._id, exerciseId: 'plan-ex-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('client module — raw logs + photos (read-only oversight)', () => {
  it('reads sync-pushed logs by date, lists recent entries, and rejects an unrelated coach', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const otherCoach = await insertUser({ _id: 'coach-2', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);

    const col = await syncRecordsCol();
    const now = Date.now();
    await col.insertOne({
      _id: recordId(clientDoc._id, 'workoutLogs', '2026-09-01'),
      clientId: clientDoc._id,
      collection: 'workoutLogs',
      recordId: '2026-09-01',
      data: { date: '2026-09-01', finished: true },
      updatedAt: now,
      syncedAt: now,
    });
    await col.insertOne({
      _id: recordId(clientDoc._id, 'progressPhotos', 'photo-1'),
      clientId: clientDoc._id,
      collection: 'progressPhotos',
      recordId: 'photo-1',
      data: { id: 'photo-1', date: '2026-09-01', url: 'https://cdn.example/photo-1.jpg' },
      updatedAt: now,
      syncedAt: now,
    });

    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    const day = await asCoach.logsWorkout.get({ clientId: clientDoc._id, date: '2026-09-01' });
    expect(day).toMatchObject({ finished: true });

    const list = await asCoach.logsWorkout.list({ clientId: clientDoc._id });
    expect(list).toHaveLength(1);

    const photos = await asCoach.photos.list({ clientId: clientDoc._id });
    expect(photos).toHaveLength(1);

    const asOtherCoach = appRouter.createCaller(ctxFor(authedUser(otherCoach)));
    await expect(asOtherCoach.logsWorkout.list({ clientId: clientDoc._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('client module — coach notes + coach targets', () => {
  it('coach creates/updates/deletes notes; client can only read; targets set + notify', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));

    const note = await asCoach.coachNotes.create({ clientId: clientDoc._id, body: 'Great progress this week!' });
    expect(note.authorId).toBe(coachDoc._id);

    const listAsClient = await asClient.coachNotes.list({ clientId: clientDoc._id });
    expect(listAsClient).toHaveLength(1);
    await expect(asClient.coachNotes.create({ clientId: clientDoc._id, body: 'nope' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const updated = await asCoach.coachNotes.update({ clientId: clientDoc._id, id: note._id, body: 'Edited note' });
    expect(updated.body).toBe('Edited note');
    await asCoach.coachNotes.delete({ clientId: clientDoc._id, id: note._id });
    expect(await asClient.coachNotes.list({ clientId: clientDoc._id })).toHaveLength(0);

    const targets = await asCoach.coachTargets.set({ clientId: clientDoc._id, waterMl: 3000, steps: 10000 });
    expect(targets.waterMl).toBe(3000);
    const gotTargets = await asClient.coachTargets.get({ clientId: clientDoc._id });
    expect(gotTargets?.steps).toBe(10000);
  });
});

describe('client module — check-ins', () => {
  it('coach requests, client submits once while requested, coach reviews', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));

    const requested = await asCoach.checkIns.request({ clientId: clientDoc._id, weekStart: '2026-09-01', weekEnd: '2026-09-07' });
    expect(requested.status).toBe('requested');

    // idempotent — a second request for the same week returns the existing doc
    const requestedAgain = await asCoach.checkIns.request({ clientId: clientDoc._id, weekStart: '2026-09-01', weekEnd: '2026-09-07' });
    expect(requestedAgain._id).toBe(requested._id);

    const submitted = await asClient.checkIns.submit({ clientId: clientDoc._id, weekStart: '2026-09-01', currentWeight: 79.5, notes: 'felt good' });
    expect(submitted?.status).toBe('submitted');

    // can't submit again once submitted
    await expect(
      asClient.checkIns.submit({ clientId: clientDoc._id, weekStart: '2026-09-01', currentWeight: 79 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const reviewed = await asCoach.checkIns.review({ clientId: clientDoc._id, weekStart: '2026-09-01', feedback: 'Nice work!' });
    expect(reviewed?.status).toBe('reviewed');

    const list = await asClient.checkIns.list({ clientId: clientDoc._id });
    expect(list).toHaveLength(1);
  });

  it('listForCoachClients returns latest+previous in one call for every active client, without a per-client fetch', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const clientA = await insertUser({ _id: 'client-a', role: 'client' });
    const clientB = await insertUser({ _id: 'client-b', role: 'client' });
    const unrelatedClient = await insertUser({ _id: 'client-unrelated', role: 'client' });
    await assignCoach(coachDoc._id, clientA._id);
    await assignCoach(coachDoc._id, clientB._id);
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    const asClientA = appRouter.createCaller(ctxFor(authedUser(clientA)));

    // client A: an older reviewed week, then a newer submitted week (latest).
    await asCoach.checkIns.request({ clientId: clientA._id, weekStart: '2026-08-25', weekEnd: '2026-08-31' });
    await asClientA.checkIns.submit({ clientId: clientA._id, weekStart: '2026-08-25', currentWeight: 80 });
    await asCoach.checkIns.review({ clientId: clientA._id, weekStart: '2026-08-25', feedback: 'Good week' });
    await asCoach.checkIns.request({ clientId: clientA._id, weekStart: '2026-09-01', weekEnd: '2026-09-07' });
    await asClientA.checkIns.submit({ clientId: clientA._id, weekStart: '2026-09-01', currentWeight: 79 });

    // client B: only ever requested, never submitted.
    await asCoach.checkIns.request({ clientId: clientB._id, weekStart: '2026-09-01', weekEnd: '2026-09-07' });

    const summaries = await asCoach.checkIns.listForCoachClients({});
    const byClient = new Map(summaries.map((s) => [s.clientId, s]));

    expect(byClient.size).toBe(2); // never the unrelated client
    expect(byClient.get(clientA._id)?.latest?.weekStart).toBe('2026-09-01');
    expect(byClient.get(clientA._id)?.latest?.status).toBe('submitted');
    expect(byClient.get(clientA._id)?.previous?.weekStart).toBe('2026-08-25'); // the reviewed week, not the requested-only one
    expect(byClient.get(clientB._id)?.latest?.status).toBe('requested');
    expect(byClient.get(clientB._id)?.previous).toBeNull(); // only one week exists at all

    // a plain client (not this coach, no users.read) is forbidden
    const asUnrelatedClient = appRouter.createCaller(ctxFor(authedUser(unrelatedClient)));
    await expect(asUnrelatedClient.checkIns.listForCoachClients({ coachId: coachDoc._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('client module — measurements', () => {
  it('client saves own measurements; save merges with existing values; assigned coach can also write', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));

    await asClient.measurements.save({ clientId: clientDoc._id, date: '2026-09-01', values: { waist: 80, chest: 100 } });
    const merged = await asCoach.measurements.save({ clientId: clientDoc._id, date: '2026-09-01', values: { waist: 79 } });
    expect(merged.values).toMatchObject({ waist: 79, chest: 100 });

    const list = await asClient.measurements.list({ clientId: clientDoc._id });
    expect(list).toHaveLength(1);

    await asCoach.measurements.delete({ clientId: clientDoc._id, date: '2026-09-01' });
    expect(await asClient.measurements.list({ clientId: clientDoc._id })).toHaveLength(0);
  });
});

describe('client module — subscription (freeze) requests', () => {
  it('client submits/cancels their own request; assigned coach decides; unrelated coach is rejected', async () => {
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const otherCoach = await insertUser({ _id: 'coach-2', role: 'coach' });
    await assignCoach(coachDoc._id, clientDoc._id);
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    const asOtherCoach = appRouter.createCaller(ctxFor(authedUser(otherCoach)));

    const submitted = await asClient.subscriptionRequest.submit({ clientId: clientDoc._id, reason: 'Traveling for 2 weeks' });
    expect(submitted.status).toBe('pending');

    await expect(
      asOtherCoach.subscriptionRequest.decide({ clientId: clientDoc._id, outcome: 'accepted', coachNote: 'ok' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const decided = await asCoach.subscriptionRequest.decide({ clientId: clientDoc._id, outcome: 'accepted', coachNote: 'Enjoy your trip!' });
    expect(decided?.status).toBe('accepted');

    const resubmitted = await asClient.subscriptionRequest.submit({ clientId: clientDoc._id, reason: 'Another break' });
    expect(resubmitted.status).toBe('pending');
    const cancelled = await asClient.subscriptionRequest.cancel({ clientId: clientDoc._id });
    expect(cancelled.status).toBe('cancelled');
  });
});
