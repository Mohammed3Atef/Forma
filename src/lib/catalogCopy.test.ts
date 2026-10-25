import { describe, expect, it } from 'vitest';
import { exerciseFromCatalog, foodPickFromCatalog, isEstimate, reserve, servingText } from './catalogCopy';
import { applyFoodEdit, snapshotFood } from './nutritionPlanModel';
import { foodFromLibrary } from './foodHandoff';
import { foodLine } from './foodFormat';
import type { CatalogExercise, CatalogFoodCard, CatalogTaxonomy } from '@/services/platform/catalogApi';

/** B4 — catalog items become plan copies that keep their provenance; servings are computed, never typed. */
const taxonomy = {
  muscles: { chest: { en: 'Chest', ar: 'الصدر' }, triceps: { en: 'Triceps', ar: 'ترايسبس' }, 'front-delts': { en: 'Front delts', ar: 'الكتف الأمامي' } },
  equipment: { barbell: { en: 'Barbell', ar: 'بار' }, bench: { en: 'Bench', ar: 'بنش' } },
  bodyParts: { chest: { en: 'Chest', ar: 'الصدر' } },
} as unknown as CatalogTaxonomy;

const bench = {
  id: 'fx_barbell_bench_press',
  rev: 3,
  name: { en: 'Barbell bench press', ar: 'ضغط البار على البنش المستوي' },
  bodyPart: 'chest',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['front-delts', 'triceps'],
  equipment: ['barbell', 'bench'],
  instructions: { en: { setup: ['a'], steps: ['b', 'c'], cues: ['d'], mistakes: ['e'], safety: [] }, ar: { setup: ['أ'], steps: ['ب', 'ج'], cues: ['د'], mistakes: ['هـ'], safety: [] } },
  media: [
    { id: 'img_wger_68', kind: 'image', url: 'https://wger.de/a.png', author: 'Everkinetic', license: 'CC-BY-SA-3.0', sourcePage: 'https://wger.de/en/exercise/73/view/' },
    { id: 'vid_wger_23', kind: 'video', url: 'https://wger.de/v.MP4', author: 'Goulart', license: 'CC-BY-SA-4.0', sourcePage: 'https://wger.de/en/exercise/73/view/' },
  ],
} as unknown as CatalogExercise;

const rice: CatalogFoodCard = {
  id: 'ff_rice_white_long_cooked',
  rev: 1,
  name: { en: 'White rice (long grain), cooked', ar: 'أرز أبيض طويل الحبة، مطبوخ' },
  category: 'grains',
  state: 'cooked',
  per100g: { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4 },
  portions: [{ id: 'cup', label: { en: '1 cup', ar: 'كوب' }, grams: 158 }],
  verification: 'source-values',
  matchNote: null,
  recipeNote: null,
  image: null,
};

describe('exercise copy', () => {
  it('a fresh plan copy with catalog identity, bilingual name, instructions and credited media', () => {
    const ex = exerciseFromCatalog(bench, taxonomy);
    expect(ex.id).toMatch(/^ex/);
    expect(ex).toMatchObject({ name: 'Barbell bench press', names: { ar: 'ضغط البار على البنش المستوي' }, targetMuscle: 'Chest', equipment: 'Barbell, Bench', catalogId: 'fx_barbell_bench_press', catalogRev: 3, imageUrl: 'https://wger.de/a.png', videoUrl: 'https://wger.de/v.MP4' });
    expect(ex.libraryExerciseId).toBeUndefined(); // not the coach's library: no library sync link
    expect(ex.mediaCredits?.map((c) => [c.kind, c.author, c.license])).toEqual([['image', 'Everkinetic', 'CC-BY-SA-3.0'], ['video', 'Goulart', 'CC-BY-SA-4.0']]);
    expect(ex.instructions?.ar?.steps).toEqual(['ب', 'ج']);
    expect(ex.workingSets).toBe(3); // default programming, the coach sets it
  });
  it('an exercise with no media is copied with none (never another exercise’s)', () => {
    const ex = exerciseFromCatalog({ ...bench, media: [] } as unknown as CatalogExercise, taxonomy);
    // None: absent (B4.2 — never null in a copy, library sync carries these into templates).
    expect([ex.imageUrl ?? null, ex.thumbUrl ?? null, ex.videoUrl ?? null, ex.images, ex.mediaCredits]).toEqual([null, null, null, [], []]);
    expect(ex.imageUrl).toBeUndefined();
  });
});

