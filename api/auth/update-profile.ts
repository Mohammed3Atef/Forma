import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../_lib/mongodb.js';
import { requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { toPublicUser, type UserDoc } from '../_lib/types.js';

/** Mirrors `sessionStore.updateSelf` — the signed-in user's own non-control fields only. */
const Body = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  photoUrl: z.string().trim().max(2000).optional(),
  timezone: z.string().trim().max(80).optional(),
  currency: z.string().trim().max(10).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'PATCH');
    const user = await requireUser(req);
    const patch = Body.parse(req.body);
    const set: Partial<UserDoc> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (set as Record<string, unknown>)[k] = v;
    }
    if (patch.displayName) set.displayNameLower = patch.displayName.toLowerCase();
    const users = await usersCol();
    await users.updateOne({ _id: user.id }, { $set: set });
    const updated = await users.findOne({ _id: user.id });
    res.status(200).json(toPublicUser(updated!));
  } catch (e) {
    handleError(res, e);
  }
}
