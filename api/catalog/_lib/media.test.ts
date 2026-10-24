import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../../_trpc/router.js';
import type { AuthedUser, Context } from '../../_trpc/context.js';
import { catalogMediaBase, indexDatasets, servedMedia, setCatalogForTests } from './dataset.js';
import { MediaSchema, type CatalogExercise, type CatalogMedia, type ExerciseDataset, type FoodDataset } from './schemas.js';

/**
 * B4.1 — the demonstration model and what a reader may see. Several demonstrations per exercise
 * (primary first); a file is served only when its rights are verified, a person approved it and it is
 * published; a Forma-hosted copy only once Forma's public catalog CDN is configured
 * (`FORMA_CATALOG_MEDIA_URL`) — before that, nothing points at a file that is not uploaded.
 */
const exercises = JSON.parse(readFileSync('data/catalog/exercises.json', 'utf8')) as ExerciseDataset;
const foods = JSON.parse(readFileSync('data/catalog/foods.json', 'utf8')) as FoodDataset;
const bench = exercises.items.find((e) => e.id === 'fx_barbell_bench_press')!;

const base = { license: 'CC-BY-SA-4.0', author: 'Goulart', sourcePage: 'https://wger.de/en/exercise/73/view/', source: { provider: 'wger', id: '1' }, verified: 'visual', rights: 'verified', review: 'approved', publication: 'published' } as const;
const image: CatalogMedia = { ...base, id: 'img_t_1', kind: 'image', url: 'https://wger.de/a.png', hosting: 'source', role: 'primary', format: 'png', mime: 'image/png', license: 'CC-BY-SA-3.0', author: 'Everkinetic' };
const sourceVideo: CatalogMedia = { ...base, id: 'vid_t_1', kind: 'video', url: 'https://wger.de/v1.MP4', hosting: 'source', role: 'alternate', format: 'mp4', mime: 'video/mp4', codec: 'h264', width: 1920, height: 1080 };
const cdnVideo: CatalogMedia = {
  ...base,
  id: 'vid_t_2',
  kind: 'video',
  url: 'https://wger.de/v2.MOV',
  hosting: 'forma-cdn',
  cdnPath: 'catalog/exercises/fx_barbell_bench_press/vid-2.mp4',
  role: 'primary',
  label: { en: 'Side view', ar: 'من الجانب' },
  format: 'mp4',
  mime: 'video/mp4',
  codec: 'h264',
  width: 1280,
  height: 720,
  durationSec: 12.3,
  poster: { cdnPath: 'catalog/exercises/fx_barbell_bench_press/vid-2-poster.webp', width: 640, height: 360, bytes: 21000 },
};
const pending: CatalogMedia = { ...cdnVideo, id: 'vid_t_3', role: 'alternate', cdnPath: 'catalog/exercises/fx_barbell_bench_press/vid-3.mp4', review: 'pending', publication: 'unpublished', verified: 'source-link' };
const withMedia = (media: CatalogMedia[]): CatalogExercise => ({ ...bench, media });

describe('demonstration model (schema)', () => {
  it('accepts the full model and refuses what must never be served', () => {
    for (const m of [image, sourceVideo, cdnVideo, pending]) expect(MediaSchema.safeParse(m).success, m.id).toBe(true);
    expect(MediaSchema.safeParse({ ...cdnVideo, codec: undefined }).success).toBe(false); // a video is H.264 MP4
    expect(MediaSchema.safeParse({ ...cdnVideo, cdnPath: undefined }).success).toBe(false); // Forma-hosted needs its path
    expect(MediaSchema.safeParse({ ...pending, publication: 'published' }).success).toBe(false); // unreviewed is never published
    expect(MediaSchema.safeParse({ ...cdnVideo, rights: 'pending' }).success).toBe(false); // unverified rights are never published
  });
});

describe('servedMedia', () => {
  it('without the catalog CDN: only files served from their source; unreviewed never', () => {
    const served = servedMedia(withMedia([image, cdnVideo, pending, sourceVideo]), null);
    expect(served.map((m) => m.id)).toEqual(['vid_t_1', 'img_t_1']);
    expect(served.every((m) => m.posterUrl === null)).toBe(true);
  });

  it('with the catalog CDN: Forma-hosted copies appear on the CDN, the primary first; the unreviewed one still never', () => {
    const served = servedMedia(withMedia([image, sourceVideo, cdnVideo, pending]), 'https://cdn.forma.test');
    expect(served.map((m) => m.id)).toEqual(['vid_t_2', 'vid_t_1', 'img_t_1']);
    expect(served[0]).toMatchObject({ url: 'https://cdn.forma.test/catalog/exercises/fx_barbell_bench_press/vid-2.mp4', posterUrl: 'https://cdn.forma.test/catalog/exercises/fx_barbell_bench_press/vid-2-poster.webp', label: { en: 'Side view' } });
  });

  it('the CDN setting accepts https (and loopback http for the test stack) only', () => {
    expect(catalogMediaBase({ FORMA_CATALOG_MEDIA_URL: 'https://catalog.forma.test/' })).toBe('https://catalog.forma.test');
    expect(catalogMediaBase({ FORMA_CATALOG_MEDIA_URL: 'http://127.0.0.1:5299/cdn' })).toBe('http://127.0.0.1:5299/cdn');
    expect(catalogMediaBase({ FORMA_CATALOG_MEDIA_URL: 'http://evil.example' })).toBeNull();
    expect(catalogMediaBase({ FORMA_CATALOG_MEDIA_URL: 'not a url' })).toBeNull();
    expect(catalogMediaBase({})).toBeNull();
  });
});

