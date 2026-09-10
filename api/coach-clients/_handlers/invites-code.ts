import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActive, requireUser } from '../../_lib/withAuth.js';
import { hasPermission } from '../../_lib/rbac.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { invitesCol, isClaimable, normalizeCode } from './invites-data.js';

/**
 * `GET /api/invites/:code` — PUBLIC (pre-auth) lookup for the claim screen.
 * The code is the capability, same as `firestore.rules`' `allow get: if true`
 * on `signupInvites/{code}` — any caller may resolve a *known* code, but there
 * is no list/enumerate endpoint. Returns the invite payload plus a computed
 * `claimable` flag (port of `isClaimable()`), sparing the frontend needing to
 * fold in the current time itself.
 *
 * `DELETE /api/invites/:code` — the owning coach (or an admin with
 * `coaches.assign`) revokes it. "Copy = keep, close without copying =
 * auto-revoke": this is what the frontend calls when a generated invite link
 * is dismissed unused. Soft-revoke only (`status: 'revoked'`) — never deletes
 * the doc, so the audit trail (who created/claimed/revoked what) survives.
 * A `claimed` invite cannot be revoked (409) — the code was already spent.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'DELETE');
    const raw = req.query.code;
    const code = normalizeCode(typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : '');
    if (!code) throw new HttpError(400, 'Invite code is required');
    const col = await invitesCol();
    const invite = await col.findOne({ _id: code });

    if (req.method === 'GET') {
      if (!invite) throw new HttpError(404, 'Invite not found');
      res.status(200).json({ ...invite, claimable: isClaimable(invite) });
      return;
    }

    // DELETE — revoke. Mutating action: caller must be active.
    const user = await requireUser(req);
    requireActive(user);
    if (!invite) throw new HttpError(404, 'Invite not found');
    const canManage =
      (user.role === 'coach' && invite.coachId === user.id) ||
      hasPermission(user.role, user.accountStatus, user.permissions, 'coaches.assign');
    if (!canManage) throw new HttpError(403, 'Forbidden');
    if (invite.status === 'claimed') throw new HttpError(409, 'Cannot revoke an invite that has already been claimed');

    await col.updateOne({ _id: code }, { $set: { status: 'revoked' } });
    res.status(200).json({ ...invite, status: 'revoked' });
  } catch (e) {
    handleError(res, e);
  }
}
