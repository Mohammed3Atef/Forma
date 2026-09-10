import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../_lib/mongodb';
import { hashPassword } from '../_lib/password';
import { issueSession } from '../_lib/tokens';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import { toPublicUser, type UserDoc } from '../_lib/types';

/**
 * Coach self-registration only, per the product decision made for Phase 1:
 * active immediately, no manual admin approval. Client accounts are created
 * via the coach invite flow (a separate route, once `coachClients` /
 * `signupInvites` exist on Mongo) — never open self-signup. Admin/super_admin
 * accounts are never self-service; use scripts/seed-mongo-admin.mjs.
 */
const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  role: z.literal('coach'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const body = Body.parse(req.body);
    const users = await usersCol();
    if (await users.findOne({ emailLower: body.email })) {
      throw new HttpError(409, 'An account with this email already exists.');
    }
    const now = Date.now();
    const doc: UserDoc = {
      _id: crypto.randomUUID(),
      email: body.email,
      emailLower: body.email,
      passwordHash: await hashPassword(body.password),
      displayName: body.displayName,
      displayNameLower: body.displayName.toLowerCase(),
      phone: body.phone,
      role: 'coach',
      accountStatus: 'active',
      permissions: [],
      featureFlags: {},
      createdBy: 'self',
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(doc);
    // NOTE(next module): auto-create the Layer-A trial `coachPlans` doc here
    // once that collection has a Mongo-backed API (mirrors createTrialPlan()
    // in the current Firestore-based sessionStore.signIn flow).
    const session = await issueSession(res, { id: doc._id, role: doc.role, accountStatus: doc.accountStatus });
    res.status(201).json({ user: toPublicUser(doc), accessToken: session.accessToken });
  } catch (e) {
    handleError(res, e);
  }
}
