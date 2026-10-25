import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { deliveryConfig, personalMedia, signPath } from './delivery.js';
import { collectPersonalPaths, personalOrphans, PERSONAL_ORPHAN_GRACE_MS } from './personalOrphans.js';

/**
 * MD-02 / MD-03 (B4.3) — the pure parts: which media is personal, how a URL is signed (Bunny token
 * authentication), and which personal files nothing references any more.
 */
const CDN = 'https://cdn.forma.test';

describe('signed delivery (MD-02)', () => {
  it('is off unless BUNNY_URL_TOKEN_KEY and BUNNY_CDN_URL are set; the lifetime is clamped to 5 min – 6 h', () => {
    expect(deliveryConfig({})).toBeNull();
    expect(deliveryConfig({ BUNNY_CDN_URL: CDN })).toBeNull();
    expect(deliveryConfig({ BUNNY_URL_TOKEN_KEY: 'k', BUNNY_CDN_URL: `${CDN}/` })).toEqual({ key: 'k', cdn: CDN, ttlSec: 3600 });
    expect(deliveryConfig({ BUNNY_URL_TOKEN_KEY: 'k', BUNNY_CDN_URL: CDN, MEDIA_URL_TTL_SECONDS: '10' })!.ttlSec).toBe(300);
    expect(deliveryConfig({ BUNNY_URL_TOKEN_KEY: 'k', BUNNY_CDN_URL: CDN, MEDIA_URL_TTL_SECONDS: '999999' })!.ttlSec).toBe(21600);
  });

  it('personal media: avatars, progress / assessment / check-in photos, message attachments — never library content or another host', () => {
    expect(personalMedia(`${CDN}/Forma/u1/avatar/a.webp`, CDN)).toEqual({ path: 'Forma/u1/avatar/a.webp', ownerId: 'u1', category: 'avatar' });
    expect(personalMedia(`${CDN}/Forma/u1/k3y.jpg`, CDN)).toMatchObject({ ownerId: 'u1', category: 'progress' });
    expect(personalMedia(`${CDN}/Forma/u1/assessment/x.png`, CDN)).toMatchObject({ category: 'assessment' });
    expect(personalMedia(`${CDN}/Forma/u1/checkin/2026-10-20/x.jpg`, CDN)).toMatchObject({ category: 'checkin' });
    expect(personalMedia(`${CDN}/Forma/c9/messages/v.webm?token=old&expires=1`, CDN)).toMatchObject({ path: 'Forma/c9/messages/v.webm', ownerId: 'c9', category: 'messages' });
    expect(personalMedia(`${CDN}/Forma/coach/exercises/x.mp4`, CDN)).toBeNull();
    expect(personalMedia(`${CDN}/Forma/coach/foods/x.webp`, CDN)).toBeNull();
    expect(personalMedia(`https://evil.test/Forma/u1/avatar/a.webp`, CDN)).toBeNull();
    expect(personalMedia(`${CDN}/Forma/u1/../u2/avatar/a.webp`, CDN)).toBeNull();
  });

  it('signs with Bunny token authentication: base64url(sha256(key + path + expires)), expiry rounded up to 5 minutes + the lifetime', () => {
    const cfg = { key: 'secret', cdn: CDN, ttlSec: 3600 };
    const now = Date.UTC(2026, 9, 25, 10, 1, 7);
    const { url, expires } = signPath('Forma/u1/avatar/a.webp', cfg, now);
    const step = Math.ceil(now / 1000 / 300) * 300;
    expect(expires).toBe(step + 3600);
    const token = crypto.createHash('sha256').update(`secret/Forma/u1/avatar/a.webp${expires}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(url).toBe(`${CDN}/Forma/u1/avatar/a.webp?token=${token}&expires=${expires}`);
    expect(token).not.toMatch(/[+/=]/);
    // Same URL for every viewer within the 5-minute step (cacheable).
    expect(signPath('Forma/u1/avatar/a.webp', cfg, now + 60_000).url).toBe(url);
  });
});

describe('personal media nothing references (MD-03, report only)', () => {
  const now = Date.UTC(2026, 9, 25);
  const old = new Date(now - PERSONAL_ORPHAN_GRACE_MS - 86_400_000).toISOString();
  const fresh = new Date(now - 86_400_000).toISOString();
  it('a file is reported only when nothing references it (signed or not) and it is older than the grace period; library files never', () => {
    const referenced = collectPersonalPaths(
      [
        { avatarUrl: `${CDN}/Forma/u1/avatar/now.webp` },
        { attachment: { url: `${CDN}/Forma/c1/messages/kept.jpg?token=t&expires=1` } },
        { deep: [{ photos: { front: `${CDN}/Forma/c1/k1.jpg` } }] },
      ],
      CDN,
    );
    expect([...referenced].sort()).toEqual(['Forma/c1/k1.jpg', 'Forma/c1/messages/kept.jpg', 'Forma/u1/avatar/now.webp']);
    const files = [
      { url: '', path: 'Forma/u1/avatar/now.webp', size: 10, lastChanged: old },
      { url: '', path: 'Forma/u1/avatar/replaced.webp', size: 11, lastChanged: old },
      { url: '', path: 'Forma/c1/messages/deleted.jpg', size: 12, lastChanged: old },
      { url: '', path: 'Forma/c1/messages/just-sent.jpg', size: 13, lastChanged: fresh },
      { url: '', path: 'Forma/c1/unknown-age.jpg', size: 14, lastChanged: undefined },
      { url: '', path: 'Forma/coach/exercises/demo.mp4', size: 15, lastChanged: old },
    ];
    expect(personalOrphans(files, referenced, CDN, now).map((o) => [o.path, o.category, o.ownerId])).toEqual([
      ['Forma/u1/avatar/replaced.webp', 'avatar', 'u1'],
      ['Forma/c1/messages/deleted.jpg', 'messages', 'c1'],
    ]);
  });
});
