import crypto from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { AuthedUser } from '../../_trpc/context.js';
import { authorizeThreadAccess } from '../../messages/_data.js';
import { MediaError } from './bunny.js';

/**
 * The upload POLICY: what a given user may upload, where it lands, and how
 * big/what type it may be. The browser never names a storage path — it names
 * a CATEGORY (plus the one id the category needs), and this module derives
 * the path from the SESSION identity, so:
 *   - a user can only ever write under their own `Forma/{ownId}/…` namespace,
 *   - a coach can only write exercise media under their own id,
 *   - message attachments land under the CLIENT's thread folder, and only for
 *     someone `authorizeThreadAccess` lets into that thread (the client, their
 *     currently-assigned coach, or `clients.writeAll`),
 *   - every id that becomes a path segment is pinned to `[A-Za-z0-9_-]`, so
 *     `..`, `/` or anything else can never escape the namespace.
 *
 * Folder layout is byte-for-byte what the old browser uploader produced, so
 * existing URLs, the super-admin gallery's `Forma/{clientId}/…` parsing and
 * the fresh-start archive all keep working.
 */

export type MediaCategory = 'avatar' | 'progress' | 'assessment' | 'checkin' | 'exercise' | 'message';
export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export const MEDIA_CATEGORIES: readonly MediaCategory[] = ['avatar', 'progress', 'assessment', 'checkin', 'exercise', 'message'];

export interface UploadMeta {
  category: string;
  mimeType: string;
  size: number;
  name?: string;
  clientId?: string;
  checkInId?: string;
}

export interface UploadTarget {
  /** Zone-relative object path incl. the server-generated filename. */
  path: string;
  mimeType: string;
  kind: MediaKind;
  name: string;
  size: number;
  category: MediaCategory;
}

const MB = 1024 * 1024;
/** Per-kind byte limits — the same numbers the old client enforced (and that the i18n `upload.tooLarge*` strings quote). */
export const MAX_BYTES: Record<MediaKind, number> = { image: 5 * MB, video: 50 * MB, audio: 10 * MB, file: 25 * MB };
export const MAX_AVATAR_BYTES = 2 * MB;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const STILL_IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
/** Types that would execute or script if ever served from the CDN origin. Refused everywhere, whatever the category. */
const BLOCKED_MIME = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/javascript', 'text/javascript', 'application/x-sh', 'application/x-msdownload']);
const BLOCKED_EXT = new Set(['html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'exe', 'sh', 'bat', 'cmd', 'php']);
const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/webm': 'weba',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
};

function kindOf(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

function extFor(mime: string, name: string | undefined): string {
  const fromMime = EXT_FOR_MIME[mime];
  if (fromMime) return fromMime;
  const fromName = name?.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const sub = mime.split('/')[1]?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,8}$/.test(sub) ? sub : 'bin';
}

function randomKey(): string {
  return `${crypto.randomBytes(9).toString('base64url')}${Date.now().toString(36)}`;
}

function assertId(value: string | undefined, what: string): string {
  if (!value || !ID_RE.test(value)) throw new MediaError(400, 'badRequest', `Invalid ${what}`);
  return value;
}

function tooLargeCode(kind: MediaKind): string {
  return kind === 'video' ? 'tooLargeVideo' : kind === 'audio' ? 'tooLargeAudio' : kind === 'file' ? 'tooLargeFile' : 'tooLarge';
}

/** Byte limit for a resolved (category, kind) — exported so the handler can cap the request body read at exactly this. */
export function limitFor(category: MediaCategory, kind: MediaKind): number {
  return category === 'avatar' ? MAX_AVATAR_BYTES : MAX_BYTES[kind];
}

/**
 * Validates + authorizes one intended upload and returns where it goes.
 * Throws `MediaError` (HTTP-shaped) on any refusal. Never trusts `meta`
 * beyond the category/id it needs; the owner is always `user.id`.
 */
export async function resolveUploadTarget(user: AuthedUser, meta: UploadMeta): Promise<UploadTarget> {
  if (user.accountStatus !== 'active') throw new MediaError(403, 'forbidden', 'Account is not active');
  const ownerId = assertId(user.id, 'user id');
  if (!MEDIA_CATEGORIES.includes(meta.category as MediaCategory)) throw new MediaError(400, 'badRequest', 'Unknown media category');
  const category = meta.category as MediaCategory;

  const mimeType = (meta.mimeType || '').toLowerCase().split(';')[0].trim();
  if (!mimeType || BLOCKED_MIME.has(mimeType)) throw new MediaError(415, 'badType', 'Unsupported file type');
  const kind = kindOf(mimeType);
  const ext = extFor(mimeType, meta.name);
  if (BLOCKED_EXT.has(ext)) throw new MediaError(415, 'badType', 'Unsupported file type');

  let folder: string;
  let allowedKinds: readonly MediaKind[];
  switch (category) {
    case 'avatar':
      folder = `Forma/${ownerId}/avatar`;
      allowedKinds = ['image'];
      break;
    case 'progress':
      folder = `Forma/${ownerId}`;
      allowedKinds = ['image'];
      break;
    case 'assessment':
      folder = `Forma/${ownerId}/assessment`;
      allowedKinds = ['image'];
      break;
    case 'checkin':
      folder = `Forma/${ownerId}/checkin/${assertId(meta.checkInId, 'check-in id')}`;
      allowedKinds = ['image'];
      break;
    case 'exercise':
      // A coach's own library only. Clients have no library; admins editing
      // their own demo library land under their own id, never a coach's.
      if (user.role === 'client') throw new MediaError(403, 'forbidden', 'Only coaches can upload exercise media');
      folder = `Forma/${ownerId}/exercises`;
      allowedKinds = ['image', 'video'];
      break;
    case 'message': {
      const clientId = assertId(meta.clientId, 'client id');
      try {
        await authorizeThreadAccess(user, clientId);
      } catch (e) {
        if (e instanceof TRPCError) throw new MediaError(403, 'forbidden', 'Not a participant in this thread');
        throw e;
      }
      folder = `Forma/${clientId}/messages`;
      allowedKinds = ['image', 'video', 'audio', 'file'];
      break;
    }
  }

  if (!allowedKinds.includes(kind)) throw new MediaError(415, 'badType', 'Unsupported file type for this upload');
  // Still images only for the photo categories (no gif/animated for avatars either — same as the old client's allow-list).
  if (kind === 'image' && category !== 'message' && category !== 'exercise' && !STILL_IMAGE_MIME.has(mimeType)) {
    throw new MediaError(415, 'badType', 'Unsupported image type');
  }

  const limit = limitFor(category, kind);
  if (!Number.isFinite(meta.size) || meta.size <= 0) throw new MediaError(400, 'badRequest', 'Empty upload');
  if (meta.size > limit) throw new MediaError(413, tooLargeCode(kind), 'File is too large');

  const safeName = (meta.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || `${randomKey()}.${ext}`;
  return { path: `${folder}/${randomKey()}.${ext}`, mimeType, kind, name: safeName, size: meta.size, category };
}
