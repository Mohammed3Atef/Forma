import { describe, expect, it } from 'vitest';
import { classifyError } from './errorKind';

/** B3.0.1: a refusal keeps the server's stable reason, so the UI can say WHY (never by parsing text). */
const trpcError = (code: string, reason?: string, httpStatus = 409) => ({ name: 'TRPCClientError', message: 'x', data: { code, httpStatus, ...(reason ? { reason } : {}) } });

describe('classifyError — server reasons', () => {
  it('a permanent refusal carries data.reason', () => {
    expect(classifyError(trpcError('CONFLICT', 'CONVERSATION_CLOSED'))).toEqual({ kind: 'permanent', code: 'CONFLICT', retryable: false, reason: 'CONVERSATION_CLOSED' });
    expect(classifyError(trpcError('FORBIDDEN', 'ACCOUNT_NOT_ACTIVE', 403))).toEqual({ kind: 'permanent', code: 'FORBIDDEN', retryable: false, reason: 'ACCOUNT_NOT_ACTIVE' });
  });
  it('no reason → no reason field; retryable kinds are unchanged', () => {
    expect(classifyError(trpcError('NOT_FOUND', undefined, 404))).toEqual({ kind: 'permanent', code: 'NOT_FOUND', retryable: false });
    expect(classifyError(trpcError('INTERNAL_SERVER_ERROR', undefined, 500)).kind).toBe('server');
    expect(classifyError(trpcError('TOO_MANY_REQUESTS', undefined, 429)).kind).toBe('rate_limited');
  });
  it('an upload refused for this account / conversation is permanent (no endless retry)', () => {
    const e = Object.assign(new Error('forbidden'), { name: 'UploadError', code: 'forbidden' });
    expect(classifyError(e)).toEqual({ kind: 'permanent', code: 'forbidden', retryable: false });
  });
});
