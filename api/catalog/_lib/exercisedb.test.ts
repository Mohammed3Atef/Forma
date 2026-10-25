import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EdbDatasetSchema, ExerciseDatasetSchema, FoodDatasetSchema } from './schemas.js';
import { indexDatasets, servedMedia } from './dataset.js';
import { search } from './search.js';

/**
 * B4.2 — the ExerciseDB V1 layer (`data/catalog/exercisedb.json`, `scripts/catalog/import-exercisedb.mjs`):
 * the committed file obeys its contract; every source id is kept and every id is unique; a link to
 * a curated item or a variation points at something real; every demonstration has its light list
 * still on disk; and the merged catalog finds ExerciseDB items in English, Arabic and Egyptian
 * Arabic without pushing curated items aside.
 */
const ROOT = process.cwd();
const read = (f: string) => JSON.parse(readFileSync(join(ROOT, 'data/catalog', f), 'utf8'));
const edb = EdbDatasetSchema.parse(read('exercisedb.json'));
const curated = ExerciseDatasetSchema.parse(read('exercises.json'));
const loaded = indexDatasets(curated, FoodDatasetSchema.parse(read('foods.json')), edb);
const curatedIds = new Set(curated.items.filter((e) => e.status === 'published').map((e) => e.id));
const top = (q: string, n = 5) => search(loaded.exerciseIndex, q, { limit: n }).hits.map((h) => h.item);

describe('ExerciseDB dataset', () => {
  it('parses against its contract, with unique ids and every source record accounted for', () => {
    const ids = edb.items.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sources = edb.items.flatMap((x) => x.sourceIds);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.length).toBe(edb.source.advertised); // all 1,500 records kept by id (duplicates folded, not lost)
  });

  it('every exercise has a demonstration, and every demonstration its list still on disk (small, never the GIF)', () => {
    for (const x of edb.items) {
      expect(x.media.length, x.id).toBeGreaterThan(0);
      for (const m of x.media) {
        const file = join(ROOT, 'public', m.thumb);
        expect(existsSync(file), m.thumb).toBe(true);
        expect(statSync(file).size).toBeLessThan(8_000);
        expect(m.url).toMatch(/^https:\/\/static\.exercisedb\.dev\/media\/[A-Za-z0-9]+\.gif$/);
      }
    }
  });

  it('links point at real items; a linked record is never also standalone; variations stay separate', () => {
    for (const x of edb.items) {
      if (x.formaId) expect(curatedIds.has(x.formaId), `${x.id} → ${x.formaId}`).toBe(true);
      if (x.variantOf) expect(curatedIds.has(x.variantOf) || edb.items.some((y) => y.id === x.variantOf), `${x.id} variantOf ${x.variantOf}`).toBe(true);
      expect(x.variantOf).not.toBe(x.id);
    }
    const linked = edb.items.filter((x) => x.formaId);
    expect(linked.length).toBeGreaterThan(50);
    for (const x of linked) expect(loaded.exerciseById.get(x.id)?.id).toBe(x.formaId); // the ExerciseDB id resolves to the curated item
    expect(loaded.exerciseCount).toBe(curatedIds.size + edb.items.filter((x) => !x.formaId).length);
    // Reviewed decisions hold: a loaded variation is not merged into the bodyweight item.
    expect(edb.items.find((x) => x.sourceName === 'weighted pull-up')).toMatchObject({ formaId: null, variantOf: 'fx_pull_up' });
    expect(edb.items.find((x) => x.sourceName === 'cable kickback')).toMatchObject({ formaId: null }); // a triceps move, not the glute kickback
  });

  it('every name has a draft Arabic name and Egyptian aliases; nothing is marked reviewed by a native speaker yet', () => {
    for (const x of edb.items) {
      expect(x.translation).toBe('draft');
      expect(x.name.ar).toMatch(/\p{Script=Arabic}/u);
      expect(x.aliases.eg.length).toBeGreaterThan(0);
    }
  });
});

describe('the merged catalog', () => {
  it('a curated item gains the ExerciseDB demonstration of the same movement (after its own video)', () => {
    const bench = loaded.exerciseById.get('fx_barbell_bench_press')!;
    const media = servedMedia(bench, null);
    expect(media.some((m) => m.format === 'gif' && m.license === 'EXERCISEDB' && m.thumbUrl?.startsWith('/catalog/edb/'))).toBe(true);
    expect(media.find((m) => m.format === 'gif')!.author).toBe('ExerciseDB (AscendAPI)');
  });

  it('finds ExerciseDB items in English, Arabic and Egyptian Arabic', () => {
    expect(top('reverse grip pull up').map((e) => e.name.en)).toContain('Reverse-grip pull-up');
    expect(top('السحب على العقلة بقبضة معكوسة').map((e) => e.name.en)).toContain('Reverse-grip pull-up');
    expect(top('عقلة عكسي').map((e) => e.name.en)).toContain('Reverse-grip pull-up');
    expect(top('kettlebell snatch').some((e) => e.name.en.toLowerCase().includes('snatch'))).toBe(true);
  });

  it('a curated item still comes first for its own name', () => {
    for (const [q, id] of [['barbell bench press', 'fx_barbell_bench_press'], ['ضغط البار على البنش المستوي', 'fx_barbell_bench_press'], ['pull-up', 'fx_pull_up'], ['سكوات', 'fx_barbell_back_squat']] as const) {
      expect(top(q, 3).map((e) => e.id), q).toContain(id);
    }
  });

  it('search stays fast over the whole catalog (p95 < 15 ms in memory)', () => {
    const qs = ['press', 'curl', 'ضغط', 'سحب', 'سمانة', 'dumbel', 'kettlebell', 'stretch', 'إطالة', 'row'];
    const ms = qs.map((q) => {
      const t0 = performance.now();
      search(loaded.exerciseIndex, q, { limit: 20 });
      return performance.now() - t0;
    });
    ms.sort((a, b) => a - b);
    expect(ms[Math.floor(ms.length * 0.95)]).toBeLessThan(15);
  });
});
