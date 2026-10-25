import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';

/**
 * B4 — the read-only catalog API over the committed datasets: vocabulary, full items, food search
 * (clients log custom foods with it), page caps and the error contract. No database is involved.
 * B4.3: exercise SEARCH is the coach's unified library (`library.exercises.list` — library.test.ts).
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

describe('always on (B4.3 — the shared library; the B4 FORMA_CATALOG switch is retired)', () => {
  it('serves in production too, whatever FORMA_CATALOG says', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.FORMA_CATALOG = 'off';
    expect((await caller().catalog.meta()).exercises.count).toBeGreaterThan(1000);
    expect((await caller().catalog.foods.search({ q: 'rice' })).items.length).toBeGreaterThan(0);
  });
});

describe('exercises', () => {
  it('meta: versions, counts and the bilingual vocabulary', async () => {
    const m = await caller().catalog.meta();
    expect(m.exercises.count).toBeGreaterThan(10);
    expect(m.taxonomy.muscles.chest).toEqual({ en: 'Chest', ar: 'الصدر' });
  });

  it('get returns the full item; unknown ids are NOT_FOUND; full() takes at most 30 ids', async () => {
    const e = await caller().catalog.exercises.get({ id: 'fx_barbell_bench_press' });
    expect(e.instructions.ar?.steps.length).toBeGreaterThan(1);
    await expect(caller().catalog.exercises.get({ id: 'fx_nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller().catalog.exercises.full({ ids: Array.from({ length: 31 }, (_, i) => `fx_${i}`) })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
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
    await expect(caller(user('coach', 'suspended')).catalog.exercises.get({ id: 'fx_barbell_bench_press' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('clients can search foods (custom food entry)', async () => {
    const r = await caller(user('client')).catalog.foods.search({ q: 'banana', limit: 1 });
    expect(r.items[0]?.id).toBe('ff_banana');
  });
});

describe('ExerciseDB layer through the API (B4.2)', () => {
  it('meta counts the merged catalog and names the ExerciseDB version and credit', async () => {
    const m = await caller().catalog.meta();
    expect(m.exercises.count).toBeGreaterThan(1000);
    expect(m.exercisedb?.attribution.en).toMatch(/AscendAPI/);
  });

  it('get: English steps, no invented Arabic instructions or difficulty, the GIF with its credit', async () => {
    const { readFileSync } = await import('node:fs');
    const edb = JSON.parse(readFileSync('data/catalog/exercisedb.json', 'utf8')) as { items: { id: string; name: { en: string } }[] };
    const id = edb.items.find((x) => x.name.en === 'Reverse-grip pull-up')!.id;
    const e = await caller().catalog.exercises.get({ id });
    expect(e).toMatchObject({ origin: 'exercisedb', difficulty: null, pattern: null, credit: { provider: 'exercisedb' } });
    expect(e.instructions.ar).toBeNull();
    expect(e.instructions.en.steps.length).toBeGreaterThan(2);
    expect(e.instructions.en.steps[0]).not.toMatch(/^step/i);
    expect(e.media[0]).toMatchObject({ format: 'gif', license: 'EXERCISEDB', author: 'ExerciseDB (AscendAPI)' });
  });

  it('an ExerciseDB id linked to a curated item resolves to that item (no duplicate), once', async () => {
    const { readFileSync } = await import('node:fs');
    const edb = JSON.parse(readFileSync('data/catalog/exercisedb.json', 'utf8')) as { items: { id: string; formaId: string | null }[] };
    const linked = edb.items.find((x) => x.formaId === 'fx_barbell_bench_press')!;
    expect((await caller().catalog.exercises.get({ id: linked.id })).id).toBe('fx_barbell_bench_press');
    expect((await caller().catalog.exercises.full({ ids: ['fx_barbell_bench_press', linked.id] })).map((e) => e.id)).toEqual(['fx_barbell_bench_press']);
  });
});
