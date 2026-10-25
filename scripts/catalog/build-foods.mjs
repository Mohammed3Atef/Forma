/**
 * B4 — build the curated food dataset `data/catalog/foods.json` from the curation sheets
 * (scripts/catalog/curation/foods/*.mjs: Forma names, Arabic + Egyptian aliases, category, state,
 * which USDA record, which USDA portions) and the cached USDA FoodData Central files.
 *
 * NO VALUE IS TYPED BY HAND:
 *  - per-100 g values come from the named USDA record (energy 1008 → 2048 → 2047; carbs by
 *    difference → by summation), never edited;
 *  - a household portion's grams come from that record's own portion table (USDA weight ÷ USDA
 *    amount = grams for ONE unit); a portion the record doesn't have is a build error;
 *  - a recipe dish is computed from other catalog foods at their as-served weights (sum of the
 *    cooked components; no invented yield) and is labelled an estimate;
 *  - a proxy (a local food with no USDA record) carries a visible match note.
 * Deterministic and idempotent like build-exercises.mjs (rev / version bump only on change).
 *
 *   node scripts/catalog/build-foods.mjs [--dry-run]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadUsda, per100gOf } from './lib/usda.mjs';
import { CURATION_DIR } from './lib/curation.mjs';

const DRY = process.argv.includes('--dry-run');
const OUT = resolve('data/catalog/foods.json');
const REPORT = resolve('data/catalog-reports/foods-build.json');

const sheetsDir = join(CURATION_DIR, 'foods');
const sheets = [];
for (const f of readdirSync(sheetsDir).filter((x) => x.endsWith('.mjs')).sort()) {
  const mod = await import(pathToFileURL(join(sheetsDir, f)).href);
  for (const e of mod.default) sheets.push({ ...e, sheet: f });
}
const { foods: usda, manifest } = await loadUsda();
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const prevById = new Map((previous?.items ?? []).map((i) => [i.id, i]));
const problems = [];

// B4.1: the reviewed, processed pictures (scripts/catalog/build-food-images.mjs → data/catalog-reports/food-images.json).
const IMAGES = resolve('data/catalog-reports/food-images.json');
const imageRecords = existsSync(IMAGES) ? JSON.parse(readFileSync(IMAGES, 'utf8')).foods : {};
function imagesFor(id) {
  const r = imageRecords[id];
  if (!r?.variants || (r.status !== 'approved' && r.status !== 'needs-replacement')) return [];
  const variant = (v) => ({ cdnPath: v.cdnPath, width: v.width, height: v.height, bytes: v.bytes });
  return [
    {
      id: `fimg_${id.slice(3)}_r${r.rev}`,
      role: 'primary',
      url: r.originalUrl,
      sourcePage: r.pageUrl,
      variants: { thumb: variant(r.variants.thumb), card: variant(r.variants.card) },
      // B4.2: Wikimedia's own renditions (food-image-remote.mjs), served while the catalog CDN is not set.
      ...(r.remote ? { remote: r.remote } : {}),
      alt: r.alt,
      license: r.license,
      ...(r.licenseUrl ? { licenseUrl: r.licenseUrl } : {}),
      author: (r.author || '').trim() || 'Wikimedia Commons contributor',
      ...(r.credit ? { credit: String(r.credit).slice(0, 300) } : {}),
      source: { provider: 'wikimedia-commons', id: r.file },
      rights: 'verified',
      review: r.status === 'needs-replacement' ? 'needs-replacement' : 'approved',
      publication: 'published',
      rev: r.rev,
    },
  ];
}

// Rounding helper identical in method to api/catalog/_lib/nutrition.ts `roundTo` (half away from zero).
const roundTo = (n, dp) => {
  const f = 10 ** dp;
  const r = Math.round(Number((Math.abs(n) * f).toPrecision(12)));
  return (Math.sign(n) * r) / f;
};
const contentHash = (item) => createHash('sha256').update(JSON.stringify({ ...item, rev: undefined })).digest('hex');
const withRev = ({ id, status, ...rest }, rev) => ({ id, status, rev, ...rest });
const DT = { sr_legacy: 'sr_legacy', survey_fndds: 'survey_fndds', foundation: 'foundation' };
const fdcUrl = (id) => `https://fdc.nal.usda.gov/food-details/${id}/nutrients`;

function portionsFor(entry, rec) {
  const out = [];
  for (const p of entry.portions ?? []) {
    const hits = rec.portions.filter((x) => p.match.test(x.text) && (p.amount === undefined || x.amount === p.amount));
    if (hits.length !== 1) {
      problems.push(`${entry.id}: portion "${p.id}" matches ${hits.length} USDA portions of fdc ${rec.fdcId} (${rec.portions.map((x) => `${x.amount}×${x.text}`).join(' | ') || 'none'})`);
      continue;
    }
    const h = hits[0];
    out.push({ id: p.id, label: { en: p.label[0], ar: p.label[1] }, // One unit = USDA weight ÷ USDA amount, unless the label itself states the amount (`asListed`).
      grams: roundTo(p.asListed ? h.grams : h.grams / h.amount, 1), source: rec.dataType === 'sr_legacy' ? 'usda-sr-weight' : rec.dataType === 'survey_fndds' ? 'usda-fndds-portion' : 'usda-foundation-portion', ref: `fdc:${rec.fdcId} “${h.amount} ${h.text}” = ${h.grams} g` });
  }
  return out;
}

const items = [];
const byId = new Map();
// Two passes: plain records first, then recipes (which read other catalog items).
for (const pass of ['record', 'recipe']) {
  for (const s of sheets) {
    if ((pass === 'recipe') !== !!s.recipe) continue;
    if (byId.has(s.id)) {
      problems.push(`${s.id}: duplicate id (${s.sheet})`);
      continue;
    }
    let per100g;
    let energySource;
    let sources;
    let portions = [];
    let verification;
    let recipe;
    if (s.recipe) {
      const ings = s.recipe.ingredients.map(([foodId, grams]) => ({ foodId, grams, food: byId.get(foodId) }));
      const missing = ings.filter((i) => !i.food);
      if (missing.length) {
        problems.push(`${s.id}: recipe ingredient(s) not in the catalog: ${missing.map((m) => m.foodId).join(', ')}`);
        continue;
      }
      const total = ings.reduce((a, i) => a + i.grams, 0);
      const sum = (k) => ings.reduce((a, i) => a + ((i.food.per100g[k] ?? 0) * i.grams) / 100, 0);
      per100g = { kcal: roundTo((sum('kcal') / total) * 100, 2), protein: roundTo((sum('protein') / total) * 100, 2), carbs: roundTo((sum('carbs') / total) * 100, 2), fat: roundTo((sum('fat') / total) * 100, 2) };
      if (ings.every((i) => i.food.per100g.fiber !== undefined)) per100g.fiber = roundTo((sum('fiber') / total) * 100, 2);
      energySource = 'recipe-sum';
      verification = 'recipe-estimate';
      recipe = { ingredients: ings.map((i) => ({ foodId: i.foodId, grams: i.grams })), note: { en: s.recipe.note[0], ar: s.recipe.note[1] } };
      sources = ings.map((i) => ({ provider: 'forma', id: i.foodId, role: 'recipe-ingredient', license: 'FORMA-PROPRIETARY', description: `${i.grams} g ${i.food.name.en}` }));
      // A recipe's only household portion is the dish exactly as composed — never a typed weight.
      for (const p of s.portions ?? []) if (!p.recipeServing) problems.push(`${s.id}: recipe portion "${p.id}" must be the whole recipe (recipeServing)`);
      portions = (s.portions ?? []).filter((p) => p.recipeServing).map((p) => ({ id: p.id, label: { en: p.label[0], ar: p.label[1] }, grams: total, source: 'recipe', ref: `the whole recipe as composed (${total} g)` }));
    } else {
      const rec = usda.get(s.fdc);
      if (!rec) {
        problems.push(`${s.id}: fdc ${s.fdc} not found in the USDA files`);
        continue;
      }
      const v = per100gOf(rec);
      if (!v) {
        problems.push(`${s.id}: fdc ${s.fdc} lacks a core nutrient (energy / protein / fat / carbohydrate)`);
        continue;
      }
      per100g = v.per100g;
      energySource = v.energySource;
      verification = s.proxy ? 'proxy-estimate' : 'source-values';
      sources = [{ provider: 'usda-fdc', id: String(rec.fdcId), url: fdcUrl(rec.fdcId), role: 'nutrients', license: 'CC0-1.0', description: rec.description, dataType: DT[rec.dataType] }];
      portions = portionsFor(s, rec);
    }
    const body = {
      id: s.id,
      status: s.status ?? 'published',
      name: { en: s.name[0], ar: s.name[1] },
      aliases: { en: s.aliases?.en ?? [], ar: s.aliases?.ar ?? [], eg: s.aliases?.eg ?? [] },
      category: s.category,
      state: s.state,
      ...(s.prep ? { preparation: { en: s.prep[0], ar: s.prep[1] } } : {}),
      per100g,
      energySource,
      portions,
      verification,
      ...(s.proxy ? { matchNote: { en: s.proxy[0], ar: s.proxy[1] } } : {}),
      sources,
      ...(recipe ? { recipe } : {}),
      content: { license: 'FORMA-PROPRIETARY', author: 'Forma', review: 'draft', translation: 'draft' },
      images: imagesFor(s.id),
    };
    const prev = prevById.get(s.id);
    const rev = !prev ? 1 : contentHash(prev) === contentHash(body) ? prev.rev : prev.rev + 1;
    const item = withRev(body, rev);
    byId.set(s.id, item);
    items.push(item);
  }
}
// Keep the sheet order in the file (recipes were built second).
const order = new Map(sheets.map((s, i) => [s.id, i]));
items.sort((a, b) => order.get(a.id) - order.get(b.id));

const changed = !previous || previous.items.length !== items.length || items.some((i, n) => previous.items[n]?.id !== i.id || prevById.get(i.id)?.rev !== i.rev);
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
const version = !changed ? previous.version : previous?.version?.startsWith(today) ? `${today}-${Number(previous.version.split('-')[1]) + 1}` : `${today}-1`;
const dataset = {
  kind: 'foods',
  version,
  builtAt: changed ? new Date().toISOString() : previous.builtAt,
  generator: 'scripts/catalog/build-foods.mjs',
  sources: [
    ...Object.entries(manifest).map(([k, m]) => ({ provider: `usda-fdc:${k}`, version: m.release, retrievedAt: m.fetchedAt, license: 'CC0 1.0', attribution: 'Source: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov' })),
    { provider: 'forma', version, retrievedAt: Object.values(manifest).map((m) => m.fetchedAt).sort().at(-1), license: '© Forma', attribution: 'Names, translations, aliases, portion choice and recipes by Forma' },
  ],
  excluded: [],
  items,
};
const report = {
  version,
  changed,
  curated: items.length,
  published: items.filter((i) => i.status === 'published').length,
  needsReview: items.filter((i) => i.status === 'needs-review').length,
  byVerification: items.reduce((m, i) => ({ ...m, [i.verification]: (m[i.verification] ?? 0) + 1 }), {}),
  byDataType: items.reduce((m, i) => {
    const d = i.sources.find((s) => s.role === 'nutrients')?.dataType ?? 'recipe';
    return { ...m, [d]: (m[d] ?? 0) + 1 };
  }, {}),
  byCategory: items.reduce((m, i) => ({ ...m, [i.category]: (m[i.category] ?? 0) + 1 }), {}),
  portions: items.reduce((n, i) => n + i.portions.length, 0),
  withImage: items.filter((i) => i.images.length).length,
  imagesNeedReplacement: items.filter((i) => i.images.some((m) => m.review === 'needs-replacement')).length,
  problems,
};
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else if (DRY) {
  console.log(`dry run — ${changed ? 'WOULD WRITE' : 'no change'} ${version}`, JSON.stringify(report, null, 1));
} else {
  mkdirSync(resolve('data/catalog-reports'), { recursive: true });
  if (changed) writeFileSync(OUT, `${JSON.stringify(dataset, null, 1)}\n`);
  writeFileSync(REPORT, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`${changed ? 'wrote' : 'unchanged'} ${OUT} (${version}): ${report.published} published · ${JSON.stringify(report.byVerification)} · ${report.portions} portions`);
}
