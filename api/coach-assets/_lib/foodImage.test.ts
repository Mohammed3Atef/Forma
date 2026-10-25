import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertFoodImagesAllowed, foodImageProblem, type FoodImageRef } from './foodImage.js';
import type { FoodDataset } from '../../catalog/_lib/schemas.js';

/**
 * B4.1 — who may put which picture on a food. A coach's own uploads (their `foods` folder) or an
 * approved catalog picture of THAT catalog food; never another coach's photo, never a client's
 * private media (progress photos and attachments share the CDN host), never a path that escapes
 * the folder. Checked wherever a food is saved: library foods, food groups, templates, plans.
 */
const CDN = 'https://media.forma.test';
const CAT = 'https://catalog.forma.test';
const foods = JSON.parse(readFileSync('data/catalog/foods.json', 'utf8')) as FoodDataset;
const pictured = foods.items.find((f) => f.images.length)!;
const other = foods.items.find((f) => f.images.length && f.id !== pictured.id)!;
const env = { BUNNY_CDN_URL: process.env.BUNNY_CDN_URL, FORMA_CATALOG_MEDIA_URL: process.env.FORMA_CATALOG_MEDIA_URL };
beforeEach(() => {
  process.env.BUNNY_CDN_URL = CDN;
  process.env.FORMA_CATALOG_MEDIA_URL = CAT;
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const upload = (coach: string, file = 'abc.webp'): FoodImageRef => ({ source: 'upload', url: `${CDN}/Forma/${coach}/foods/${file}`, thumbUrl: `${CDN}/Forma/${coach}/foods/t-${file}`, rev: 1, uploadedAt: 1 });
const catalog = (foodId: string, of = pictured): FoodImageRef => ({ source: 'forma-catalog', catalogFoodId: foodId, url: `${CAT}/${of.images[0].variants.card.cdnPath}`, thumbUrl: `${CAT}/${of.images[0].variants.thumb.cdnPath}`, rev: 1, uploadedAt: 1 });

describe('food picture ownership', () => {
  it('a coach may use their own uploads; not another coach’s; not a client’s private media; no path escape', () => {
    expect(foodImageProblem(upload('coach-a'), 'coach-a')).toBeNull();
    expect(foodImageProblem(upload('coach-b'), 'coach-a')).toMatch(/your own uploads/);
    const progress: FoodImageRef = { source: 'upload', url: `${CDN}/Forma/client-1/progress1.jpg`, thumbUrl: `${CDN}/Forma/client-1/progress1.jpg`, rev: 1, uploadedAt: 1 };
    expect(foodImageProblem(progress, 'coach-a')).toMatch(/your own uploads/);
    expect(foodImageProblem(upload('coach-a', '../../client-1/progress1.jpg'), 'coach-a')).toMatch(/your own uploads/);
    expect(foodImageProblem({ ...upload('coach-a'), url: 'https://evil.example/Forma/coach-a/foods/x.webp' }, 'coach-a')).toMatch(/your own uploads/);
  });

  it('a catalog picture only for its own catalog food, and only once the catalog CDN is set', () => {
    expect(foodImageProblem(catalog(pictured.id), null)).toBeNull();
    expect(foodImageProblem(catalog(pictured.id, other), null)).toMatch(/not available/); // another food's picture
    delete process.env.FORMA_CATALOG_MEDIA_URL;
    expect(foodImageProblem(catalog(pictured.id), null)).toMatch(/not available/);
  });

  it('every picture in a saved body is checked — plan meals, items and their approved alternatives', () => {
    const plan = { meals: [{ id: 'm1', items: [{ id: 'i1', image: upload('coach-a'), allowedAlternatives: [{ id: 'alt', image: upload('coach-b') }] }] }] };
    expect(() => assertFoodImagesAllowed(plan, 'coach-a')).toThrow(/your own uploads/);
    plan.meals[0].items[0].allowedAlternatives[0].image = catalog(pictured.id);
    expect(() => assertFoodImagesAllowed(plan, 'coach-a')).not.toThrow();
    expect(() => assertFoodImagesAllowed({ image: { source: 'upload', url: 'javascript:alert(1)' } }, 'coach-a')).toThrow(/Invalid food photo/);
  });

  it('a picture the stored document already holds stays editable; only new pictures must pass', () => {
    const transferred = { meals: [{ id: 'm1', items: [{ id: 'i1', image: upload('coach-a') }] }] };
    // Coach B now edits the plan coach A built: A's photo may stay, B may not add another of A's.
    expect(() => assertFoodImagesAllowed(transferred, 'coach-b', transferred)).not.toThrow();
    const added = { meals: [{ id: 'm1', items: [{ id: 'i1', image: upload('coach-a') }, { id: 'i2', image: upload('coach-a', 'other.webp') }] }] };
    expect(() => assertFoodImagesAllowed(added, 'coach-b', transferred)).toThrow(/your own uploads/);
    // A catalog picture withdrawn after the plan was saved does not lock the plan.
    const withCatalog = { image: catalog(pictured.id) };
    delete process.env.FORMA_CATALOG_MEDIA_URL;
    expect(() => assertFoodImagesAllowed(withCatalog, 'coach-a', withCatalog)).not.toThrow();
    expect(() => assertFoodImagesAllowed(withCatalog, 'coach-a')).toThrow(/not available/);
  });

  it('B4.2: a catalog picture may also be Wikimedia’s own renditions of that same file (no CDN needed) — still only for its own food', () => {
    delete process.env.FORMA_CATALOG_MEDIA_URL;
    const r = pictured.images[0].remote!;
    expect(r).toBeTruthy();
    const remote: FoodImageRef = { source: 'forma-catalog', catalogFoodId: pictured.id, url: r.cardUrl, thumbUrl: r.thumbUrl, rev: 1, uploadedAt: 1 };
    expect(foodImageProblem(remote, 'coach-a')).toBeNull();
    expect(foodImageProblem({ ...remote, catalogFoodId: other.id }, 'coach-a')).toMatch(/not available/);
    expect(foodImageProblem({ ...remote, url: 'https://upload.wikimedia.org/wikipedia/commons/x/xy/Other.jpg' }, 'coach-a')).toMatch(/not available/);
  });

  it('B4.2: a coach’s own picture link is any public https image — never Forma’s storage, never javascript:', () => {
    const link = (url: string): FoodImageRef => ({ source: 'url', url, thumbUrl: url, rev: 1, uploadedAt: 1 });
    expect(foodImageProblem(link('https://images.example.com/koshary.jpg'), 'coach-a')).toBeNull();
    expect(foodImageProblem(link(`${CDN}/Forma/client-1/progress1.jpg`), 'coach-a')).toMatch(/your own uploads/);
    expect(foodImageProblem(link(`${CDN}/Forma/coach-b/foods/x.webp`), 'coach-a')).toMatch(/your own uploads/);
    expect(() => assertFoodImagesAllowed({ image: link('javascript:alert(1)') }, 'coach-a')).toThrow(/Invalid food photo/);
  });
});
