import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth.js';
import { handleError, methodGuard } from '../../_lib/http.js';
import { flagsCol, toPublicFlag, writeFlagAudit } from './flags-lib.js';

/**
 * Port of `src/services/platform/flagsApi.ts`. GET (`listFlags`): any signed-in
 * user (per firestore.rules `featureFlags` read: `isSignedIn()`). PUT
 * (`saveFlag`, upsert by id): requires `flags.manage`.
 */
const SaveBody = z.object({
  id: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  scope: z.enum(['global', 'coach', 'client']),
  targetId: z.string().trim().min(1).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT');
    const user = await requireUser(req);
    requireActive(user);
    const col = await flagsCol();

    if (req.method === 'PUT') {
      requirePermission(user, 'flags.manage');
      const body = SaveBody.parse(req.body);
      const doc = { _id: body.id, enabled: body.enabled, scope: body.scope, targetId: body.targetId, updatedAt: Date.now() };
      await col.replaceOne({ _id: body.id }, doc, { upsert: true });
      await writeFlagAudit(user, body.id, { flag: body.id, enabled: body.enabled, scope: body.scope });
      res.status(200).json(toPublicFlag(doc));
      return;
    }

    const docs = await col.find({}).toArray();
    res.status(200).json(docs.map(toPublicFlag));
  } catch (e) {
    handleError(res, e);
  }
}
