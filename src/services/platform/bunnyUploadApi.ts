/**
 * Bunny CDN image upload (client-side). Forma has no server, so the upload runs
 * in the browser with the Bunny Storage key read from `import.meta.env`. Files
 * land under the `Forma/` folder of the configured storage zone and are served
 * from the public pull-zone host (`VITE_BUNNY_CDN_URL`).
 *
 * NOTE: the storage key is present in the shipped bundle and the resulting URLs
 * are public (unguessable random keys, but not access-controlled). Acceptable
 * for this app per product decision; harden later with a dedicated zone/proxy.
 */

import { getAttachmentKind, type AttachmentKind } from '../../lib/attachmentKind';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type UploadErrorCode = 'notConfigured' | 'badType' | 'tooLarge' | 'tooLargeVideo' | 'tooLargeAudio' | 'tooLargeFile' | 'failed' | 'cancelled';

export class UploadError extends Error {
  code: UploadErrorCode;
  constructor(code: UploadErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'UploadError';
    this.code = code;
  }
}

export interface UploadResult {
  url: string;
  size: number;
}

function cfg() {
  return {
    zone: import.meta.env.VITE_BUNNY_STORAGE_ZONE,
    apiKey: import.meta.env.VITE_BUNNY_API_KEY,
    cdnUrl: import.meta.env.VITE_BUNNY_CDN_URL,
    region: import.meta.env.VITE_BUNNY_STORAGE_REGION,
  };
}

/** True when zone + key + public CDN URL are all configured. */
export function isBunnyConfigured(): boolean {
  const { zone, apiKey, cdnUrl } = cfg();
  return Boolean(zone && apiKey && cdnUrl);
}

function randomKey(): string {
  const a = Math.random().toString(36).slice(2, 10);
  const b = Date.now().toString(36);
  return `${a}${b}`;
}

function extFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * PUTs a file to Bunny storage via `XMLHttpRequest` (not `fetch`) specifically
 * so `onProgress` can report real upload percentage — `fetch` has no upload
 * progress event. Every existing caller that doesn't pass `onProgress` behaves
 * identically to the old `fetch`-based version (same resolve/reject shape).
 */
