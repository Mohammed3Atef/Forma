import type { VercelRequest } from '@vercel/node';
import type { Collection } from 'mongodb';
import { getDb } from './mongodb.js';
import { HttpError } from './http.js';

/**
 * Simple fixed-window rate limiter backed by Mongo. Serverless functions have
 * no durable in-process memory between invocations (and multiple concurrent
 * instances don't share memory anyway), so a real limiter needs a shared
 * store — Mongo is the only shared store this project already has. One
 * document per `(bucket, key, windowStart)`; a TTL index (see
 * `scripts/mongo-init-indexes.mjs`) reaps expired windows automatically so
 * this collection never grows unbounded.
 *
 * Deliberately a fixed window, not sliding/token-bucket — good enough to
 * blunt brute-force login guessing and signup/reset spam without adding a
 * new dependency or a second collection.
 */
interface RateLimitDoc {
  _id: string;
  count: number;
  windowStart: number;
  expiresAt: Date;
}

async function rateLimitsCol(): Promise<Collection<RateLimitDoc>> {
  return (await getDb()).collection<RateLimitDoc>('rateLimits');
}

/** Best-effort client IP from Vercel's forwarded-for header; falls back to the socket address, then a constant so callers never crash on it. */
export function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  const ip = first?.split(',')[0]?.trim();
  return ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Throws `HttpError(429)` once more than `max` calls have been recorded for
 * `key` within the current `windowMs`-long window. Call this *before* doing
 * the sensitive work (password check, token creation, etc.), not after.
 */
export async function enforceRateLimit(bucket: string, key: string, max: number, windowMs: number): Promise<void> {
  const col = await rateLimitsCol();
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const _id = `${bucket}:${key}:${windowStart}`;
  await col.updateOne(
    { _id },
    { $inc: { count: 1 }, $setOnInsert: { windowStart, expiresAt: new Date(windowStart + windowMs) } },
    { upsert: true },
  );
  const doc = await col.findOne({ _id });
  if ((doc?.count ?? 0) > max) {
    throw new HttpError(429, 'Too many attempts — please wait a bit and try again.');
  }
}
