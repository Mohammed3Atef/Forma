import type { Message } from '@/types';

/**
 * Value-equality check for the fields that actually affect a message
 * bubble's rendered output (used by `MessageThread.tsx`'s memoized
 * `MessageRow`). Never reference-equality: `subscribeMessages` (see
 * messagesApi.ts) hands the whole thread a fresh array of fresh message
 * objects on EVERY poll tick, even when nothing changed, so comparing
 * message objects by `===` would never let that memoization do anything.
 *
 * Deliberately excludes `clientId`/`fromUserId`/`updatedAt`/`clientMsgId` —
 * `MessageRow` never reads any of them (it receives `mine` as a separately
 * memo-compared prop, already derived from `fromRole` by the parent) — and
 * `attachment.size`, which `Attachment` never renders. Extracted to its own
 * module (out of `MessageThread.tsx`) purely so it's unit-testable without
 * pulling in the whole component tree.
 */
export function messagesEqual(a: Message, b: Message): boolean {
  if (a === b) return true;
  if (a.id !== b.id || a.body !== b.body || a.editedAt !== b.editedAt || a.deletedAt !== b.deletedAt) return false;
  if (a.seenAt !== b.seenAt || a.createdAt !== b.createdAt || a.fromRole !== b.fromRole) return false;
  if (a.category !== b.category || a.broadcast !== b.broadcast) return false;
  const aa = a.attachment;
  const ba = b.attachment;
  if (!!aa !== !!ba) return false;
  if (aa && ba && (aa.url !== ba.url || aa.kind !== ba.kind || aa.mimeType !== ba.mimeType || aa.name !== ba.name)) return false;
  const ar = a.reactions ?? {};
  const br = b.reactions ?? {};
  const aKeys = Object.keys(ar);
  if (aKeys.length !== Object.keys(br).length) return false;
  return aKeys.every((k) => ar[k] === br[k]);
}
