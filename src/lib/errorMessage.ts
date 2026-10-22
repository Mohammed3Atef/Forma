import type { TFunction } from 'i18next';
import { classifyError } from './errorKind';

/** Seconds the server asked us to wait (`error.data.retryAfter`, sent with RATE_LIMITED), when it said. */
export function retryAfterOf(e: unknown): number | null {
  const data = (e as { data?: { retryAfter?: unknown } | null } | null)?.data;
  return typeof data?.retryAfter === 'number' && data.retryAfter > 0 ? data.retryAfter : null;
}

/**
 * The words for a failed action (B3.9, TS-02) — one place, every language. Chosen by WHAT failed,
 * never by the server's English text (which can be validation JSON and is never translated):
 *  1. the server's stable machine reason (`forma.reason.*`), when it sent one;
 *  2. the failure kind — no connection, slow down (with the wait), signed out, server trouble;
 *  3. the refusal code — not allowed, gone, changed meanwhile, not valid;
 *  4. `fallbackKey` (the action's own "couldn't …" line), else the generic error.
 */
export function errorMessage(e: unknown, t: TFunction, fallbackKey = 'common.errorGeneric'): string {
  const c = classifyError(e);
  if (c.reason) {
    const msg = t(`forma.reason.${c.reason}`, { defaultValue: '' });
    if (msg) return msg;
  }
  switch (c.kind) {
    case 'network':
    case 'timeout':
      return t('errors.network');
    case 'rate_limited': {
      const s = retryAfterOf(e);
      return s ? t('errors.rateLimitedFor', { count: Math.max(1, Math.ceil(s / 60)) }) : t('errors.rateLimited');
    }
    case 'unauthorized':
      return t('errors.session');
    case 'server':
    case 'unavailable':
      return t('errors.server');
    case 'permanent':
      switch (c.code) {
        case 'FORBIDDEN':
          return t('errors.forbidden');
        case 'NOT_FOUND':
          return t('errors.notFound');
        case 'CONFLICT':
          return t('errors.conflict');
        case 'PAYLOAD_TOO_LARGE':
          return t('errors.tooLarge');
        case 'BAD_REQUEST':
        case 'PARSE_ERROR':
        case 'UNPROCESSABLE_CONTENT':
          return t('errors.invalid');
        case 'PRECONDITION_FAILED':
          return t('errors.notNow');
      }
  }
  return t(fallbackKey);
}
