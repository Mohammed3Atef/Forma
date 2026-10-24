import type { Collection, Document } from 'mongodb';
import { listAllImages, type CdnImage } from '../../media/_lib/bunny.js';
import { clientNutritionPlansCol, planVersionsCol } from '../../client/_lib/db.js';
import { coachFoodGroupsCol, coachFoodsCol, coachNutritionTemplatesCol } from './db.js';

/**
 * B4.1 — coach food photos that nothing shows any more. A replaced or removed photo is KEPT while a
 * plan, a plan version, a template or a swap group still holds it (history stays stable); a file is
 * an orphan only when no stored document references it AND it is older than the grace period (a
 * form left open, an unsaved editor draft on a device, may still save it). REPORT ONLY: nothing here
 * deletes a file — removal is an owner-approved storage operation.
 */
export const FOOD_IMAGE_ORPHAN_GRACE_MS = 14 * 86_400_000;

const FOODS_PATH = /^Forma\/[^/]+\/foods\/[^/]+$/;

/** Every `Forma/<coachId>/foods/<file>` path referenced (as a CDN URL) anywhere in `docs`. */
export function collectFoodImagePaths(docs: Iterable<unknown>, cdnBase: string, into = new Set<string>()): Set<string> {
  const prefix = `${cdnBase.replace(/\/+$/, '')}/`;
  const walk = (v: unknown, depth: number) => {
    if (depth > 16 || v == null) return;
    if (typeof v === 'string') {
      if (v.startsWith(prefix)) {
        const rel = v.slice(prefix.length).split(/[?#]/)[0];
        if (FOODS_PATH.test(rel)) into.add(rel);
      }
      return;
    }
    if (typeof v !== 'object') return;
    for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  for (const d of docs) walk(d, 0);
  return into;
}

export interface FoodImageOrphan {
  path: string;
  coachId: string;
  size: number;
  lastChanged: string | null;
}

/** The stored food photos no document references, older than the grace period. */
export function foodImageOrphans(files: Pick<CdnImage, 'path' | 'size' | 'lastChanged'>[], referenced: Set<string>, now: number, graceMs = FOOD_IMAGE_ORPHAN_GRACE_MS): FoodImageOrphan[] {
  return files
    .filter((f) => FOODS_PATH.test(f.path) && !referenced.has(f.path))
    .filter((f) => {
      const at = f.lastChanged ? Date.parse(f.lastChanged) : NaN;
      return Number.isFinite(at) && now - at > graceMs; // unknown age → never reported
    })
    .map((f) => ({ path: f.path, coachId: f.path.split('/')[1], size: f.size, lastChanged: f.lastChanged ?? null }));
}

async function scan(col: Collection<Document>, filter: Document, cdnBase: string, into: Set<string>) {
  for await (const doc of col.find(filter)) collectFoodImagePaths([doc], cdnBase, into);
}

/** Lists the storage zone and every document that may hold a food photo; returns the report. */
export async function findFoodImageOrphans(cdnBase: string, now = Date.now()) {
  const files = (await listAllImages()).filter((f) => FOODS_PATH.test(f.path));
  const referenced = new Set<string>();
  const cols = (c: unknown) => c as Collection<Document>;
  await scan(cols(await coachFoodsCol()), {}, cdnBase, referenced);
  await scan(cols(await coachFoodGroupsCol()), {}, cdnBase, referenced);
  await scan(cols(await coachNutritionTemplatesCol()), {}, cdnBase, referenced);
  await scan(cols(await clientNutritionPlansCol()), {}, cdnBase, referenced);
  await scan(cols(await planVersionsCol()), { kind: 'nutrition' }, cdnBase, referenced);
  const orphans = foodImageOrphans(files, referenced, now);
  return { files: files.length, referenced: referenced.size, graceDays: FOOD_IMAGE_ORPHAN_GRACE_MS / 86_400_000, orphans, orphanBytes: orphans.reduce((n, o) => n + o.size, 0) };
}
