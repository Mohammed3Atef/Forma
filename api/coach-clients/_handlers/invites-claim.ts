import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../../_lib/mongodb.js';
import { hashPassword } from '../../_lib/password.js';
import { issueSession } from '../../_lib/tokens.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { toPublicUser, type UserDoc } from '../../_lib/types.js';
import { bumpActiveClientCount, coachAtClientCap, coachClientsCol, relId } from '../_data.js';
import type { CoachClientDoc } from '../_types.js';
import { buildClaimSubscription, invitesCol, isClaimable, normalizeCode } from './invites-data.js';

const Body = z.object({
  code: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(1),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().max(120).optional(),
});

/**
 * `POST /api/invites/claim` — PUBLIC (pre-auth). The all-or-nothing join that
 * `AcceptInvite.tsx`'s `join()` used to perform against Firebase Auth +
 * Firestore, now done server-side against Mongo:
 *  1) validate the code (pending, not expired, single-use),
 *  2) enforce the destination coach's client cap,
 *  3) create the client's `users` doc (role: client, active, assignedCoachId,
 *     inviteCode),
 *  4) create the `coachClients` relationship with an explicit subscription
 *     state built from the invite's chosen settings (`buildClaimSubscription`)
 *     — a client is NEVER left without a subscription,
 *  5) mark the invite `claimed` (single-use; an atomic conditional update, so
 *     a concurrent double-claim is rejected for everyone but the first writer
 *     — even more airtight than the Firestore rule this ports, which relied on
 *     a single-document rule check),
 *  6) issue a session so the new client is immediately signed in.
 * A failure after the atomic claim rolls the invite back to `pending` (port of
 * `unclaimInvite()`) and — if the user doc was already inserted — removes it,
 * so the code stays usable and no orphaned account is left behind.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const body = Body.parse(req.body);
    const code = normalizeCode(body.code);

    const invites = await invitesCol();
    const invite = await invites.findOne({ _id: code });
    if (!isClaimable(invite)) throw new HttpError(410, 'This invite is no longer valid');
    const inv = invite!;

    const email = (inv.email?.trim() || body.email?.trim() || '').toLowerCase();
    if (!email) throw new HttpError(400, 'Email is required');

    const users = await usersCol();
    if (await users.findOne({ emailLower: email })) {
      throw new HttpError(409, 'An account with this email already exists.');
    }

    if (await coachAtClientCap(inv.coachId)) {
      throw new HttpError(409, 'This coach has reached their client limit');
    }

    const now = Date.now();
    const clientId = crypto.randomUUID();

    // Atomically flip pending -> claimed, naming this new client as the
    // claimer. Single-use guarantee even under a concurrent double-claim.
    const claimResult = await invites.findOneAndUpdate(
      {
        _id: code,
        status: 'pending',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      { $set: { status: 'claimed', claimedByUid: clientId, claimedAt: now } },
    );
    if (!claimResult) throw new HttpError(409, 'This invite was just claimed by someone else');

    const claimName = body.displayName?.trim() || email.split('@')[0];
    const userDoc: UserDoc = {
      _id: clientId,
      email,
      emailLower: email,
      passwordHash: await hashPassword(body.password),
      displayName: claimName,
      displayNameLower: claimName.toLowerCase(),
      phone: body.phone.trim(),
      role: 'client',
      accountStatus: 'active',
      permissions: [],
      featureFlags: {},
      createdBy: 'self',
      assignedCoachId: inv.coachId,
      inviteCode: inv._id,
      createdAt: now,
      updatedAt: now,
    };

    const relDoc: CoachClientDoc = {
      _id: relId(inv.coachId, clientId),
      coachId: inv.coachId,
      clientId,
      status: 'active',
      createdBy: clientId,
      inviteCode: inv._id,
      subscription: buildClaimSubscription(inv, now),
      createdAt: now,
      updatedAt: now,
    };

    try {
      await users.insertOne(userDoc);
      const coachClients = await coachClientsCol();
      await coachClients.insertOne(relDoc);
    } catch (joinErr) {
      // Roll back so the code remains usable, and don't leave an orphaned account.
      await users.deleteOne({ _id: clientId }).catch(() => undefined);
      await invites
        .updateOne({ _id: code }, { $set: { status: 'pending' }, $unset: { claimedByUid: '', claimedAt: '' } })
        .catch((e) => console.warn('[invites] unclaim rollback failed (non-fatal):', e));
      throw joinErr;
    }

    await bumpActiveClientCount(inv.coachId, 1);

    const session = await issueSession(res, { id: clientId, role: 'client', accountStatus: 'active' });
    res.status(201).json({ user: toPublicUser(userDoc), accessToken: session.accessToken, relationship: relDoc });
  } catch (e) {
    handleError(res, e);
  }
}
