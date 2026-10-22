import crypto from 'node:crypto';
import type { Collection } from 'mongodb';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { canReadClientData, canWriteCoachOwned, resolveClientId } from '../../client/_lib/access.js';
import { clientCardioPlansCol, clientNutritionPlansCol, clientWorkoutPlansCol, coachClientsCol, planCollectionForKind, planVersionsCol } from '../../client/_lib/db.js';
import type { ClientPlanDoc, PlanVersionDoc, PlanVersionKind } from '../../client/_lib/types.js';

/**
 * `workoutPlan`/`nutritionPlan`/`cardioPlan` are identical CRUD shapes (coach-
 * authored singleton, client read-only) differing only in which collection
 * they read/write — see `api/client/_handlers/{workout,nutrition,cardio}-plan.ts`.
 */
const PlanBodySchema = z
  .object({
    clientId: z.string().optional(),
    id: z.string().optional(),
    name: z.string().trim().min(1),
    /**
     * Optimistic concurrency (B0 / CO-01). `updatedAt` of the server plan the
     * editor loaded; `null` = "creating — no plan may exist yet". Required
     * unless `replaceExisting` is set, so a stale or never-loaded editor can
     * never silently replace a newer plan.
     */
    baseUpdatedAt: z.number().nullable().optional(),
    /** Deliberate full replacement (template assignment). The previous plan is still snapshotted as a version first. */
    replaceExisting: z.boolean().optional(),
    /** Optional label for the version this save creates. */
    versionReason: z.string().trim().max(200).optional(),
  })
  .passthrough();

const CONTROL_FIELDS = ['baseUpdatedAt', 'replaceExisting', 'versionReason'] as const;

function stripDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  delete out._id;
  delete out.clientId;
  return out;
}

/**
 * Make sure the plan that is about to be replaced is recoverable: if the active
 * version doesn't already hold exactly this plan (legacy plans saved before
 * every save was versioned, or a plan written by another path), snapshot it as
 * an inactive version first.
 */
async function capturePrevious(clientId: string, kind: PlanVersionKind, existing: ClientPlanDoc, userId: string): Promise<void> {
  const col = await planVersionsCol();
  const active = await col.findOne({ clientId, kind, active: true });
  if (active && active.planUpdatedAt === existing.updatedAt) return;
  const latest = await col.find({ clientId, kind }).sort({ versionNumber: -1 }).limit(1).toArray();
  const versionNumber = (latest[0]?.versionNumber ?? 0) + 1;
  const snapshot = stripDoc(existing as unknown as Record<string, unknown>);
  await col.insertOne({
    _id: crypto.randomUUID(),
    clientId,
    kind,
    versionNumber,
    name: (snapshot.name as string) || `${kind} v${versionNumber}`,
    createdAt: Date.now(),
    createdBy: userId,
    reason: 'Previous plan (saved automatically before a change)',
    snapshot,
    active: false,
    planUpdatedAt: existing.updatedAt as number,
  });
}

async function recordVersion(clientId: string, kind: PlanVersionKind, snapshot: Record<string, unknown>, planUpdatedAt: number, userId: string, reason?: string): Promise<PlanVersionDoc> {
  const col = await planVersionsCol();
  const latest = await col.find({ clientId, kind }).sort({ versionNumber: -1 }).limit(1).toArray();
  const versionNumber = (latest[0]?.versionNumber ?? 0) + 1;
  await col.updateMany({ clientId, kind, active: true }, { $set: { active: false } });
  const version: PlanVersionDoc = {
    _id: crypto.randomUUID(),
    clientId,
    kind,
    versionNumber,
    name: (snapshot.name as string) || `${kind} v${versionNumber}`,
    createdAt: Date.now(),
    createdBy: userId,
    snapshot: JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>,
    active: true,
    planUpdatedAt,
  };
  if (reason) version.reason = reason;
  await col.insertOne(version);
  return version;
}

