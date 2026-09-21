/**
 * One-time (re-runnable) importer: pulls the full exercise catalog from
 * wger.de's free, public, no-auth API (https://wger.de/api/v2/exerciseinfo/)
 * and regenerates `public/data/exercise-library.json` — the single starter
 * exercise dataset both `loadStarterExercises()` (server) and
 * `fetchStarterExercises()` (client) already read. No other code needs to
 * change: this script just replaces what's IN that file.
 *
 * Exercise + ingredient data from wger.de is licensed CC BY-SA 3.0 — every
 * generated record carries `source: 'wger.de (CC BY-SA 3.0)'` for the
 * in-app attribution line, alongside `sourceId`/`sourceProvider` for
 * idempotent re-import + traceability.
 *
 * Usage: node scripts/importWgerExercises.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../public/data/exercise-library.json');
const API = 'https://wger.de/api/v2';

// Same 14-value muscle/category vocabulary the old free-exercise-db dataset
// used (confirmed by inspecting public/data/exercise-library.json), so the
// existing STARTER_TEMPLATES muscle-group blueprints
// (api/coach-assets/_lib/starterLibraryData.ts) keep working unmodified.
const MUSCLE_MAP = {
  'Anterior deltoid': 'Shoulders',
  'Biceps brachii': 'Biceps',
  'Biceps femoris': 'Hamstrings',
  Brachialis: 'Biceps',
  Gastrocnemius: 'Calves',
  'Gluteus maximus': 'Glutes',
  'Latissimus dorsi': 'Lats',
  'Obliquus externus abdominis': 'Abdominals',
  'Pectoralis major': 'Chest',
  'Quadriceps femoris': 'Quadriceps',
  'Rectus abdominis': 'Abdominals',
  'Serratus anterior': 'Chest',
  Soleus: 'Calves',
  Trapezius: 'Traps',
  'Triceps brachii': 'Triceps',
};
// wger has no dedicated muscle for "Adductors"/"Lower Back"/"Middle Back" —
// fall back from the exercise's CATEGORY when no primary muscle mapped.
// Honest limitation, not fabricated data: those three buckets in
// STARTER_TEMPLATES will draw fewer/no picks from this dataset (the existing
// `pickByMuscles` round-robin already degrades gracefully when a bucket is
// sparse or empty — confirmed in starterLibraryBuild.ts).
const CATEGORY_FALLBACK = {
  Abs: 'Abdominals',
  Arms: 'Biceps',
  Back: 'Lats',
  Calves: 'Calves',
  Cardio: 'Other',
  Chest: 'Chest',
  Legs: 'Quadriceps',
  Shoulders: 'Shoulders',
};
const EQUIPMENT_MAP = {
  Barbell: 'Barbell',
  Bench: 'Other',
  'Cable machine': 'Cable',
  Dumbbell: 'Dumbbell',
  'Gym mat': 'Other',
  'Incline bench': 'Other',
  Kettlebell: 'Kettlebells',
  'Pull-up bar': 'Body Only',
  'Resistance band': 'Bands',
  'SZ-Bar': 'Barbell',
  'Swiss Ball': 'Exercise Ball',
  'none (bodyweight exercise)': 'Body Only',
};

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAllPages(path) {
  const results = [];
  let url = `${API}${path}`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    const page = await res.json();
    results.push(...page.results);
    url = page.next;
  }
  return results;
}

console.log('Fetching wger language table...');
const languages = await fetchAllPages('/language/?limit=100');
const langIdByCode = Object.fromEntries(languages.map((l) => [l.short_name, l.id]));
const EN_ID = langIdByCode.en;
const AR_ID = langIdByCode.ar;
if (!EN_ID) throw new Error('wger language table has no "en" entry — aborting.');

console.log('Fetching wger exercise catalog (exerciseinfo, paginated)...');
const raw = await fetchAllPages('/exerciseinfo/?limit=100');
console.log(`Fetched ${raw.length} raw exercise records.`);

let arCovered = 0;
const out = [];
for (const ex of raw) {
  const enT = ex.translations.find((t) => t.language === EN_ID) ?? ex.translations[0];
  if (!enT || !enT.name) continue; // no usable name in any language — skip
  const arT = AR_ID ? ex.translations.find((t) => t.language === AR_ID) : undefined;
  if (arT?.description) arCovered += 1;

  const primaryMuscleName = ex.muscles?.[0]?.name;
  const targetMuscle = MUSCLE_MAP[primaryMuscleName] ?? CATEGORY_FALLBACK[ex.category?.name] ?? 'Other';
  const secondaryMuscles = (ex.muscles_secondary ?? [])
    .map((m) => MUSCLE_MAP[m.name])
    .filter((v, i, arr) => v && arr.indexOf(v) === i);
  const muscles = [ex.muscles?.[0]?.name, ...(ex.muscles_secondary ?? []).map((m) => m.name)].filter(Boolean);
  const equipmentNames = (ex.equipment ?? []).map((e) => e.name);
  const equipmentList = equipmentNames.length ? equipmentNames : ['none (bodyweight exercise)'];
  const equipment = EQUIPMENT_MAP[equipmentList[0]] ?? 'Other';

  const image = ex.images?.[0]?.image ?? null;
  const video = ex.videos?.[0]?.video ?? null;

  out.push({
    id: `wger-${ex.id}`,
    name: enT.name,
    targetMuscle,
    warmupSets: '',
    warmupSetCount: 0,
    workingSets: 3,
    repRange: '8-12',
    rir: '',
    tempo: '',
    notes: { en: stripHtml(enT.description), ar: arT ? stripHtml(arT.description) : '' },
    restSec: 90,
    videoId: null,
    videoUrl: video,
    category: targetMuscle,
    equipment,
    tags: muscles.map((m) => m.toLowerCase()),
    progressionNotes: '',
    imageUrl: image,
    images: ex.images?.map((i) => i.image) ?? [],
    // Richer metadata (additive — see src/types/index.ts's Exercise interface).
    sourceId: String(ex.id),
    sourceProvider: 'wger',
    sourceCategory: ex.category?.name ?? null,
    muscles: muscles.length ? muscles : undefined,
    secondaryMuscles: secondaryMuscles.length ? secondaryMuscles : undefined,
    equipmentList,
    source: 'wger.de (CC BY-SA 3.0)',
  });
}

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

const bytes = Buffer.byteLength(JSON.stringify(out));
console.log('--- Import summary ---');
console.log(`Exercises written:      ${out.length}`);
console.log(`With a video:           ${out.filter((e) => e.videoUrl).length}`);
console.log(`With an image:          ${out.filter((e) => e.imageUrl).length}`);
console.log(`Arabic description cov: ${arCovered}/${raw.length} (${((arCovered / raw.length) * 100).toFixed(1)}%)`);
console.log(`Output file:            ${OUT_PATH}`);
console.log(`Raw size:               ${(bytes / 1024).toFixed(1)} KB`);
