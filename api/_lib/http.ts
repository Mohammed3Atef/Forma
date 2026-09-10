import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';

/** Thrown by route handlers to short-circuit with a specific HTTP status + message. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Throws a 405 unless `req.method` is one of `methods`. */
export function methodGuard(req: VercelRequest, ...methods: string[]): void {
  if (!req.method || !methods.includes(req.method)) {
    throw new HttpError(405, `Method not allowed (expected ${methods.join(' or ')})`);
  }
}

/** Uniform error → HTTP response mapping for every route's catch block. */
export function handleError(res: VercelResponse, e: unknown): void {
  if (e instanceof HttpError) {
    res.status(e.status).json({ error: e.message });
    return;
  }
  if (e instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', details: e.issues });
    return;
  }
  console.error('[api] unhandled error:', e);
  res.status(500).json({ error: 'Internal server error' });
}
