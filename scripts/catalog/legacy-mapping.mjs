/**
 * B4 — the reviewable old → new mapping (migration step D). READ-ONLY: it reads the legacy starter
 * datasets (the files every coach's library was seeded from) and the catalog datasets, and writes
 * a report. It changes no database and remaps nothing — applying a mapping is a separate,
 * owner-approved step (B4_IMPORT_AND_MIGRATION_PLAN.md).
 *
 *   node scripts/catalog/legacy-mapping.mjs
 *   → data/catalog-reports/legacy-mapping.json (+ .md summary)
 *
 * Exercises (legacy ids `wger-<n>`):
 *  - exact     the catalog item takes its identity from the same wger record (listed in its
 *              legacyIds) — high confidence, still shown for approval;
 *  - variant   same wger variation group as a mapped record — LOW confidence: a candidate only,
 *              human approval required (a variant is never silently merged);
 *  - none      no reliable match → keep as a legacy / archived row (never remapped).
 * Foods (legacy ids `seed-food-<slug>`): mapped when a catalog food lists it; per-100 g values are
 * compared and a difference > 10 % (or > 20 kcal) requires approval — a remap must never silently
 * change a plan's nutrition.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CACHE_ROOT } from './lib/fetchCache.mjs';

const read = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));
const exercises = read('data/catalog/exercises.json');
const foods = read('data/catalog/foods.json');
const legacyEx = read('public/data/exercise-library.json');
let snapshot = null;
try {
  snapshot = JSON.parse(readFileSync(join(CACHE_ROOT, 'wger-snapshot.json'), 'utf8'));
} catch {
  /* variation groups are optional evidence */
}

// ---- exercises
const byLegacy = new Map();
for (const e of exercises.items) for (const id of e.legacyIds) byLegacy.set(id, e);
const groupOf = new Map((snapshot?.exercises ?? []).map((x) => [`wger-${x.id}`, x.variationGroup]));
const groupToCatalog = new Map();
for (const [legacyId, e] of byLegacy) {
  const g = groupOf.get(legacyId);
  if (g) groupToCatalog.set(g, [...(groupToCatalog.get(g) ?? []), e.id]);
}
const exRows = legacyEx.map((l) => {
  const hit = byLegacy.get(l.id);
  if (hit) return { legacyId: l.id, legacyName: l.name, to: hit.id, toName: hit.name.en, confidence: 'exact', reason: 'same wger record', approval: 'required (batch)' };
  const g = groupOf.get(l.id);
  const cands = g ? [...new Set(groupToCatalog.get(g) ?? [])] : [];
  if (cands.length) return { legacyId: l.id, legacyName: l.name, to: null, candidates: cands, confidence: 'variant', reason: 'same wger variation group — a variant, not the same exercise', approval: 'required (per item)' };
  return { legacyId: l.id, legacyName: l.name, to: null, confidence: 'none', reason: 'no reliable match', approval: 'keep as legacy' };
});

