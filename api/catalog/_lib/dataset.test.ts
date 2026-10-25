import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExerciseDatasetSchema, FoodDatasetSchema, type CatalogFood } from './schemas.js';
import { recipePer100g, atwaterKcal } from './nutrition.js';
import { normalizeText } from './normalize.js';

/**
 * B4 — the gate for the COMMITTED catalog datasets (data/catalog/*.json). A dataset that fails here
 * must not ship: provenance + licence on everything, no duplicates, honest media, Arabic that is
 * Arabic, food values traceable to their record (recipes recomputed, a few USDA values pinned).
 */
const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), 'data/catalog', f), 'utf8'));
const exercises = ExerciseDatasetSchema.parse(read('exercises.json'));
const foods = FoodDatasetSchema.parse(read('foods.json'));
const ARABIC = /[؀-ۿ]/;
const LATIN_LETTER = /[A-Za-z]/;

describe('exercise dataset', () => {
  it('parses against the contract (licences, instructions EN + AR, media rules)', () => {
    expect(exercises.items.length).toBeGreaterThan(10);
    expect(exercises.version).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d+$/);
  });

  it('ids and names are unique (no duplicate presented as different exercises)', () => {
    const ids = exercises.items.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lang of ['en', 'ar'] as const) {
      const names = exercises.items.map((e) => normalizeText(e.name[lang]));
      expect(new Set(names).size, `duplicate ${lang} name`).toBe(names.length);
    }
  });

  it('variants point at real items', () => {
    const ids = new Set(exercises.items.map((e) => e.id));
    for (const e of exercises.items) if (e.variantOf) expect(ids.has(e.variantOf), `${e.id} → ${e.variantOf}`).toBe(true);
  });

  it('Arabic fields are Arabic and English fields are English', () => {
    for (const e of exercises.items) {
      expect(ARABIC.test(e.name.ar), e.id).toBe(true);
      expect(ARABIC.test(e.name.en), e.id).toBe(false);
      const ar = Object.values(e.instructions.ar).flat();
      const en = Object.values(e.instructions.en).flat();
      for (const line of ar) expect(ARABIC.test(line), `${e.id}: "${line}"`).toBe(true);
      for (const line of en) expect(ARABIC.test(line), `${e.id}: "${line}"`).toBe(false);
      for (const a of [...e.aliases.ar, ...e.aliases.eg]) expect(ARABIC.test(a), `${e.id}: alias "${a}"`).toBe(true);
      expect(Object.keys(e.instructions.ar).every((k) => (e.instructions.ar as Record<string, string[]>)[k].length === (e.instructions.en as Record<string, string[]>)[k].length), `${e.id}: EN and AR instruction sections differ in length`).toBe(true);
    }
  });

  it('media: every file is licensed, credited, reviewed, traceable; videos are H.264 MP4 only', () => {
    for (const e of exercises.items) {
      for (const m of e.media) {
        expect(['CC0-1.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0']).toContain(m.license);
        expect(m.author.length).toBeGreaterThan(0);
        expect(m.author.includes('@'), `${e.id}: author is an email address`).toBe(false);
        // B4.1: published = rights verified + approved by a person who LOOKED at it (or played it).
        if (m.publication === 'published') expect([m.rights, m.review, m.verified], `${e.id}/${m.id}`).toEqual(['verified', 'approved', 'visual']);
        expect(m.url.startsWith('https://')).toBe(true);
        if (m.kind === 'video') expect([m.format, m.codec, m.mime]).toEqual(['mp4', 'h264', 'video/mp4']);
        if (m.hosting === 'forma-cdn') {
          expect(m.cdnPath, `${e.id}/${m.id}`).toMatch(new RegExp(`^catalog/exercises/${e.id}/`)); // its own exercise's folder — never another's
          expect(m.kind === 'video' ? m.poster?.cdnPath : 'n/a').toBeTruthy();
        }
        // Only reviewed providers; the unverified "Free Exercise DB" videos never enter a dataset.
        expect(m.source.provider).toBe('wger');
        expect(m.url).not.toMatch(/r2\.dev|free-exercise-db|zenithfits/i);
      }
      expect(e.media.filter((m) => m.kind === 'video' && m.role === 'primary').length, `${e.id}: one primary video at most`).toBeLessThanOrEqual(1);
      const ids = e.media.map((m) => m.url);
      expect(new Set(ids).size, `${e.id}: the same file twice`).toBe(ids.length);
    }
    // The same file is never presented as two different exercises.
    const all = exercises.items.flatMap((e) => e.media.map((m) => m.url));
    expect(new Set(all).size).toBe(all.length);
  });

  it('every source excluded from the media is recorded with a reason', () => {
    for (const x of exercises.excluded) expect(x.reason.length).toBeGreaterThan(5);
  });
});

