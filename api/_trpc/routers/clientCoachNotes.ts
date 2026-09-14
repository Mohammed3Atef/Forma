import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { canReadClientData, canWriteCoachOwned, resolveClientId } from '../../client/_lib/access.js';
import { coachNotesCol, coachTargetsCol } from '../../client/_lib/db.js';
import { notify } from '../../client/_lib/notify.js';
import type { CoachNoteDoc, CoachTargetsDoc } from '../../client/_lib/types.js';

const NoteScreenEnum = z.enum(['nutrition', 'workout', 'cardio', 'progress', 'measurements', 'photos']);
const NoteEntityTypeEnum = z.enum(['meal', 'food', 'water', 'supplement', 'exercise', 'workout_day', 'cardio_session', 'measurement', 'weight_entry', 'progress_photo', 'checkin']);

/** `coachNotes` is coach-owned: client read-only, only the assigned coach / admin(clients.writeAll) may write. */
export const coachNotesRouter = router({
  list: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await coachNotesCol();
    return col.find({ clientId }).sort({ createdAt: -1 }).limit(50).toArray();
  }),

  create: protectedProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        body: z.string().trim().min(1).max(4000),
        kind: z.enum(['note', 'announcement']).optional(),
        screen: NoteScreenEnum.optional(),
        date: z.string().optional(),
        entityType: NoteEntityTypeEnum.optional(),
        entityId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const now = Date.now();
      const note: CoachNoteDoc = {
        _id: crypto.randomUUID(),
        clientId,
        authorId: ctx.user.id,
        authorRole: ctx.user.role,
        body: input.body,
        kind: input.kind ?? 'note',
        createdAt: now,
        updatedAt: now,
      };
      if (input.screen) note.screen = input.screen;
      if (input.date) note.date = input.date;
      if (input.entityType) note.entityType = input.entityType;
      if (input.entityId) note.entityId = input.entityId;
      await (await coachNotesCol()).insertOne(note);
      await notify({
        clientId,
        forRole: 'client',
        type: 'coach_note',
        body: input.body.trim().slice(0, 140),
        screen: input.screen,
        date: input.date,
        entityType: input.entityType,
        entityId: input.entityId,
        createdBy: ctx.user.id,
      });
      return note;
    }),

  update: protectedProcedure
    .input(z.object({ clientId: z.string().optional(), id: z.string().min(1), body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await coachNotesCol();
      const now = Date.now();
      await col.updateOne({ _id: input.id, clientId }, { $set: { body: input.body, updatedAt: now } });
      const updated = await col.findOne({ _id: input.id, clientId });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' });
      return updated;
    }),

  delete: protectedProcedure.input(z.object({ clientId: z.string().optional(), id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    await (await coachNotesCol()).deleteOne({ _id: input.id, clientId });
  }),
});

/** The singleton `coachTargets` doc — coach-owned: client read-only, only the assigned coach / admin(clients.writeAll) may write. */
export const coachTargetsRouter = router({
  get: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await coachTargetsCol()).findOne({ _id: clientId });
  }),

  set: protectedProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        waterMl: z.number().optional(),
        steps: z.number().optional(),
        cardioMin: z.number().optional(),
        calories: z.number().optional(),
        protein: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const now = Date.now();
      const clean: CoachTargetsDoc = { _id: clientId, clientId, updatedBy: ctx.user.id, updatedAt: now };
      for (const k of ['waterMl', 'steps', 'cardioMin', 'calories', 'protein'] as const) {
        const v = input[k];
        if (typeof v === 'number' && !Number.isNaN(v)) clean[k] = v;
      }
      await (await coachTargetsCol()).replaceOne({ _id: clientId }, clean, { upsert: true });
      await notify({ clientId, forRole: 'client', type: 'targets_updated', screen: 'nutrition', route: '/nutrition', createdBy: ctx.user.id });
      return clean;
    }),
});
