import crypto from 'node:crypto';
import { notificationsCol } from './db';
import type { AppNotificationDoc, NoteEntityType, NoteScreen, NotificationType } from './types';

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
  createdBy: string;
}

export async function notify(input: NotifyInput): Promise<void> {
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
  await col.insertOne(doc);
}
