import { getAttachmentKind, type AttachmentKind } from './attachmentKind';
import { classifyVideoUrl, type VideoSource } from './videoSource';

/**
 * Media reference seam (B1.11). Screens hold a `MediaRef` — WHAT the media is
 * — and ask `resolveMedia` HOW to show it, instead of each screen treating a
 * raw URL string its own way. Today a ref is a stored URL (Forma CDN, YouTube,
 * an external link) or a device-local blob that hasn't been uploaded yet
 * (`local:<key>`, kept by the outbox). Uploads now also return the storage
 * `path`, so a later catalog (B4) can resolve refs through a provider instead
 * of trusting a URL baked into old records.
 */
export type MediaKind = AttachmentKind;

export interface MediaRef {
  /** A URL, or `local:<blobKey>` for a file saved on this device and not uploaded yet. */
  ref: string;
  kind: MediaKind;
  name?: string;
  mimeType?: string;
  /** Storage path of a Forma upload (returned by /api/media since B1.11). */
  path?: string;
}

export const LOCAL_REF = 'local:';
export const isLocalRef = (v: string | undefined | null): v is string => !!v && v.startsWith(LOCAL_REF);
export const localKeyOf = (ref: string) => ref.slice(LOCAL_REF.length);

export type ResolvedMedia =
  | { status: 'ready'; kind: 'image' | 'audio' | 'file'; src: string }
  | { status: 'ready'; kind: 'video'; video: Exclude<VideoSource, { kind: 'unsupported' }> }
  | { status: 'not_uploaded'; kind: MediaKind; localKey: string }
  | { status: 'unsupported'; kind: MediaKind; reason: 'invalid' | 'host' | 'type' };

/** http(s) — plain http only on loopback (dev / the isolated test CDN) — or an in-memory blob. */
function safeMediaUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol === 'blob:' || u.protocol === 'https:') return u.toString();
    if (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname)) return u.toString();
    return null;
  } catch {
    return null;
  }
}

/** How to show a ref — pure; loading / failed / offline are the viewer's runtime states on top of this. */
export function resolveMedia(media: MediaRef): ResolvedMedia {
  if (isLocalRef(media.ref)) return { status: 'not_uploaded', kind: media.kind, localKey: localKeyOf(media.ref) };
  if (media.kind === 'video') {
    const video = classifyVideoUrl(media.ref);
    if (!video) return { status: 'unsupported', kind: 'video', reason: 'invalid' };
    if (video.kind === 'unsupported') return { status: 'unsupported', kind: 'video', reason: video.reason };
    return { status: 'ready', kind: 'video', video };
  }
  const src = safeMediaUrl(media.ref);
  if (!src) return { status: 'unsupported', kind: media.kind, reason: 'invalid' };
  return { status: 'ready', kind: media.kind, src };
}

/** A ref for a stored URL, its kind from MIME type / file name when not given. */
export function mediaRef(ref: string, kind?: MediaKind, extra: Omit<MediaRef, 'ref' | 'kind'> = {}): MediaRef {
  return { ref, kind: kind ?? getAttachmentKind({ mimeType: extra.mimeType, name: extra.name ?? ref }), ...extra };
}
