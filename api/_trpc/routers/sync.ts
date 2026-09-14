import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';
import { recordId, singletonId, syncDeletionsCol, syncRecordsCol, syncSingletonsCol } from '../../sync/_data.js';

/**
 * Generic sync backend for `src/data/sync/SyncEngine.ts` — port of
 * `api/sync/_handlers/*.ts`. Deliberately `authedProcedure` (bare — requires
 * only a resolved user, NOT `accountStatus === 'active'`) everywhere here,
 * matching every old handler's `requireUser()`-only guard: a pending or
 * suspended account's offline queue must still be able to flush, and its own
 * previously-synced data must still be readable, even though it can't take
 * most other actions elsewhere in the app.
 */

export const syncRouter = router({
  /** Bulk upsert of dirty local records for one synced collection. One server timestamp for the whole batch. */
  push: authedProcedure
    .input(
      z.object({
        collection: z.string().min(1).max(60),
        records: z.array(z.object({ id: z.string().min(1), updatedAt: z.number(), data: z.record(z.string(), z.unknown()) })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const col = await syncRecordsCol();
      const syncedAt = Date.now();
      for (const rec of input.records) {
        await col.updateOne(
          { _id: recordId(ctx.user.id, input.collection, rec.id) },
          {
            $set: {
              clientId: ctx.user.id,
              collection: input.collection,
              recordId: rec.id,
              data: rec.data,
              updatedAt: rec.updatedAt,
              syncedAt,
            },
          },
          { upsert: true },
        );
      }
      return { pushed: input.records.length, syncedAt };
    }),

  pull: authedProcedure
    .input(z.object({ collection: z.string().min(1).max(60), since: z.number().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const col = await syncRecordsCol();
      const docs = await col
        .find({ clientId: ctx.user.id, collection: input.collection, ...(input.since > 0 ? { syncedAt: { $gt: input.since } } : {}) })
        .toArray();
      let maxSyncedAt = input.since;
      const records = docs.map((d) => {
        maxSyncedAt = Math.max(maxSyncedAt, d.syncedAt);
        return { id: d.recordId, updatedAt: d.updatedAt, data: d.data };
      });
      return { records, maxSyncedAt };
    }),

  deletionsPush: authedProcedure
    .input(z.object({ deletions: z.array(z.object({ collection: z.string().min(1).max(60), id: z.string().min(1), deletedAt: z.number() })) }))
    .mutation(async ({ ctx, input }) => {
      const col = await syncDeletionsCol();
      const syncedAt = Date.now();
      for (const del of input.deletions) {
        await col.updateOne(
          { _id: recordId(ctx.user.id, del.collection, del.id) },
          { $set: { clientId: ctx.user.id, collection: del.collection, recordId: del.id, deletedAt: del.deletedAt, syncedAt } },
          { upsert: true },
        );
        // Remove the live record too, so a subsequent pull of the data
        // collection doesn't resurrect it on another device.
        await (await syncRecordsCol()).deleteOne({ _id: recordId(ctx.user.id, del.collection, del.id) });
      }
      return { flushed: input.deletions.length, syncedAt };
    }),

  deletionsPull: authedProcedure.input(z.object({ since: z.number().min(0).default(0) })).query(async ({ ctx, input }) => {
    const col = await syncDeletionsCol();
    const docs = await col.find({ clientId: ctx.user.id, ...(input.since > 0 ? { syncedAt: { $gt: input.since } } : {}) }).toArray();
    let maxSyncedAt = input.since;
    const deletions = docs.map((d) => {
      maxSyncedAt = Math.max(maxSyncedAt, d.syncedAt);
      return { collection: d.collection, id: d.recordId, deletedAt: d.deletedAt };
    });
    return { deletions, maxSyncedAt };
  }),

  /** GET the caller's own profile/settings singleton. */
  singletonGet: authedProcedure.input(z.object({ name: z.enum(['profile', 'settings']) })).query(async ({ ctx, input }) => {
    const col = await syncSingletonsCol();
    const doc = await col.findOne({ _id: singletonId(ctx.user.id, input.name) });
    return doc ? { data: doc.data, updatedAt: doc.updatedAt } : null;
  }),

  /** PUT — last-write-wins by `updatedAt`; a stale write is rejected with the current remote value so the client can pull instead. */
  singletonSet: authedProcedure
    .input(z.object({ name: z.enum(['profile', 'settings']), data: z.record(z.string(), z.unknown()), updatedAt: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const col = await syncSingletonsCol();
      const existing = await col.findOne({ _id: singletonId(ctx.user.id, input.name) });
      if (existing && existing.updatedAt > input.updatedAt) {
        return { data: existing.data, updatedAt: existing.updatedAt, stale: true };
      }
      await col.updateOne(
        { _id: singletonId(ctx.user.id, input.name) },
        { $set: { clientId: ctx.user.id, name: input.name, data: input.data, updatedAt: input.updatedAt } },
        { upsert: true },
      );
      return { data: input.data, updatedAt: input.updatedAt, stale: false };
    }),

  /** Deletes ALL of the caller's own synced data (used by "reset all data"). */
  wipe: authedProcedure.mutation(async ({ ctx }) => {
    const [records, deletions, singletons] = await Promise.all([syncRecordsCol(), syncDeletionsCol(), syncSingletonsCol()]);
    await Promise.all([
      records.deleteMany({ clientId: ctx.user.id }),
      deletions.deleteMany({ clientId: ctx.user.id }),
      singletons.deleteMany({ clientId: ctx.user.id }),
    ]);
  }),
});
