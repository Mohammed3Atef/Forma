import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { catalogMediaBase, loadCatalog } from '../../catalog/_lib/dataset.js';

/**
 * B4.1 — the picture of a food, as a coach's library food or a plan item carries it. Always a COPY
 * (url + small thumbnail + who made it): a plan keeps the picture it was built with, whatever
 * happens to the library food or the catalog later. Two kinds only:
 *  - `upload`        the coach's own photo, sanitized and stored under THAT coach's `foods` folder
 *                    (`/api/media/upload?category=food` — EXIF stripped, type read from the bytes);
 *  - `forma-catalog` an approved Forma catalog image of THAT catalog food, on the public catalog CDN.
 * Anything else is refused on save — so no food can show another coach's photo, or a client's private
 * media (progress photos, message attachments live on the same CDN host).
 */
const imageUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => /^https:\/\/[^\s]+$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s]*$/i.test(v), { message: 'Image links must be https:// links' });

export const FoodImageRefSchema = z.object({
  source: z.enum(['upload', 'forma-catalog']),
  url: imageUrl,
  thumbUrl: imageUrl,
  width: z.number().int().positive().max(8192).optional(),
  height: z.number().int().positive().max(8192).optional(),
  alt: z.object({ en: z.string().max(200), ar: z.string().max(200) }).optional(),
  catalogFoodId: z.string().regex(/^ff_[a-z0-9_]+$/).optional(),
  author: z.string().max(200).optional(),
  license: z.string().max(40).optional(),
  sourcePage: z.string().max(500).optional(),
  /** Replacing a photo uploads a NEW file (new rev): the old one stays for the plans that show it. */
  rev: z.number().int().min(1),
  uploadedAt: z.number().int().positive(),
});
export type FoodImageRef = z.infer<typeof FoodImageRefSchema>;

/** The CDN host the coach uploads land on (the media zone's public address). */
function uploadBase(): string | null {
  const v = process.env.BUNNY_CDN_URL?.trim().replace(/\/+$/, '');
  return v || null;
}

/** Why a food picture may not be saved for `coachId`, or null when it may. */
export function foodImageProblem(image: FoodImageRef, coachId: string | null): string | null {
  const urls = [image.url, image.thumbUrl];
  if (image.source === 'upload') {
    const base = uploadBase();
    if (!base || !coachId) return 'Uploaded food photos are not available here';
    const folder = `${base}/Forma/${coachId}/foods/`;
    return urls.every((u) => u.startsWith(folder) && !u.slice(folder.length).includes('..')) ? null : 'A food photo must be one of your own uploads';
  }
  const base = catalogMediaBase();
  const food = image.catalogFoodId ? loadCatalog().foodById.get(image.catalogFoodId) : undefined;
  if (!base || !food) return 'This Forma food photo is not available';
  const allowed = new Set(
    (food.images ?? [])
      .filter((i) => i.publication === 'published' && i.rights === 'verified' && i.review !== 'pending')
      .flatMap((i) => [`${base}/${i.variants.card.cdnPath}`, `${base}/${i.variants.thumb.cdnPath}`]),
  );
  return urls.every((u) => allowed.has(u)) ? null : 'This Forma food photo is not available';
}

/** Every object carrying an `image` field anywhere in a body (meals, alternatives, group foods …). */
function eachImage(body: unknown, visit: (image: unknown) => void): void {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 12 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (o.image != null && typeof o.image === 'object' && !Array.isArray(o.image)) visit(o.image);
    for (const x of Object.values(o)) walk(x, depth + 1);
  };
  walk(body, 0);
}

const imageKey = (i: { url?: unknown; thumbUrl?: unknown }) => `${String(i.url)}|${String(i.thumbUrl)}`;

/**
 * Every food picture anywhere in a saved body (a library food, a food group's foods, a template's or
 * a plan's meals and their approved alternatives) — each checked for `coachId`. A picture the stored
 * document (`previous`) already holds is kept as it is: history stays editable after a catalog
 * picture is withdrawn, or after a transfer leaves the previous coach's photo in the client's plan —
 * only NEW pictures must pass.
 */
export function assertFoodImagesAllowed(body: unknown, coachId: string | null, previous?: unknown): void {
  const stored = new Set<string>();
  if (previous) eachImage(previous, (i) => stored.add(imageKey(i as Record<string, unknown>)));
  eachImage(body, (raw) => {
    const parsed = FoodImageRefSchema.safeParse(raw);
    if (!parsed.success) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid food photo' });
    if (stored.has(imageKey(parsed.data))) return;
    const problem = foodImageProblem(parsed.data, coachId);
    if (problem) throw new TRPCError({ code: 'BAD_REQUEST', message: problem });
  });
}
