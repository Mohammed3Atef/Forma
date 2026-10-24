import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ExerciseDatasetSchema, FoodDatasetSchema } from './schemas.js';
import { indexDatasets } from './dataset.js';
import { search } from './search.js';
import { STARTER_FOODS } from '../../coach-assets/_lib/starterLibraryData.js';

/**
 * B4 migration step E — shadow comparison of search, old vs new, on real queries (English, Modern
 * Standard Arabic, Egyptian Arabic, misspellings). "Old" = what a coach had: the nutrition editor's
 * substring match over the 84 legacy starter foods / the plan picker's substring match over the
 * 909 legacy starter exercises (English only). "New" = the catalog search. A result is relevant when
 * it is one of the query's expected catalog items (old: a legacy row mapped to one of them).
 *
 * Gates (new search): top-3 hit rate ≥ 90 % overall and ≥ 85 % for Arabic / Egyptian queries;
 * p95 latency < 15 ms per query in memory (the network round trip is ~100× that; the measured value is reported). `SHADOW_REPORT=1` also writes
 * data/catalog-reports/shadow-{foods,exercises}.{json,md}.
 */
const ROOT = process.cwd();
const read = (f: string) => JSON.parse(readFileSync(join(ROOT, 'data/catalog', f), 'utf8'));
const loaded = indexDatasets(ExerciseDatasetSchema.parse(read('exercises.json')), FoodDatasetSchema.parse(read('foods.json')));

