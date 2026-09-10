import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { bannersCol, toPublicBanner } from '../_lib.js';

/**
 * Port of `bannersApi.ts`'s `saveBanner()` (as a full-replace PUT, scoped to
 * an existing id) and `deleteBanner()`. GET (single) is a convenience
 * addition alongside `listBanners()`.
 */
const UpdateBody = z.object({
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
    methodGuard(req, 'GET', 'PUT', 'DELETE');
    const user = await requireUser(req);
    requireActive(user);

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) throw new HttpError(400, 'Missing banner id');
    const col = await bannersCol();

    if (req.method === 'DELETE') {
      requirePermission(user, 'flags.manage');
      await col.deleteOne({ _id: id });
      res.status(204).end();
      return;
    }

    if (req.method === 'PUT') {
      requirePermission(user, 'flags.manage');
      const existing = await col.findOne({ _id: id });
      if (!existing) throw new HttpError(404, 'Banner not found');
      const body = UpdateBody.parse(req.body);
      const doc = { ...existing, ...body, _id: id, createdBy: existing.createdBy, createdAt: existing.createdAt, updatedAt: Date.now() };
      await col.replaceOne({ _id: id }, doc);
      res.status(200).json(toPublicBanner(doc));
      return;
    }

    const doc = await col.findOne({ _id: id });
    if (!doc) throw new HttpError(404, 'Banner not found');
    res.status(200).json(toPublicBanner(doc));
  } catch (e) {
    handleError(res, e);
  }
}
