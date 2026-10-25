import crypto from 'node:crypto';

/**
 * MD-02 (B4.3; dormant until the owner configures it) — personal media through short-lived signed
 * URLs instead of permanent public links. Bunny's pull zone checks the token (Token Authentication:
 * `token = base64url(sha256(securityKey + path + expires))`), so a copied link stops working when it
 * expires and an unsigned link never works once token authentication is on.
 *
 * Off (`BUNNY_URL_TOKEN_KEY` unset) nothing changes: every URL is returned as stored. On, only
 * PERSONAL media is signed — a user's avatar, progress, assessment and check-in photos and message
 * attachments — never coach library content (exercise demonstrations, food photos), which plans show
 * to every client of that coach and stays public by design.
 *
 * Stored documents keep the bare URL; signatures are made on request (`media.sign`) for a viewer who
 * may see that media (`canSeePersonalMedia`), so a token never ends up in the database.
 */
export interface DeliveryConfig {
  key: string;
  cdn: string;
  ttlSec: number;
}
export type PersonalCategory = 'avatar' | 'assessment' | 'checkin' | 'messages' | 'progress';

/** Expiries are rounded up to 5-minute steps: the same URL for every viewer for a while (cacheable). */
const STEP_SEC = 300;
const MIN_TTL = 300;
const MAX_TTL = 6 * 3600;

export function deliveryConfig(env: Partial<Record<string, string>> = process.env): DeliveryConfig | null {
  const key = env.BUNNY_URL_TOKEN_KEY?.trim();
  const cdn = env.BUNNY_CDN_URL?.trim().replace(/\/+$/, '');
  if (!key || !cdn) return null;
  const ttl = Number(env.MEDIA_URL_TTL_SECONDS);
  return { key, cdn, ttlSec: Number.isFinite(ttl) ? Math.min(MAX_TTL, Math.max(MIN_TTL, Math.round(ttl))) : 3600 };
}

// The upload policy (`policy.ts`) writes personal media at exactly these paths (ids pinned to
// [A-Za-z0-9_-]): avatar/, assessment/, checkin/<id>/, messages/ under the owner, and progress photos
// directly in the owner's folder. `exercises/` and `foods/` are coach library content.
const PERSONAL = /^Forma\/([A-Za-z0-9_-]{1,64})\/(?:(avatar|assessment|checkin|messages)\/[A-Za-z0-9_./-]+|([A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}))$/;

/** The personal media a stored URL points at (path, owner, category) — or null for anything else. */
export function personalMedia(url: string, cdn: string): { path: string; ownerId: string; category: PersonalCategory } | null {
  const prefix = `${cdn}/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length).split(/[?#]/)[0];
  if (path.includes('..')) return null;
  const m = PERSONAL.exec(path);
  if (!m) return null;
  return { path, ownerId: m[1], category: (m[2] as PersonalCategory | undefined) ?? 'progress' };
}

/** A signed URL for a zone path, valid until `expires` (unix seconds). */
export function signPath(path: string, cfg: DeliveryConfig, nowMs = Date.now()): { url: string; expires: number } {
  const expires = Math.ceil(nowMs / 1000 / STEP_SEC) * STEP_SEC + cfg.ttlSec;
  const signed = `/${path}`;
  const token = crypto.createHash('sha256').update(cfg.key + signed + expires).digest('base64').replace(/\n/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { url: `${cfg.cdn}${signed}?token=${token}&expires=${expires}`, expires };
}
