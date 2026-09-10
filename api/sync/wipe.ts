import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { syncDeletionsCol, syncRecordsCol, syncSingletonsCol } from './_data.js';

/** Deletes ALL of the caller's own synced data (used by "reset all data"). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    const [records, deletions, singletons] = await Promise.all([syncRecordsCol(), syncDeletionsCol(), syncSingletonsCol()]);
    await Promise.all([
      records.deleteMany({ clientId: user.id }),
      deletions.deleteMany({ clientId: user.id }),
      singletons.deleteMany({ clientId: user.id }),
    ]);
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
