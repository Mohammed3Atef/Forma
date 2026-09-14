import { z } from 'zod';
import { router, protectedProcedure, permissionProcedure } from '../trpc.js';
import { DAY_MS, activeDaysCol, dayKey, usageStatsCol } from '../../banners/_handlers/usage-lib.js';

/** tRPC port of `api/banners/_handlers/{usage-index,usage-active-day,usage-bump}.ts`. */
export const usageRouter = router({
  /** Records that the calling user was active today (idempotent per user/day). uid/role come from the verified session, never the input. */
  recordActiveDay: protectedProcedure.mutation(async ({ ctx }) => {
    const day = dayKey();
    const col = await activeDaysCol();
    await col.updateOne(
      { _id: `${day}__${ctx.user.id}` },
      { $set: { day, uid: ctx.user.id, role: ctx.user.role, ts: Date.now() } },
      { upsert: true },
    );
  }),

  bump: protectedProcedure
    .input(z.object({ field: z.literal('searches') }))
    .mutation(async () => {
      const day = dayKey();
      const col = await usageStatsCol();
      await col.updateOne({ _id: day }, { $set: { day, updatedAt: Date.now() }, $inc: { searches: 1 } }, { upsert: true });
    }),

  /** Admin usage aggregate: activeDays (last 30d) + usageStats (last 7d) → DAU/WAU/MAU + 8-day activeTrend + searches7d. */
  fetch: permissionProcedure('users.read').query(async () => {
    const now = Date.now();
    const activeCol = await activeDaysCol();
    const usageCol = await usageStatsCol();
    const [rows, usageDocs] = await Promise.all([
      activeCol.find({ ts: { $gte: now - 30 * DAY_MS } }).toArray(),
      usageCol.find({ day: { $gte: dayKey(now - 7 * DAY_MS) } }).toArray(),
    ]);

    const distinctWithin = (ms: number) => new Set(rows.filter((r) => r.ts >= now - ms).map((r) => r.uid)).size;
    const today = dayKey();
    const activeTrend: { label: string; value: number }[] = [];
    for (let i = 7; i >= 0; i -= 1) {
      const dk = dayKey(now - i * DAY_MS);
      const value = new Set(rows.filter((r) => r.day === dk).map((r) => r.uid)).size;
      const d = new Date(now - i * DAY_MS);
      activeTrend.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value });
    }
    const searches7d = usageDocs.reduce((n, d) => n + (d.searches ?? 0), 0);

    return {
      dau: new Set(rows.filter((r) => r.day === today).map((r) => r.uid)).size,
      wau: distinctWithin(7 * DAY_MS),
      mau: distinctWithin(30 * DAY_MS),
      activeTrend,
      searches7d,
    };
  }),
});
