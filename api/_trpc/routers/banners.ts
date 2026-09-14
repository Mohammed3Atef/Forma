import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, permissionProcedure } from '../trpc.js';
import { bannersCol, matchesViewer, toPublicBanner } from '../../banners/_lib.js';
import type { BannerDoc, BannerPlacement } from '../../banners/_lib.js';

/**
 * tRPC port of `api/banners/_handlers/{index,detail,for-viewer}.ts`. Business
 * logic (Mongo access, `matchesViewer`) is unchanged, reused verbatim from
 * `../../banners/_lib.js` — only the request/response plumbing moves from
 * manual req/res handling to procedures.
 */
const BannerFields = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional(),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaHref: z.string().trim().max(2000).optional(),
  style: z.enum(['info', 'success', 'warning', 'promo']),
  placement: z.enum(['all', 'client_home', 'coach_dashboard']),
  roles: z.array(z.enum(['super_admin', 'admin', 'coach', 'client'])).default([]),
  segment: z.enum(['all', 'new', 'existing']),
  active: z.boolean(),
  startAt: z.number().nullable().optional(),
  endAt: z.number().nullable().optional(),
});

const PLACEMENTS: BannerPlacement[] = ['all', 'client_home', 'coach_dashboard'];

export const bannersRouter = router({
  /** Any signed-in active user (targeting/scheduling filter is client-side, not a security boundary). */
  list: protectedProcedure.query(async () => {
    const col = await bannersCol();
    const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
    return docs.map(toPublicBanner);
  }),

  forViewer: protectedProcedure
    .input(z.object({ placement: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const placement = (PLACEMENTS.includes(input.placement as BannerPlacement) ? input.placement : 'all') as BannerPlacement;
      const col = await bannersCol();
      const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
      const viewerCtx = { role: ctx.user.role, createdAt: ctx.user.doc.createdAt, placement };
      return docs.filter((d) => matchesViewer(d, viewerCtx)).map(toPublicBanner);
    }),

  create: permissionProcedure('flags.manage')
    .input(BannerFields)
    .mutation(async ({ ctx, input }) => {
      const col = await bannersCol();
      const now = Date.now();
      const doc = { _id: crypto.randomUUID(), ...input, createdBy: ctx.user.id, createdAt: now, updatedAt: now } as BannerDoc;
      await col.insertOne(doc);
      return toPublicBanner(doc);
    }),

  /** Full-replace update, matching `bannersApi.ts`'s `saveBanner()` PUT semantics — NOT_FOUND lets the caller fall back to `create`. */
  update: permissionProcedure('flags.manage')
    .input(z.object({ id: z.string().min(1) }).merge(BannerFields))
    .mutation(async ({ input }) => {
      const { id, ...fields } = input;
      const col = await bannersCol();
      const existing = await col.findOne({ _id: id });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Banner not found' });
      const doc = { ...existing, ...fields, _id: id, createdBy: existing.createdBy, createdAt: existing.createdAt, updatedAt: Date.now() };
      await col.replaceOne({ _id: id }, doc);
      return toPublicBanner(doc);
    }),

  delete: permissionProcedure('flags.manage')
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const col = await bannersCol();
      await col.deleteOne({ _id: input.id });
    }),
});
