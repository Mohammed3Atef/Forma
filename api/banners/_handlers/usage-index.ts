import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth.js';
import { handleError, methodGuard } from '../../_lib/http.js';
import { DAY_MS, activeDaysCol, dayKey, usageStatsCol } from './usage-lib.js';

/**
 * Port of `usageApi.ts`'s `fetchUsage()` — admin usage aggregate: `activeDays`
 * (last 30d) + `usageStats` (last 7d) → DAU/WAU/MAU + 8-day activeTrend +
 * searches7d. Per firestore.rules, both collections are read-gated by
 * `users.read`.
 */
export interface UsageData {
  dau: number;
  wau: number;
  mau: number;
  activeTrend: { label: string; value: number }[];
  searches7d: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);
    requirePermission(user, 'users.read');

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

    const data: UsageData = {
      dau: new Set(rows.filter((r) => r.day === today).map((r) => r.uid)).size,
      wau: distinctWithin(7 * DAY_MS),
      mau: distinctWithin(30 * DAY_MS),
      activeTrend,
      searches7d,
    };
    res.status(200).json(data);
  } catch (e) {
    handleError(res, e);
  }
}
