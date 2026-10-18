import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { canReadClientData, canWriteClientOrCoach, canWriteCoachOwned, isActiveSelf, resolveClientId } from '../../client/_lib/access.js';
import { checkInsCol, coachClientsCol, measurementLogsCol, subscriptionRequestsCol } from '../../client/_lib/db.js';
import { notify } from '../../client/_lib/notify.js';
import { resolveNotifications } from '../../messages/_handlers/notifications-data.js';
import { hasPermission } from '../../_lib/rbac.js';
import { CommercialReason } from '../../_lib/commercialReason.js';
import type { FreezeRequestDoc, MeasurementLogDoc, WeeklyCheckInDoc } from '../../client/_lib/types.js';

/**
 * A check-in's key within its client: the training week (`2026-10-17`) — one record per week, as
 * always — or, B3.4, `week__coachId` for a second coach's own record of the same week after a
 * mid-week hand-over (the first record keeps the plain week). The `_id` is `clientId__key`.
 */
function checkInId(clientId: string, key: string): string {
  return `${clientId}__${key}`;
}
function keyOf(doc: Pick<WeeklyCheckInDoc, '_id' | 'clientId'>): string {
  const prefix = `${doc.clientId}__`;
  return doc._id.startsWith(prefix) ? doc._id.slice(prefix.length) : doc._id;
}
const weekOfKey = (key: string) => key.split('__')[0];

/**
 * B3.3 / B3.4 ownership: a check-in is a coach's when that coach requested it (`coachId`), or —
 * legacy, no `coachId` — it was created after the coach's current relationship began. Never
 * invented: a legacy record from before the relationship belongs to nobody the coach can see.
 */
function ownedBy(doc: WeeklyCheckInDoc, coachId: string, relationshipStart: number | null): boolean {
  if (doc.coachId) return doc.coachId === coachId;
  return relationshipStart != null && (doc.submittedAt ?? doc.createdAt ?? 0) >= relationshipStart;
}
async function relationshipStartOf(coachId: string, clientId: string): Promise<number | null> {
  const rel = await (await coachClientsCol()).findOne({ coachId, clientId, status: 'active' }, { projection: { createdAt: 1 } });
  return rel ? Number(rel.createdAt ?? 0) : null;
}
/** The coach currently coaching the client (the active relationship), or null. */
async function currentCoachOf(clientId: string): Promise<string | null> {
  const rel = await (await coachClientsCol()).findOne({ clientId, status: 'active' }, { projection: { coachId: 1 } });
  return rel?.coachId ?? null;
}
/** Every record of one training week for a client, newest first (one; two after a mid-week hand-over). */
async function weekDocs(clientId: string, week: string): Promise<WeeklyCheckInDoc[]> {
  return (await checkInsCol()).find({ clientId, weekStart: week }).sort({ createdAt: -1 }).toArray();
}
/** The calling coach's own record of that week (the key's suffix is ignored — ownership decides). */
async function ownWeekDoc(clientId: string, key: string, coachId: string): Promise<WeeklyCheckInDoc | null> {
  const start = await relationshipStartOf(coachId, clientId);
  return (await weekDocs(clientId, weekOfKey(key))).find((d) => ownedBy(d, coachId, start)) ?? null;
}
/**
 * B3.4: a request a previous coach left open is no longer actionable for the client — their
 * current coach can't see it. (Legacy requests without `coachId` are left as they were.)
 */
function staleForClient(doc: WeeklyCheckInDoc, currentCoachId: string | null): boolean {
  return doc.status === 'requested' && !!doc.coachId && doc.coachId !== currentCoachId;
}
/**
 * Two client generations (B3.4 compatibility gate, owner 2026-10-18):
 *  - a client that says `byKey` (this release on) names the record exactly — `week` for a week's
 *    first record, `week__coachId` for a second coach's record of the same week;
 *  - an older app (RC2 … B3.3) addresses check-ins by WEEK alone and shows one per week. It is
 *    served the week's record that is actionable for it — the current coach's when there is one —
 *    so its list, its screen and its submission all name the same record.
 * A `week__coachId` key (from a notification link) is exact for both.
 */
