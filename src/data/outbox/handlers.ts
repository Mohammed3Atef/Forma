import type { AttachmentKind } from '@/lib/attachmentKind';
import type { MessageAttachment, MessageCategory } from '@/types';
import { blobStore } from '@/data/blobStore';
import { isLocalRef, LOCAL_REF, localKeyOf } from '@/lib/mediaRef';
import { getDataSource } from '@/data/dataSource';
import { downscaleImage } from '@/lib/image';
import { uid } from '@/lib/utils';
import { sendMessage } from '@/services/platform/messagesApi';
import { uploadFile, uploadImage } from '@/services/platform/mediaApi';
import { submitCheckIn, type CheckInSubmission } from '@/services/platform/checkInApi';
import { enqueueOutbox, OutboxPermanentError, registerOutboxHandler, type OutboxOp } from './outbox';

/**
 * The operation types the outbox delivers (B1.6), and the helpers screens use
 * to queue them. Approved operation classes:
 *  - `message.send`          chat text and one attachment (image, video, voice note, file)
 *  - `checkin.submit`        the weekly check-in, including its photos
 *  - `progressPhoto.upload`  a progress photo's bytes to the coach-visible store
 * Everything else that writes stays online-required (spec §12).
 */

/** Local reference to bytes held in the account's blob store (until uploaded). */
export { LOCAL_REF, isLocalRef };
const keyOf = localKeyOf;

// ---- message.send -----------------------------------------------------------

export interface MessageSendPayload {
  clientId: string;
  /**
   * B3.0.1 / B3-S14: the conversation (coach id) the message was written in.
   * Sent with every retry, so after a transfer the server refuses it
   * (CONVERSATION_CLOSED) instead of delivering it to the new coach. Absent
   * on ops queued by an older build (the server then uses the current coach).
   */
  coachId?: string;
  text: string;
  category?: MessageCategory;
  attachment?: { blobKey: string; kind: AttachmentKind; name: string; mimeType: string; size: number; downscale?: boolean };
}

async function prepareAttachment(blob: Blob, a: NonNullable<MessageSendPayload['attachment']>): Promise<File> {
  if (!a.downscale) return blob instanceof File ? blob : new File([blob], a.name, { type: a.mimeType || blob.type });
  const scaled = await downscaleImage(blob);
  // downscaleImage falls back to the original bytes when it can't decode — keep their real type.
  return new File([scaled], a.name, { type: scaled.type || a.mimeType });
}

registerOutboxHandler('message.send', async (op, ctx) => {
  const p = op.payload as MessageSendPayload;
  let attachment: MessageAttachment | undefined;
  if (p.attachment) {
    let media = op.media?.attachment;
    if (!media) {
      const blob = await blobStore.get(p.attachment.blobKey);
      if (!blob) throw new OutboxPermanentError('BLOB_MISSING');
      const file = await prepareAttachment(blob, p.attachment);
      const up = await uploadFile(file, { category: 'message', clientId: p.clientId, ...(p.coachId ? { coachId: p.coachId } : {}) }, { name: p.attachment.name, signal: ctx.signal, onProgress: (pct) => ctx.progress(pct / 100) });
      media = { url: up.url, kind: up.kind, name: up.name, size: up.size, mimeType: up.mimeType };
      await ctx.setMedia('attachment', media);
    }
    attachment = { url: media.url, kind: (media.kind ?? p.attachment.kind) as MessageAttachment['kind'], name: media.name, size: media.size, mimeType: media.mimeType };
  }
  // The op id IS the server's idempotency key: a retry after a lost response returns the same message.
  return sendMessage(p.clientId, { id: op.userId, role: 'client' }, p.text, { category: p.category, attachment, clientMsgId: op.operationId, coachId: p.coachId });
});

/**
 * Queue one chat message. Attachment bytes are stored on the device first, so
 * the send survives a reload; the caption is a second message that waits for
 * the attachment (`dependsOn`).
 */
export async function queueMessage(input: {
  clientId: string;
  /** The conversation it is written in (the coach's own id, or the client's current coach). */
  coachId?: string;
  text: string;
  category?: MessageCategory;
  attachment?: { file: File; kind: AttachmentKind; downscale?: boolean };
  dependsOn?: string;
}): Promise<OutboxOp<MessageSendPayload>> {
  const operationId = uid('msg');
  let attachment: MessageSendPayload['attachment'];
  const blobKeys: string[] = [];
  if (input.attachment) {
    const blobKey = `outbox:${operationId}`;
    await blobStore.put(blobKey, input.attachment.file);
    blobKeys.push(blobKey);
    attachment = {
      blobKey,
      kind: input.attachment.kind,
      name: input.attachment.file.name,
      mimeType: input.attachment.file.type,
      size: input.attachment.file.size,
      downscale: input.attachment.downscale,
    };
  }
  return enqueueOutbox<MessageSendPayload>({
    operationId,
    type: 'message.send',
    scope: `thread:${input.clientId}`,
    payload: { clientId: input.clientId, ...(input.coachId ? { coachId: input.coachId } : {}), text: input.text, category: input.category, attachment },
    blobKeys,
    dependencyIds: input.dependsOn ? [input.dependsOn] : undefined,
  });
}

