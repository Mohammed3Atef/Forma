import { createHash } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import type { Collection } from 'mongodb';
import { TRPCError } from '@trpc/server';
import { CommercialReason } from './commercialReason.js';
import { getDb } from './mongodb.js';

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

/**
 * The stored key part of a counter: a hash, so the collection never holds an email address, IP or
 * account id in clear (B4 / B36-R4 review). One-way and stable, so counting is unchanged.
 */
function keyDigest(key: string): string {
  return createHash('sha256').update(key).digest('base64url').slice(0, 32);
}

/**
 * One mailbox, one counter: lowercased, a `+tag` dropped, and for Gmail the dots too (Gmail ignores
 * both), so per-address limits can't be dodged with `victim+1@…` / `v.ictim@gmail.com`. Only the
 * LIMIT key — the address the email goes to is never rewritten.
 */
export function mailboxKey(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** Best-effort client IP from Vercel's forwarded-for header; falls back to the socket address, then a constant so callers never crash on it. */
export function getClientIp(req: VercelRequest): string {
  const fwd = req.headers?.['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  const ip = first?.split(',')[0]?.trim();
  return ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Throws `TRPCError({code:'TOO_MANY_REQUESTS'})` once more than `max` calls
 * have been recorded for `key` within the current `windowMs`-long window.
 * Call this *before* doing the sensitive work (password check, token
 * creation, etc.), not after.
 *
 * Shared by every server instance (one atomic `$inc` per call on one document), so N concurrent
 * calls are counted N times. The refusal carries `reason: 'RATE_LIMITED'` and `retryAfter` (seconds
 * until the window resets) — the app waits and retries instead of reading it as a failure.
 */
export async function enforceRateLimit(bucket: string, key: string, max: number, windowMs: number, message = 'Too many attempts — please wait a bit and try again.'): Promise<void> {
  const col = await rateLimitsCol();
  const now = Date.now();
  const c = await charge(col, bucket, key, windowMs, now);
  if (c.count > max) throw tooMany(message, c.windowStart + windowMs - now);
}

/** One atomic `$inc` on the counter of the current window (created on first use). */
async function charge(col: Collection<RateLimitDoc>, bucket: string, key: string, windowMs: number, now: number): Promise<{ _id: string; count: number; windowStart: number }> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const _id = `${bucket}:${keyDigest(key)}:${windowStart}`;
  const hit = () => col.findOneAndUpdate({ _id }, { $inc: { count: 1 }, $setOnInsert: { windowStart, expiresAt: new Date(windowStart + windowMs) } }, { upsert: true, returnDocument: 'after' });
  let doc: RateLimitDoc | null;
  try {
    doc = await hit();
  } catch (e) {
    // Two first hits of a new window race to insert the same document: the loser retries once,
    // as an update of the document the winner created.
    if ((e as { code?: number }).code !== 11000) throw e;
    doc = await hit();
  }
  return { _id, count: doc?.count ?? 0, windowStart };
}

function tooMany(message: string, msLeft: number): TRPCError {
  const retryAfter = Math.max(1, Math.ceil(msLeft / 1000));
  return new TRPCError({ code: 'TOO_MANY_REQUESTS', message, cause: new CommercialReason('RATE_LIMITED', { retryAfter }) });
}

export interface QuotaCheck {
  bucket: string;
  key: string;
  max: number;
  windowMs: number;
  message: string;
}

/**
 * B4.1 — the quotas of ONE operation (a message: per sender + per conversation; an invite: per
 * creator + per creator-and-mailbox), charged as a unit. If any refuses, every counter this call
 * charged is refunded — the refused operation consumes no quota — and the refusal carries
 * RATE_LIMITED + retryAfter. `release()` refunds them too when the operation then fails before
 * anything was written. Concurrency: an operation is admitted only when every counter, including its
 * own charge, is within its limit, and refunds only ever lower a count, so N concurrent calls never
 * admit more than the limit (a refund still in flight can make a neighbour wait — never the reverse).
 */
export async function consumeRateLimits(checks: QuotaCheck[]): Promise<{ release: () => Promise<void> }> {
  const col = await rateLimitsCol();
  const now = Date.now();
  const charged: string[] = [];
  const refund = async () => {
    await Promise.all(charged.map((_id) => col.updateOne({ _id, count: { $gt: 0 } }, { $inc: { count: -1 } })));
    charged.length = 0;
  };
  for (const q of checks) {
    const c = await charge(col, q.bucket, q.key, q.windowMs, now);
    charged.push(c._id);
    if (c.count > q.max) {
      await refund();
      throw tooMany(q.message, c.windowStart + q.windowMs - now);
    }
  }
  return { release: refund };
}