async function clientDoc(clientId: string, key: string, byKey: boolean): Promise<(WeeklyCheckInDoc & { closed?: true }) | null> {
  const exact = await (await checkInsCol()).findOne({ _id: checkInId(clientId, key) });
  if (!byKey && !key.includes('__')) return weekRecordForOldApp(clientId, key, await currentCoachOf(clientId));
  // A previous coach's request left open (an old notification link, a draft) reads as closed — this
  // release says so instead of opening answers that could never be sent.
  return exact && staleForClient(exact, await currentCoachOf(clientId)) ? { ...exact, closed: true } : exact;
}
/** The one record an older app sees for a week: the current coach's, else the week's first record, else the newest — never a previous coach's open request. */
async function weekRecordForOldApp(clientId: string, week: string, current: string | null): Promise<WeeklyCheckInDoc | null> {
  const visible = (await weekDocs(clientId, week)).filter((d) => !staleForClient(d, current));
  return visible.find((d) => !!current && d.coachId === current) ?? visible.find((d) => d._id === checkInId(clientId, week)) ?? visible[0] ?? null;
}
/**
 * The record an older app's submission (or one it queued offline) by week alone is for: the week's
 * only open request. Refused, never redirected (owner, 2026-10-18), when the answers could be meant
 * for another record — two open requests (`ambiguous`), or a previous coach's request left open
 * (`stale`: it may be answers composed before the hand-over, or for the new coach's request). The
 * app keeps the answers; the new coach's request stays answerable from its notification link and
 * after the app updates.
 */
async function openRecordForOldApp(clientId: string, week: string): Promise<WeeklyCheckInDoc | 'ambiguous' | 'stale' | null> {
  const current = await currentCoachOf(clientId);
  const open = (await weekDocs(clientId, week)).filter((d) => d.status === 'requested');
  const live = open.filter((d) => !staleForClient(d, current));
  if (live.length > 1 || (live.length === 1 && open.length > 1)) return 'ambiguous';
  if (live.length === 0 && open.length > 0) return 'stale';
  return live[0] ?? null;
}
async function insertOrNull(doc: WeeklyCheckInDoc): Promise<WeeklyCheckInDoc | null> {
  try {
    await (await checkInsCol()).insertOne(doc);
    return doc;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return null; // the key is taken (a concurrent request, or another coach's week)
    throw e;
  }
}

/**
 * Weekly check-ins — coach-owned (creates the request + reviews), but a
 * dedicated rule ALSO lets the client update their OWN doc while it's still
 * `status: 'requested'` (the one-time submit). No client delete.
 */
