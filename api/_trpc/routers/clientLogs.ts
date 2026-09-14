import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { canReadClientData, resolveClientId } from '../../client/_lib/access.js';
import { syncRecordsCol } from '../../sync/_data.js';

/**
 * Raw fitness logs (workout/nutrition/weight/cardio/checklist) and progress
 * photos are all read-only oversight routes over the generic `syncRecords`
 * collection (`api/sync/*`) — the client's own device pushes them there via
 * `SyncEngine`/`photoStore.ts`; these routes never write. See
 * `api/client/_handlers/{logs-*,photos}.ts`, which this ports 1:1 (only the
 * per-collection defaults differ — captured in the config below instead of
 * five near-duplicate handler files).
 */
async function requireReadAccess(user: Parameters<typeof canReadClientData>[0], inputClientId: string | undefined) {
  const clientId = resolveClientId(inputClientId, user);
  if (!(await canReadClientData(user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
  return clientId;
}

function makeDayKeyedLogRouter(collection: string, defaultLimit: number, maxLimit: number) {
  return router({
    get: authedProcedure.input(z.object({ clientId: z.string().optional(), date: z.string() })).query(async ({ ctx, input }) => {
      const clientId = await requireReadAccess(ctx.user, input.clientId);
      const syncCol = await syncRecordsCol();
      const rec = await syncCol.findOne({ clientId, collection, recordId: input.date });
      return rec?.data ?? null;
    }),
    list: authedProcedure.input(z.object({ clientId: z.string().optional(), limit: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
      const clientId = await requireReadAccess(ctx.user, input?.clientId);
      const syncCol = await syncRecordsCol();
      const limit = Math.min(input?.limit || defaultLimit, maxLimit);
      const recs = await syncCol.find({ clientId, collection }).sort({ recordId: -1 }).limit(limit).toArray();
      return recs.map((r) => r.data);
    }),
  });
}

export const logsWorkoutRouter = makeDayKeyedLogRouter('workoutLogs', 30, 200);
export const logsNutritionRouter = makeDayKeyedLogRouter('nutritionLogs', 30, 200);
export const logsWeightRouter = makeDayKeyedLogRouter('weightLogs', 120, 500);
export const logsChecklistRouter = makeDayKeyedLogRouter('dailyChecklists', 30, 200);

/** cardioLogs allows several sessions per day, so it's keyed by its own generated id, not the date. */
export const logsCardioRouter = router({
  get: authedProcedure.input(z.object({ clientId: z.string().optional(), id: z.string() })).query(async ({ ctx, input }) => {
    const clientId = await requireReadAccess(ctx.user, input.clientId);
    const syncCol = await syncRecordsCol();
    const rec = await syncCol.findOne({ clientId, collection: 'cardioLogs', recordId: input.id });
    return rec?.data ?? null;
  }),
  list: authedProcedure
    .input(z.object({ clientId: z.string().optional(), date: z.string().optional(), limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const clientId = await requireReadAccess(ctx.user, input?.clientId);
      const syncCol = await syncRecordsCol();
      const filter: Record<string, unknown> = { clientId, collection: 'cardioLogs' };
      if (input?.date) filter['data.date'] = input.date;
      const limit = Math.min(input?.limit || 120, 500);
      const recs = await syncCol.find(filter).sort({ updatedAt: -1 }).limit(limit).toArray();
      return recs.map((r) => r.data);
    }),
});

/** Coach-oversight read of a client's progress photos (the `progressPhotos` generic-sync collection). */
export const photosRouter = router({
  list: authedProcedure.input(z.object({ clientId: z.string().optional(), limit: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = await requireReadAccess(ctx.user, input?.clientId);
    const syncCol = await syncRecordsCol();
    const limit = Math.min(input?.limit || 200, 500);
    const recs = await syncCol.find({ clientId, collection: 'progressPhotos' }).sort({ 'data.date': -1 }).limit(limit).toArray();
    return recs.map((r) => r.data);
  }),
});
