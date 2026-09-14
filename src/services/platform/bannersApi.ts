import { trpc, TRPCClientError } from '@/services/trpc';
import type { Role } from '@/types';

export type BannerStyle = 'info' | 'success' | 'warning' | 'promo';
export type BannerPlacement = 'all' | 'client_home' | 'coach_dashboard';
export type BannerSegment = 'all' | 'new' | 'existing';

/** A targeted marketing banner/offer, at `banners/{id}`. Managed by admins; read
 * by any signed-in user (targeting/scheduling filter server-side — not a security
 * boundary). */
export interface Banner {
  id: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  style: BannerStyle;
  placement: BannerPlacement;
  roles: Role[]; // empty = every role
  segment: BannerSegment;
  active: boolean;
  startAt?: number | null;
  endAt?: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

const DAY = 86_400_000;

export async function listBanners(): Promise<Banner[]> {
  return trpc.banners.list.query();
}

/** Fields the API accepts on create/update (server owns id/createdBy/createdAt/updatedAt). */
function toBody(b: Banner) {
  return {
    title: b.title,
    body: b.body,
    ctaLabel: b.ctaLabel,
    ctaHref: b.ctaHref,
    style: b.style,
    placement: b.placement,
    roles: b.roles,
    segment: b.segment,
    active: b.active,
    startAt: b.startAt,
    endAt: b.endAt,
  };
}

/**
 * Upserts a banner by id, matching the Firestore-era `setDoc` create-or-replace
 * semantics: tries updating the existing banner first, and falls back to
 * creating it when it doesn't exist yet (the API assigns the real id for
 * brand-new banners — callers should rely on the next list refresh rather than
 * the id on the object passed in here).
 */
export async function saveBanner(b: Banner): Promise<void> {
  try {
    await trpc.banners.update.mutate({ id: b.id, ...toBody(b) });
  } catch (e) {
    if (e instanceof TRPCClientError && e.data?.code === 'NOT_FOUND') {
      await trpc.banners.create.mutate(toBody(b));
      return;
    }
    throw e;
  }
}

export async function deleteBanner(id: string): Promise<void> {
  await trpc.banners.delete.mutate({ id });
}

export interface ViewerCtx {
  role: Role;
  createdAt: number;
  placement: BannerPlacement;
}

/** Whether a banner should show to a given viewer right now (active + scheduled + targeted). */
export function matchesViewer(b: Banner, ctx: ViewerCtx, now = Date.now()): boolean {
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

/**
 * Banners visible to the calling (signed-in) user right now. Role/join-date/
 * placement matching happens server-side against the caller's own session —
 * `ctx.role`/`ctx.createdAt` are expected to already be that same user's
 * values (as every current caller passes), so only `placement` is sent.
 */
export async function fetchBannersForViewer(ctx: ViewerCtx): Promise<Banner[]> {
  return trpc.banners.forViewer.query({ placement: ctx.placement });
}