describe('catalog API serves only the servable media (B4.1)', () => {
  const user: AuthedUser = { id: 'u-coach', role: 'coach', accountStatus: 'active', permissions: [], doc: {} as AuthedUser['doc'] };
  const caller = () => appRouter.createCaller({ req: { headers: {} } as unknown as VercelRequest, res: {} as VercelResponse, user } as Context);
  const saved = process.env.FORMA_CATALOG_MEDIA_URL;
  afterEach(() => {
    setCatalogForTests(null);
    if (saved === undefined) delete process.env.FORMA_CATALOG_MEDIA_URL;
    else process.env.FORMA_CATALOG_MEDIA_URL = saved;
  });
  const install = () => setCatalogForTests(indexDatasets({ ...exercises, items: exercises.items.map((e) => (e.id === bench.id ? withMedia([cdnVideo, pending]) : e)) }, foods));

  it('a Forma-hosted demo is invisible until the CDN is configured — no card claims a video it cannot play', async () => {
    install();
    delete process.env.FORMA_CATALOG_MEDIA_URL;
    const card = (await caller().catalog.exercises.search({ q: 'barbell bench press', limit: 1 })).items[0];
    expect(card).toMatchObject({ id: bench.id, media: 'none', videoCount: 0, thumb: null });
    expect((await caller().catalog.exercises.get({ id: bench.id })).media).toEqual([]);
    expect((await caller().catalog.exercises.search({ q: 'bench press', video: true, limit: 50 })).items.map((i) => i.id)).not.toContain(bench.id);
  });

  it('once configured: the card shows the poster and the count; the full item carries CDN urls and never the pending file', async () => {
    install();
    process.env.FORMA_CATALOG_MEDIA_URL = 'https://cdn.forma.test';
    const card = (await caller().catalog.exercises.search({ q: 'barbell bench press', limit: 1 })).items[0];
    expect(card).toMatchObject({ media: 'video', videoCount: 1, thumb: { url: 'https://cdn.forma.test/catalog/exercises/fx_barbell_bench_press/vid-2-poster.webp', author: 'Goulart' } });
    const full = await caller().catalog.exercises.get({ id: bench.id });
    expect(full.media.map((m) => [m.id, m.url])).toEqual([['vid_t_2', 'https://cdn.forma.test/catalog/exercises/fx_barbell_bench_press/vid-2.mp4']]);
  });
});

describe('food pictures are served like demonstrations (B4.1)', () => {
  const user: AuthedUser = { id: 'u-coach', role: 'coach', accountStatus: 'active', permissions: [], doc: {} as AuthedUser['doc'] };
  const caller = () => appRouter.createCaller({ req: { headers: {} } as unknown as VercelRequest, res: {} as VercelResponse, user } as Context);
  const saved = process.env.FORMA_CATALOG_MEDIA_URL;
  afterEach(() => {
    setCatalogForTests(null);
    if (saved === undefined) delete process.env.FORMA_CATALOG_MEDIA_URL;
    else process.env.FORMA_CATALOG_MEDIA_URL = saved;
  });

  it('no picture until the catalog CDN is configured; then the light variants with the credit, never the image records', async () => {
    const withPicture = foods.items.find((f) => f.images.length)!;
    delete process.env.FORMA_CATALOG_MEDIA_URL;
    expect((await caller().catalog.foods.search({ q: withPicture.name.en, limit: 5 })).items.find((c) => c.id === withPicture.id)?.image).toBeNull();
    process.env.FORMA_CATALOG_MEDIA_URL = 'https://cdn.forma.test';
    const card = (await caller().catalog.foods.search({ q: withPicture.name.en, limit: 5 })).items.find((c) => c.id === withPicture.id)!;
    const i = withPicture.images[0];
    expect(card.image).toMatchObject({ thumbUrl: `https://cdn.forma.test/${i.variants.thumb.cdnPath}`, cardUrl: `https://cdn.forma.test/${i.variants.card.cdnPath}`, author: i.author, license: i.license, alt: i.alt });
    const full = await caller().catalog.foods.get({ id: withPicture.id });
    expect(full).not.toHaveProperty('images');
    expect(full.image?.cardUrl).toBe(card.image?.cardUrl);
  });

  it('a food with no approved picture has none — never another food’s', async () => {
    process.env.FORMA_CATALOG_MEDIA_URL = 'https://cdn.forma.test';
    const without = foods.items.find((f) => !f.images.length)!;
    expect((await caller().catalog.foods.get({ id: without.id })).image).toBeNull();
  });
});