export const checkInsRouter = router({
  /**
   * `weekStart` is the check-in's key (the week, or `week__coachId`, B3.4). B3.4 (owner, 2026-10-18):
   * a coach only ever gets their OWN record of that week — never a previous coach's (answers,
   * photos, feedback); the client gets their record (see `clientDoc`); an admin with
   * `users.read` reads the exact record, as before.
   */
  get: authedProcedure.input(z.object({ clientId: z.string().optional(), weekStart: z.string(), byKey: z.boolean().optional() })).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    if (ctx.user.id === clientId) return clientDoc(clientId, input.weekStart, input.byKey === true);
    if (ctx.user.role === 'coach') return ownWeekDoc(clientId, input.weekStart, ctx.user.id);
    return (await checkInsCol()).findOne({ _id: checkInId(clientId, input.weekStart) });
  }),

  /**
   * Newest week first. B3.4: a coach gets only their own check-ins (B33-R3 — never a previous
   * coach's); the client gets their whole history except requests a previous coach left open
   * (not actionable); an admin with `users.read` gets everything.
   */
  list: authedProcedure.input(z.object({ clientId: z.string().optional(), byKey: z.boolean().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const all = await (await checkInsCol()).find({ clientId }).sort({ weekStart: -1, createdAt: -1 }).toArray();
    if (ctx.user.id === clientId) {
      const current = await currentCoachOf(clientId);
      const visible = all.filter((d) => !staleForClient(d, current));
      if (input?.byKey) return visible;
      // An older app keys its list by week: one record per week — the one it would open (`weekRecordForOldApp`).
      const byWeek = new Map<string, WeeklyCheckInDoc>();
      for (const d of visible) {
        const have = byWeek.get(d.weekStart);
        const preferred = (x: WeeklyCheckInDoc) => (current && x.coachId === current ? 2 : x._id === checkInId(clientId, x.weekStart) ? 1 : 0);
        if (!have || preferred(d) > preferred(have)) byWeek.set(d.weekStart, d);
      }
      return visible.filter((d) => byWeek.get(d.weekStart) === d);
    }
    if (ctx.user.role === 'coach') {
      const start = await relationshipStartOf(ctx.user.id, clientId);
      return all.filter((d) => ownedBy(d, ctx.user.id, start));
    }
    return all;
  }),

  /**
   * Latest + previous (reviewed) check-in for every one of a coach's active
   * clients, in one query — was one `checkIns.list` request per client
   * (`CoachCheckInsOverview`'s `useQueries` N+1). Unlike `workouts7d`/
   * `assessment`, this screen needs the actual check-in records (dates,
   * status, submitted values) to render the row + the review queue, so it
   * doesn't fit `coachClients.dashboardSummaries`' coarse boolean shape —
   * it gets its own batched endpoint instead of forcing a shared one.
   *
   * B3.3 (owner, 2026-10-17): only THIS coach's check-ins — ones this coach
   * requested (`coachId`), or legacy ones without `coachId` created after
   * this relationship began (the `toReview` rule in `dashboardSummaries`). A
   * previous coach's check-ins on a transferred client never reach the new
   * coach's Today / Clients (they used to be sent and hidden client-side).
   */
  listForCoachClients: authedProcedure
    .input(z.object({ coachId: z.string().trim().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const canReadAll = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'users.read');
      const coachId = input.coachId ?? ctx.user.id;
      if (ctx.user.id !== coachId && !canReadAll) throw new TRPCError({ code: 'FORBIDDEN' });
      const relCol = await coachClientsCol();
      const rels = await relCol.find({ coachId, status: 'active' }).toArray();
      const clientIds = [...new Set(rels.map((r) => r.clientId))];
      if (clientIds.length === 0) return [];
      const relStart = new Map(rels.map((r) => [r.clientId, Number(r.createdAt ?? 0)]));

      const col = await checkInsCol();
      const found = await col.find({ clientId: { $in: clientIds } }).sort({ clientId: 1, weekStart: -1, createdAt: -1 }).toArray();
      const docs = found.filter((d) => ownedBy(d, coachId, relStart.get(d.clientId) ?? null));
      const byClient = new Map<string, WeeklyCheckInDoc[]>();
      for (const d of docs) {
        const arr = byClient.get(d.clientId);
        if (arr) arr.push(d);
        else byClient.set(d.clientId, [d]);
      }
      return clientIds.map((clientId) => {
        const all = byClient.get(clientId) ?? [];
        const latest = all[0] ?? null;
        const previous = all.slice(1).find((c) => c.status === 'submitted' || c.status === 'reviewed') ?? null;
        return { clientId, latest, previous };
      });
    }),

  /**
   * Idempotent per coach and week. B3.4 (owner, 2026-10-18): after a mid-week hand-over the
   * incoming coach gets a NEW record of their own for the same week (`week__coachId`) — the
   * previous coach's record is never reassigned, returned or touched. A repeat (or a concurrent)
   * request by the same coach returns that coach's one record; the `_id` makes a duplicate
   * impossible. An admin acting for a client keeps the old behaviour (one record per week).
   */
  request: authedProcedure
    .input(z.object({ clientId: z.string().optional(), weekStart: z.string(), weekEnd: z.string(), coachId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const week = weekOfKey(input.weekStart);
      const now = Date.now();
      // A coach's own id is never taken from input (it's already proven by
      // `canWriteCoachOwned` above); only an admin acting on a client's behalf
      // may name the coach the check-in belongs to.
      const coachId = ctx.user.role === 'coach' ? ctx.user.id : (input.coachId ?? '');
      const record = (key: string): WeeklyCheckInDoc => ({
        _id: checkInId(clientId, key),
        clientId,
        coachId,
        weekStart: week,
        weekEnd: input.weekEnd,
        status: 'requested',
        progressPhotos: {},
        createdAt: now,
        updatedAt: now,
      });

      let created: WeeklyCheckInDoc | null;
      if (ctx.user.role !== 'coach') {
        const existing = await (await checkInsCol()).findOne({ _id: checkInId(clientId, week) });
        if (existing) return existing;
        created = await insertOrNull(record(week));
        if (!created) return (await (await checkInsCol()).findOne({ _id: checkInId(clientId, week) }))!;
      } else {
        const own = await ownWeekDoc(clientId, week, coachId);
        if (own) return own;
        // The week's first record keeps the plain key; if it is taken — by a previous coach, or by
        // this coach a moment ago — check whose it is before making this coach's own record.
        created = await insertOrNull(record(week));
        if (!created) {
          const mine = await ownWeekDoc(clientId, week, coachId);
          if (mine) return mine;
          created = await insertOrNull(record(`${week}__${coachId}`));
          if (!created) {
            const again = await ownWeekDoc(clientId, week, coachId);
            if (again) return again;
            throw new TRPCError({ code: 'CONFLICT', message: 'Check-in request conflict' });
          }
        }
      }
      const key = keyOf(created);
      await notify({ clientId, forRole: 'client', type: 'checkin_requested', entityType: 'checkin', entityId: key, route: `/check-in/${key}`, createdBy: ctx.user.id });
      return created;
    }),

  /** Client submits their OWN check-in, once, while it's still 'requested'. */
  submit: authedProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        weekStart: z.string(),
        currentWeight: z.number().optional(),
        adherenceTraining: z.number().optional(),
        adherenceNutrition: z.number().optional(),
        hungerLevel: z.number().optional(),
        energyLevel: z.number().optional(),
        sleepQuality: z.number().optional(),
        notes: z.string().optional(),
        progressPhotos: z.object({ front: z.string().optional(), side: z.string().optional(), back: z.string().optional() }).optional(),
        /** Client-generated operation id (B1.6 outbox): a replay of the same submission returns it instead of failing. */
        opId: z.string().trim().min(1).max(100).optional(),
        /** B3.4: `weekStart` is the record key (set by this release on; older apps and their queued submissions omit it). */
        byKey: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      const col = await checkInsCol();
      let existing: WeeklyCheckInDoc | null;
      if (ctx.user.id !== clientId || input.byKey || input.weekStart.includes('__')) {
        existing = await col.findOne({ _id: checkInId(clientId, input.weekStart) });
      } else {
        // An older app, or a submission it queued offline before updating. A replay of a submission that
        // already landed returns that record (B1.6 idempotency comes first); otherwise the week's single open request.
        const replayed = input.opId ? ((await weekDocs(clientId, input.weekStart)).find((d) => d.submitOpId === input.opId) ?? null) : null;
        if (replayed) {
          existing = replayed;
        } else {
          const open = await openRecordForOldApp(clientId, input.weekStart);
          if (open === 'ambiguous') throw new TRPCError({ code: 'CONFLICT', message: 'CHECKIN_AMBIGUOUS', cause: new CommercialReason('CHECKIN_AMBIGUOUS') });
          if (open === 'stale') throw new TRPCError({ code: 'CONFLICT', message: 'CHECKIN_STALE', cause: new CommercialReason('CHECKIN_STALE') });
          existing = open ?? (await weekRecordForOldApp(clientId, input.weekStart, await currentCoachOf(clientId)));
        }
      }
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Check-in not found' });
      // A previous coach's request left open is nobody's to answer now (no coach would see it): refused
      // for every client generation — the answers stay on the device (B3.4 compatibility gate).
      if (ctx.user.id === clientId && existing.status === 'requested' && staleForClient(existing, await currentCoachOf(clientId))) {
        throw new TRPCError({ code: 'CONFLICT', message: 'CHECKIN_STALE', cause: new CommercialReason('CHECKIN_STALE') });
      }
      const _id = existing._id;
      const key = keyOf(existing);
      const own = ctx.user.accountStatus === 'active' && ctx.user.id === clientId;
      // Idempotent replay: the device never saw the answer to its own earlier submit.
      if (own && input.opId && existing.status !== 'requested' && existing.submitOpId === input.opId) return existing;
      if (!own || existing.status !== 'requested') throw new TRPCError({ code: 'FORBIDDEN' });

      const now = Date.now();
      const patch: Record<string, unknown> = { status: 'submitted', submittedAt: now, updatedAt: now };
      for (const k of ['currentWeight', 'adherenceTraining', 'adherenceNutrition', 'hungerLevel', 'energyLevel', 'sleepQuality', 'notes'] as const) {
        const v = input[k];
        if (v != null && v !== '') patch[k] = v;
      }
      const photos: Record<string, string> = {};
      for (const pose of ['front', 'side', 'back'] as const) {
        const url = input.progressPhotos?.[pose];
        if (url) photos[pose] = url;
      }
      patch.progressPhotos = photos;
      if (input.opId) patch.submitOpId = input.opId;
      // Compare-and-set on the status, so two racing submits can't both win.
      const res = await col.updateOne({ _id, status: 'requested' }, { $set: patch });
      if (res.matchedCount === 0) {
        const now2 = await col.findOne({ _id });
        if (input.opId && now2?.submitOpId === input.opId) return now2;
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const updated = await col.findOne({ _id });
      // The coach-bound notice goes to the client's current coach (B3.0.1) — only when this record is
      // theirs: a previous coach's late answer is the client's history, not the new coach's task (B3.4).
      if (!existing.coachId || existing.coachId === (await currentCoachOf(clientId))) {
        await notify({ clientId, forRole: 'coach', type: 'checkin_submitted', entityType: 'checkin', entityId: key, route: `/coach/client/${clientId}/checkins`, createdBy: clientId });
      }
      // The request is done — it must not stay unread or replay (B0 / NT-03).
      await resolveNotifications({ clientId, forRole: 'client', type: 'checkin_requested', entityId: key });
      return updated;
    }),

  /** Coach reviews a submitted check-in with feedback. B3.4: only their own record (a previous coach's is never touched). */
  review: authedProcedure.input(z.object({ clientId: z.string().optional(), weekStart: z.string(), feedback: z.string() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await checkInsCol();
    const now = Date.now();
    const target = ctx.user.role === 'coach' ? await ownWeekDoc(clientId, input.weekStart, ctx.user.id) : await col.findOne({ _id: checkInId(clientId, input.weekStart) });
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Check-in not found' });
    const _id = target._id;
    const key = keyOf(target);
    await col.updateOne({ _id }, { $set: { status: 'reviewed', reviewedAt: now, coachFeedback: input.feedback.trim(), updatedAt: now } });
    const updated = await col.findOne({ _id });
    if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Check-in not found' });
    await notify({ clientId, forRole: 'client', type: 'checkin_reviewed', body: input.feedback.trim().slice(0, 140), entityType: 'checkin', entityId: key, route: `/check-in/${key}`, createdBy: ctx.user.id });
    await resolveNotifications({ clientId, forRole: 'coach', type: 'checkin_submitted', entityId: key });
    return updated;
  }),

  /** Coach/admin only (no client delete rule). B3.4: a coach deletes only their own record. */
  delete: authedProcedure.input(z.object({ clientId: z.string().optional(), weekStart: z.string() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await checkInsCol();
    const target = ctx.user.role === 'coach' ? await ownWeekDoc(clientId, input.weekStart, ctx.user.id) : await col.findOne({ _id: checkInId(clientId, input.weekStart) });
    if (target) await col.deleteOne({ _id: target._id });
  }),
});

/** `measurementLogs` — NOT coach-owned (client keeps normal own-write), but a dedicated rule ALSO grants the assigned coach / admin(writeAll) write. */
export const measurementsRouter = router({
  get: authedProcedure.input(z.object({ clientId: z.string().optional(), date: z.string() })).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await measurementLogsCol()).findOne({ _id: `${clientId}__${input.date}` });
  }),

  list: authedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await measurementLogsCol()).find({ clientId }).sort({ date: 1 }).toArray();
  }),

  /** Read-merges the existing day so partial entries don't wipe other body parts. */
  save: authedProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        date: z.string(),
        values: z.record(z.string(), z.number()),
        // Keys the user explicitly emptied — the merge below would otherwise
        // keep the old value forever (a cleared field could never be saved).
        clear: z.array(z.string().max(60)).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteClientOrCoach(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await measurementLogsCol();
      const _id = `${clientId}__${input.date}`;
      const existing = await col.findOne({ _id });
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(input.values)) {
        if (typeof v === 'number' && !Number.isNaN(v) && v > 0) clean[k] = v;
      }
      const now = Date.now();
      const merged: Record<string, number> = { ...existing?.values, ...clean };
      for (const k of input.clear ?? []) if (!(k in clean)) delete merged[k];
      const log: MeasurementLogDoc = { _id, clientId, date: input.date, values: merged, updatedAt: now };
      await col.replaceOne({ _id }, log, { upsert: true });
      if (ctx.user.id !== clientId) {
        await notify({ clientId, forRole: 'client', type: 'measurement_added', screen: 'measurements', date: input.date, createdBy: ctx.user.id });
      }
      return log;
    }),

  delete: authedProcedure.input(z.object({ clientId: z.string().optional(), date: z.string() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteClientOrCoach(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    await (await measurementLogsCol()).deleteOne({ _id: `${clientId}__${input.date}` });
  }),
});

