import { Binary, type Collection } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';
import type { MediaCategory, MediaKind } from './policy.js';

/**
 * Chunked-upload staging. Vercel Functions refuse request bodies over 4.5 MB
 * (413 FUNCTION_PAYLOAD_TOO_LARGE, every plan), and Bunny Storage has no
 * multipart/append API — so a file larger than one request is received in
 * `CHUNK_BYTES` pieces, staged here, and assembled into ONE `PUT` to Bunny at
 * finalize. The outbound PUT has no such limit (function memory is 2 GB and
 * the largest allowed object is 50 MB).
 *
 * Both collections carry a TTL index on `expiresAt`, so an abandoned upload
 * (client closed the tab between chunks) is reaped by Mongo within
 * `SESSION_TTL_MS` + the TTL monitor's sweep interval, never accumulates.
 */

export const CHUNK_BYTES = 4 * 1024 * 1024;
export const SESSION_TTL_MS = 60 * 60 * 1000;

export interface MediaUploadSessionDoc {
  _id: string; // crypto.randomUUID()
  ownerId: string;
  category: MediaCategory;
  path: string; // the resolved target path — fixed at init, never re-derived
  mimeType: string;
  kind: MediaKind;
  name: string;
  size: number;
  totalChunks: number;
  chunkSize: number;
  createdAt: number;
  expiresAt: Date;
}

export interface MediaUploadChunkDoc {
  _id: string; // `${uploadId}:${index}`
  uploadId: string;
  index: number;
  bytes: number;
  data: Binary;
  expiresAt: Date;
}

export async function ensureMediaIndexes(): Promise<void> {
  const db = await getDb();
  await db.collection('mediaUploads').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' });
  await db.collection('mediaUploadChunks').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' });
  await db.collection('mediaUploadChunks').createIndex({ uploadId: 1, index: 1 }, { name: 'uploadId_index' });
}

export async function mediaUploadsCol(): Promise<Collection<MediaUploadSessionDoc>> {
  const db = await getDb();
  await ensureMediaIndexes();
  return db.collection<MediaUploadSessionDoc>('mediaUploads');
}

export async function mediaUploadChunksCol(): Promise<Collection<MediaUploadChunkDoc>> {
  return (await getDb()).collection<MediaUploadChunkDoc>('mediaUploadChunks');
}

export function chunkId(uploadId: string, index: number): string {
  return `${uploadId}:${index}`;
}

export function toBinary(buf: Buffer): Binary {
  return new Binary(buf);
}