// ---- checkin.submit ---------------------------------------------------------

export interface CheckInSubmitPayload {
  clientId: string;
  /** The check-in's record key — the week, or `week__coachId` for a second coach's record of that week (B3.4). */
  weekStart: string;
  /**
   * Set by this release on: `weekStart` is a record key. Submissions queued by older builds lack it
   * and carry a plain week, which the server resolves the way those builds meant (never guessing).
   */
  byKey?: boolean;
  /** Answers; `progressPhotos` values may be `local:<blobKey>` until uploaded. */
  form: CheckInSubmission;
}

const POSES = ['front', 'side', 'back'] as const;

registerOutboxHandler('checkin.submit', async (op, ctx) => {
  const p = op.payload as CheckInSubmitPayload;
  const photos: Record<string, string> = {};
  for (const pose of POSES) {
    const v = p.form.progressPhotos?.[pose];
    if (!v) continue;
    if (!isLocalRef(v)) {
      photos[pose] = v;
      continue;
    }
    let media = op.media?.[pose];
    if (!media) {
      const blob = await blobStore.get(keyOf(v));
      if (!blob) throw new OutboxPermanentError('BLOB_MISSING');
      const scaled = await downscaleImage(blob);
      const up = await uploadImage(scaled, { category: 'checkin', checkInId: p.weekStart }, { signal: ctx.signal });
      media = { url: up.url, size: up.size };
      await ctx.setMedia(pose, media);
    }
    photos[pose] = media.url;
  }
  await submitCheckIn(p.clientId, p.weekStart, { ...p.form, progressPhotos: photos }, op.operationId, p.byKey === true);
  return { weekStart: p.weekStart };
});

/** Queue the weekly check-in (one per week — a second submit replaces an unsent one). */
export async function queueCheckInSubmit(input: CheckInSubmitPayload): Promise<OutboxOp<CheckInSubmitPayload>> {
  const blobKeys = POSES.map((pose) => input.form.progressPhotos?.[pose]).filter(isLocalRef).map(keyOf);
  return enqueueOutbox<CheckInSubmitPayload>({
    operationId: uid('checkin'),
    type: 'checkin.submit',
    scope: `checkin:${input.weekStart}`,
    dedupeKey: `checkin:${input.weekStart}`,
    payload: { ...input, byKey: true },
    blobKeys,
  });
}

/** Keep a picked check-in photo on the device; returns the `local:` reference the form stores. */
export async function stashCheckInPhoto(weekStart: string, pose: string, file: Blob): Promise<string> {
  const key = `checkin:${weekStart}:${pose}:${uid('p')}`;
  await blobStore.put(key, file);
  return LOCAL_REF + key;
}
export async function localPhotoUrl(ref: string): Promise<string | null> {
  return isLocalRef(ref) ? blobStore.objectUrl(keyOf(ref)) : ref;
}

// ---- progressPhoto.upload ---------------------------------------------------

export interface ProgressPhotoUploadPayload {
  photoId: string;
}

registerOutboxHandler('progressPhoto.upload', async (op, ctx) => {
  const { photoId } = op.payload as ProgressPhotoUploadPayload;
  const photos = getDataSource().progressPhotos;
  const photo = await photos.get(photoId);
  if (!photo) return { url: null, deleted: true }; // the photo was deleted meanwhile — nothing to deliver
  if (photo.cdnUrl) return { url: photo.cdnUrl };
  const blob = await blobStore.get(photo.localKey);
  if (!blob) throw new OutboxPermanentError('BLOB_MISSING');
  const scaled = await downscaleImage(blob);
  // Lands under the signed-in user's own `Forma/{uid}/` folder — the server derives that from the session.
  const { url } = await uploadImage(scaled, { category: 'progress' }, { signal: ctx.signal });
  const latest = (await photos.get(photoId)) ?? photo;
  await photos.put({ ...latest, cdnUrl: url, updatedAt: Date.now(), dirty: true }); // metadata then syncs to the coach
  return { url };
});

export async function queueProgressPhotoUpload(photoId: string): Promise<OutboxOp<ProgressPhotoUploadPayload>> {
  return enqueueOutbox<ProgressPhotoUploadPayload>({
    operationId: uid('photo'),
    type: 'progressPhoto.upload',
    scope: `photo:${photoId}`,
    dedupeKey: `photo:${photoId}`,
    payload: { photoId },
  });
}
