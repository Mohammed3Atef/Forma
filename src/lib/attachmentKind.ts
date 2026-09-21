/**
 * Single source of truth for classifying a message attachment as
 * image/video/audio/file. Used both for the composer's pre-send draft
 * preview and for rendering an already-sent attachment — the two must never
 * diverge, so nothing else in the app re-implements this classification.
 *
 * MIME type is authoritative when known (checked via `startsWith`, so any
 * `image/*` — including `image/svg+xml` and `image/gif` — counts as an
 * image, any `video/*` as a video, any `audio/*` as audio). Extension is
 * only a fallback for older persisted messages that predate the `mimeType`
 * field.
 */
export type AttachmentKind = "image" | "video" | "audio" | "file";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "heic", "heif", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "mkv", "avi"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "oga", "aac", "weba", "flac"]);

function extOf(name?: string): string | undefined {
  const m = name?.match(/\.([a-z0-9]+)$/i);
  return m?.[1]?.toLowerCase();
}

export function getAttachmentKind(input: { mimeType?: string; name?: string; fallbackKind?: AttachmentKind }): AttachmentKind {
  const mime = input.mimeType?.toLowerCase().trim();
  if (mime) {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
  }
  const ext = extOf(input.name);
  if (ext) {
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  }
  return input.fallbackKind ?? "file";
}