/** Singleton `subscriptionRequest` (freeze request) — NOT coach-owned: client creates/cancels; assigned coach/admin(writeAll) decides. */
export const subscriptionRequestRouter = router({
  get: authedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await subscriptionRequestsCol()).findOne({ _id: clientId });
  }),

  /**
   * B3.2 / B32-P1 (owner, 2026-10-17) — every PENDING freeze request among
   * the caller's ACTIVE clients, read from the canonical request documents
   * (never the notification feed, whose newest-50 window lost old requests).
   * A request belongs to the current relationship only if it was made after
   * that relationship began, so one raised under a previous coach — or an
   * earlier stint with this coach — is never exposed. Read-only; same
   * self-or-`users.read` rule as the coach's other roster summaries.
   * Cursor-paginated on (requestedAt, clientId): bounded pages, nothing
   * silently dropped. One request document per client, so no duplicates.
   */
  pendingForCoach: authedProcedure
    .input(
      z
        .object({
          coachId: z.string().trim().min(1).optional(),
          cursor: z.object({ requestedAt: z.number(), clientId: z.string().min(1) }).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const coachId = input?.coachId ?? ctx.user.id;
      const canReadAll = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'users.read');
      if (ctx.user.id !== coachId && !canReadAll) throw new TRPCError({ code: 'FORBIDDEN' });
      const limit = input?.limit ?? 100;
      const rels = await (await coachClientsCol()).find({ coachId, status: 'active' }, { projection: { clientId: 1, createdAt: 1 } }).toArray();
      if (rels.length === 0) return { items: [], nextCursor: null };
      const filter: Record<string, unknown> = {
        status: 'pending',
        $or: rels.map((r) => ({ _id: r.clientId, requestedAt: { $gte: Number(r.createdAt ?? 0) } })),
      };
      const c = input?.cursor;
      if (c) filter.$and = [{ $or: [{ requestedAt: { $gt: c.requestedAt } }, { requestedAt: c.requestedAt, _id: { $gt: c.clientId } }] }];
      const docs = await (await subscriptionRequestsCol()).find(filter).sort({ requestedAt: 1, _id: 1 }).limit(limit + 1).toArray();
      const page = docs.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((d) => ({ clientId: d.clientId, from: d.from ?? null, until: d.until ?? null, reason: d.reason, requestedAt: d.requestedAt })),
        nextCursor: docs.length > limit && last ? { requestedAt: last.requestedAt, clientId: last._id } : null,
      };
    }),

  /** Client creates/resubmits. */
  submit: authedProcedure
    .input(z.object({ clientId: z.string().optional(), from: z.number().nullable().optional(), until: z.number().nullable().optional(), reason: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!isActiveSelf(ctx.user, clientId)) throw new TRPCError({ code: 'FORBIDDEN' });
      const now = Date.now();
      const doc: FreezeRequestDoc = {
        _id: clientId,
        clientId,
        from: input.from ?? null,
        until: input.until ?? null,
        reason: input.reason.trim(),
        status: 'pending',
        requestedAt: now,
        decidedAt: null,
        decidedBy: null,
        coachNote: '',
        updatedAt: now,
      };
      await (await subscriptionRequestsCol()).replaceOne({ _id: clientId }, doc, { upsert: true });
      await notify({ clientId, forRole: 'coach', type: 'freeze_requested', body: input.reason.trim().slice(0, 140), route: `/coach/client/${clientId}/subscription`, createdBy: clientId });
      return doc;
    }),

  /** Client withdraws a pending request. */
  cancel: authedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!isActiveSelf(ctx.user, clientId)) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await subscriptionRequestsCol();
    const now = Date.now();
    await col.updateOne({ _id: clientId }, { $set: { status: 'cancelled', updatedAt: now } });
    const updated = await col.findOne({ _id: clientId });
    if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription request not found' });
    await resolveNotifications({ clientId, forRole: 'coach', type: 'freeze_requested' });
    return updated;
  }),

  /** Assigned coach / admin(writeAll) decides. */
  decide: authedProcedure
    .input(z.object({ clientId: z.string().optional(), outcome: z.enum(['accepted', 'rejected']), coachNote: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await subscriptionRequestsCol();
      const now = Date.now();
      await col.updateOne(
        { _id: clientId },
        { $set: { clientId, status: input.outcome, decidedAt: now, decidedBy: ctx.user.id, coachNote: input.coachNote.trim(), updatedAt: now } },
        { upsert: true },
      );
      const updated = await col.findOne({ _id: clientId });
      await notify({ clientId, forRole: 'client', type: 'freeze_decided', body: input.coachNote.trim().slice(0, 140), route: '/coach-notes', createdBy: ctx.user.id });
      await resolveNotifications({ clientId, forRole: 'coach', type: 'freeze_requested' });
      return updated;
    }),
});
