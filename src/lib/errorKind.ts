import { TRPCClientError } from '@trpc/client';

/**
 * What KIND of failure an error is (B1.6 / B1.7) — the one place that tells a
 * dropped connection apart from a server refusal. Retry logic, the outbox,
 * sync status and error copy all branch on this instead of each inspecting
 * tRPC/fetch internals.
 *
 *  - `network`     no response at all (offline, DNS, reset, CORS, or an HTML
 *                  error page from the platform in place of JSON) → retry later
 *  - `timeout`     the request deadline fired → retry later
 *  - `unauthorized` session not accepted (the tRPC link already tried one refresh)
 *  - `rate_limited` server asked us to slow down → retry with a longer pause
 *  - `server`      5xx / internal error → retry with backoff
 *  - `permanent`   the server understood and refused (validation, forbidden,
 *                  not found, conflict, too large, bad type) → retrying the same
 *                  request can never succeed; the user must act
 *  - `unavailable` the feature is switched off server-side (uploads not
 *                  configured) → retry much later, tell the user
 *  - `cancelled`   the user aborted it
 */
export type ErrorKind = 'network' | 'timeout' | 'unauthorized' | 'rate_limited' | 'server' | 'permanent' | 'unavailable' | 'cancelled';

export interface ClassifiedError {
  kind: ErrorKind;
  /** tRPC error code / upload error code when known (never shown to users). */
  code?: string;
  /** True when the same request may succeed later without the user changing anything. */
  retryable: boolean;
}

const PERMANENT_TRPC = new Set(['BAD_REQUEST', 'PARSE_ERROR', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'PAYLOAD_TOO_LARGE', 'UNPROCESSABLE_CONTENT', 'METHOD_NOT_SUPPORTED', 'PRECONDITION_FAILED', 'NOT_IMPLEMENTED', 'UNSUPPORTED_MEDIA_TYPE']);
const SERVER_TRPC = new Set(['INTERNAL_SERVER_ERROR', 'BAD_GATEWAY', 'SERVICE_UNAVAILABLE', 'GATEWAY_TIMEOUT', 'CLIENT_CLOSED_REQUEST']);

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'TimeoutError';
}

/** Upload failures (mediaApi `UploadError`), recognised by shape so this module stays dependency-free. */
function uploadCode(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null;
  const x = e as { name?: string; code?: unknown };
  return x.name === 'UploadError' && typeof x.code === 'string' ? x.code : null;
}

export function classifyError(e: unknown): ClassifiedError {
  const up = uploadCode(e);
  if (up) {
    switch (up) {
      case 'cancelled':
        return { kind: 'cancelled', code: up, retryable: false };
      case 'notConfigured':
        return { kind: 'unavailable', code: up, retryable: true };
      case 'failed':
        return { kind: 'network', code: up, retryable: true };
      default:
        return { kind: 'permanent', code: up, retryable: false }; // badType / tooLarge*
    }
  }
  if (isTimeout(e)) return { kind: 'timeout', retryable: true };
  if (isAbort(e)) return { kind: 'cancelled', retryable: false };

  const err = e as { name?: string; data?: { code?: string; httpStatus?: number } | null; cause?: unknown };
  if (e instanceof TRPCClientError || (err && typeof err === 'object' && err.name === 'TRPCClientError')) {
    const code = err.data?.code;
    if (!code) {
      // No tRPC payload: the request never produced a JSON answer. A deadline
      // shows up as a TimeoutError cause; everything else (TypeError: Failed
      // to fetch, a SyntaxError from an HTML 502 page) is a connection problem.
      if (isTimeout(err.cause)) return { kind: 'timeout', retryable: true };
      if (isAbort(err.cause)) return { kind: 'cancelled', retryable: false };
      return { kind: 'network', retryable: true };
    }
    if (code === 'UNAUTHORIZED') return { kind: 'unauthorized', code, retryable: true };
    if (code === 'TOO_MANY_REQUESTS') return { kind: 'rate_limited', code, retryable: true };
    if (code === 'TIMEOUT') return { kind: 'timeout', code, retryable: true };
    if (SERVER_TRPC.has(code)) return { kind: 'server', code, retryable: true };
    if (PERMANENT_TRPC.has(code)) return { kind: 'permanent', code, retryable: false };
    const status = err.data?.httpStatus ?? 0;
    if (status >= 500) return { kind: 'server', code, retryable: true };
    return { kind: 'permanent', code, retryable: false };
  }
  // fetch() rejects with a TypeError when there is no connection.
  if (e instanceof TypeError) return { kind: 'network', retryable: true };
  return { kind: 'server', retryable: true };
}

/** Connection-level failures: the device couldn't reach the server at all. */
export function isConnectivityError(e: unknown): boolean {
  const k = classifyError(e).kind;
  return k === 'network' || k === 'timeout';
}
