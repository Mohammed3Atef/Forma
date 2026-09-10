import { getDb } from '../_lib/mongodb.js';
import type { Role } from '../_lib/types.js';

/**
 * Backend-local mirror of `src/services/platform/bannersApi.ts`'s `Banner`
 * shape (`banners` collection, `_id` == a generated id).
 */
export type BannerStyle = 'info' | 'success' | 'warning' | 'promo';
export type BannerPlacement = 'all' | 'client_home' | 'coach_dashboard';
export type BannerSegment = 'all' | 'new' | 'existing';

export interface BannerDoc {
  _id: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  style: BannerStyle;
  placement: BannerPlacement;
  /** empty = every role */
  roles: Role[];
  segment: BannerSegment;
  active: boolean;
  startAt?: number | null;
  endAt?: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface PublicBanner {
  id: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  style: BannerStyle;
  placement: BannerPlacement;
  roles: Role[];
  segment: BannerSegment;
  active: boolean;
  startAt?: number | null;
  endAt?: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export function toPublicBanner(d: BannerDoc): PublicBanner {
  const { _id, ...rest } = d;
  return { id: _id, ...rest };
}

export async function bannersCol() {
  return (await getDb()).collection<BannerDoc>('banners');
}

const DAY = 86_400_000;

export interface ViewerCtx {
  role: Role;
  createdAt: number;
  placement: BannerPlacement;
}

/**
 * Port of `bannersApi.ts`'s `matchesViewer()` — whether a banner should show
 * to a given viewer right now (active + scheduled + targeted).
 */
export function matchesViewer(b: BannerDoc, ctx: ViewerCtx, now = Date.now()): boolean {
  if (!b.active) return false;
  if (b.startAt && now < b.startAt) return false;
  if (b.endAt && now > b.endAt) return false;
  if (b.placement !== 'all' && b.placement !== ctx.placement) return false;
  if (b.roles.length > 0 && !b.roles.includes(ctx.role)) return false;
  if (b.segment !== 'all') {
    const isNew = ctx.createdAt >= now - 30 * DAY;
    if (b.segment === 'new' && !isNew) return false;
    if (b.segment === 'existing' && isNew) return false;
  }
  return true;
}
