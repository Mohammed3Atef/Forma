import { describe, expect, it } from 'vitest';
import { collectFoodImagePaths, FOOD_IMAGE_ORPHAN_GRACE_MS, foodImageOrphans } from './foodImageOrphans.js';

/**
 * B4.1 — which coach food photos nothing shows any more. A photo still held by a library food, a
 * swap group, a template, a plan or an earlier plan version is never an orphan; neither is a recent
 * upload (an open form or a device draft may still save it). Report only.
 */
const CDN = 'https://media.forma.test';
const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 24);
const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

describe('food photo orphans', () => {
  it('collects every referenced food photo — library foods, group foods, plan meals, alternatives, versions', () => {
    const refs = collectFoodImagePaths(
      [
        { id: 'f1', image: { source: 'upload', url: `${CDN}/Forma/c1/foods/a.webp`, thumbUrl: `${CDN}/Forma/c1/foods/a-t.webp` } },
        { foods: [{ image: { url: `${CDN}/Forma/c1/foods/b.webp?v=2`, thumbUrl: `${CDN}/Forma/c1/foods/b-t.webp` } }] },
        { snapshot: { meals: [{ items: [{ allowedAlternatives: [{ image: { url: `${CDN}/Forma/c2/foods/c.webp`, thumbUrl: `${CDN}/Forma/c2/foods/c-t.webp` } }] }] }] } },
        // Not food photos: a progress photo, a catalog picture, another host.
        { photo: `${CDN}/Forma/client-1/progress.jpg`, image: { url: 'https://catalog.forma.test/catalog/foods/ff_rice/r1-card.webp' } },
        { url: 'https://evil.example/Forma/c1/foods/x.webp' },
      ],
      CDN,
    );
    expect([...refs].sort()).toEqual(['Forma/c1/foods/a-t.webp', 'Forma/c1/foods/a.webp', 'Forma/c1/foods/b-t.webp', 'Forma/c1/foods/b.webp', 'Forma/c2/foods/c-t.webp', 'Forma/c2/foods/c.webp']);
  });

  it('an unreferenced photo older than the grace period is reported; referenced, recent, undated or non-food files never are', () => {
    const files = [
      { path: 'Forma/c1/foods/a.webp', size: 10, lastChanged: at(90) }, // still in a plan
      { path: 'Forma/c1/foods/old.webp', size: 20, lastChanged: at(30) }, // orphan
      { path: 'Forma/c1/foods/new.webp', size: 30, lastChanged: at(2) }, // a form may still save it
      { path: 'Forma/c1/foods/nodate.webp', size: 40 },
      { path: 'Forma/client-1/progress.jpg', size: 50, lastChanged: at(400) }, // not a food photo
    ];
    const out = foodImageOrphans(files, new Set(['Forma/c1/foods/a.webp']), now);
    expect(out).toEqual([{ path: 'Forma/c1/foods/old.webp', coachId: 'c1', size: 20, lastChanged: at(30) }]);
    expect(FOOD_IMAGE_ORPHAN_GRACE_MS).toBe(14 * DAY);
  });
});