type Q = [query: string, expected: string[], lang: 'en' | 'ar' | 'eg' | 'typo'];
const RICE = ['ff_rice_white_medium_cooked', 'ff_rice_white_long_cooked', 'ff_rice_white_dry'];
const FOOD_QUERIES: Q[] = [
  ['rice', RICE, 'en'], ['white rice cooked', ['ff_rice_white_medium_cooked', 'ff_rice_white_long_cooked'], 'en'], ['brown rice', ['ff_rice_brown_cooked'], 'en'], ['pasta', ['ff_pasta_cooked', 'ff_pasta_dry'], 'en'], ['spaghetti', ['ff_pasta_cooked'], 'en'],
  ['oats', ['ff_oats_dry', 'ff_oatmeal_cooked'], 'en'], ['oatmeal', ['ff_oatmeal_cooked', 'ff_oats_dry'], 'en'], ['pita bread', ['ff_bread_pita_white', 'ff_bread_pita_whole_wheat'], 'en'], ['toast', ['ff_bread_white', 'ff_bread_whole_wheat'], 'en'], ['baladi bread', ['ff_baladi_bread'], 'en'],
  ['chicken breast', ['ff_chicken_breast_roasted', 'ff_chicken_breast_raw'], 'en'], ['chicken thigh', ['ff_chicken_thigh_roasted'], 'en'], ['eggs', ['ff_egg_whole_raw', 'ff_egg_boiled', 'ff_egg_fried', 'ff_egg_scrambled'], 'en'], ['boiled egg', ['ff_egg_boiled'], 'en'], ['egg white', ['ff_egg_white_raw'], 'en'],
  ['tuna', ['ff_tuna_water', 'ff_tuna_oil'], 'en'], ['salmon', ['ff_salmon_cooked'], 'en'], ['tilapia', ['ff_tilapia_cooked', 'ff_tilapia_raw'], 'en'], ['shrimp', ['ff_shrimp_cooked'], 'en'], ['ground beef', ['ff_beef_ground_90_cooked', 'ff_beef_ground_90_raw', 'ff_beef_ground_80_raw', 'ff_beef_ground_80_cooked'], 'en'],
  ['steak', ['ff_beef_sirloin_lean_grilled'], 'en'], ['liver', ['ff_beef_liver_fried', 'ff_chicken_liver'], 'en'], ['lentils', ['ff_lentils_boiled', 'ff_lentils_brown_dry', 'ff_lentils_red_dry'], 'en'], ['fava beans', ['ff_fava_beans_boiled', 'ff_fava_beans_canned', 'ff_fava_beans_dry'], 'en'], ['ful medames', ['ff_ful_with_oil', 'ff_fava_beans_boiled'], 'en'],
  ['chickpeas', ['ff_chickpeas_boiled', 'ff_chickpeas_canned'], 'en'], ['hummus', ['ff_hummus'], 'en'], ['tahini', ['ff_tahini'], 'en'], ['falafel', ['ff_falafel_chickpea', 'ff_taameya'], 'en'], ['milk', ['ff_milk_whole', 'ff_milk_2', 'ff_milk_skim'], 'en'],
  ['skim milk', ['ff_milk_skim'], 'en'], ['yogurt', ['ff_yogurt_plain_whole', 'ff_yogurt_plain_lowfat', 'ff_greek_yogurt_nonfat', 'ff_greek_yogurt_whole'], 'en'], ['greek yogurt', ['ff_greek_yogurt_nonfat', 'ff_greek_yogurt_whole'], 'en'], ['cottage cheese', ['ff_cottage_cheese_4', 'ff_cottage_cheese_1'], 'en'], ['feta', ['ff_feta', 'ff_white_cheese_domiati'], 'en'],
  ['cheddar', ['ff_cheddar'], 'en'], ['mozzarella', ['ff_mozzarella_part_skim'], 'en'], ['banana', ['ff_banana'], 'en'], ['apple', ['ff_apple'], 'en'], ['orange', ['ff_orange'], 'en'],
  ['mango', ['ff_mango'], 'en'], ['dates', ['ff_dates_deglet', 'ff_dates_medjool'], 'en'], ['watermelon', ['ff_watermelon'], 'en'], ['strawberries', ['ff_strawberries'], 'en'], ['potato', ['ff_potato_boiled', 'ff_potato_baked'], 'en'],
  ['sweet potato', ['ff_sweet_potato_baked'], 'en'], ['tomato', ['ff_tomato_raw'], 'en'], ['spinach', ['ff_spinach_raw', 'ff_spinach_boiled'], 'en'], ['olive oil', ['ff_olive_oil'], 'en'], ['peanut butter', ['ff_peanut_butter'], 'en'],
  ['almonds', ['ff_almonds'], 'en'], ['honey', ['ff_honey'], 'en'], ['whey protein', ['ff_whey_protein'], 'en'], ['koshary', ['ff_koshary'], 'en'], ['basbousa', ['ff_basbousa'], 'en'],
  ['رز', RICE, 'eg'], ['أرز أبيض مطبوخ', RICE, 'ar'], ['رز بني', ['ff_rice_brown_cooked'], 'eg'], ['مكرونة', ['ff_pasta_cooked', 'ff_pasta_dry', 'ff_pasta_whole_wheat_cooked'], 'eg'], ['شوفان', ['ff_oats_dry', 'ff_oatmeal_cooked'], 'ar'],
  ['عيش بلدي', ['ff_baladi_bread'], 'eg'], ['عيش شامي', ['ff_bread_pita_white', 'ff_bread_pita_whole_wheat'], 'eg'], ['صدور فراخ', ['ff_chicken_breast_roasted', 'ff_chicken_breast_raw'], 'eg'], ['صدر دجاج', ['ff_chicken_breast_roasted', 'ff_chicken_breast_raw'], 'ar'], ['بيض مسلوق', ['ff_egg_boiled'], 'ar'],
  ['بياض بيض', ['ff_egg_white_raw'], 'eg'], ['تونة', ['ff_tuna_water', 'ff_tuna_oil'], 'ar'], ['بلطي', ['ff_tilapia_cooked', 'ff_tilapia_raw'], 'eg'], ['جمبري', ['ff_shrimp_cooked'], 'eg'], ['لحمة مفرومة', ['ff_beef_ground_90_cooked', 'ff_beef_ground_90_raw', 'ff_beef_ground_80_raw', 'ff_beef_ground_80_cooked'], 'eg'],
  ['كبدة', ['ff_beef_liver_fried', 'ff_chicken_liver'], 'eg'], ['عدس', ['ff_lentils_boiled', 'ff_lentils_brown_dry', 'ff_lentils_red_dry', 'ff_lentil_soup'], 'ar'], ['فول', ['ff_fava_beans_boiled', 'ff_ful_with_oil', 'ff_fava_beans_canned', 'ff_fava_beans_dry'], 'eg'], ['طعمية', ['ff_taameya'], 'eg'], ['طحينة', ['ff_tahini'], 'ar'],
  ['لبن', ['ff_milk_whole', 'ff_milk_2', 'ff_milk_skim', 'ff_laban_rayeb'], 'eg'], ['زبادي', ['ff_yogurt_plain_whole', 'ff_yogurt_plain_lowfat', 'ff_greek_yogurt_nonfat', 'ff_greek_yogurt_whole'], 'eg'], ['جبنة قريش', ['ff_areesh_cheese'], 'eg'], ['جبنة بيضا', ['ff_white_cheese_domiati'], 'eg'], ['موز', ['ff_banana'], 'ar'],
  ['تفاح', ['ff_apple'], 'ar'], ['برتقان', ['ff_orange'], 'eg'], ['بلح', ['ff_dates_deglet', 'ff_dates_medjool'], 'eg'], ['بطاطس', ['ff_potato_boiled', 'ff_potato_baked', 'ff_french_fries_oven'], 'eg'], ['ملوخية', ['ff_molokhia_soup', 'ff_jute_leaves_boiled'], 'eg'],
  ['بامية', ['ff_okra_boiled'], 'eg'], ['زيت زيتون', ['ff_olive_oil'], 'ar'], ['سمنة', ['ff_ghee'], 'eg'], ['كشري', ['ff_koshary'], 'eg'], ['محشي', ['ff_mahshi_kousa'], 'eg'],
  ['chiken brest', ['ff_chicken_breast_roasted', 'ff_chicken_breast_raw'], 'typo'], ['bannana', ['ff_banana'], 'typo'], ['brocoli', ['ff_broccoli_boiled'], 'typo'], ['yoghurt', ['ff_yogurt_plain_whole', 'ff_yogurt_plain_lowfat', 'ff_greek_yogurt_nonfat', 'ff_greek_yogurt_whole'], 'typo'], ['oatmeel', ['ff_oatmeal_cooked', 'ff_oats_dry'], 'typo'],
];

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}
function p95(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

describe('food search — shadow comparison (B4 step E)', () => {
  const legacyFoods = [...STARTER_FOODS].sort((a, b) => a.name.en.localeCompare(b.name.en));
  const legacyFor = (ids: string[]) => new Set(ids.flatMap((id) => loaded.foodById.get(id)?.legacyIds ?? []));
  const rows = FOOD_QUERIES.map(([q, expected, lang]) => {
    for (const id of expected) expect(loaded.foodById.has(id), `${q}: expected id ${id} is not a published food`).toBe(true);
    const t0 = performance.now();
    const res = search(loaded.foodIndex, q, { limit: 20 });
    const ms = performance.now() - t0;
    const top = res.hits.slice(0, 3).map((h) => h.item.id);
    // Old: the nutrition editor's library picker (substring on the English name, raw substring on Arabic).
    const old = legacyFoods.filter((f) => (f.name.en || '').toLowerCase().includes(q.toLowerCase()) || (f.name.ar || '').includes(q.trim())).slice(0, 3).map((f) => f.id);
    const legacy = legacyFor(expected);
    return { q, lang, expected, newTop3: top, newHit: top.some((id) => expected.includes(id)), newTotal: res.total, oldTop3: old, oldHit: old.some((id) => legacy.has(id)), ms };
  });

  it('new search: top-3 hit rate ≥ 90 % overall and ≥ 85 % for Arabic / Egyptian; p95 latency < 15 ms', () => {
    const misses = rows.filter((r) => !r.newHit).map((r) => `${r.q} → ${r.newTop3.join(', ') || '(none)'}`);
    const arabic = rows.filter((r) => r.lang === 'ar' || r.lang === 'eg');
    expect(pct(rows.filter((r) => r.newHit).length, rows.length), misses.join(' | ')).toBeGreaterThanOrEqual(90);
    expect(pct(arabic.filter((r) => r.newHit).length, arabic.length), misses.join(' | ')).toBeGreaterThanOrEqual(85);
    expect(p95(rows.map((r) => r.ms))).toBeLessThan(15);
    if (process.env.SHADOW_REPORT) writeReport('foods', rows);
  });
});

export function writeReport(kind: string, rows: { q: string; lang: string; newHit: boolean; oldHit: boolean; newTop3: string[]; oldTop3: string[]; ms: number }[]) {
  const by = (lang?: string) => rows.filter((r) => !lang || r.lang === lang);
  const summary = ['all', 'en', 'ar', 'eg', 'typo'].map((lang) => {
    const set = by(lang === 'all' ? undefined : lang);
    return { lang, queries: set.length, newTop3: pct(set.filter((r) => r.newHit).length, set.length), oldTop3: pct(set.filter((r) => r.oldHit).length, set.length) };
  });
  const dir = join(ROOT, 'data/catalog-reports');
  mkdirSync(dir, { recursive: true });
  const latency = { p50: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)], p95: p95(rows.map((r) => r.ms)) };
  const file = join(dir, `shadow-${kind}.json`);
  writeFileSync(file, `${JSON.stringify({ generatedAt: new Date().toISOString(), kind, summary, latencyMs: latency, rows }, null, 1)}\n`);
  const md = [
    `# Shadow comparison — ${kind} search (generated)`,
    '',
    '| Queries | n | New: relevant in top 3 | Old: relevant in top 3 |',
    '|---|---:|---:|---:|',
    ...summary.map((s) => `| ${s.lang} | ${s.queries} | ${s.newTop3} % | ${s.oldTop3} % |`),
    '',
    `Latency per query (in memory): p50 ${latency.p50.toFixed(3)} ms, p95 ${latency.p95.toFixed(3)} ms.`,
    '',
    '| Query | Lang | New top 3 | Old top 3 |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.q} | ${r.lang} | ${r.newHit ? '✓' : '✗'} ${r.newTop3.join(', ')} | ${r.oldHit ? '✓' : '✗'} ${r.oldTop3.join(', ')} |`),
    '',
  ];
  writeFileSync(join(dir, `shadow-${kind}.md`), md.join('\n'));
}

