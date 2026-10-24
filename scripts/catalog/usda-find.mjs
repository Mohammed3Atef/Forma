/**
 * B4 curation helper — find USDA records by words in their description (all words must appear).
 *   node scripts/catalog/usda-find.mjs rice white cooked [--type=sr_legacy] [--portions]
 */
import { loadUsda, per100gOf } from './lib/usda.mjs';

const words = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((w) => w.toLowerCase());
const type = process.argv.find((a) => a.startsWith('--type='))?.slice(7);
const showPortions = process.argv.includes('--portions');
const { foods } = await loadUsda();
let n = 0;
for (const f of foods.values()) {
  const d = f.description.toLowerCase();
  if (type && f.dataType !== type) continue;
  if (!words.every((w) => d.includes(w))) continue;
  const v = per100gOf(f);
  console.log(`${f.fdcId} [${f.dataType}] ${f.description} | ${v ? `${v.per100g.kcal}kcal P${v.per100g.protein} C${v.per100g.carbs} F${v.per100g.fat}${v.per100g.fiber !== undefined ? ` fib${v.per100g.fiber}` : ''} (${v.energySource})` : 'INCOMPLETE'}`);
  if (showPortions) for (const p of f.portions) console.log(`      ${p.amount} × ${p.text} = ${p.grams} g`);
  if (++n >= 40) break;
}
