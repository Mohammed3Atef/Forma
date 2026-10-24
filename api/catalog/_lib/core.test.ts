import { describe, expect, it } from 'vitest';
import { editDistance, foldArabic, normalizeText, tokenize } from './normalize.js';
import { buildIndex, search } from './search.js';
import { atwaterKcal, nutrientsFor, recipePer100g, roundTo, servingGrams, sumServings } from './nutrition.js';

/** B4 — the catalog core: search normalization (EN / AR / Egyptian), ranked search, the one nutrition calculation. */
describe('normalization', () => {
  it('folds Arabic spelling variants, diacritics, tatweel and Arabic-Indic digits', () => {
    expect(foldArabic('أُرْز إِسكندراني آيس')).toBe('ارز اسكندراني ايس');
    expect(foldArabic('بيضةٌ مسلوقة')).toBe('بيضه مسلوقه');
    expect(foldArabic('مـــلـوخية')).toBe('ملوخيه');
    expect(foldArabic('٢٥٠ جم')).toBe('250 جم');
    expect(foldArabic('مستشفى')).toBe('مستشفي');
  });
  it('drops a leading Arabic article so "الدمبل" finds "دمبل"', () => {
    expect(tokenize('الدمبل')).toEqual(['دمبل']);
    expect(tokenize('بالبار والبنش')).toEqual(['بار', 'بنش']);
    expect(tokenize('ال')).toEqual(['ال']); // too short to strip
  });
  it('English: case, punctuation, compounds, abbreviations and simple plurals', () => {
    expect(normalizeText('Pull-Ups')).toBe('pullup');
    expect(normalizeText('pull ups')).toBe('pullup');
    expect(normalizeText('Lat Pull Down')).toBe('lat pulldown');
    expect(tokenize('DB bench presses')).toEqual(['dumbbell', 'bench', 'press']);
    expect(tokenize('RDL')).toEqual(['romanian', 'deadlift']);
    expect(tokenize('Curls')).toEqual(['curl']);
    expect(tokenize('flies')).toEqual(['fly']);
    expect(tokenize('lunges')).toEqual(['lunge']);
    expect(tokenize('abs')).toEqual(['abs']);
    expect(tokenize('Crème brûlée')).toEqual(['creme', 'brulee']);
  });
  it('edit distance is capped (stops early) and counts transpositions as one', () => {
    expect(editDistance('bench', 'bnech', 1)).toBe(1);
    expect(editDistance('squat', 'sqaut', 1)).toBe(1);
    expect(editDistance('deadlift', 'dedlift', 2)).toBe(1);
    expect(editDistance('curl', 'press', 1)).toBe(2);
  });
});

describe('ranked search', () => {
  const items = [
    { id: 'a', name: 'Barbell bench press', ar: 'ضغط البار على البنش المستوي', eg: ['بنش', 'بنش مستوي'], muscle: 'Chest' },
    { id: 'b', name: 'Incline barbell bench press', ar: 'ضغط البار على البنش المائل', eg: ['بنش عالي'], muscle: 'Chest' },
    { id: 'c', name: 'Dumbbell fly', ar: 'الفتح بالدمبل', eg: ['فلاي'], muscle: 'Chest' },
    { id: 'd', name: 'Barbell curl', ar: 'ثني الذراع بالبار', eg: ['باي بار'], muscle: 'Biceps' },
  ];
  const index = buildIndex(items, (i) => [{ text: i.name, weight: 1 }, { text: i.ar, weight: 1 }, ...i.eg.map((text) => ({ text, weight: 0.9 })), { text: i.muscle, weight: 0.4 }], { sortKey: (i) => i.name });
  const ids = (q: string, filter?: (i: (typeof items)[number]) => boolean) => search(index, q, { limit: 10, filter }).hits.map((h) => h.item.id);

  it('every word must match; the exact name ranks first', () => {
    expect(ids('barbell bench press')[0]).toBe('a');
    expect(ids('barbell')).toEqual(expect.arrayContaining(['a', 'b', 'd']));
    expect(ids('barbell fly')).toEqual([]);
  });
  it('tolerates a typo and joined words', () => {
    expect(ids('bnech press')[0]).toBe('a');
    expect(ids('benchpress')).toContain('a');
  });
  it('Arabic and Egyptian words find the same item', () => {
    expect(ids('بنش')[0]).toBe('a');
    expect(ids('البنش المائل')[0]).toBe('b');
    expect(ids('فلاي')).toEqual(['c']);
  });
  it('filters, pages, and an empty query lists everything by name', () => {
    expect(ids('', (i) => i.muscle === 'Chest')).toEqual(['a', 'c', 'b']);
    const page = search(index, '', { limit: 2, offset: 2 });
    expect(page.total).toBe(4);
    expect(page.hits.map((h) => h.item.id)).toEqual(['c', 'b']);
  });
});

describe('nutrition — one method, deterministic rounding', () => {
  const rice = { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4 }; // USDA fdc 168878, per 100 g
  it('rounds half away from zero without binary noise', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(0.05, 1)).toBe(0.1);
    expect(roundTo(-0.05, 1)).toBe(-0.1);
    expect(roundTo(Number.NaN, 1)).toBe(0);
  });
  it('100 g is the record itself; 1 g is a hundredth; any grams scale linearly', () => {
    expect(nutrientsFor(rice, 100)).toEqual({ grams: 100, kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4 });
    expect(nutrientsFor(rice, 1)).toEqual({ grams: 1, kcal: 1, protein: 0, carbs: 0.3, fat: 0, fiber: 0 });
    expect(nutrientsFor(rice, 250)).toEqual({ grams: 250, kcal: 325, protein: 6.7, carbs: 70.4, fat: 0.7, fiber: 1 });
  });
  it('a household portion resolves to grams first (USDA: 1 cup cooked rice = 158 g)', () => {
    const cup = { id: 'cup', grams: 158 };
    expect(servingGrams(1, cup)).toBe(158);
    expect(servingGrams(1.5, cup)).toBe(237);
    expect(servingGrams(0.5, cup)).toBe(79);
    expect(nutrientsFor(rice, servingGrams(1, cup))).toEqual({ grams: 158, kcal: 205, protein: 4.3, carbs: 44.5, fat: 0.4, fiber: 0.6 });
    expect(servingGrams(0, cup)).toBe(0);
    expect(servingGrams(-2)).toBe(0);
    expect(servingGrams(152.34)).toBe(152.3);
  });
  it('totals add the rounded rows a reader sees', () => {
    const rows = [nutrientsFor(rice, 158), nutrientsFor({ kcal: 165, protein: 31.02, carbs: 0, fat: 3.57 }, 86)];
    expect(sumServings(rows)).toEqual({ kcal: 205 + 142, protein: 4.3 + 26.7, carbs: 44.5, fat: 0.4 + 3.1 });
  });
  it('a recipe is per 100 g of the dish as composed, and only fiber when every ingredient has it', () => {
    const oil = { kcal: 884, protein: 0, carbs: 0, fat: 100 };
    const fava = { kcal: 110, protein: 7.6, carbs: 19.65, fat: 0.4, fiber: 5.4 };
    const v = recipePer100g([{ per100g: fava, grams: 200 }, { per100g: oil, grams: 13.5 }]);
    expect(v.kcal).toBeCloseTo(((110 * 2 + 8.84 * 13.5) / 213.5) * 100, 1);
    expect(v.fiber).toBeUndefined();
    expect(recipePer100g([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it('Atwater check is a plausibility hint only', () => {
    expect(atwaterKcal({ protein: 10, carbs: 10, fat: 10 })).toBe(170);
  });
});
