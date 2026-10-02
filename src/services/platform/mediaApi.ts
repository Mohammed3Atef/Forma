import { useEffect } from 'react';
import { create } from 'zustand';
import { getAttachmentKind, type AttachmentKind } from '@/lib/attachmentKind';
import { getAccessToken, refreshSession } from '@/services/platformApi';
import { trpc } from '@/services/trpc';

/**
 * Media uploads — the browser side of `api/media/[action].ts`.
 *
 * The browser holds NO storage credentials any more. It names a CATEGORY
 * (+ the one id that category needs) and streams bytes to `/api/media/*`
 * with its normal bearer session; the backend decides whether this user may
 * upload there, derives the storage path from the SESSION identity, and is
 * the only thing that talks to Bunny. (Until this module, the storage zone
 * password shipped in the bundle as `VITE_BUNNY_API_KEY`.)
 *
 * Files up to `SINGLE_MAX_BYTES` go in one request; larger ones (video,
 * audio, documents) go as 4 MiB chunks the backend assembles — Vercel refuses
 * request bodies over 4.5 MB, so this is what keeps 50 MB videos working.
 * Progress is reported per byte across all chunks. All limits are enforced
 * server-side; the pre-checks here only exist for instant feedback.
 */

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

export type UploadTarget =
  | { category: 'avatar' | 'progress' | 'assessment' | 'exercise' }
  | { category: 'checkin'; checkInId: string }
  | { category: 'message'; clientId: string };

export interface UploadOptions {
  /** Display name to keep with the file (defaults to `File.name`). */
  name?: string;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

const MB = 1024 * 1024;
export const SINGLE_MAX_BYTES = 4 * MB;
const MAX_IMAGE_BYTES = 5 * MB;
const MAX_VIDEO_BYTES = 50 * MB;
const MAX_AUDIO_BYTES = 10 * MB;
const MAX_FILE_BYTES = 25 * MB;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export type { AttachmentKind };

function maxBytesFor(kind: AttachmentKind): number {
  if (kind === 'video') return MAX_VIDEO_BYTES;
  if (kind === 'audio') return MAX_AUDIO_BYTES;
  if (kind === 'file') return MAX_FILE_BYTES;
  return MAX_IMAGE_BYTES;
}

function tooLargeCode(kind: AttachmentKind): UploadErrorCode {
  return kind === 'video' ? 'tooLargeVideo' : kind === 'audio' ? 'tooLargeAudio' : kind === 'file' ? 'tooLargeFile' : 'tooLarge';
}

// ---- "are uploads enabled?" — asked of the server once, cached ------------

interface UploadConfigState {
  status: 'unknown' | 'loading' | 'ready';
  configured: boolean;
  load: () => Promise<void>;
}

const useUploadConfig = create<UploadConfigState>((set, get) => ({
  status: 'unknown',
  configured: false,
  async load() {
    if (get().status !== 'unknown') return;
    set({ status: 'loading' });
    try {
      const { configured } = await trpc.media.status.query();
      set({ status: 'ready', configured });
    } catch {
      // Not signed in yet / offline — leave it unknown so the next mount retries.
      set({ status: 'unknown', configured: false });
    }
  },
}));

/** Hook: true once the server has confirmed media storage is configured. Pickers stay disabled until then (same UX as when `VITE_BUNNY_*` was absent). */
export function useUploadConfigured(): boolean {
  const configured = useUploadConfig((s) => s.configured);
  const load = useUploadConfig((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return configured;
}

/** Non-hook variant for stores: resolves the flag (fetching it if needed). */
export async function ensureUploadConfig(): Promise<boolean> {
  await useUploadConfig.getState().load();
  return useUploadConfig.getState().configured;
}

// ---- transport -----------------------------------------------------------

interface RawResponse {
  status: number;
  json: Record<string, unknown>;
}

function xhrPost(url: string, body: Blob, contentType: string, token: string | null, opts: UploadOptions): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new UploadError('cancelled'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.withCredentials = true;
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      let json: Record<string, unknown> = {};
      try {
        json = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : {};
      } catch {
        /* non-JSON error page — handled by status below */
      }
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new UploadError('failed', 'network error'));
    xhr.onabort = () => reject(new UploadError('cancelled'));
    opts.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(body);
  });
}

/** POST raw bytes with the session; exactly one refresh-and-retry on 401 (mirrors `trpcFetch`). */
async function postRaw(url: string, body: Blob, contentType: string, opts: UploadOptions, retry = true): Promise<RawResponse> {
  const r = await xhrPost(url, body, contentType, getAccessToken(), opts);
  if (r.status === 401 && retry && (await refreshSession())) return postRaw(url, body, contentType, opts, false);
  return r;
}

