import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../_lib/mongodb';
import { verifyPassword } from '../_lib/password';
import { issueSession } from '../_lib/tokens';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import { toPublicUser } from '../_lib/types';

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const body = Body.parse(req.body);
    const users = await usersCol();
    const doc = await users.findOne({ emailLower: body.email });
    // Deliberately identical error for "no such account" and "wrong password"
    // so a bad actor can't use this endpoint to enumerate registered emails.
    if (!doc || !(await verifyPassword(body.password, doc.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password.');
    }
    // Login itself does not gate on accountStatus (pending/suspended accounts
    // can still authenticate) — the frontend derives its own routing/UI phase
    // from accountStatus after sign-in, same as today's Firebase Auth flow.
    const session = await issueSession(res, { id: doc._id, role: doc.role, accountStatus: doc.accountStatus });
    res.status(200).json({ user: toPublicUser(doc), accessToken: session.accessToken });
  } catch (e) {
    handleError(res, e);
  }
}
