import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPathSegments } from '../_lib/routePath.js';
import { createContext, type AuthedUser } from '../_trpc/context.js';
import { MediaError, isBunnyConfigured, putObject } from './_lib/bunny.js';
import { limitFor, resolveUploadTarget, type UploadMeta } from './_lib/policy.js';
import { CHUNK_BYTES, SESSION_TTL_MS, chunkId, mediaUploadChunksCol, mediaUploadsCol, toBinary } from './_lib/staging.js';

/**
 * The media upload function — the ONLY code path that writes to Bunny
 * Storage. Authenticated with the same bearer access token as tRPC (context
 * is built by the very same `createContext`, so a suspended/pending account
 * is refused here exactly as everywhere else), authorized + path-derived by
 * `_lib/policy.ts`, and kept OUT of tRPC only because it carries raw binary
 * bodies with upload progress (XHR) rather than JSON.
 *
 *   POST /api/media/upload?category=…[&clientId=…|&checkInId=…][&name=…]
 *        raw body (≤ 4 MiB), Content-Type = the file's MIME  → { url, size, kind, name, mimeType }
 *   POST /api/media/init      JSON { category, mimeType, size, name?, clientId?, checkInId? } → { uploadId, chunkSize, totalChunks }
 *   POST /api/media/chunk?uploadId=…&index=N   raw body (≤ chunkSize)          → { received }
 *   POST /api/media/finalize  JSON { uploadId }                                 → { url, size, kind, name, mimeType }
 *
 * `bodyParser: false` — the body is read here as a raw stream with a hard
 * byte cap, so an oversized upload is cut off at the policy's limit, never
 * buffered whole first.
 */
export const config = { api: { bodyParser: false } };

/** Largest single request body this function will read — under Vercel's 4.5 MB payload limit. */
const MAX_REQUEST_BYTES = CHUNK_BYTES;
const MAX_JSON_BYTES = 64 * 1024;

