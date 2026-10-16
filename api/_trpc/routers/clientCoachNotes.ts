import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import type { Filter } from 'mongodb';
import { canReadClientData, canWriteCoachOwned, hasClientsWriteAll, isAssignedCoachOf, resolveClientId } from '../../client/_lib/access.js';
import { coachNotesCol, coachTargetsCol } from '../../client/_lib/db.js';
import { coachClientsCol } from '../../coach-clients/_data.js';
import { writeAudit } from '../../admin/_lib/audit.js';
import { notify } from '../../client/_lib/notify.js';
import type { CoachNoteDoc, CoachTargetsDoc } from '../../client/_lib/types.js';

const NoteScreenEnum = z.enum(['nutrition', 'workout', 'cardio', 'progress', 'measurements', 'photos']);
const NoteEntityTypeEnum = z.enum(['meal', 'food', 'water', 'supplement', 'exercise', 'workout_day', 'cardio_session', 'measurement', 'weight_entry', 'progress_photo', 'checkin']);

/**
 * B3.0.1 / B3-S02 (owner O-16): coach notes are AUTHOR-PRIVATE.
 *  - client  — only notes explicitly shared with them (unchanged, B0);
 *  - coach   — shared notes (any author: the client sees them anyway) plus
 *              their OWN private notes; never another coach's private note;
 *  - admin   — `clients.readAll` oversight of every note, AUDITED whenever the
 *              answer contains another author's private note (owner R-1).
 * Legacy notes without `authorId` belong to the coach whose relationship was
 * active when they were written; for the calling coach that is "written since
 * my current relationship began" (otherwise admin-only). No data migration.
 */
async function myStintStart(coachId: string, clientId: string): Promise<number | null> {
  const rel = await (await coachClientsCol()).findOne({ _id: `${coachId}__${clientId}`, status: 'active' }, { projection: { createdAt: 1 } });
  return rel ? rel.createdAt : null;
}

function isPrivate(n: Pick<CoachNoteDoc, 'visibility'>): boolean {
  return n.visibility !== 'client';
}

/** The note's author as far as the server can prove it (legacy: the caller's current stint only). */
function authorOf(n: CoachNoteDoc, callerId: string, callerStintStart: number | null): string | null {
  if (n.authorId) return n.authorId;
  return callerStintStart != null && n.createdAt >= callerStintStart ? callerId : null;
}

/** `coachNotes` is coach-owned: client read-only, only the assigned coach / admin(clients.writeAll) may write. */
export const coachNotesRouter = router({
  list: authedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await coachNotesCol();
    // B0 / CO-02, CO-21: the client only ever receives notes the coach explicitly
    // shared. Private and legacy (unclassified) notes never leave the server.
    const clientSide = ctx.user.role === 'client' || ctx.user.id === clientId;
    if (clientSide) return col.find({ clientId, visibility: 'client' as const }).sort({ createdAt: -1 }).limit(50).toArray();
    if (await isAssignedCoachOf(ctx.user, clientId)) {
      const since = await myStintStart(ctx.user.id, clientId);
      const mine: Filter<CoachNoteDoc>[] = [{ visibility: 'client' }, { authorId: ctx.user.id }];
      if (since != null) mine.push({ authorId: { $exists: false }, createdAt: { $gte: since } });
      return col.find({ clientId, $or: mine }).sort({ createdAt: -1 }).limit(50).toArray();
    }
    // Admin oversight (`clients.readAll`): everything, audited when it shows someone else's private note.
    const notes = await col.find({ clientId }).sort({ createdAt: -1 }).limit(50).toArray();
    const foreignPrivate = notes.filter((n) => isPrivate(n) && n.authorId !== ctx.user.id);
    if (foreignPrivate.length > 0) {
      await writeAudit(ctx.user, 'coachNotes.readPrivate', clientId, { count: foreignPrivate.length, noteIds: foreignPrivate.map((n) => n._id) });
    }
    return notes;
  }),

  create: authedProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        body: z.string().trim().min(1).max(4000),
        kind: z.enum(['note', 'announcement']).optional(),
        /** Private by default; `client` must be chosen explicitly. */
        visibility: z.enum(['private', 'client']).optional(),
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
        visibility: input.visibility ?? 'private',
        createdAt: now,
        updatedAt: now,
      };
      if (input.screen) note.screen = input.screen;
      if (input.date) note.date = input.date;
      if (input.entityType) note.entityType = input.entityType;
      if (input.entityId) note.entityId = input.entityId;
      await (await coachNotesCol()).insertOne(note);
      // Only a note shared with the client notifies them (a private note's text must never reach the client).
      if (note.visibility === 'client') {
        await notify({
          clientId,
          forRole: 'client',
          type: 'coach_note',
          body: input.body.trim().slice(0, 140),
          screen: input.screen,
          date: input.date,
          entityType: input.entityType,
          entityId: input.entityId,
          noteVisibility: 'client',
          createdBy: ctx.user.id,
        });
      }
      return note;
    }),

  /**
   * Only the note's AUTHOR (or an admin with `clients.writeAll`) may change or
   * delete it (B3.0.1 / B3-S02). Another coach's private note answers
   * NOT_FOUND — a probe cannot confirm it exists; another coach's SHARED note
   * (which the caller can already see) answers FORBIDDEN.
   */
  update: authedProcedure
    .input(z.object({ clientId: z.string().optional(), id: z.string().min(1), body: z.string().trim().min(1).max(4000), visibility: z.enum(['private', 'client']).optional() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await coachNotesCol();
      await assertNoteAuthor(ctx.user, clientId, input.id);
      const now = Date.now();
      await col.updateOne({ _id: input.id, clientId }, { $set: { body: input.body, updatedAt: now, ...(input.visibility ? { visibility: input.visibility } : {}) } });
      const updated = await col.findOne({ _id: input.id, clientId });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' });
      return updated;
    }),

  delete: authedProcedure.input(z.object({ clientId: z.string().optional(), id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    await assertNoteAuthor(ctx.user, clientId, input.id);
    await (await coachNotesCol()).deleteOne({ _id: input.id, clientId });
  }),
});

async function assertNoteAuthor(user: Parameters<typeof canWriteCoachOwned>[0], clientId: string, id: string): Promise<void> {
  const note = await (await coachNotesCol()).findOne({ _id: id, clientId });
  if (!note) throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' });
  if (hasClientsWriteAll(user)) return;
  const since = await myStintStart(user.id, clientId);
  if (authorOf(note, user.id, since) === user.id) return;
  if (isPrivate(note)) throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' });
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the author can change this note' });
}

/** The singleton `coachTargets` doc — coach-owned: client read-only, only the assigned coach / admin(clients.writeAll) may write. */
export const coachTargetsRouter = router({
  get: authedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    return (await coachTargetsCol()).findOne({ _id: clientId });
  }),

  set: authedProcedure
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