const X = (...ids: string[]) => ids.map((i) => `fx_${i}`);
const CURLS = X('barbell_curl', 'dumbbell_curl', 'alternating_dumbbell_curl', 'cable_curl', 'ez_bar_curl', 'preacher_curl', 'concentration_curl', 'incline_dumbbell_curl', 'hammer_curl', 'reverse_curl');
const TRICEPS = X('triceps_pushdown', 'rope_pushdown', 'overhead_cable_triceps_extension', 'ez_bar_skullcrusher', 'dumbbell_skullcrusher', 'overhead_dumbbell_triceps_extension', 'dumbbell_kickback', 'bench_dip', 'close_grip_bench_press', 'diamond_push_up');
const SQUATS = X('barbell_back_squat', 'front_squat', 'goblet_squat', 'bodyweight_squat', 'smith_machine_squat', 'hack_squat', 'pistol_squat', 'bulgarian_split_squat');
const DEADLIFTS = X('deadlift', 'romanian_deadlift', 'dumbbell_romanian_deadlift', 'single_leg_romanian_deadlift', 'sumo_deadlift', 'trap_bar_deadlift', 'rack_pull');
const PRESS_SH = X('barbell_overhead_press', 'seated_dumbbell_shoulder_press', 'machine_shoulder_press', 'arnold_press', 'push_press');
const LATERAL = X('dumbbell_lateral_raise', 'cable_lateral_raise', 'machine_lateral_raise');
const CHEST_FLY = X('dumbbell_fly', 'cable_crossover', 'low_to_high_cable_fly', 'pec_deck');
const BENCH = X('barbell_bench_press', 'incline_barbell_bench_press', 'decline_barbell_bench_press', 'dumbbell_bench_press', 'incline_dumbbell_press', 'smith_incline_press', 'close_grip_bench_press');
const CORE = X('crunch', 'plank', 'cable_crunch', 'hanging_leg_raise', 'lying_leg_raise', 'hanging_knee_raise', 'russian_twist', 'ab_wheel_rollout', 'dead_bug', 'hollow_hold', 'side_plank', 'mountain_climber', 'dumbbell_side_bend', 'pallof_press', 'bird_dog');
const EXERCISE_QUERIES: Q[] = [
  ['bench press', BENCH, 'en'], ['incline bench press', X('incline_barbell_bench_press', 'incline_dumbbell_press', 'smith_incline_press'), 'en'], ['dumbbell bench press', X('dumbbell_bench_press', 'incline_dumbbell_press'), 'en'], ['chest fly', CHEST_FLY, 'en'], ['cable crossover', X('cable_crossover', 'low_to_high_cable_fly'), 'en'],
  ['push up', X('push_up', 'decline_push_up', 'diamond_push_up', 'pike_push_up', 'handstand_push_up'), 'en'], ['dips', X('chest_dip', 'bench_dip'), 'en'], ['pec deck', X('pec_deck', 'reverse_pec_deck'), 'en'], ['pullover', X('dumbbell_pullover'), 'en'], ['pull up', X('pull_up', 'chin_up'), 'en'],
  ['chin up', X('chin_up', 'pull_up'), 'en'], ['lat pulldown', X('lat_pulldown', 'close_grip_lat_pulldown', 'straight_arm_pulldown'), 'en'], ['seated cable row', X('seated_cable_row', 'single_arm_cable_row', 'machine_row'), 'en'], ['barbell row', X('barbell_bent_over_row', 't_bar_row'), 'en'], ['dumbbell row', X('one_arm_dumbbell_row', 'chest_supported_dumbbell_row'), 'en'],
  ['t bar row', X('t_bar_row'), 'en'], ['face pull', X('face_pull'), 'en'], ['deadlift', DEADLIFTS, 'en'], ['romanian deadlift', X('romanian_deadlift', 'dumbbell_romanian_deadlift', 'single_leg_romanian_deadlift'), 'en'], ['rdl', X('romanian_deadlift', 'dumbbell_romanian_deadlift', 'single_leg_romanian_deadlift'), 'en'],
  ['hyperextension', X('back_extension'), 'en'], ['squat', SQUATS, 'en'], ['front squat', X('front_squat'), 'en'], ['goblet squat', X('goblet_squat'), 'en'], ['leg press', X('leg_press', 'leg_press_calf_raise'), 'en'],
  ['hack squat', X('hack_squat'), 'en'], ['lunges', X('walking_lunge', 'reverse_lunge', 'bulgarian_split_squat'), 'en'], ['bulgarian split squat', X('bulgarian_split_squat'), 'en'], ['leg curl', X('lying_leg_curl', 'seated_leg_curl'), 'en'], ['leg extension', X('leg_extension'), 'en'],
  ['hip thrust', X('barbell_hip_thrust', 'glute_bridge'), 'en'], ['glute bridge', X('glute_bridge', 'barbell_hip_thrust'), 'en'], ['calf raise', X('standing_calf_raise', 'seated_calf_raise', 'leg_press_calf_raise'), 'en'], ['shoulder press', PRESS_SH, 'en'], ['ohp', X('barbell_overhead_press'), 'en'],
  ['lateral raise', LATERAL, 'en'], ['front raise', X('dumbbell_front_raise'), 'en'], ['rear delt fly', X('rear_delt_fly', 'cable_rear_delt_fly', 'reverse_pec_deck'), 'en'], ['shrugs', X('barbell_shrug', 'dumbbell_shrug'), 'en'], ['bicep curl', CURLS, 'en'],
  ['hammer curl', X('hammer_curl'), 'en'], ['preacher curl', X('preacher_curl'), 'en'], ['tricep pushdown', X('triceps_pushdown', 'rope_pushdown'), 'en'], ['skull crusher', X('ez_bar_skullcrusher', 'dumbbell_skullcrusher'), 'en'], ['plank', X('plank', 'side_plank'), 'en'],
  ['crunches', X('crunch', 'cable_crunch'), 'en'], ['leg raise', X('hanging_leg_raise', 'lying_leg_raise', 'hanging_knee_raise'), 'en'], ['russian twist', X('russian_twist'), 'en'], ['burpees', X('burpee'), 'en'], ['jumping jacks', X('jumping_jack'), 'en'],
  ['kettlebell swing', X('kettlebell_swing'), 'en'], ['farmers walk', X('farmers_carry'), 'en'], ['treadmill', X('treadmill'), 'en'], ['hip flexor stretch', X('hip_flexor_stretch'), 'en'], ['foam roller', X('foam_roll_quads'), 'en'],
  ['بنش', BENCH, 'eg'], ['بنش عالي', X('incline_barbell_bench_press', 'incline_dumbbell_press', 'smith_incline_press'), 'eg'], ['ضغط', X('push_up', 'decline_push_up', 'diamond_push_up', 'pike_push_up', 'barbell_bench_press'), 'eg'], ['عقلة', X('pull_up', 'chin_up'), 'eg'], ['متوازي', X('chest_dip', 'bench_dip'), 'eg'],
  ['سحب أمامي', X('lat_pulldown', 'close_grip_lat_pulldown'), 'eg'], ['سحب أرضي', X('seated_cable_row', 'single_arm_cable_row', 'machine_row'), 'eg'], ['تجديف بالبار', X('barbell_bent_over_row', 't_bar_row'), 'ar'], ['ديدلفت', DEADLIFTS, 'eg'], ['الرفعة الميتة', DEADLIFTS, 'ar'],
  ['سكوات', SQUATS, 'eg'], ['القرفصاء بالبار', X('barbell_back_squat', 'front_squat', 'smith_machine_squat'), 'ar'], ['ليج بريس', X('leg_press', 'leg_press_calf_raise'), 'eg'], ['طعن', X('walking_lunge', 'reverse_lunge', 'bulgarian_split_squat'), 'ar'], ['رفرفة جانبي', LATERAL, 'eg'],
  ['ضغط كتف', PRESS_SH, 'eg'], ['شرجز', X('barbell_shrug', 'dumbbell_shrug'), 'eg'], ['باي', CURLS, 'eg'], ['تراي', TRICEPS, 'eg'], ['هامر', X('hammer_curl'), 'eg'],
  ['بلانك', X('plank', 'side_plank'), 'eg'], ['كرانش', X('crunch', 'cable_crunch'), 'eg'], ['سمانة', X('standing_calf_raise', 'seated_calf_raise', 'leg_press_calf_raise'), 'eg'], ['ليج كيرل', X('lying_leg_curl', 'seated_leg_curl'), 'eg'], ['هيب ثرست', X('barbell_hip_thrust', 'glute_bridge'), 'eg'],
  ['فلاي', CHEST_FLY, 'eg'], ['كروس', X('cable_crossover', 'low_to_high_cable_fly'), 'eg'], ['نط الحبل', X('jump_rope'), 'ar'], ['ضغط الدمبل على البنش المائل', X('incline_dumbbell_press'), 'ar'], ['تمرين البطن', CORE, 'ar'],
  ['bench pres', BENCH, 'typo'], ['squaat', SQUATS, 'typo'], ['dedlift', DEADLIFTS, 'typo'], ['lateral rase', LATERAL, 'typo'], ['bicep curls', CURLS, 'typo'],
  ['triceps push down', X('triceps_pushdown', 'rope_pushdown'), 'typo'], ['pullups', X('pull_up', 'chin_up'), 'typo'], ['shoulder pres', PRESS_SH, 'typo'], ['hip thust', X('barbell_hip_thrust', 'glute_bridge'), 'typo'], ['romanian dead lift', X('romanian_deadlift', 'dumbbell_romanian_deadlift', 'single_leg_romanian_deadlift'), 'typo'],
];