describe('food dataset', () => {
  const byId = new Map(foods.items.map((f) => [f.id, f]));
  it('pictures (B4.1): open-licence, credited, described in both languages, in the food’s own folder; never NC / ND', () => {
    const withImage = foods.items.filter((f) => f.images.length);
    expect(withImage.length).toBeGreaterThan(100);
    for (const f of withImage) {
      for (const i of f.images) {
        expect(['CC0-1.0', 'PD', 'CC-BY-2.0', 'CC-BY-2.5', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-2.0', 'CC-BY-SA-2.5', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0']).toContain(i.license);
        expect(i.author.trim().length, f.id).toBeGreaterThan(0);
        expect(ARABIC.test(i.alt.ar) && LATIN_LETTER.test(i.alt.en), `${f.id}: alt text in both languages`).toBe(true);
        expect(i.source.provider).toBe('wikimedia-commons');
        expect(i.url, f.id).toMatch(/^https:\/\/upload\.wikimedia\.org\/[^?]+$/); // provenance, no tracking parameters
        expect(i.sourcePage, f.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
        for (const v of [i.variants.thumb, i.variants.card]) expect(v.cdnPath, f.id).toMatch(new RegExp(`^catalog/foods/${f.id}/r\\d+-(thumb|card)\\.webp$`));
        expect(i.variants.thumb.bytes, `${f.id}: list thumbnails stay light`).toBeLessThan(20_000);
        expect(i.variants.card.bytes, `${f.id}: card images stay light`).toBeLessThan(150_000);
        if (i.publication === 'published') expect([i.rights, i.review === 'pending'], f.id).toEqual(['verified', false]);
      }
    }
  });
  it('parses against the contract (per-100 g values, licensed sources, evidence-based portions)', () => {
    expect(foods.items.length).toBeGreaterThan(100);
  });

  it('ids and names are unique', () => {
    const ids = foods.items.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lang of ['en', 'ar'] as const) {
      const names = foods.items.map((f) => normalizeText(f.name[lang]));
      expect(new Set(names).size, `duplicate ${lang} name`).toBe(names.length);
    }
  });

  it('Arabic fields are Arabic; names in English carry no Arabic', () => {
    for (const f of foods.items) {
      expect(ARABIC.test(f.name.ar), f.id).toBe(true);
      expect(ARABIC.test(f.name.en), f.id).toBe(false);
      for (const p of f.portions) expect(ARABIC.test(p.label.ar), `${f.id}/${p.id}`).toBe(true);
      for (const a of [...f.aliases.ar, ...f.aliases.eg]) expect(ARABIC.test(a), `${f.id}: alias "${a}"`).toBe(true);
      if (f.matchNote) expect(ARABIC.test(f.matchNote.ar) && LATIN_LETTER.test(f.matchNote.en)).toBe(true);
    }
  });

  it('raw and cooked are never mixed: the name says the state the values describe', () => {
    for (const f of foods.items) {
      const en = f.name.en.toLowerCase();
      if (/\braw\b/.test(en)) expect(f.state, f.id).toBe('raw');
      if (/\buncooked\b/.test(en)) expect(['raw', 'dry', 'as-sold'], f.id).toContain(f.state);
      // A cooked name never sits on raw / dry values (roasted nuts are sold roasted: `as-sold` is fine).
      if (/\b(cooked|boiled|roasted|grilled|baked|fried|simmered|scrambled)\b/.test(en) && !/\buncooked\b/.test(en)) expect(['raw', 'dry'], f.id).not.toContain(f.state);
      const desc = f.sources.find((s) => s.role === 'nutrients')?.description?.toLowerCase() ?? '';
      if (f.verification === 'source-values' && desc) {
        // USDA calls uncooked grains and pulses "raw"; the catalog files them as `dry`.
        if (/\braw\b/.test(desc)) expect(['raw', 'dry'], `${f.id}: USDA says raw`).toContain(f.state);
        if (/\b(cooked|boiled|roasted|broiled|braised|pan-browned|pan-fried|fried|baked)\b/.test(desc) && !/\buncooked\b/.test(desc)) expect(['cooked', 'prepared', 'as-sold'], `${f.id}: USDA says cooked`).toContain(f.state);
      }
    }
  });

  it('a recipe’s values are exactly its catalog ingredients recomputed (no typed numbers)', () => {
    const recipes = foods.items.filter((f) => f.recipe);
    expect(recipes.length).toBeGreaterThan(0);
    for (const f of recipes as (CatalogFood & { recipe: NonNullable<CatalogFood['recipe']> })[]) {
      const ings = f.recipe.ingredients.map((i) => ({ per100g: byId.get(i.foodId)!.per100g, grams: i.grams }));
      for (const i of f.recipe.ingredients) expect(byId.get(i.foodId)?.recipe, `${f.id}: an ingredient is itself a recipe`).toBeUndefined();
      expect(f.per100g).toEqual(recipePer100g(ings));
      expect(f.portions.every((p) => p.source === 'recipe' && p.grams === f.recipe.ingredients.reduce((a, i) => a + i.grams, 0))).toBe(true);
    }
  });

  it('values are plausible: energy agrees with the macros (Atwater) within USDA’s own spread', () => {
    for (const f of foods.items) {
      const est = atwaterKcal(f.per100g);
      // USDA energy uses food-specific factors (and fibre / alcohol), so allow a wide but finite gap.
      expect(Math.abs(f.per100g.kcal - est), `${f.id}: ${f.per100g.kcal} kcal vs ${est.toFixed(0)} from macros`).toBeLessThanOrEqual(Math.max(25, est * 0.2));
    }
  });

  it('a few values are pinned to their USDA records (an extraction bug would move them)', () => {
    const pin = (id: string) => byId.get(id)!;
    expect(pin('ff_rice_white_long_cooked').per100g).toMatchObject({ kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28 });
    expect(pin('ff_rice_white_long_cooked').portions.find((p) => p.id === 'cup')?.grams).toBe(158);
    expect(pin('ff_chicken_breast_roasted').per100g).toMatchObject({ kcal: 165, protein: 31.02, fat: 3.57 });
    expect(pin('ff_egg_whole_raw').portions.find((p) => p.id === 'large')?.grams).toBe(50);
    expect(pin('ff_fava_beans_boiled').per100g).toMatchObject({ kcal: 110, protein: 7.6, carbs: 19.65, fat: 0.4 });
    expect(pin('ff_olive_oil').per100g).toMatchObject({ kcal: 884, fat: 100 });
    expect(pin('ff_chicken_breast_raw').energySource).toBe('usda-2048'); // Foundation record: Atwater specific
  });

  it('estimates are labelled: proxies explain their match; nothing typed by hand is called "source values"', () => {
    for (const f of foods.items) {
      if (f.verification === 'proxy-estimate') expect(f.name.en).toMatch(/\(estimate\)/);
      if (f.verification === 'recipe-estimate') expect(f.name.en).toMatch(/\(estimate\)/);
      if (f.verification === 'source-values') expect(f.sources.some((s) => s.provider === 'usda-fdc' && s.license === 'CC0-1.0')).toBe(true);
    }
  });
});