// ---- foods: parse the legacy starter food rows from the TS data file (fd(slug, en, ar, quantity, kcal, p, c, f, category))
const src = readFileSync(resolve('api/coach-assets/_lib/starterLibraryData.ts'), 'utf8');
const legacyFoods = [...src.matchAll(/fd\('([^']+)',\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)',\s*'([^']*)',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*'([^']+)'\)/g)].map((m) => ({
  id: `seed-food-${m[1]}`,
  name: m[2].replace(/\\'/g, "'"),
  quantity: m[4],
  kcal: Number(m[5]),
  protein: Number(m[6]),
  carbs: Number(m[7]),
  fat: Number(m[8]),
}));
const gramsOf = (q) => {
  const m = q.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  return m ? Number(m[1]) : null;
};
const foodByLegacy = new Map();
for (const f of foods.items) for (const id of f.legacyIds) foodByLegacy.set(id, f);
const foodRows = legacyFoods.map((l) => {
  const hit = foodByLegacy.get(l.id);
  const g = gramsOf(l.quantity);
  const per100 = g ? { kcal: (l.kcal * 100) / g, protein: (l.protein * 100) / g, carbs: (l.carbs * 100) / g, fat: (l.fat * 100) / g } : null;
  if (!hit) return { legacyId: l.id, legacyName: l.name, legacyQuantity: l.quantity, to: null, confidence: 'none', reason: 'no catalog food — kept as the coach’s own food', approval: 'keep as legacy' };
  let delta = null;
  let needsReview = true;
  if (per100) {
    delta = Object.fromEntries(['kcal', 'protein', 'carbs', 'fat'].map((k) => [k, Math.round((hit.per100g[k] - per100[k]) * 10) / 10]));
    const kcalGap = Math.abs(delta.kcal);
    needsReview = kcalGap > 20 || kcalGap > 0.1 * Math.max(per100.kcal, 1) || hit.verification !== 'source-values';
  }
  return {
    legacyId: l.id,
    legacyName: l.name,
    legacyQuantity: l.quantity,
    to: hit.id,
    toName: hit.name.en,
    confidence: per100 ? (needsReview ? 'same food, different values' : 'same food, same values') : 'same food (legacy serving not in grams)',
    per100gDelta: delta,
    verification: hit.verification,
    approval: needsReview ? 'required (per item)' : 'required (batch)',
  };
});

const count = (rows, k, v) => rows.filter((r) => r[k] === v).length;
const report = {
  generatedAt: new Date().toISOString(),
  datasets: { exercises: exercises.version, foods: foods.version },
  exercises: { legacy: exRows.length, exact: count(exRows, 'confidence', 'exact'), variantCandidates: count(exRows, 'confidence', 'variant'), keepAsLegacy: count(exRows, 'confidence', 'none'), rows: exRows },
  foods: {
    legacy: foodRows.length,
    mapped: foodRows.filter((r) => r.to).length,
    mappedNeedingReview: foodRows.filter((r) => r.to && r.approval === 'required (per item)').length,
    keepAsLegacy: foodRows.filter((r) => !r.to).length,
    rows: foodRows,
  },
  rule: 'Nothing is remapped automatically. Plans store full copies, so an unmapped or archived legacy row never breaks a plan; applying any mapping is an owner-approved migration.',
};
mkdirSync(resolve('data/catalog-reports'), { recursive: true });
writeFileSync(resolve('data/catalog-reports/legacy-mapping.json'), `${JSON.stringify(report, null, 1)}\n`);
const md = [
  '# Legacy → catalog mapping (generated — do not edit)',
  '',
  `Datasets: exercises ${report.datasets.exercises}, foods ${report.datasets.foods}. Generated ${report.generatedAt}.`,
  '',
  '| | Legacy rows | Exact / mapped | Needs per-item review | Keep as legacy |',
  '|---|---:|---:|---:|---:|',
  `| Exercises (starter, wger) | ${report.exercises.legacy} | ${report.exercises.exact} | ${report.exercises.variantCandidates} (variant candidates) | ${report.exercises.keepAsLegacy} |`,
  `| Foods (starter) | ${report.foods.legacy} | ${report.foods.mapped} | ${report.foods.mappedNeedingReview} (values differ / estimate) | ${report.foods.keepAsLegacy} |`,
  '',
  report.rule,
  '',
  '## Foods mapped with a value difference (per 100 g, new − old)',
  '',
  '| Legacy | → Catalog | Δ kcal | Δ protein | Δ carbs | Δ fat | Kind |',
  '|---|---|---:|---:|---:|---:|---|',
  ...foodRows.filter((r) => r.to && r.approval === 'required (per item)').map((r) => `| ${r.legacyName} (${r.legacyQuantity}) | ${r.toName} | ${r.per100gDelta?.kcal ?? '—'} | ${r.per100gDelta?.protein ?? '—'} | ${r.per100gDelta?.carbs ?? '—'} | ${r.per100gDelta?.fat ?? '—'} | ${r.verification} |`),
  '',
  '## Legacy foods with no catalog match (kept as the coach’s own)',
  '',
  ...foodRows.filter((r) => !r.to).map((r) => `- ${r.legacyName} (${r.legacyId})`),
  '',
];
writeFileSync(resolve('data/catalog-reports/legacy-mapping.md'), md.join('\n'));
console.log(`exercises: ${report.exercises.exact} exact · ${report.exercises.variantCandidates} variant candidates · ${report.exercises.keepAsLegacy} keep as legacy (of ${report.exercises.legacy})`);
console.log(`foods: ${report.foods.mapped} mapped (${report.foods.mappedNeedingReview} need per-item review) · ${report.foods.keepAsLegacy} keep as legacy (of ${report.foods.legacy})`);
