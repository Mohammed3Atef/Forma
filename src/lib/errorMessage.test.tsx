import { afterAll, describe, expect, it } from 'vitest';
import i18n, { applyLocale } from '@/i18n';
import { errorMessage, retryAfterOf } from './errorMessage';
import { commercialErrorMessage } from './commercialErrors';

/** B3.9 (TS-02): a failed action is said in the user's language, by what failed — never the server's English text. */
const trpc = (code: string, extra: Record<string, unknown> = {}, message = 'Validation failed: [{"path":["x"]}]') => ({
  name: 'TRPCClientError',
  message,
  data: { code, httpStatus: 400, ...extra },
});
const t = i18n.t.bind(i18n);

describe('errorMessage (TS-02)', () => {
  afterAll(() => applyLocale('en'));

  it('never shows the server text — a validation refusal reads as a translated, actionable line', async () => {
    await applyLocale('en');
    const msg = errorMessage(trpc('BAD_REQUEST'), t);
    expect(msg).toBe(i18n.t('errors.invalid'));
    expect(msg).not.toContain('Validation');
  });

  it('a stable server reason wins over the code', () => {
    expect(errorMessage(trpc('CONFLICT', { reason: 'RELATIONSHIP_ENDED' }), t)).toBe(i18n.t('forma.reason.RELATIONSHIP_ENDED'));
    expect(errorMessage(trpc('CONFLICT', { reason: 'CHECKIN_ANSWERED' }), t)).toBe(i18n.t('forma.reason.CHECKIN_ANSWERED'));
  });

  it('an unknown reason falls back to the code line, not to the raw message', () => {
    expect(errorMessage(trpc('CONFLICT', { reason: 'SOMETHING_NEW' }), t)).toBe(i18n.t('errors.conflict'));
    expect(errorMessage(trpc('FORBIDDEN'), t)).toBe(i18n.t('errors.forbidden'));
    expect(errorMessage(trpc('NOT_FOUND'), t)).toBe(i18n.t('errors.notFound'));
    expect(errorMessage(trpc('PRECONDITION_FAILED'), t)).toBe(i18n.t('errors.notNow'));
  });

  it('no connection, server trouble, a lost session', () => {
    expect(errorMessage(new TypeError('Failed to fetch'), t)).toBe(i18n.t('errors.network'));
    expect(errorMessage({ name: 'TRPCClientError', message: 'x', data: null }, t)).toBe(i18n.t('errors.network'));
    expect(errorMessage(trpc('INTERNAL_SERVER_ERROR'), t)).toBe(i18n.t('errors.server'));
    expect(errorMessage(trpc('UNAUTHORIZED'), t)).toBe(i18n.t('errors.session'));
  });

  it('a rate limit says how long to wait (B36-R4 retryAfter, seconds → whole minutes)', () => {
    const e = trpc('TOO_MANY_REQUESTS', { reason: 'RATE_LIMITED', retryAfter: 125 });
    expect(retryAfterOf(e)).toBe(125);
    expect(errorMessage(e, t)).toBe(i18n.t('errors.rateLimitedFor', { count: 3 }));
    expect(errorMessage(e, t)).toContain('3 minutes');
    expect(errorMessage(trpc('TOO_MANY_REQUESTS'), t)).toBe(i18n.t('errors.rateLimited'));
  });

  it('the fallback key is the action\'s own line', () => {
    expect(errorMessage(new Error('boom'), t, 'common.savedFailed')).toBe(i18n.t('errors.server'));
    expect(errorMessage({ name: 'UploadError', code: 'cancelled' }, t, 'common.savedFailed')).toBe(i18n.t('common.savedFailed'));
  });

  it('Arabic: the same failure reads in Arabic (no English server text)', async () => {
    for (const lng of ['ar', 'ar-eg'] as const) {
      await applyLocale(lng);
      const msg = errorMessage(trpc('BAD_REQUEST', {}, 'Invalid input'), t);
      expect(msg).toBe(i18n.t('errors.invalid'));
      expect(msg).not.toMatch(/[A-Za-z]{3,}/);
      expect(errorMessage(trpc('TOO_MANY_REQUESTS', { retryAfter: 60 }), t)).not.toMatch(/[A-Za-z]{3,}/);
    }
  });

  it('commercialErrorMessage keeps reasons and no longer leaks the server text', async () => {
    await applyLocale('en');
    expect(commercialErrorMessage(trpc('PRECONDITION_FAILED', { reason: 'CLIENT_CAPACITY_REACHED' }), t)).toBe(i18n.t('forma.reason.CLIENT_CAPACITY_REACHED'));
    expect(commercialErrorMessage(trpc('CONFLICT', {}, 'E11000 duplicate key'), t)).not.toContain('E11000');
  });
});
