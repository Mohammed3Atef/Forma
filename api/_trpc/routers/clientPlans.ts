import crypto from 'node:crypto';
import type { Collection } from 'mongodb';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { canReadClientData, canWriteCoachOwned, resolveClientId } from '../../client/_lib/access.js';
import { clientCardioPlansCol, clientNutritionPlansCol, clientWorkoutPlansCol, planCollectionForKind, planVersionsCol } from '../../client/_lib/db.js';
import type { ClientPlanDoc, PlanVersionDoc, PlanVersionKind } from '../../client/_lib/types.js';

/**
 * `workoutPlan`/`nutritionPlan`/`cardioPlan` are identical CRUD shapes (coach-
 * authored singleton, client read-only) differing only in which collection
 * they read/write — see `api/client/_handlers/{workout,nutrition,cardio}-plan.ts`.
 */
const PlanBodySchema = z.object({ clientId: z.string().optional(), id: z.string().optional(), name: z.string().trim().min(1) }).passthrough();

function makePlanRouter(colFn: () => Promise<Collection<ClientPlanDoc>>) {
  return router({
    get: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
      const clientId = resolveClientId(input?.clientId, ctx.user);
      if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const doc = await (await colFn()).findOne({ _id: clientId });
      if (!doc) return null;
      const plan: Record<string, unknown> = { ...doc };
      delete plan._id;
      delete plan.clientId;
      return plan;
    }),

    /** Full replace, mirrors `setDoc` (not merge). */
    save: protectedProcedure.input(PlanBodySchema).mutation(async ({ ctx, input }) => {
      const { clientId: inputClientId, ...body } = input;
      const clientId = resolveClientId(inputClientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const now = Date.now();
      const plan = { ...body, id: body.id ?? clientId, updatedAt: now };
      await (await colFn()).replaceOne({ _id: clientId }, { _id: clientId, clientId, ...plan } as ClientPlanDoc, { upsert: true });
      return plan;
    }),
  });
}

export const workoutPlanRouter = makePlanRouter(clientWorkoutPlansCol);
export const nutritionPlanRouter = makePlanRouter(clientNutritionPlansCol);
export const cardioPlanRouter = makePlanRouter(clientCardioPlansCol);

const KindEnum = z.enum(['workout', 'nutrition', 'cardio']);

async function writeActivePlan(clientId: string, kind: PlanVersionKind, snapshot: Record<string, unknown>): Promise<void> {
  const col = await planCollectionForKind(kind);
  const now = Date.now();
  await col.replaceOne({ _id: clientId }, { _id: clientId, clientId, ...snapshot, updatedAt: now } as ClientPlanDoc, { upsert: true });
}

/**
 * Plan version history — `planVersions` is coach-owned (client read-only).
 * Saving/restoring a version also mirrors the snapshot into the singleton
 * plan doc (`clientWorkoutPlans` etc.) — the doc the client reads day to day.
 */
export const planVersionsRouter = router({
  list: protectedProcedure
    .input(z.object({ clientId: z.string().optional(), kind: KindEnum.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const clientId = resolveClientId(input?.clientId, ctx.user);
      if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await planVersionsCol();
      const filter: Record<string, unknown> = { clientId };
      if (input?.kind) filter.kind = input.kind;
      return col.find(filter).sort({ versionNumber: -1 }).toArray();
    }),

  /** Snapshot the current plan as a new active version (deactivating the previous one). */
  save: protectedProcedure
    .input(z.object({ clientId: z.string().optional(), kind: KindEnum, plan: z.object({ name: z.string().optional() }).passthrough(), reason: z.string().trim().optional() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });

      const col = await planVersionsCol();
      const existing = await col.find({ clientId, kind: input.kind }).sort({ versionNumber: -1 }).toArray();
      const versionNumber = (existing[0]?.versionNumber ?? 0) + 1;
      const now = Date.now();
      const version: PlanVersionDoc = {
        _id: crypto.randomUUID(),
        clientId,
        kind: input.kind,
        versionNumber,
        name: input.plan.name || `${input.kind} v${versionNumber}`,
        createdAt: now,
        createdBy: ctx.user.id,
        snapshot: JSON.parse(JSON.stringify(input.plan)) as Record<string, unknown>,
        active: true,
      };
      if (input.reason) version.reason = input.reason;

      await Promise.all(existing.filter((v) => v.active).map((v) => col.updateOne({ _id: v._id }, { $set: { active: false } })));
      await col.insertOne(version);
      await writeActivePlan(clientId, input.kind, version.snapshot);
      return version;
    }),

  /** Make an older version active again and restore it into the assigned plan. */
  restore: protectedProcedure
    .input(z.object({ clientId: z.string().optional(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });

      const col = await planVersionsCol();
      const version = await col.findOne({ _id: input.versionId, clientId });
      if (!version) throw new TRPCError({ code: 'NOT_FOUND', message: 'Version not found' });
      const all = await col.find({ clientId, kind: version.kind }).toArray();
      await Promise.all(all.map((v) => col.updateOne({ _id: v._id }, { $set: { active: v._id === version._id } })));
      await writeActivePlan(clientId, version.kind, version.snapshot);
      return col.findOne({ _id: input.versionId });
    }),
});
