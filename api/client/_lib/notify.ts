import crypto from 'node:crypto';
import { coachClientsCol, notificationsCol } from './db.js';
import type { AppNotificationDoc, NoteEntityType, NoteScreen, NotificationType } from './types.js';

/** Port of `notificationsApi.notify()` — same shape, now writing to Mongo. */
export interface NotifyInput {
  clientId: string;
  forRole: 'client' | 'coach';
  type: NotificationType;
  body?: string;
  screen?: NoteScreen;
  date?: string;
  entityType?: NoteEntityType;
  entityId?: string;
  route?: string;
  /** coach_note only: the note was shared with the client, so its excerpt may be shown. */
  noteVisibility?: 'client';
  createdBy: string;
}

/**
 * Best-effort (B1.6): a notification is a side effect of a domain write that
 * has ALREADY committed. If it fails, the write must still report success —
 * otherwise the client retries a write that already happened (a check-in
 * resubmit then fails as "already submitted"). Failures are logged.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await insertNotification(input);
  } catch (e) {
    console.error(`[notify] ${input.type} for ${input.clientId} failed (the domain write already committed):`, e);
  }
}

async function insertNotification(input: NotifyInput): Promise<void> {
  const col = await notificationsCol();
  const now = Date.now();
  const doc: AppNotificationDoc = {
    _id: crypto.randomUUID(),
    clientId: input.clientId,
    forRole: input.forRole,
    type: input.type,
    seenAt: null,
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
  };
  if (input.body) doc.body = input.body;
  if (input.screen) doc.screen = input.screen;
  if (input.date) doc.date = input.date;
  if (input.entityType) doc.entityType = input.entityType;
  if (input.entityId) doc.entityId = input.entityId;
  if (input.route) doc.route = input.route;
  if (input.noteVisibility) doc.noteVisibility = input.noteVisibility;
  // B3.0.1 / B3-S14: a coach-bound notification belongs to the client's coach
  // at the moment it is raised — a later coach never sees it.
  if (input.forRole === 'coach') {
    const rel = await (await coachClientsCol()).findOne({ clientId: input.clientId, status: 'active' }, { projection: { coachId: 1 } });
    if (rel?.coachId) doc.coachId = rel.coachId;
  }
  await col.insertOne(doc);
}
