import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../../_lib/mongodb.js';
import { hashPassword } from '../../_lib/password.js';
import { requireActive, requirePermission, requireRole, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { toPublicUser, type AccountStatus, type Permission, type Role, type UserDoc } from '../../_lib/types.js';
import { writeAudit } from '../_lib/audit.js';

/**
 * Port of `src/services/platform/accountsApi.ts`'s `fetchUsersPage()` (GET,
 * cursor-paginated, newest first, optional role/status filter) and
 * `createUser()`/`createAccount()` (POST — admin-provisioned account, mirrors
 * `api/auth/signup.ts`'s hashing/defaults but lets the actor set role/status).
 */
const CreateBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(['client', 'coach', 'admin', 'super_admin']),
  accountStatus: z.enum(['active', 'suspended', 'pending', 'disabled']).optional(),
  permissions: z.array(z.string()).optional(),
  assignedCoachId: z.string().trim().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST');
    const actor = await requireUser(req);
    requireActive(actor);
    const users = await usersCol();

    if (req.method === 'POST') {
      requirePermission(actor, 'users.create');
      const body = CreateBody.parse(req.body);
      // Admin/super_admin accounts are never provisioned through the general
      // "create any user" API — only a super_admin may even attempt it here,
      // mirroring firestore.rules' isSuperAdmin() vs. users.create+client/coach split.
      if (body.role === 'admin' || body.role === 'super_admin') {
        requireRole(actor, 'super_admin');
      }
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
        role: body.role,
        accountStatus: body.accountStatus ?? 'active',
        permissions: (body.permissions ?? []) as Permission[],
        featureFlags: {},
        createdBy: actor.id,
        assignedCoachId: body.assignedCoachId,
        // Admin-provisioned accounts use a temp password — prompt the user to set their own on first login.
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      };
      await users.insertOne(doc);
      await writeAudit(actor, 'user.create', doc._id, { role: doc.role });
      res.status(201).json(toPublicUser(doc));
      return;
    }

    requirePermission(actor, 'users.read');
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const role = typeof req.query.role === 'string' ? (req.query.role as Role) : undefined;
    const status = typeof req.query.status === 'string' ? (req.query.status as AccountStatus) : undefined;

    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    if (status) filter.accountStatus = status;
    if (cursor) {
      const [ts, id] = cursor.split(':');
      const tsNum = Number(ts);
      if (Number.isFinite(tsNum) && id) {
        filter.$or = [{ createdAt: { $lt: tsNum } }, { createdAt: tsNum, _id: { $lt: id } }];
      }
    }
    const docs = await users.find(filter).sort({ createdAt: -1, _id: -1 }).limit(pageSize).toArray();
    const nextCursor = docs.length === pageSize ? `${docs[docs.length - 1].createdAt}:${docs[docs.length - 1]._id}` : null;
    res.status(200).json({ users: docs.map(toPublicUser), cursor: nextCursor });
  } catch (e) {
    handleError(res, e);
  }
}