function putToBunny(url: string, apiKey: string, contentType: string, body: Blob, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadError('cancelled'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('AccessKey', apiKey);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError('failed', `Bunny upload failed (${xhr.status}): ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new UploadError('failed', 'network error'));
    xhr.onabort = () => reject(new UploadError('cancelled'));
    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);
    xhr.send(body);
  });
}

/**
 * Upload an image blob to Bunny storage under `{folder}/{random}.{ext}` and
 * return its public CDN URL. Validates type + size; throws `UploadError` with a
 * machine code the UI can localise.
 *
 * PERFORMANCE CLOSEOUT (documented blocker, not fixed this pass — see chat
 * report): the SAME uploaded image (up to 5 MB, whatever resolution the
 * source photo was) is currently requested at every size it's ever shown at
 * — a ~40px `Avatar`, a list-row thumbnail, a message-preview image, and a
 * full-screen progress-photo view all hit this identical CDN URL. Bunny sells
 * an on-the-fly image-resize add-on ("Optimizer", `?width=`/`?height=` query
 * params on the pull-zone URL), which WOULD fix this cheaply if available —
 * but whether it's enabled is an account/pull-zone-level setting in Bunny's
 * own dashboard, not something derivable from this repo: `cfg()` above only
 * reads `VITE_BUNNY_STORAGE_ZONE`/`VITE_BUNNY_API_KEY`/`VITE_BUNNY_CDN_URL`/
 * `VITE_BUNNY_STORAGE_REGION`, there is no optimizer flag, dependency, or
 * prior reference to it anywhere in the codebase. Per this pass's explicit
 * "don't guess" constraint, no `?width=` parameter was appended anywhere.
 *
 * To resolve: confirm with whoever owns the Bunny account whether the pull
 * zone has Optimizer (or a similar resize feature) turned on. If yes, add a
 * small `cdnThumb(url, {w,h}): string` helper here and use it for the avatar/
 * list-thumbnail/message-preview/photo-grid call sites, while leaving
 * full-screen/detail views on the original URL. If no, the real fix is
 * downscaling at UPLOAD time (a second, smaller variant written alongside the
 * original in `uploadImageToBunny`/the client-side photo pickers).
 */
export async function uploadImageToBunny(file: Blob, opts: { folder: string; onProgress?: (pct: number) => void; signal?: AbortSignal }): Promise<UploadResult> {
  const { zone, apiKey, cdnUrl, region } = cfg();
  if (!zone || !apiKey || !cdnUrl) throw new UploadError('notConfigured');
  if (!ALLOWED_MIME.has(file.type)) throw new UploadError('badType');
  if (file.size > MAX_BYTES) throw new UploadError('tooLarge');

  const ext = extFor(file.type);
  const folder = opts.folder.replace(/^\/+|\/+$/g, '');
  const path = `${folder}/${randomKey()}.${ext}`;
  // Regional subdomains route to the right datacentre; default host = de region.
  const storageHost = region && region !== 'de' ? `storage.${region}.bunnycdn.com` : 'storage.bunnycdn.com';
  const uploadUrl = `https://${storageHost}/${zone}/${path}`;

  await putToBunny(uploadUrl, apiKey, file.type, file, opts.onProgress, opts.signal);
  const publicBase = cdnUrl.replace(/\/$/, '');
  return { url: `${publicBase}/${path}`, size: file.size };
}

/** Re-exported from the shared classifier (`@/lib/attachmentKind`) so existing callers importing from here keep working. */
export type { AttachmentKind };
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB (voice messages)
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * @deprecated use `getAttachmentKind` from `@/lib/attachmentKind` — kept only
 * as a thin wrapper so this stays the single classification implementation.
 */
export function attachmentKind(mime: string): AttachmentKind {
  return getAttachmentKind({ mimeType: mime });
}

function maxBytesFor(kind: AttachmentKind): number {
  if (kind === 'video') return MAX_VIDEO_BYTES;
  if (kind === 'audio') return MAX_AUDIO_BYTES;
  return MAX_FILE_BYTES;
}

function fileExt(name: string, mime: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  if (mime.startsWith('image/')) return extFor(mime);
  return mime.split('/')[1] || 'bin';
}

/**
 * Upload an arbitrary attachment (image / video / document) to Bunny storage,
 * unmodified, and return its public URL + kind + display name. Used by the
 * messenger. Images aren't downscaled here — the caller may downscale first.
 */
export async function uploadFileToBunny(file: File, opts: { folder: string; onProgress?: (pct: number) => void; signal?: AbortSignal }): Promise<UploadResult & { kind: AttachmentKind; name: string; mimeType: string }> {
  const { zone, apiKey, cdnUrl, region } = cfg();
  if (!zone || !apiKey || !cdnUrl) throw new UploadError('notConfigured');
  const kind = getAttachmentKind({ mimeType: file.type, name: file.name });
  if (file.size > maxBytesFor(kind)) {
    throw new UploadError(kind === 'video' ? 'tooLargeVideo' : kind === 'audio' ? 'tooLargeAudio' : kind === 'file' ? 'tooLargeFile' : 'tooLarge');
  }

  const folder = opts.folder.replace(/^\/+|\/+$/g, '');
  const path = `${folder}/${randomKey()}.${fileExt(file.name, file.type)}`;
  const storageHost = region && region !== 'de' ? `storage.${region}.bunnycdn.com` : 'storage.bunnycdn.com';
  await putToBunny(`https://${storageHost}/${zone}/${path}`, apiKey, file.type, file, opts.onProgress, opts.signal);
  return { url: `${cdnUrl.replace(/\/$/, '')}/${path}`, size: file.size, kind, name: file.name, mimeType: file.type };
}

// ---- Listing (super-admin media gallery) -----------------------------------

interface BunnyListItem {
  ObjectName: string;
  Length: number;
  IsDirectory: boolean;
  LastChanged?: string;
  DateCreated?: string;
}

export interface CdnImage {
  url: string; // public CDN URL
  path: string; // relative path under the zone, e.g. "Forma/{clientId}/x.webp"
  name: string;
  clientId: string; // parsed from `Forma/{clientId}/…`
  context: 'progress' | 'assessment' | 'other';
  size: number;
  lastChanged?: string;
}

function storageHost(): string {
  const { region } = cfg();
  return region && region !== 'de' ? `storage.${region}.bunnycdn.com` : 'storage.bunnycdn.com';
}

async function listDir(relPath: string): Promise<BunnyListItem[]> {
  const { zone, apiKey } = cfg();
  if (!zone || !apiKey) return [];
  const dir = relPath.endsWith('/') ? relPath : `${relPath}/`;
  const res = await fetch(`https://${storageHost()}/${zone}/${dir}`, {
    headers: { AccessKey: apiKey, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  return (await res.json().catch(() => [])) as BunnyListItem[];
}

/** Extensions this gallery actually renders via `<img>` — anything else (e.g. a `.pdf` message attachment under the same CDN zone) is skipped rather than pushed in broken. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'bmp', 'svg']);
function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

/**
 * Recursively list every uploaded image under the `Forma/` folder (super-admin
 * media gallery). Returns files with their public CDN URLs, newest first.
 *
 * PERFORMANCE CLOSEOUT (documented blocker, not fixed this pass — see chat
 * report): this still walks the ENTIRE CDN tree on every call. `AdminMedia.tsx`
 * caps how many client GROUPS it *renders*, but that cap is applied after this
 * function has already returned — the network/CPU cost of `listDir` (one
 * Bunny Edge Storage "list directory" request per folder, recursed up to
 * `maxDepth`) scales with the total number of files ever uploaded
 * platform-wide, not with what's shown.
 *
 * Why this isn't fixed here: Bunny's Edge Storage "List Files" endpoint
 * (`GET /{zone}/{path}/`, used by `listDir` above) is a flat per-directory
 * listing with no cursor/page/limit parameter anywhere in this codebase's
 * usage of it, and there is nothing here (env config, dependencies, or prior
 * code) that verifies whether cursor-based or count-limited listing is
 * actually available on this account/zone. Per this pass's explicit
 * constraint, that capability must be verified against Bunny's real API
 * before being used — not assumed — so no `?page=`/cursor param was added.
 *
 * Proposed contract for later (doesn't require any new Bunny capability):
 * write a small Mongo index collection (`{clientId, path, url, context,
 * size, uploadedAt}`) at upload time, in `uploadImageToBunny`/
 * `uploadFileToBunny` above, then back a paginated tRPC procedure
 * (`admin.media.list`, skip/limit or cursor) with THAT index instead of
 * walking the CDN at read time. Existing uploads would need a one-time
 * backfill pass (a script that runs `listAllImages()` once and writes the
 * index) since this function has no per-upload hook today.
 */
export async function listAllImages(root = 'Forma', maxDepth = 4): Promise<CdnImage[]> {
  const { zone, apiKey, cdnUrl } = cfg();
  if (!zone || !apiKey || !cdnUrl) throw new UploadError('notConfigured');
  const base = cdnUrl.replace(/\/$/, '');
  const out: CdnImage[] = [];

  const walk = async (rel: string, depth: number): Promise<void> => {
    const items = await listDir(rel);
    await Promise.all(
      items.map(async (it) => {
        const childRel = `${rel.replace(/\/$/, '')}/${it.ObjectName}`;
        if (it.IsDirectory) {
          if (depth < maxDepth) await walk(childRel, depth + 1);
          return;
        }
        if (!isImageFile(it.ObjectName)) return; // e.g. a message attachment (.pdf) under the same CDN zone
        const parts = childRel.split('/'); // ["Forma", "{clientId}", …, "file"]
        out.push({
          url: `${base}/${childRel}`,
          path: childRel,
          name: it.ObjectName,
          clientId: parts[1] ?? '',
          context: childRel.includes('/assessment/') ? 'assessment' : parts.length === 3 ? 'progress' : 'other',
          size: it.Length ?? 0,
          lastChanged: it.LastChanged ?? it.DateCreated,
        });
      }),
    );
  };

  await walk(root, 0);
  return out.sort((a, b) => (b.lastChanged ?? '').localeCompare(a.lastChanged ?? ''));
}
