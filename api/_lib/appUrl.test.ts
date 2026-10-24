import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUrlError, CANONICAL_PRODUCTION_ORIGIN, appLink, resetAppUrlWarningForTests, trustedAppOrigin } from './appUrl.js';

/** B39A-S01 (P0): the origin of every emailed link comes from server configuration only. */
afterEach(() => {
  resetAppUrlWarningForTests();
  vi.restoreAllMocks();
});

describe('trustedAppOrigin', () => {
  it('a valid configured origin is used, normalised to the bare origin', () => {
    expect(trustedAppOrigin({ APP_BASE_URL: 'https://www.useforma.fit', VERCEL_ENV: 'production' })).toBe('https://www.useforma.fit');
    expect(trustedAppOrigin({ APP_BASE_URL: 'https://app.forma.test/', NODE_ENV: 'development' })).toBe('https://app.forma.test');
    expect(trustedAppOrigin({ APP_BASE_URL: '  https://preview.forma.test  ', VERCEL_ENV: 'preview' })).toBe('https://preview.forma.test');
  });

  it('http only for localhost outside production', () => {
    expect(trustedAppOrigin({ APP_BASE_URL: 'http://127.0.0.1:5199', NODE_ENV: 'development' })).toBe('http://127.0.0.1:5199');
    expect(trustedAppOrigin({ APP_BASE_URL: 'http://localhost:5173' })).toBe('http://localhost:5173');
    expect(() => trustedAppOrigin({ APP_BASE_URL: 'http://evil.example', NODE_ENV: 'development' })).toThrow(AppUrlError);
    expect(() => trustedAppOrigin({ APP_BASE_URL: 'http://localhost:5173', VERCEL_ENV: 'production' })).toThrow(AppUrlError);
    expect(() => trustedAppOrigin({ APP_BASE_URL: 'https://localhost', VERCEL_ENV: 'production' })).toThrow(AppUrlError);
  });

  it('anything but a bare origin fails safe (path, query, fragment, credentials, other schemes, garbage)', () => {
    for (const bad of ['https://app.forma.test/reset', 'https://app.forma.test/?a=1', 'https://app.forma.test/#x', 'https://u:p@app.forma.test', 'javascript:alert(1)', 'ftp://app.forma.test', 'not a url', '//evil.example']) {
      expect(() => trustedAppOrigin({ APP_BASE_URL: bad, VERCEL_ENV: 'production' }), bad).toThrow(AppUrlError);
    }
  });

  it('production without configuration uses the built-in canonical origin (a constant), and says so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(trustedAppOrigin({ VERCEL_ENV: 'production' })).toBe(CANONICAL_PRODUCTION_ORIGIN);
    expect(trustedAppOrigin({ NODE_ENV: 'production' })).toBe(CANONICAL_PRODUCTION_ORIGIN);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('outside production a missing configuration fails safe — never a guessed host (a Vercel preview is not production)', () => {
    expect(() => trustedAppOrigin({})).toThrow(AppUrlError);
    expect(() => trustedAppOrigin({ NODE_ENV: 'development' })).toThrow(AppUrlError);
    expect(() => trustedAppOrigin({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toThrow(AppUrlError);
  });

  it('appLink joins a rooted path only', () => {
    expect(appLink('/reset/abc', { APP_BASE_URL: 'https://app.forma.test' })).toBe('https://app.forma.test/reset/abc');
    expect(() => appLink('//evil.example/x', { APP_BASE_URL: 'https://app.forma.test' })).toThrow(AppUrlError);
    expect(() => appLink('reset', { APP_BASE_URL: 'https://app.forma.test' })).toThrow(AppUrlError);
  });
});
