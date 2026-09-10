import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { handleError, methodGuard } from '../_lib/http';
import { requireUser } from '../_lib/withAuth';
import { createNotification } from '../notifications/_data';
import {
  authorizeThreadAccess,
  getAssignedCoachId,
  messagesCol,
  toPublicMessage,
  type MessageAttachment,
  type MessageCategory,
  type MessageDoc,
} from './_data';

const DEFAULT_PAGE_SIZE = 200;

const ListQuery = z.object({
  clientId: z.string().trim().min(1),
  since: z.coerce.number().optional(),
});

const AttachmentSchema = z.object({
  url: z.string().trim().min(1),
  kind: z.enum(['image', 'video', 'audio', 'file']),
  name: z.string().trim().max(200).optional(),
  size: z.number().nonnegative().optional(),
});

const SendBody = z.object({
  clientId: z.string().trim().min(1),
  text: z.string().trim().max(4000),
  category: z.enum(['message', 'announcement', 'offer', 'reminder', 'update']).optional(),
  attachment: AttachmentSchema.optional(),
});

/**
 * GET  /api/messages?clientId=X&since=<ms epoch>
 *   Polling-friendly read of one client's 1:1 thread, oldest-first: if `since`
 *   is given, only messages strictly after it (the "what's new" poll);
 *   otherwise the last `DEFAULT_PAGE_SIZE` messages (the initial page load).
 *   Returns a `cursor` the caller should pass as `since` on its next poll.
 *
 * POST /api/messages { clientId, text, category?, attachment? }
 *   Sends a message into the thread as the caller, then best-effort notifies
 *   the other party (mirrors `sendMessage` in the Firestore-era messagesApi).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST');
    const user = await requireUser(req);
    const col = await messagesCol();

    if (req.method === 'GET') {
      const { clientId, since } = ListQuery.parse(req.query);
      await authorizeThreadAccess(user, clientId);

      let docs: MessageDoc[];
      if (since != null) {
        docs = await col.find({ clientId, createdAt: { $gt: since } }).sort({ createdAt: 1 }).toArray();
      } else {
        // No cursor yet (initial page load): last DEFAULT_PAGE_SIZE, oldest-first.
        docs = await col.find({ clientId }).sort({ createdAt: -1 }).limit(DEFAULT_PAGE_SIZE).toArray();
        docs.reverse();
      }

      const cursor = docs.length > 0 ? docs[docs.length - 1].createdAt : (since ?? Date.now());
      res.status(200).json({ messages: docs.map(toPublicMessage), cursor });
      return;
    }

    // POST
    const body = SendBody.parse(req.body);
    await authorizeThreadAccess(user, body.clientId);

    const now = Date.now();
    const coachId = user.role === 'coach' ? user.id : await getAssignedCoachId(body.clientId);
    const doc: MessageDoc = {
      _id: `msg_${now}_${Math.random().toString(36).slice(2, 10)}`,
      clientId: body.clientId,
      fromUserId: user.id,
      fromRole: user.role,
      body: body.text,
      seenAt: null,
      createdAt: now,
      updatedAt: now,
    };
    if (coachId) doc.coachId = coachId;
    if (body.category) doc.category = body.category as MessageCategory;
    if (body.attachment) doc.attachment = body.attachment as MessageAttachment;
    await col.insertOne(doc);

    const toCoach = user.role !== 'coach';
    const preview = body.text || (body.attachment ? `📎 ${body.attachment.name ?? body.attachment.kind}` : '');
    await createNotification({
      clientId: body.clientId,
      forRole: toCoach ? 'coach' : 'client',
      type: 'message_received',
      body: preview.slice(0, 140),
      route: toCoach ? `/coach/messages/${body.clientId}` : '/messages',
      createdBy: user.id,
    });

    res.status(201).json(toPublicMessage(doc));
  } catch (e) {
    handleError(res, e);
  }
}
