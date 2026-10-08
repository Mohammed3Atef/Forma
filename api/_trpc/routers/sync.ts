import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedureNoActive } from '../trpc.js';
import { isSyncCollection, MAX_RECORDS_PER_PUSH, SYNC_SCHEMA_VERSION, validatePushedRecord, type RejectReason } from '../../sync/_contract.js';
import { recordId, singletonId, syncDeletionsCol, syncRecordsCol, syncSingletonsCol, type SyncRecordDoc } from '../../sync/_data.js';

/** The server's copy of a record, returned when a device's write can't be applied on top of it. */
interface ServerCopy {
  id: string;
  updatedAt: number;
  rev: number;
  data: Record<string, unknown>;
}
const copyOf = (d: SyncRecordDoc): ServerCopy => ({ id: d.recordId, updatedAt: d.updatedAt, rev: d.rev ?? 0, data: d.data });

/** B1.7: an unknown collection is a programming error — refuse the request (records are checked one by one). */
function assertCollection(name: string): void {
  if (!isSyncCollection(name)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown collection' });
}
const isDuplicateKey = (e: unknown) => (e as { code?: number } | null)?.code === 11000;

/**
 * Generic sync backend for `src/data/sync/SyncEngine.ts` — port of
 * `api/sync/_handlers/*.ts`. Every procedure is `clientSyncProcedure`: client
 * role only, but deliberately NOT `accountStatus === 'active'` — a pending or
 * suspended account's offline queue must still be able to flush, and its own
 * previously-synced data must still be readable, even though it can't take
 * most other actions elsewhere in the app.
 */

/**
 * B0 / RM-81, PWA-04: only CLIENT accounts own tracker data. A coach/admin
 * session must never push, pull or delete through the client sync endpoints
 * (a stale build used to run the engine for every role and could capture a
 * client's queued records under the coach's id). Still no active-status
 * requirement, so a pending/suspended client's offline queue can flush.
 */
const clientSyncProcedure = roleProcedureNoActive('client');

export const syncRouter = router({
  /**
   * Conditional write of dirty local records for one synced collection
   * (B0 / PWA-06). Each record carries the revision the device last saw:
   *  - `baseRev: n`    → applied only if the server copy is still at rev n
   *                      (or was deleted meanwhile — a later edit wins over a delete);
   *  - `baseRev: null` → a record the device never saw on the server: applied
   *                      only if none exists (two devices creating the same
   *                      date-keyed day is a conflict, not an overwrite);
   *  - omitted         → a pre-revision client: never lets an OLDER edit
   *                      replace a newer one.
   * Everything not applied comes back in `conflicts` with the server copy, so
   * the device can ask the user instead of losing either side.
   */
  push: clientSyncProcedure
    .input(
      z.object({
        collection: z.string().min(1).max(60),
        records: z
          .array(
            z.object({
              id: z.string().min(1).max(200),
              // Checked per record by the contract (a bad value rejects that record, not the batch).
              updatedAt: z.unknown(),
              data: z.record(z.string(), z.unknown()),
              baseRev: z.number().int().min(0).nullable().optional(),
              /** Record schema version (B1.7); absent from pre-B1 clients = 1. */
              sv: z.number().int().optional(),
            }),
          )
          .max(MAX_RECORDS_PER_PUSH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertCollection(input.collection);
      const collection = input.collection as Parameters<typeof validatePushedRecord>[0];
      const col = await syncRecordsCol();
      const syncedAt = Date.now();
      const accepted: { id: string; rev: number }[] = [];
      const conflicts: ServerCopy[] = [];
      // Records that break the contract are refused ONE BY ONE (B1.7 / PWA-13):
      // the rest of the batch still applies, and the device learns why.
      const rejected: { id: string; reason: RejectReason }[] = [];
      for (const raw of input.records) {
        const reason = validatePushedRecord(collection, { ...raw, updatedAt: raw.updatedAt as number });
        if (reason) {
          rejected.push({ id: raw.id, reason });
          continue;
        }
        const rec = { ...raw, updatedAt: raw.updatedAt as number };
        const _id = recordId(ctx.user.id, input.collection, rec.id);
        const existing = await col.findOne({ _id });
        let ok: boolean;
        if (rec.baseRev === undefined) ok = !existing || rec.updatedAt >= existing.updatedAt;
        else if (rec.baseRev === null) ok = !existing;
        else ok = !existing || (existing.rev ?? 0) === rec.baseRev;
        if (ok) {
          const rev = (existing?.rev ?? 0) + 1;
          const doc = { clientId: ctx.user.id, collection: input.collection, recordId: rec.id, data: rec.data, updatedAt: rec.updatedAt, syncedAt, rev, sv: rec.sv ?? SYNC_SCHEMA_VERSION };
          if (existing) {
            // Atomic compare-and-set on the revision we checked.
            const filter = existing.rev == null ? { _id, rev: { $exists: false } } : { _id, rev: existing.rev };
            ok = (await col.updateOne(filter, { $set: doc })).matchedCount === 1;
          } else {
            try {
              await col.insertOne({ _id, ...doc });
            } catch (e) {
              if (!isDuplicateKey(e)) throw e;
              ok = false;
            }
          }
          if (ok) {
            accepted.push({ id: rec.id, rev });
            continue;
          }
        }
        const current = await col.findOne({ _id });
        if (current) conflicts.push(copyOf(current));
      }
      return { pushed: accepted.length, syncedAt, accepted, conflicts, rejected };
    }),

  pull: clientSyncProcedure
    .input(z.object({ collection: z.string().min(1).max(60), since: z.number().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      assertCollection(input.collection);
      const col = await syncRecordsCol();
      const docs = await col
        .find({ clientId: ctx.user.id, collection: input.collection, ...(input.since > 0 ? { syncedAt: { $gt: input.since } } : {}) })
        .toArray();
      let maxSyncedAt = input.since;
      const records = docs.map((d) => {
        maxSyncedAt = Math.max(maxSyncedAt, d.syncedAt);
        return { id: d.recordId, updatedAt: d.updatedAt, rev: d.rev ?? 0, sv: d.sv ?? 1, data: d.data };
      });
      return { records, maxSyncedAt };
    }),

  /**
   * Deletions are conditional too (B0 / PWA-03, PWA-06): a delete only removes
   * the server copy the device actually saw (`baseRev`); if it was edited since
   * (or, for a pre-revision client, edited after the delete happened) the
   * delete is refused and the current copy returned — an edit always beats a
   * stale delete, and one device can never delete a record it never had.
   */
  deletionsPush: clientSyncProcedure
    .input(
      z.object({
        deletions: z.array(
          z.object({ collection: z.string().min(1).max(60), id: z.string().min(1), deletedAt: z.number(), baseRev: z.number().int().min(0).nullable().optional() }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const col = await syncDeletionsCol();
      const records = await syncRecordsCol();
      const syncedAt = Date.now();
      const rejected: (ServerCopy & { collection: string })[] = [];
      let flushed = 0;
      for (const del of input.deletions) {
        if (!isSyncCollection(del.collection)) continue; // never store a tombstone for something that can't exist
        const _id = recordId(ctx.user.id, del.collection, del.id);
        const live = await records.findOne({ _id });
        if (live) {
          const allowed = del.baseRev === undefined ? live.updatedAt <= del.deletedAt : (live.rev ?? 0) === del.baseRev && del.baseRev !== null;
          if (!allowed) {
            rejected.push({ collection: del.collection, ...copyOf(live) });
            continue;
          }
          // Remove the copy we checked (not one written a moment later).
          const filter = live.rev == null ? { _id, rev: { $exists: false } } : { _id, rev: live.rev };
          if ((await records.deleteOne(filter)).deletedCount !== 1) {
            const now = await records.findOne({ _id });
            if (now) {
              rejected.push({ collection: del.collection, ...copyOf(now) });
              continue;
            }
          }
        }
        flushed += 1;
        await col.updateOne(
          { _id: recordId(ctx.user.id, del.collection, del.id) },
          { $set: { clientId: ctx.user.id, collection: del.collection, recordId: del.id, deletedAt: del.deletedAt, syncedAt } },
          { upsert: true },
        );
      }
      return { flushed, syncedAt, rejected };
    }),

  deletionsPull: clientSyncProcedure.input(z.object({ since: z.number().min(0).default(0) })).query(async ({ ctx, input }) => {
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
  singletonGet: clientSyncProcedure.input(z.object({ name: z.enum(['profile', 'settings']) })).query(async ({ ctx, input }) => {
    const col = await syncSingletonsCol();
    const doc = await col.findOne({ _id: singletonId(ctx.user.id, input.name) });
    return doc ? { data: doc.data, updatedAt: doc.updatedAt } : null;
  }),

  /** PUT — last-write-wins by `updatedAt`; a stale write is rejected with the current remote value so the client can pull instead. */
  singletonSet: clientSyncProcedure
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
  // B0 / CL-44, RM-56: there is deliberately NO client-callable wipe — the
  // synced history is the record the coach reviews; account/data deletion is
  // support-mediated.
});