describe('exercise search — shadow comparison (B4 step E)', () => {
  const legacy = (JSON.parse(readFileSync(join(ROOT, 'public/data/exercise-library.json'), 'utf8')) as { id: string; name: string; targetMuscle?: string; category?: string; tags?: string[] }[]).sort((a, b) => a.name.localeCompare(b.name));
  const legacyFor = (ids: string[]) => new Set(ids.flatMap((id) => loaded.exerciseById.get(id)?.legacyIds ?? []));
  const rows = EXERCISE_QUERIES.map(([q, expected, lang]) => {
    for (const id of expected) expect(loaded.exerciseById.has(id), `${q}: expected id ${id} is not published`).toBe(true);
    const t0 = performance.now();
    const res = search(loaded.exerciseIndex, q, { limit: 20 });
    const ms = performance.now() - t0;
    const top = res.hits.slice(0, 3).map((h) => h.item.id);
    // Old: the plan picker's filter over a coach library seeded from the legacy dataset (English only).
    const n = q.toLowerCase();
    const old = legacy.filter((e) => e.name.toLowerCase().includes(n) || (e.targetMuscle ?? '').toLowerCase().includes(n) || (e.category ?? '').toLowerCase().includes(n) || (e.tags ?? []).some((t) => t.toLowerCase().includes(n))).slice(0, 3).map((e) => e.id);
    const lset = legacyFor(expected);
    return { q, lang, expected, newTop3: top, newHit: top.some((id) => expected.includes(id)), newTotal: res.total, oldTop3: old, oldHit: old.some((id) => lset.has(id)), ms };
  });

  it('new search: top-3 hit rate ≥ 90 % overall and ≥ 85 % for Arabic / Egyptian; p95 latency < 15 ms', () => {
    const misses = rows.filter((r) => !r.newHit).map((r) => `${r.q} → ${r.newTop3.join(', ') || '(none)'}`);
    const arabic = rows.filter((r) => r.lang === 'ar' || r.lang === 'eg');
    expect(pct(rows.filter((r) => r.newHit).length, rows.length), misses.join(' | ')).toBeGreaterThanOrEqual(90);
    expect(pct(arabic.filter((r) => r.newHit).length, arabic.length), misses.join(' | ')).toBeGreaterThanOrEqual(85);
    expect(p95(rows.map((r) => r.ms))).toBeLessThan(15);
    if (process.env.SHADOW_REPORT) writeReport('exercises', rows);
  });
});
