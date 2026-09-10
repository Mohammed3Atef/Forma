import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth.js';
import { handleError, methodGuard } from '../../_lib/http.js';
import { bannersCol, toPublicBanner } from '../_lib.js';
import type { BannerDoc } from '../_lib.js';

/**
 * Port of `src/services/platform/bannersApi.ts`. GET (`listBanners`): any
 * signed-in user (targeting/scheduling filter is client-side, not a security
 * boundary — per firestore.rules `banners` read: `isSignedIn()`). POST
 * (create, part of `saveBanner`): requires `flags.manage`.
 */
const CreateBody = z.object({
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST');
    const user = await requireUser(req);
    requireActive(user);
    const col = await bannersCol();

    if (req.method === 'POST') {
      requirePermission(user, 'flags.manage');
      const body = CreateBody.parse(req.body);
      const now = Date.now();
      const doc = { _id: crypto.randomUUID(), ...body, createdBy: user.id, createdAt: now, updatedAt: now } as BannerDoc;
      await col.insertOne(doc);
      res.status(201).json(toPublicBanner(doc));
      return;
    }

    const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
    res.status(200).json(docs.map(toPublicBanner));
  } catch (e) {
    handleError(res, e);
  }
}
