import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { canReadClientData, canWriteClientOrCoach, canWriteCoachOwned, isActiveSelf, resolveClientId } from '../../client/_lib/access.js';
import { checkInsCol, measurementLogsCol, subscriptionRequestsCol } from '../../client/_lib/db.js';
import { notify } from '../../client/_lib/notify.js';
import type { FreezeRequestDoc, MeasurementLogDoc, WeeklyCheckInDoc } from '../../client/_lib/types.js';

function checkInId(clientId: string, weekStart: string): string {
  return `${clientId}__${weekStart}`;
}

/**
 * Weekly check-ins — coach-owned (creates the request + reviews), but a
 * dedicated rule ALSO lets the client update their OWN doc while it's still
 * `status: 'requested'` (the one-time submit). No client delete.
 */
export const checkInsRouter = router({
  get: protectedProcedure.input(z.object({ clientId: z.string().optional(), weekStart: z.string() })).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await checkInsCol()).findOne({ _id: checkInId(clientId, input.weekStart) });
  }),

  list: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await checkInsCol()).find({ clientId }).sort({ weekStart: -1 }).toArray();
  }),

  /** Idempotent: one doc per week. */
  request: protectedProcedure
    .input(z.object({ clientId: z.string().optional(), weekStart: z.string(), weekEnd: z.string(), coachId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await checkInsCol();
      const _id = checkInId(clientId, input.weekStart);
      const existing = await col.findOne({ _id });
      if (existing) return existing;
      const now = Date.now();
      const coachId = input.coachId ?? (ctx.user.role === 'coach' ? ctx.user.id : '');
      const checkIn: WeeklyCheckInDoc = {
        _id,
        clientId,
        coachId,
        weekStart: input.weekStart,
        weekEnd: input.weekEnd,
        status: 'requested',
        progressPhotos: {},
        createdAt: now,
        updatedAt: now,
      };
      await col.insertOne(checkIn);
      await notify({ clientId, forRole: 'client', type: 'checkin_requested', entityType: 'checkin', entityId: input.weekStart, route: `/check-in/${input.weekStart}`, createdBy: ctx.user.id });
      return checkIn;
    }),

  /** Client submits their OWN check-in, once, while it's still 'requested'. */
  submit: protectedProcedure
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      const col = await checkInsCol();
      const _id = checkInId(clientId, input.weekStart);
      const existing = await col.findOne({ _id });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Check-in not found' });
      const allowed = ctx.user.accountStatus === 'active' && ctx.user.id === clientId && existing.status === 'requested';
      if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' });

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
      await col.updateOne({ _id }, { $set: patch });
      const updated = await col.findOne({ _id });
      await notify({ clientId, forRole: 'coach', type: 'checkin_submitted', entityType: 'checkin', entityId: input.weekStart, route: `/coach/client/${clientId}/checkins`, createdBy: clientId });
      return updated;
    }),

  /** Coach reviews a submitted check-in with feedback. */
  review: protectedProcedure.input(z.object({ clientId: z.string().optional(), weekStart: z.string(), feedback: z.string() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await checkInsCol();
    const now = Date.now();
    const _id = checkInId(clientId, input.weekStart);
    await col.updateOne({ _id }, { $set: { status: 'reviewed', reviewedAt: now, coachFeedback: input.feedback.trim(), updatedAt: now } });
    const updated = await col.findOne({ _id });
    if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Check-in not found' });
    await notify({ clientId, forRole: 'client', type: 'checkin_reviewed', body: input.feedback.trim().slice(0, 140), entityType: 'checkin', entityId: input.weekStart, route: `/check-in/${input.weekStart}`, createdBy: ctx.user.id });
    return updated;
  }),

  /** Coach/admin only (no client delete rule). */
  delete: protectedProcedure.input(z.object({ clientId: z.string().optional(), weekStart: z.string() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    await (await checkInsCol()).deleteOne({ _id: checkInId(clientId, input.weekStart) });
  }),
});

/** `measurementLogs` — NOT coach-owned (client keeps normal own-write), but a dedicated rule ALSO grants the assigned coach / admin(writeAll) write. */
export const measurementsRouter = router({
  get: protectedProcedure.input(z.object({ clientId: z.string().optional(), date: z.string() })).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await measurementLogsCol()).findOne({ _id: `${clientId}__${input.date}` });
  }),

  list: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await measurementLogsCol()).find({ clientId }).sort({ date: 1 }).toArray();
  }),

  /** Read-merges the existing day so partial entries don't wipe other body parts. */
  save: protectedProcedure
    .input(z.object({ clientId: z.string().optional(), date: z.string(), values: z.record(z.string(), z.number()) }))
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
      const log: MeasurementLogDoc = { _id, clientId, date: input.date, values: { ...existing?.values, ...clean }, updatedAt: now };
      await col.replaceOne({ _id }, log, { upsert: true });
      if (ctx.user.id !== clientId) {
        await notify({ clientId, forRole: 'client', type: 'measurement_added', screen: 'measurements', date: input.date, createdBy: ctx.user.id });
      }
      return log;
    }),

  delete: protectedProcedure.input(z.object({ clientId: z.string().optional(), date: z.string() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteClientOrCoach(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    await (await measurementLogsCol()).deleteOne({ _id: `${clientId}__${input.date}` });
  }),
});

/** Singleton `subscriptionRequest` (freeze request) — NOT coach-owned: client creates/cancels; assigned coach/admin(writeAll) decides. */
export const subscriptionRequestRouter = router({
  get: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await subscriptionRequestsCol()).findOne({ _id: clientId });
  }),

  /** Client creates/resubmits. */
  submit: protectedProcedure
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
      await notify({ clientId, forRole: 'coach', type: 'freeze_requested', body: input.reason.trim().slice(0, 140), route: `/coach/client/${clientId}`, createdBy: clientId });
      return doc;
    }),

  /** Client withdraws a pending request. */
  cancel: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!isActiveSelf(ctx.user, clientId)) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await subscriptionRequestsCol();
    const now = Date.now();
    await col.updateOne({ _id: clientId }, { $set: { status: 'cancelled', updatedAt: now } });
    const updated = await col.findOne({ _id: clientId });
    if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription request not found' });
    return updated;
  }),

  /** Assigned coach / admin(writeAll) decides. */
  decide: protectedProcedure
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
      return updated;
    }),
});