export const PLAN_CONFLICT_MESSAGE = 'PLAN_CONFLICT: this plan changed since it was loaded. Reload the latest plan before saving.';

/**
 * The ONLY write path for a client's assigned plan (B0 / CO-01):
 *  - create (`baseUpdatedAt: null`) fails if a plan already exists;
 *  - update (`baseUpdatedAt: n`) is an atomic compare-and-replace on `updatedAt`;
 *  - `replaceExisting` is an explicit full replacement (template assignment);
 *  - the previous plan is captured as a version if it isn't already, and the
 *    new plan is recorded as the active version — every save is recoverable.
 */
export async function savePlanGuarded(
  kind: PlanVersionKind,
  clientId: string,
  body: Record<string, unknown>,
  opts: { baseUpdatedAt?: number | null; replaceExisting?: boolean; reason?: string; userId: string },
): Promise<Record<string, unknown>> {
  const col = await planCollectionForKind(kind);
  const existing = await col.findOne({ _id: clientId });
  if (!opts.replaceExisting) {
    if (opts.baseUpdatedAt === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'baseUpdatedAt is required (reload the editor and try again).' });
    }
    if (opts.baseUpdatedAt === null ? !!existing : !existing || existing.updatedAt !== opts.baseUpdatedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: PLAN_CONFLICT_MESSAGE });
    }
  }
  if (existing) await capturePrevious(clientId, kind, existing, opts.userId);
  const clean: Record<string, unknown> = { ...body };
  for (const f of CONTROL_FIELDS) delete clean[f];
  delete clean.clientId;
  delete clean._id;
  // Strictly increasing, so two saves in the same millisecond can't share a revision.
  const now = Math.max(Date.now(), ((existing?.updatedAt as number | undefined) ?? 0) + 1);
  const plan = { ...clean, id: (clean.id as string | undefined) ?? clientId, updatedAt: now };
  const doc = { _id: clientId, clientId, ...plan } as unknown as ClientPlanDoc;
  if (!existing) {
    try {
      await col.insertOne(doc);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new TRPCError({ code: 'CONFLICT', message: PLAN_CONFLICT_MESSAGE });
      throw e;
    }
  } else {
    const filter = opts.replaceExisting ? { _id: clientId } : { _id: clientId, updatedAt: existing.updatedAt };
    const res = await col.replaceOne(filter as never, doc);
    if (res.matchedCount === 0) throw new TRPCError({ code: 'CONFLICT', message: PLAN_CONFLICT_MESSAGE });
  }
  await recordVersion(clientId, kind, plan, now, opts.userId, opts.reason);
  return plan;
}

function makePlanRouter(kind: PlanVersionKind, colFn: () => Promise<Collection<ClientPlanDoc>>) {
  return router({
    get: authedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
      const clientId = resolveClientId(input?.clientId, ctx.user);
      if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const doc = await (await colFn()).findOne({ _id: clientId });
      if (!doc) return null;
      return stripDoc(doc as unknown as Record<string, unknown>);
    }),

    /** Full replace with optimistic concurrency + automatic versioning (see `savePlanGuarded`). */
    save: authedProcedure.input(PlanBodySchema).mutation(async ({ ctx, input }) => {
      const { clientId: inputClientId, baseUpdatedAt, replaceExisting, versionReason, ...body } = input;
      const clientId = resolveClientId(inputClientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      return savePlanGuarded(kind, clientId, body, { baseUpdatedAt, replaceExisting, reason: versionReason, userId: ctx.user.id });
    }),
  });
}

export const workoutPlanRouter = makePlanRouter('workout', clientWorkoutPlansCol);
export const nutritionPlanRouter = makePlanRouter('nutrition', clientNutritionPlansCol);
export const cardioPlanRouter = makePlanRouter('cardio', clientCardioPlansCol);

const KindEnum = z.enum(['workout', 'nutrition', 'cardio']);