async function postJson(url: string, payload: unknown, signal?: AbortSignal, retry = true): Promise<RawResponse> {
  const token = getAccessToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw new UploadError('cancelled');
    throw new UploadError('failed', e instanceof Error ? e.message : 'network error');
  }
  if (res.status === 401 && retry && (await refreshSession())) return postJson(url, payload, signal, false);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

function assertOk(r: RawResponse): Record<string, unknown> {
  if (r.status >= 200 && r.status < 300) return r.json;
  const code = typeof r.json.error === 'string' ? r.json.error : '';
  const message = typeof r.json.message === 'string' ? r.json.message : `Upload failed (${r.status})`;
  if (r.status === 413 && code.startsWith('tooLarge')) throw new UploadError(code as UploadErrorCode, message);
  if (r.status === 415) throw new UploadError('badType', message);
  if (r.status === 503) throw new UploadError('notConfigured', message);
  throw new UploadError('failed', message);
}

function targetParams(target: UploadTarget): Record<string, string> {
  const p: Record<string, string> = { category: target.category };
  if (target.category === 'checkin') p.checkInId = target.checkInId;
  if (target.category === 'message') p.clientId = target.clientId;
  return p;
}

interface UploadResponse extends UploadResult {
  kind: AttachmentKind;
  name: string;
  mimeType: string;
}

function toResult(json: Record<string, unknown>): UploadResponse {
  return {
    url: String(json.url),
    size: Number(json.size),
    kind: (json.kind as AttachmentKind) ?? 'file',
    name: String(json.name ?? ''),
    mimeType: String(json.mimeType ?? ''),
  };
}

async function uploadSingle(file: Blob, target: UploadTarget, name: string | undefined, opts: UploadOptions): Promise<UploadResponse> {
  const q = new URLSearchParams({ ...targetParams(target), ...(name ? { name } : {}) });
  const r = await postRaw(`/api/media/upload?${q.toString()}`, file, file.type, opts);
  return toResult(assertOk(r));
}

async function uploadChunked(file: Blob, target: UploadTarget, name: string | undefined, opts: UploadOptions): Promise<UploadResponse> {
  const init = assertOk(await postJson('/api/media/init', { ...targetParams(target), mimeType: file.type, size: file.size, name }, opts.signal));
  const uploadId = String(init.uploadId);
  const chunkSize = Number(init.chunkSize);
  const total = Number(init.totalChunks);
  for (let i = 0; i < total; i += 1) {
    const start = i * chunkSize;
    const part = file.slice(start, Math.min(start + chunkSize, file.size), file.type);
    const q = new URLSearchParams({ uploadId, index: String(i) });
    const r = await postRaw(`/api/media/chunk?${q.toString()}`, part, 'application/octet-stream', {
      signal: opts.signal,
      onProgress: opts.onProgress ? (pct) => opts.onProgress?.(Math.round(((start + (part.size * pct) / 100) / file.size) * 100)) : undefined,
    });
    assertOk(r);
  }
  return toResult(assertOk(await postJson('/api/media/finalize', { uploadId }, opts.signal)));
}

/**
 * Upload any attachment (image / video / audio / document) and get back its
 * public URL + kind + display name. Used by the messenger and the exercise
 * video picker. Images aren't downscaled here — the caller may do that first.
 */
export async function uploadFile(file: Blob, target: UploadTarget, opts: UploadOptions = {}): Promise<UploadResponse> {
  const name = opts.name ?? (file instanceof File ? file.name : undefined);
  const kind = getAttachmentKind({ mimeType: file.type, name });
  if (file.size > maxBytesFor(kind)) throw new UploadError(tooLargeCode(kind));
  return file.size <= SINGLE_MAX_BYTES ? uploadSingle(file, target, name, opts) : uploadChunked(file, target, name, opts);
}

/** Upload a still image (JPEG/PNG/WebP, ≤ 5 MB) — avatars, progress/assessment/check-in photos. */
export async function uploadImage(file: Blob, target: UploadTarget, opts: UploadOptions = {}): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) throw new UploadError('badType');
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError('tooLarge');
  const { url, size } = await uploadFile(file, target, opts);
  return { url, size };
}

// ---- super-admin gallery (now server-side) ---------------------------------

export type CdnImage = Awaited<ReturnType<typeof trpc.media.listImages.query>>[number];

export async function listAllImages(): Promise<CdnImage[]> {
  return trpc.media.listImages.query();
}