describe('food serving', () => {
  it('a household portion: grams from the portion, values from per-100 g (1 cup cooked rice = 158 g = 205 kcal)', () => {
    const p = foodPickFromCatalog(rice, 'cup', 1);
    expect(p.macros).toEqual({ calories: 205, protein: 4.3, carbs: 44.5, fats: 0.4 });
    expect(p.quantity).toBe('1 cup (158 g)');
    expect(p.provenance).toMatchObject({ catalogId: 'ff_rice_white_long_cooked', catalogRev: 1, portion: { id: 'cup', amount: 1, grams: 158 }, foodState: 'cooked', verification: 'source-values', source: { provider: 'forma-catalog', license: 'CC0-1.0' } });
  });
  it('grams, fractions, and an unknown portion falls back to grams', () => {
    expect(foodPickFromCatalog(rice, 'g', 150).macros).toEqual({ calories: 195, protein: 4, carbs: 42.3, fats: 0.4 });
    expect(foodPickFromCatalog(rice, 'cup', 1.5).provenance.portion).toMatchObject({ amount: 1.5, grams: 237 });
    expect(foodPickFromCatalog(rice, 'nope', 80).provenance.portion).toMatchObject({ id: 'g', grams: 80 });
  });
  it('the reader sees the serving in their language, always with grams', () => {
    const portion = foodPickFromCatalog(rice, 'cup', 2).provenance.portion!;
    expect(servingText(portion, 'en')).toBe('2 × 1 cup (316 g)');
    expect(servingText(portion, 'ar')).toBe('2 × كوب (316 جم)');
    expect(servingText({ id: 'g', amount: 150, grams: 150 }, 'ar-EG')).toBe('150 جم');
    expect(foodLine({ quantity: 'old text', portion, calories: 411, protein: 8.5, carbs: 89, fats: 0.9 }, 'ar')).toBe('2 × كوب (316 جم) · 411 kcal · P8.5 C89 F0.9');
    expect(foodLine({ quantity: '100 g', calories: 130, protein: 2.7, carbs: 28, fats: 0.3 })).toBe('100 g · 130 kcal · P2.7 C28 F0.3');
  });
  it('a new serving of the same food recomputes from per-100 g', () => {
    const p = foodPickFromCatalog(rice, 'cup', 1);
    const r = reserve(p.provenance, null, 200)!;
    expect(r.macros).toEqual({ calories: 260, protein: 5.4, carbs: 56.3, fats: 0.6 });
    expect(r.provenance.portion).toEqual({ id: 'g', amount: 200, grams: 200 });
    expect(reserve({}, null, 100)).toBeNull();
  });
  it('a recipe estimate keeps what it assumes (the plate, the oil) with the row', () => {
    const note = { en: 'A medium plate with 2 tsp oil.', ar: 'طبق متوسط بملعقتين صغيرتين زيت.' };
    const p = foodPickFromCatalog({ ...rice, id: 'ff_koshary', verification: 'recipe-estimate', portions: [{ id: 'plate', label: { en: '1 plate', ar: 'طبق' }, grams: 450 }], recipeNote: note }, 'plate', 1);
    expect(p.provenance).toMatchObject({ verification: 'recipe-estimate', sourceNote: note, source: { license: 'FORMA-PROPRIETARY' } });
    expect(foodPickFromCatalog(rice, 'cup', 1).provenance.sourceNote).toBeUndefined();
  });
  it('estimates are flagged', () => {
    expect(isEstimate({ verification: 'proxy-estimate' })).toBe(true);
    expect(isEstimate({ verification: 'source-values' })).toBe(false);
    expect(isEstimate({})).toBe(false);
  });
});