async function writeActivePlan(clientId: string, kind: PlanVersionKind, snapshot: Record<string, unknown>, previousUpdatedAt: number): Promise<number> {
  const col = await planCollectionForKind(kind);
  const now = Math.max(Date.now(), previousUpdatedAt + 1);
  await col.replaceOne({ _id: clientId }, { _id: clientId, clientId, ...snapshot, updatedAt: now } as ClientPlanDoc, { upsert: true });
  return now;
}

/**
 * Plan version history — `planVersions` is coach-owned (client read-only).
 * Saving/restoring a version also mirrors the snapshot into the singleton
 * plan doc (`clientWorkoutPlans` etc.) — the doc the client reads day to day.
 */
/**
 * B3.9 (owner rule O-16): a coach sees and restores only the plan versions of THEIR CURRENT stint
 * with the client — on or after the day the active relationship began. After a transfer (fresh
 * start or not) or a release and re-assignment, the earlier versions — another coach's plans and
 * reasons — stay out of reach. The client and admins keep the whole history. Null = no limit.
 */
async function coachStintStart(user: { id: string; role: string }, clientId: string): Promise<number | null> {
  if (user.role !== 'coach') return null;
  const rel = await (await coachClientsCol()).findOne({ coachId: user.id, clientId, status: 'active' }, { projection: { createdAt: 1 } });
  // A relationship without a start date (data from before B3) sets no boundary — as before.
  return Number(rel?.createdAt ?? 0);
}

/** The newest versions are what the History sheet shows; older ones stay stored. */
const VERSION_LIST_LIMIT = 200;

export const planVersionsRouter = router({
  list: authedProcedure
    .input(z.object({ clientId: z.string().optional(), kind: KindEnum.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const clientId = resolveClientId(input?.clientId, ctx.user);
      if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await planVersionsCol();
      const filter: Record<string, unknown> = { clientId };
      if (input?.kind) filter.kind = input.kind;
      const since = await coachStintStart(ctx.user, clientId);
      if (since != null) filter.createdAt = { $gte: since };
      return col.find(filter).sort({ versionNumber: -1 }).limit(VERSION_LIST_LIMIT).toArray();
    }),

  /**
   * "Save as new version": the same guarded save as the editors (concurrency
   * + automatic capture of the previous plan), with the coach's reason.
   */
  save: authedProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        kind: KindEnum,
        plan: z.object({ name: z.string().optional() }).passthrough(),
        reason: z.string().trim().optional(),
        baseUpdatedAt: z.number().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const body = { ...(input.plan as Record<string, unknown>) };
      if (!body.name) body.name = `${input.kind} plan`;
      await savePlanGuarded(input.kind, clientId, body, { baseUpdatedAt: input.baseUpdatedAt, reason: input.reason, userId: ctx.user.id });
      const col = await planVersionsCol();
      return col.findOne({ clientId, kind: input.kind, active: true });
    }),

  /** Make an older version active again and restore it into the assigned plan. */
  restore: authedProcedure
    .input(z.object({ clientId: z.string().optional(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });

      const col = await planVersionsCol();
      const since = await coachStintStart(ctx.user, clientId);
      const version = await col.findOne({ _id: input.versionId, clientId, ...(since != null ? { createdAt: { $gte: since } } : {}) });
      // Another stint's version answers exactly like a missing one (no probing of earlier coaches' work).
      if (!version) throw new TRPCError({ code: 'NOT_FOUND', message: 'Version not found' });
      const planCol = await planCollectionForKind(version.kind);
      const current = await planCol.findOne({ _id: clientId });
      if (current) await capturePrevious(clientId, version.kind, current, ctx.user.id);
      const updatedAt = await writeActivePlan(clientId, version.kind, version.snapshot, (current?.updatedAt as number | undefined) ?? 0);
      await col.updateMany({ clientId, kind: version.kind, active: true }, { $set: { active: false } });
      await col.updateOne({ _id: version._id }, { $set: { active: true, planUpdatedAt: updatedAt } });
      return col.findOne({ _id: input.versionId });
    }),
});
