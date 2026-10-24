import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { TRPCError } from '@trpc/server';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { catalogEnabled } from '../../catalog/_lib/dataset.js';

/**
 * B4 — the read-only catalog API over the committed datasets: the production switch, search in
 * English / Arabic / Egyptian Arabic, filters, page caps (no session downloads the catalog), and
 * the error contract. No database is involved.
 */
const user = (role: AuthedUser['role'] = 'coach', accountStatus: AuthedUser['accountStatus'] = 'active'): AuthedUser => ({ id: `u-${role}`, role, accountStatus, permissions: [], doc: {} as AuthedUser['doc'] });
const caller = (u: AuthedUser | null = user()) => appRouter.createCaller({ req: { headers: {} } as unknown as VercelRequest, res: {} as VercelResponse, user: u } as Context);

const ENV = ['FORMA_CATALOG', 'VERCEL_ENV'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  delete process.env.FORMA_CATALOG;
  delete process.env.VERCEL_ENV;
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('the production switch (B4 approval gate)', () => {
  it('off in production unless FORMA_CATALOG=on; on elsewhere unless FORMA_CATALOG=off', () => {
    expect(catalogEnabled({ VERCEL_ENV: 'production' })).toBe(false);
    expect(catalogEnabled({ VERCEL_ENV: 'production', FORMA_CATALOG: 'on' })).toBe(true);
    expect(catalogEnabled({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(catalogEnabled({})).toBe(true);
    expect(catalogEnabled({ FORMA_CATALOG: 'off' })).toBe(false);
  });

  it('switched off: meta says so and every read is refused with CATALOG_DISABLED', async () => {
    process.env.VERCEL_ENV = 'production';
    expect(await caller().catalog.meta()).toEqual({ enabled: false });
    const err = (await caller().catalog.foods.search({ q: 'rice' }).catch((e) => e)) as TRPCError & { cause?: { reason?: string } };
    expect(err.code).toBe('PRECONDITION_FAILED');
    expect(err.cause?.reason).toBe('CATALOG_DISABLED');
  });
});

describe('exercises', () => {
  it('meta: versions, counts and the bilingual vocabulary', async () => {
    const m = await caller().catalog.meta();
    if (!m.enabled) throw new Error('expected enabled');
    expect(m.exercises.count).toBeGreaterThan(10);
    expect(m.taxonomy.muscles.chest).toEqual({ en: 'Chest', ar: 'الصدر' });
  });

  it('English, Arabic and Egyptian Arabic find the same exercise; a typo still does', async () => {
    const first = async (q: string) => (await caller().catalog.exercises.search({ q })).items[0]?.id;
    expect(await first('bench press')).toBe('fx_barbell_bench_press');
    expect(await first('ضغط البار على البنش المستوي')).toBe('fx_barbell_bench_press');
    expect(await first('بنش مستوي')).toBe('fx_barbell_bench_press');
    expect(await first('bnech press')).toBe('fx_barbell_bench_press');
    expect(await first('incline db press')).toBe('fx_incline_dumbbell_press');
    expect(await first('بنش عالي دمبل')).toBe('fx_incline_dumbbell_press');
  });

  it('filters by muscle / equipment / video, and cards are light (no instructions)', async () => {
    const r = await caller().catalog.exercises.search({ q: '', equipment: 'dumbbell', limit: 50 });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((c) => c.equipment.includes('dumbbell'))).toBe(true);
    expect(r.items[0]).not.toHaveProperty('instructions');
    const v = await caller().catalog.exercises.search({ q: '', video: true, limit: 50 });
    expect(v.items.every((c) => c.media === 'video')).toBe(true);
    expect(JSON.stringify(r).length / r.items.length).toBeLessThan(800); // bytes per card
  });

  it('pages are capped at 50; get returns the full item; unknown ids are NOT_FOUND / absent', async () => {
    await expect(caller().catalog.exercises.search({ q: '', limit: 500 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const e = await caller().catalog.exercises.get({ id: 'fx_barbell_bench_press' });
    expect(e.instructions.ar.steps.length).toBeGreaterThan(1);
    await expect(caller().catalog.exercises.get({ id: 'fx_nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await caller().catalog.exercises.byIds({ ids: ['fx_barbell_bench_press', 'fx_nope'] })).map((c) => c.id)).toEqual(['fx_barbell_bench_press']);
  });
});

describe('foods', () => {
  it('Egyptian names find Egyptian foods, verified records first', async () => {
    const ids = async (q: string) => (await caller().catalog.foods.search({ q, limit: 5 })).items.map((f) => f.id);
    expect((await ids('رز'))[0]).toMatch(/^ff_rice_white/);
    expect(await ids('عيش بلدي')).toContain('ff_baladi_bread');
    expect((await ids('طعمية'))[0]).toBe('ff_taameya');
    expect((await ids('كشري'))[0]).toBe('ff_koshary');
    expect((await ids('chicken breast'))[0]).toMatch(/^ff_chicken_breast/);
    expect((await ids('eggs'))[0]).toMatch(/^ff_egg/);
  });

  it('a card carries per-100 g values, portions and the estimate note — enough to add a serving without another request', async () => {
    const [baladi] = (await caller().catalog.foods.search({ q: 'عيش بلدي', limit: 1 })).items;
    expect(baladi.verification).toBe('proxy-estimate');
    expect(baladi.matchNote?.ar).toMatch(/[؀-ۿ]/);
    expect(baladi.recipeNote).toBeNull();
    const [koshary] = (await caller().catalog.foods.search({ q: 'كشري', limit: 1 })).items;
    expect(koshary).toMatchObject({ id: 'ff_koshary', verification: 'recipe-estimate', matchNote: null });
    expect(koshary.recipeNote?.en).toMatch(/plate/i);
    const [rice] = (await caller().catalog.foods.search({ q: 'long grain rice cooked', limit: 1 })).items;
    expect(rice.per100g.kcal).toBe(130);
    expect(rice.portions.find((p) => p.id === 'cup')?.grams).toBe(158);
  });

  it('filters by category', async () => {
    const r = await caller().catalog.foods.search({ q: '', category: 'cheese', limit: 50 });
    expect(r.items.length).toBeGreaterThan(5);
    expect(r.items.every((f) => f.category === 'cheese')).toBe(true);
  });
});

describe('access', () => {
  it('requires an active account', async () => {
    await expect(caller(null).catalog.meta()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller(user('coach', 'suspended')).catalog.exercises.search({ q: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('clients can search foods (custom food entry)', async () => {
    const r = await caller(user('client')).catalog.foods.search({ q: 'banana', limit: 1 });
    expect(r.items[0]?.id).toBe('ff_banana');
  });
});
