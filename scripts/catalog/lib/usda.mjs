/**
 * B4 — read the cached USDA FoodData Central files (fetch-usda.mjs) into one lookup:
 *   fdcId → { fdcId, dataType, description, nutrients: { <nutrientId>: amount per 100 g }, portions }
 * Only the nutrients the catalog uses are kept. Portions keep the source's own wording and gram
 * weight (never invented): SR Legacy `amount` + `modifier`, FNDDS `portionDescription`,
 * Foundation `amount` + measure unit + `modifier`. FNDDS "Quantity not specified" is dropped.
 */
import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { CACHE_ROOT } from './fetchCache.mjs';

export const NUTRIENTS = { kcal: 1008, kcalAtwaterSpecific: 2048, kcalAtwaterGeneral: 2047, protein: 1003, fat: 1004, carbs: 1005, carbsSum: 1050, fiber: 1079, fiberAoac: 2033 };
const KEEP = new Set(Object.values(NUTRIENTS));

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function* csvRows(file) {
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells;
      continue;
    }
    yield Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  }
}

const findDir = (name) => {
  const base = join(CACHE_ROOT, 'usda', name);
  if (!existsSync(base)) throw new Error(`USDA ${name} not downloaded — run scripts/catalog/fetch-usda.mjs`);
  const sub = readdirSync(base).find((d) => !d.includes('.'));
  return sub ? join(base, sub) : base;
};

async function loadSrLegacy(foods) {
  const dir = findDir('sr_legacy');
  for await (const r of csvRows(join(dir, 'food.csv'))) foods.set(Number(r.fdc_id), { fdcId: Number(r.fdc_id), dataType: 'sr_legacy', description: r.description, nutrients: {}, portions: [] });
  for await (const r of csvRows(join(dir, 'food_nutrient.csv'))) {
    const nid = Number(r.nutrient_id);
    if (!KEEP.has(nid)) continue;
    const f = foods.get(Number(r.fdc_id));
    if (f && r.amount !== '') f.nutrients[nid] = Number(r.amount);
  }
  const units = new Map();
  for await (const r of csvRows(join(dir, 'measure_unit.csv'))) units.set(r.id, r.name);
  for await (const r of csvRows(join(dir, 'food_portion.csv'))) {
    const f = foods.get(Number(r.fdc_id));
    if (!f || !(Number(r.gram_weight) > 0)) continue;
    const unit = units.get(r.measure_unit_id);
    f.portions.push({ seq: Number(r.seq_num), amount: Number(r.amount) || 1, text: [unit && unit !== 'undetermined' ? unit : '', r.modifier, r.portion_description].filter(Boolean).join(' ').trim(), grams: Number(r.gram_weight) });
  }
}

function loadJsonFoods(foods, name, key, dataType) {
  const dir = join(CACHE_ROOT, 'usda', name);
  const file = readdirSync(dir).find((f) => f.endsWith('.json'));
  const data = JSON.parse(readFileSync(join(dir, file), 'utf8'))[key];
  for (const x of data) {
    if (!x) continue; // the Foundation 2026-04 file carries null placeholders
    const nutrients = {};
    for (const n of x.foodNutrients ?? []) {
      const id = Number(n.nutrient?.id);
      if (KEEP.has(id) && typeof n.amount === 'number') nutrients[id] = n.amount;
    }
    const portions = (x.foodPortions ?? [])
      .filter((p) => p.gramWeight > 0 && !/quantity not specified/i.test(p.portionDescription ?? ''))
      .map((p) => ({
        seq: p.sequenceNumber ?? 0,
        amount: p.amount ?? 1,
        text: (p.portionDescription || [p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '', p.modifier].filter(Boolean).join(' ')).trim(),
        grams: p.gramWeight,
      }));
    foods.set(x.fdcId, { fdcId: x.fdcId, dataType, description: x.description, nutrients, portions });
  }
}

let cache = null;
export async function loadUsda() {
  if (cache) return cache;
  const foods = new Map();
  await loadSrLegacy(foods);
  loadJsonFoods(foods, 'survey_fndds', 'SurveyFoods', 'survey_fndds');
  loadJsonFoods(foods, 'foundation', 'FoundationFoods', 'foundation');
  const manifest = JSON.parse(readFileSync(join(CACHE_ROOT, 'usda', 'manifest.json'), 'utf8'));
  cache = { foods, manifest };
  return cache;
}

/**
 * Per-100 g values of a record, with the energy basis named: kcal (1008), else Atwater specific
 * (2048), else general (2047); carbohydrate by difference (1005), else by summation (1050).
 * Returns null when a core value is missing — such a record is never used.
 */
export function per100gOf(food) {
  const n = food.nutrients;
  const has = (id) => typeof n[id] === 'number';
  const energy = has(1008) ? ['usda-1008', n[1008]] : has(2048) ? ['usda-2048', n[2048]] : has(2047) ? ['usda-2047', n[2047]] : null;
  const carbs = has(1005) ? n[1005] : has(1050) ? n[1050] : null;
  if (!energy || !has(1003) || !has(1004) || carbs === null) return null;
  const v = { kcal: energy[1], protein: n[1003], carbs, fat: n[1004] };
  const fiber = has(1079) ? n[1079] : has(2033) ? n[2033] : undefined;
  if (fiber !== undefined) v.fiber = fiber;
  return { per100g: v, energySource: energy[0] };
}