describe('applyFoodEdit keeps or drops provenance explicitly', () => {
  const pick = foodPickFromCatalog(rice, 'cup', 1);
  const created = applyFoodEdit(null, 'f1', { name: pick.name, quantity: pick.quantity, ...pick.macros, allowCustom: false, provenance: pick.provenance }, () => 'x');
  it('a catalog pick stores its numbers and where they came from', () => {
    expect(created).toMatchObject({ id: 'f1', calories: 205, catalogId: 'ff_rice_white_long_cooked', portion: { grams: 158 }, per100g: rice.per100g });
  });
  it('untouched provenance survives an unrelated edit (alternatives toggle)', () => {
    const next = applyFoodEdit(created, 'f1', { name: created.name, quantity: created.quantity, calories: 205, protein: 4.3, carbs: 44.5, fats: 0.4, allowCustom: true }, () => 'x');
    expect(next.catalogId).toBe('ff_rice_white_long_cooked');
    expect(next.allowCustomSubstitution).toBe(true);
  });
  it('a hand-typed value drops every catalog claim (null)', () => {
    const next = applyFoodEdit(created, 'f1', { name: created.name, quantity: '1 bowl', calories: 250, protein: 4.3, carbs: 44.5, fats: 0.4, allowCustom: false, provenance: null }, () => 'x');
    for (const k of ['catalogId', 'catalogRev', 'per100g', 'portion', 'foodState', 'verification', 'sourceNote', 'source']) expect(next).not.toHaveProperty(k);
    expect(next.calories).toBe(250);
  });
});

describe('food pictures travel as copies (B4.1)', () => {
  const served = { thumbUrl: 'https://catalog.forma.test/foods/rice-thumb.webp', cardUrl: 'https://catalog.forma.test/foods/rice-card.webp', width: 640, height: 480, alt: { en: 'Cooked rice', ar: 'أرز مطبوخ' }, author: 'Jane Doe', license: 'CC-BY-SA-4.0' as const, licenseUrl: null, sourcePage: 'https://commons.wikimedia.org/wiki/File:Rice.jpg', rev: 2 };
  it('a catalog pick copies the approved picture with its credit and revision; none when there is none', () => {
    const p = foodPickFromCatalog({ ...rice, image: served }, 'cup', 1);
    expect(p.image).toMatchObject({ source: 'forma-catalog', catalogFoodId: rice.id, url: served.cardUrl, thumbUrl: served.thumbUrl, author: 'Jane Doe', license: 'CC-BY-SA-4.0', rev: 2 });
    expect(foodPickFromCatalog(rice, 'cup', 1).image).toBeNull();
  });
  it('applyFoodEdit: untouched keeps the picture, null removes it, a new one replaces it', () => {
    const pic = foodPickFromCatalog({ ...rice, image: served }, 'cup', 1).image!;
    const created = applyFoodEdit(null, 'f1', { name: rice.name, quantity: '1 cup', calories: 205, protein: 4.3, carbs: 44.5, fats: 0.4, allowCustom: false, image: pic }, () => 'x');
    expect(created.image).toEqual(pic);
    expect(applyFoodEdit(created, 'f1', { name: rice.name, quantity: '2 cups', calories: 410, protein: 8.6, carbs: 89, fats: 0.8, allowCustom: false }, () => 'x').image).toEqual(pic);
    expect(applyFoodEdit(created, 'f1', { name: rice.name, quantity: '1 cup', calories: 205, protein: 4.3, carbs: 44.5, fats: 0.4, allowCustom: false, image: null }, () => 'x')).not.toHaveProperty('image');
    const own = { source: 'upload' as const, url: 'https://media.forma.test/Forma/c1/foods/a.webp', thumbUrl: 'https://media.forma.test/Forma/c1/foods/t.webp', rev: 1, uploadedAt: 1 };
    expect(applyFoodEdit(created, 'f1', { name: rice.name, quantity: '1 cup', calories: 205, protein: 4.3, carbs: 44.5, fats: 0.4, allowCustom: false, image: own }, () => 'x').image).toEqual(own);
  });
  it('alternatives and library hand-offs keep the food picture', () => {
    const own = { source: 'upload' as const, url: 'https://media.forma.test/Forma/c1/foods/a.webp', thumbUrl: 'https://media.forma.test/Forma/c1/foods/t.webp', rev: 1, uploadedAt: 1 };
    const lib = { id: 'lf1', name: { en: 'Ful', ar: 'فول' }, quantity: '1 bowl', calories: 300, protein: 15, carbs: 40, fats: 9, image: own };
    expect(snapshotFood(lib, () => 'n').image).toEqual(own);
    expect(snapshotFood({ ...lib, image: undefined }, () => 'n')).not.toHaveProperty('image');
    expect(foodFromLibrary(lib, () => 'n1').image).toEqual(own);
  });
});