function send(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

function queryOf(req: VercelRequest): URLSearchParams {
  const url = req.url ?? '';
  const i = url.indexOf('?');
  return new URLSearchParams(i === -1 ? '' : url.slice(i + 1));
}

async function readBody(req: VercelRequest, maxBytes: number, tooLargeCode = 'tooLarge'): Promise<Buffer> {
  // Defensive: if a runtime ignored `bodyParser: false` and pre-read the body.
  const pre = (req as { body?: unknown }).body;
  if (Buffer.isBuffer(pre)) {
    if (pre.length > maxBytes) throw new MediaError(413, tooLargeCode, 'File is too large');
    return pre;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > maxBytes) throw new MediaError(413, tooLargeCode, 'File is too large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function readJson<T>(req: VercelRequest): Promise<T> {
  const raw = await readBody(req, MAX_JSON_BYTES, 'badRequest');
  try {
    return JSON.parse(raw.toString('utf8') || '{}') as T;
  } catch {
    throw new MediaError(400, 'badRequest', 'Malformed JSON body');
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function tooLargeCodeFor(kind: string): string {
  return kind === 'video' ? 'tooLargeVideo' : kind === 'audio' ? 'tooLargeAudio' : kind === 'file' ? 'tooLargeFile' : 'tooLarge';
}

function metaFromQuery(q: URLSearchParams, mimeType: string, size: number): UploadMeta {
  return {
    category: q.get('category') ?? '',
    mimeType,
    size,
    name: str(q.get('name')),
    clientId: str(q.get('clientId')),
    checkInId: str(q.get('checkInId')),
  };
}

// ---- actions --------------------------------------------------------------

async function upload(req: VercelRequest, res: VercelResponse, user: AuthedUser): Promise<void> {
  const q = queryOf(req);
  const mimeType = String(req.headers['content-type'] ?? '');
  const declared = Number(req.headers['content-length'] ?? 0);
  // Resolve/authorize on the DECLARED size first (cheap, before reading a
  // byte), then re-check on what actually arrived.
  const target = await resolveUploadTarget(user, metaFromQuery(q, mimeType, declared > 0 ? declared : 1));
  const cap = Math.min(limitFor(target.category, target.kind), MAX_REQUEST_BYTES);
  const body = await readBody(req, cap, tooLargeCodeFor(target.kind));
  if (body.length === 0) throw new MediaError(400, 'badRequest', 'Empty upload');
  const url = await putObject(target.path, target.mimeType, body);
  send(res, 200, { url, size: body.length, kind: target.kind, name: target.name, mimeType: target.mimeType });
}

async function init(req: VercelRequest, res: VercelResponse, user: AuthedUser): Promise<void> {
  const body = await readJson<Partial<UploadMeta>>(req);
  const size = Number(body.size);
  const target = await resolveUploadTarget(user, {
    category: String(body.category ?? ''),
    mimeType: String(body.mimeType ?? ''),
    size,
    name: str(body.name),
    clientId: str(body.clientId),
    checkInId: str(body.checkInId),
  });
  const totalChunks = Math.ceil(target.size / CHUNK_BYTES);
  const now = Date.now();
  const sessions = await mediaUploadsCol();
  const uploadId = crypto.randomUUID();
  await sessions.insertOne({
    _id: uploadId,
    ownerId: user.id,
    category: target.category,
    path: target.path,
    mimeType: target.mimeType,
    kind: target.kind,
    name: target.name,
    size: target.size,
    totalChunks,
    chunkSize: CHUNK_BYTES,
    createdAt: now,
    expiresAt: new Date(now + SESSION_TTL_MS),
  });
  send(res, 200, { uploadId, chunkSize: CHUNK_BYTES, totalChunks });
}

async function ownedSession(uploadId: string | undefined, user: AuthedUser) {
  if (!uploadId || !/^[0-9a-f-]{36}$/.test(uploadId)) throw new MediaError(400, 'badRequest', 'Invalid upload id');
  const sessions = await mediaUploadsCol();
  const session = await sessions.findOne({ _id: uploadId });
  // A session that isn't yours is indistinguishable from one that doesn't exist.
  if (!session || session.ownerId !== user.id) throw new MediaError(404, 'notFound', 'Upload session not found');
  if (session.expiresAt.getTime() <= Date.now()) throw new MediaError(410, 'expired', 'Upload session expired');
  return session;
}

async function chunk(req: VercelRequest, res: VercelResponse, user: AuthedUser): Promise<void> {
  const q = queryOf(req);
  const session = await ownedSession(q.get('uploadId') ?? undefined, user);
  const index = Number(q.get('index'));
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) throw new MediaError(400, 'badRequest', 'Chunk index out of range');
  const isLast = index === session.totalChunks - 1;
  const expected = isLast ? session.size - index * session.chunkSize : session.chunkSize;
  const body = await readBody(req, session.chunkSize, tooLargeCodeFor(session.kind));
  if (body.length !== expected) throw new MediaError(400, 'badRequest', `Chunk ${index} has ${body.length} bytes, expected ${expected}`);
  const chunks = await mediaUploadChunksCol();
  await chunks.updateOne(
    { _id: chunkId(session._id, index) },
    { $set: { uploadId: session._id, index, bytes: body.length, data: toBinary(body), expiresAt: session.expiresAt } },
    { upsert: true },
  );
  const received = await chunks.countDocuments({ uploadId: session._id });
  send(res, 200, { received, totalChunks: session.totalChunks });
}

async function finalize(req: VercelRequest, res: VercelResponse, user: AuthedUser): Promise<void> {
  const body = await readJson<{ uploadId?: string }>(req);
  const session = await ownedSession(str(body.uploadId), user);
  const chunksCol = await mediaUploadChunksCol();
  const parts = await chunksCol.find({ uploadId: session._id }).sort({ index: 1 }).toArray();
  if (parts.length !== session.totalChunks || parts.some((p, i) => p.index !== i)) {
    throw new MediaError(409, 'incomplete', `Received ${parts.length} of ${session.totalChunks} chunks`);
  }
  const assembled = Buffer.concat(parts.map((p) => Buffer.from(p.data.buffer)));
  if (assembled.length !== session.size) throw new MediaError(409, 'incomplete', 'Assembled size does not match the declared size');

  const url = await putObject(session.path, session.mimeType, assembled);
  const sessions = await mediaUploadsCol();
  await Promise.all([chunksCol.deleteMany({ uploadId: session._id }), sessions.deleteOne({ _id: session._id })]);
  send(res, 200, { url, size: assembled.length, kind: session.kind, name: session.name, mimeType: session.mimeType });
}

// ---- entry ----------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const [action] = getPathSegments(req, '/api/media');
  try {
    if (req.method !== 'POST') {
      send(res, 405, { error: 'methodNotAllowed' });
      return;
    }
    if (!isBunnyConfigured()) {
      send(res, 503, { error: 'notConfigured', message: 'Media uploads are not configured' });
      return;
    }
    const { user } = await createContext({ req, res });
    if (!user) {
      send(res, 401, { error: 'unauthorized' });
      return;
    }
    if (user.accountStatus !== 'active') {
      send(res, 403, { error: 'forbidden', message: 'Account is not active' });
      return;
    }
    switch (action) {
      case 'upload':
        return await upload(req, res, user);
      case 'init':
        return await init(req, res, user);
      case 'chunk':
        return await chunk(req, res, user);
      case 'finalize':
        return await finalize(req, res, user);
      default:
        send(res, 404, { error: 'notFound' });
        return;
    }
  } catch (e) {
    if (e instanceof MediaError) {
      send(res, e.status, { error: e.code, message: e.message });
      return;
    }
    console.error('[media] unhandled error:', e);
    send(res, 500, { error: 'failed', message: 'Upload failed' });
  }
}
