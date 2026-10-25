#!/usr/bin/env node
/**
 * B4.2 — ExerciseDB V1 → Forma's local, versioned exercise layer (provider decision: owner, 2026-10-24).
 *
 *   node scripts/catalog/fetch-exercisedb.mjs        # the records (cached)
 *   node scripts/catalog/fetch-exercisedb-media.mjs  # one look at every GIF + list thumbnails
 *   node scripts/catalog/import-exercisedb.mjs       # this: normalise, validate, write
 *   → data/catalog/exercisedb.json   (the dataset the API serves; versioned)
 *   → data/catalog-reports/exercisedb-import.{json,md}
 *
 * Repeatable and offline: it reads only the cached snapshot, the media manifest, the curated Forma
 * catalog, the translation sheets (`curation/exercisedb-ar/*.json`) and the reviewed overrides
 * (`curation/exercisedb-review.json`). Rules:
 *  - every source id is kept (`sourceIds`); a Forma id, once given, never changes (re-imports reuse
 *    the previous file's ids), so plans and coach copies that point at it stay valid;
 *  - records with the same name AND the same equipment / target / body part are ONE exercise:
 *    an identical GIF (same sha256) is an exact duplicate and dropped; a different GIF is another
 *    demonstration of it (alternate media);
 *  - a record that is the same movement as a curated Forma item is linked to it (`formaId`) — the
 *    Forma item gains the demonstration, nothing is duplicated, nothing curated is overwritten;
 *  - a variation (the same movement + incline / single-arm / seated …) stays its own item, linked by
 *    `variantOf` — never merged;
 *  - the source vocabulary is mapped onto Forma's ids (an unmapped term fails the import) and also
 *    kept verbatim (`terms`);
 *  - the GIF stays at its original URL; the app serves only the small WebP list thumbnail.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CACHE_ROOT } from './lib/fetchCache.mjs';
import { keyOf, MODIFIERS, tokens } from './lib/exerciseMatch.mjs';

const OUT = resolve('data/catalog/exercisedb.json');
const REPORT = resolve('data/catalog-reports/exercisedb-import');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const raw = read(join(CACHE_ROOT, 'exercisedb-raw.json'));
const mediaInfo = read(join(CACHE_ROOT, 'exercisedb-media.json'));
const forma = read('data/catalog/exercises.json').items.filter((e) => e.status === 'published');
const previous = existsSync(OUT) ? read(OUT) : null;
const reviewFile = resolve('scripts/catalog/curation/exercisedb-review.json');
const review = existsSync(reviewFile) ? Object.fromEntries(Object.entries(read(reviewFile)).filter(([k]) => !k.startsWith('_'))) : {};
const AR_DIR = resolve('scripts/catalog/curation/exercisedb-ar');
const arSheet = {};
if (existsSync(AR_DIR)) for (const f of readdirSync(AR_DIR).filter((x) => x.endsWith('.json')).sort()) Object.assign(arSheet, read(join(AR_DIR, f)));
const problems = [];

// ---- vocabulary: ExerciseDB term → Forma id (taxonomy.ts) ----------------------------------------
const BODY = { 'upper arms': 'arms', 'lower arms': 'arms', 'upper legs': 'legs', 'lower legs': 'legs', waist: 'core', chest: 'chest', back: 'back', shoulders: 'shoulders', cardio: 'cardio', neck: 'neck' };
const MUSCLE = {
  abdominals: 'abs', core: 'abs', obliques: 'obliques', pectorals: 'chest', glutes: 'glutes', biceps: 'biceps', brachialis: 'biceps', triceps: 'triceps',
  deltoids: 'delts', 'rear deltoids': 'rear-delts', 'rotator cuff': 'rotator-cuff', 'upper back': 'upper-back', rhomboids: 'upper-back', back: 'upper-back',
  'latissimus dorsi': 'lats', trapezius: 'traps', 'erector spinae': 'lower-back', 'serratus anterior': 'serratus', quadriceps: 'quads', hamstrings: 'hamstrings',
  adductors: 'adductors', abductors: 'abductors', 'hip flexors': 'hip-flexors', calves: 'calves', soleus: 'calves', 'tibialis anterior': 'calves', ankles: 'calves',
  'ankle stabilizers': 'calves', feet: 'calves', forearms: 'forearms', wrists: 'forearms', hands: 'forearms', 'wrist flexors': 'forearms', 'wrist extensors': 'forearms',
  'grip muscles': 'forearms', 'levator scapulae': 'neck', sternocleidomastoid: 'neck', 'cardiovascular system': 'cardio',
};
const EQUIP = {
  bodyweight: 'bodyweight', assisted: 'bodyweight', dumbbell: 'dumbbell', cable: 'cable', barbell: 'barbell', 'olympic barbell': 'barbell', 'ez bar': 'ez-bar',
  'trap bar': 'trap-bar', kettlebell: 'kettlebell', 'stability ball': 'stability-ball', 'bosu ball': 'bosu-ball', 'medicine ball': 'medicine-ball',
  'leverage machine': 'machine', 'sled machine': 'machine', 'stepmill machine': 'machine', 'ski ergometer': 'machine', 'upper body ergometer': 'machine',
  'smith machine': 'smith-machine', 'resistance band': 'band', weighted: 'added-weight', roller: 'foam-roller', 'suspension trainer': 'suspension',
  'elliptical machine': 'elliptical', 'stationary bike': 'bike', 'ab wheel': 'ab-wheel', towel: 'other', 'tennis ball': 'other', tire: 'other', hammer: 'other',
};
function equipmentOf(term, name) {
  const t = term.toLowerCase();
  if (t === 'rope') return /jump rope|skipping/.test(name) ? 'jump-rope' : /battl/.test(name) ? 'battle-ropes' : 'other';
  const id = EQUIP[t];
  if (!id) problems.push(`unmapped equipment "${term}" (${name})`);
  return id;
}
const muscleOf = (term, name) => MUSCLE[term.toLowerCase()] ?? (problems.push(`unmapped muscle "${term}" (${name})`), null);

// ---- names ---------------------------------------------------------------------------------------
const nameKey = (n) => n.trim().toLowerCase().replace(/\s+/g, ' ');
const UPPER = { ez: 'EZ', trx: 'TRX', bosu: 'BOSU', smith: 'Smith', v: 'V', 'v-up': 'V-up', 'v-sit': 'V-sit', 'z': 'Z', 'w': 'W', 'y': 'Y', 't': 'T', 'l-sit': 'L-sit', 'jm': 'JM', 'pnf': 'PNF' };
function displayName(key) {
  const words = key.split(' ').map((w, i) => {
    const bare = w.replace(/[()]/g, '');
    const up = UPPER[bare];
    const out = up ? w.replace(bare, up) : w;
    return i === 0 && !up ? out.charAt(0).toUpperCase() + out.slice(1) : out;
  });
  return words.join(' ');
}
const stepText = (s) => s.replace(/^\s*step\s*:?\s*\d+\s*[:.)-]?\s*/i, '').trim();

// ---- 1. normalise each record ---------------------------------------------------------------------
const records = raw.items.map((x) => {
  const key = nameKey(x.name);
  const equipment = [...new Set(x.equipments.map((e) => equipmentOf(e, key)).filter(Boolean))];
  if (/\bbench\b/.test(key) && !equipment.includes('bench') && !equipment.includes('machine')) equipment.push('bench');
  if (/\b(pull-?ups?|chin-?ups?|hanging|muscle-?ups?)\b/.test(key) && equipment.some((q) => q === 'bodyweight' || q === 'added-weight') && !equipment.includes('pull-up-bar')) equipment.push('pull-up-bar');
  if (/\bdips?\b/.test(key) && equipment.some((q) => q === 'bodyweight' || q === 'added-weight') && !equipment.includes('dip-station')) equipment.push('dip-station');
  const primary = [...new Set(x.targetMuscles.map((m) => muscleOf(m, key)).filter(Boolean))];
  const secondary = [...new Set(x.secondaryMuscles.map((m) => muscleOf(m, key)).filter(Boolean))].filter((m) => !primary.includes(m));
  let bodyPart = BODY[x.bodyParts[0]?.toLowerCase()] ?? (problems.push(`unmapped body part "${x.bodyParts[0]}" (${key})`), 'full-body');
  if (bodyPart === 'legs' && primary.includes('glutes')) bodyPart = 'glutes';
  const info = mediaInfo[x.exerciseId];
  return {
    sourceId: x.exerciseId,
    key,
    group: [key, [...x.equipments].map((e) => e.toLowerCase()).sort().join('+'), [...x.targetMuscles].sort().join('+'), x.bodyParts.join('+')].join('|'),
    equipment: equipment.slice(0, 4),
    primary: primary.slice(0, 3),
    secondary: secondary.slice(0, 6),
    bodyPart,
    terms: { bodyParts: x.bodyParts, targetMuscles: x.targetMuscles, secondaryMuscles: x.secondaryMuscles, equipments: x.equipments },
    steps: x.instructions.map(stepText).filter(Boolean),
    gifUrl: x.gifUrl,
    media: info?.sha256 ? info : null,
    mediaError: info?.error ?? (info ? null : 'not fetched'),
  };
});

// ---- 2. one exercise per name + equipment + target + body part ------------------------------------
const prevIdBySource = new Map((previous?.items ?? []).flatMap((it) => it.sourceIds.map((s) => [s, it.id])));
const groups = new Map();
for (const r of records) (groups.get(r.group) ?? groups.set(r.group, []).get(r.group)).push(r);
let exactDuplicates = 0;
let alternateDemos = 0;
const brokenMedia = [];
const items = [];
for (const members of groups.values()) {
  members.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const p = members[0];
  const reused = members.map((m) => prevIdBySource.get(m.sourceId)).find(Boolean);
  const id = reused ?? `edb_${p.sourceId}`;
  const media = [];
  const seenSha = new Set();
  for (const m of members) {
    if (!m.media) {
      brokenMedia.push({ sourceId: m.sourceId, name: m.key, url: m.gifUrl, error: m.mediaError });
      continue;
    }
    if (seenSha.has(m.media.sha256)) {
      exactDuplicates += 1;
      continue;
    }
    seenSha.add(m.media.sha256);
    if (media.length) alternateDemos += 1;
    media.push({
      id: `gif_${m.sourceId.toLowerCase()}_${m.media.sha256.slice(0, 6)}`,
      sourceId: m.sourceId,
      url: m.gifUrl,
      width: m.media.width,
      height: m.media.height,
      bytes: m.media.bytes,
      frames: m.media.frames,
      sha256: m.media.sha256,
      thumb: m.media.thumb.path,
      thumbBytes: m.media.thumb.bytes,
      role: media.length ? 'alternate' : 'primary',
    });
  }
  // A record whose GIF failed but whose twin has one is still the same exercise; with no GIF at
  // all the exercise is kept — it shows "no demonstration yet", never another exercise's GIF.
  const tr = arSheet[p.key];
  items.push({
    id,
    sourceIds: members.map((m) => m.sourceId),
    name: { en: displayName(p.key), ar: tr?.ar?.trim() ?? '' },
    sourceName: p.key,
    aliases: { en: [], ar: [], eg: (tr?.eg ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3) },
    bodyPart: p.bodyPart,
    primaryMuscles: p.primary.length ? p.primary : ['cardio'],
    secondaryMuscles: [...new Set(members.flatMap((m) => m.secondary))].filter((m) => !p.primary.includes(m)).slice(0, 6),
    equipment: p.equipment.length ? p.equipment : ['bodyweight'],
    terms: p.terms,
    instructions: { en: p.steps },
    media: media.slice(0, 6),
    formaId: null,
    variantOf: null,
    translation: tr?.ar ? 'draft' : 'missing',
  });
}

// ---- 3. the same movement as a curated Forma item → linked, not duplicated -----------------------
const formaIndex = forma.map((e) => ({ e, keys: [e.name.en, ...e.aliases.en].map((n) => keyOf(tokens(n))) }));
// Same movement also means the same main muscles (a triceps kickback is not a glute kickback).
const FAMILY = { chest: 'chest', serratus: 'chest', 'front-delts': 'shoulders', 'side-delts': 'shoulders', 'rear-delts': 'shoulders', delts: 'shoulders', 'rotator-cuff': 'shoulders', lats: 'back', 'upper-back': 'back', traps: 'back', 'lower-back': 'back', neck: 'back', biceps: 'flexors', forearms: 'flexors', triceps: 'triceps', abs: 'core', obliques: 'core', 'hip-flexors': 'core', glutes: 'legs', quads: 'legs', hamstrings: 'legs', adductors: 'legs', abductors: 'legs', calves: 'legs', cardio: 'cardio' };
const sameMuscles = (a, b) => a.includes('cardio') || b.includes('cardio') || a.some((m) => b.some((n) => FAMILY[m] === FAMILY[n]));
// Support gear (bench, box, bars) says nothing about the movement's loading: compare the rest.
const SUPPORT = new Set(['bench', 'box', 'pull-up-bar', 'dip-station']);
const coreGear = (eq) => {
  const c = eq.filter((q) => !SUPPORT.has(q));
  return c.length ? c : ['bodyweight'];
};
const compatible = (a, b) => coreGear(a).some((q) => coreGear(b).includes(q));
const gearScore = (a, b) => {
  const ca = coreGear(a);
  const cb = coreGear(b);
  return ca.filter((q) => cb.includes(q)).length / new Set([...ca, ...cb]).size;
};
for (const it of items) {
  const r = review[it.sourceName];
  if (r && 'formaId' in r) {
    if (r.formaId && !forma.some((e) => e.id === r.formaId)) problems.push(`review: ${it.sourceName} → unknown ${r.formaId}`);
    it.formaId = r.formaId ?? null;
    if ('variantOf' in r) it.variantOf = r.variantOf ?? null;
    continue;
  }
  const k = keyOf(tokens(it.sourceName));
  const hit = formaIndex
    .filter(({ e, keys }) => keys.includes(k) && compatible(it.equipment, e.equipment) && sameMuscles(it.primaryMuscles, e.primaryMuscles))
    .sort((x, y) => gearScore(it.equipment, y.e.equipment) - gearScore(it.equipment, x.e.equipment))[0];
  if (hit) it.formaId = hit.e.id;
}
// Two ExerciseDB items on one Forma item: only the closest stays linked (same equipment set first).
const byForma = new Map();
for (const it of items.filter((x) => x.formaId)) (byForma.get(it.formaId) ?? byForma.set(it.formaId, []).get(it.formaId)).push(it);
for (const [fid, list] of byForma) {
  if (list.length < 2) continue;
  const e = forma.find((x) => x.id === fid);
  list.sort((a, b) => gearScore(b.equipment, e.equipment) - gearScore(a.equipment, e.equipment) || a.id.localeCompare(b.id));
  for (const extra of list.slice(1)) {
    if (review[extra.sourceName]?.formaId === fid) continue; // a reviewer linked both on purpose
    extra.formaId = null;
    extra.variantOf = fid;
  }
}

// ---- 4. variations: the same movement + modifiers → `variantOf` (kept separate) -------------------
const bases = [
  ...items.filter((x) => !x.formaId).map((x) => ({ id: x.id, key: keyOf(tokens(x.sourceName)), equipment: x.equipment })),
  ...forma.map((e) => ({ id: e.id, key: keyOf(tokens(e.name.en)), equipment: e.equipment })),
];
for (const it of items) {
  const r = review[it.sourceName];
  if (r && 'formaId' in r) continue; // decided by the review in step 3
  if (it.formaId || it.variantOf) continue;
  if (r && 'variantOf' in r) {
    it.variantOf = r.variantOf ?? null;
    continue;
  }
  const own = new Set(keyOf(tokens(it.sourceName)).split(' ').filter(Boolean));
  let best = null;
  for (const b of bases) {
    if (b.id === it.id || !compatible(it.equipment, b.equipment)) continue;
    const bk = new Set(b.key.split(' ').filter(Boolean));
    if (!bk.size || bk.size >= own.size || ![...bk].every((t) => own.has(t))) continue;
    const extra = [...own].filter((t) => !bk.has(t));
    if (extra.length > 2 || !extra.every((t) => MODIFIERS.has(t))) continue;
    const score = bk.size * 10 + (b.id.startsWith('fx_') ? 1 : 0);
    if (!best || score > best.score) best = { id: b.id, score };
  }
  if (best) it.variantOf = best.id;
}

// ---- 5. checks ------------------------------------------------------------------------------------
const ids = new Set();
for (const it of items) {
  if (ids.has(it.id)) problems.push(`duplicate id ${it.id}`);
  ids.add(it.id);
  if (!it.instructions.en.length) problems.push(`${it.id}: no instructions`);
}
for (const pi of previous?.items ?? []) if (!ids.has(pi.id) && !items.some((x) => x.sourceIds.some((s) => pi.sourceIds.includes(s)))) problems.push(`previous item ${pi.id} disappeared — ids must never be dropped silently`);
items.sort((a, b) => a.name.en.localeCompare(b.name.en) || a.id.localeCompare(b.id));
if (problems.length) {
  console.error(problems.slice(0, 40).join('\n'));
  throw new Error(`${problems.length} problem(s) — dataset not written`);
}

// ---- 6. write (new version only when the content changed) -----------------------------------------
const body = { items };
const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
let version = previous?.version ?? null;
if (!previous || previous.contentHash !== hash) {
  const n = previous?.version?.startsWith(`edb-v1-${today}-`) ? Number(previous.version.split('-').pop()) + 1 : 1;
  version = `edb-v1-${today}-${n}`;
}
const dataset = {
  version,
  contentHash: hash,
  source: {
    provider: 'exercisedb',
    name: 'ExerciseDB V1 (AscendAPI)',
    api: raw.api,
    fetchedAt: raw.fetchedAt,
    advertised: raw.total,
    attribution: { en: 'Exercise data and demonstrations: ExerciseDB by AscendAPI', ar: 'بيانات التمارين وعروضها: ExerciseDB من AscendAPI', url: 'https://ascendapi.com' },
    decision: 'Owner-confirmed use (B4.2 brief, 2026-10-24)',
  },
  ...body,
};
mkdirSync(resolve('data/catalog'), { recursive: true });
writeFileSync(OUT, JSON.stringify(dataset));

const linked = items.filter((x) => x.formaId);
const standalone = items.filter((x) => !x.formaId);
const withGif = items.filter((x) => x.media.length);
const report = {
  version,
  generatedAt: new Date().toISOString(),
  source: { advertised: raw.total, fetched: raw.items.length, fetchedAt: raw.fetchedAt },
  records: raw.items.length,
  duplicateRecordsFolded: raw.items.length - items.length,
  exactDuplicatesRemoved: exactDuplicates,
  alternateDemonstrationsMerged: alternateDemos,
  items: items.length,
  linkedToFormaItems: linked.length,
  formaItemsGainingADemonstration: new Set(linked.map((x) => x.formaId)).size,
  standaloneItems: standalone.length,
  variantsLinked: items.filter((x) => x.variantOf).length,
  finalCatalogCount: forma.length + standalone.length,
  formaCurated: forma.length,
  media: { itemsWithGif: withGif.length, itemsWithoutGif: items.length - withGif.length, gifs: items.reduce((n, x) => n + x.media.length, 0), brokenLinks: brokenMedia.length, gifBytesAtSource: items.reduce((n, x) => n + x.media.reduce((m, g) => m + g.bytes, 0), 0), thumbBytes: items.reduce((n, x) => n + x.media.reduce((m, g) => m + g.thumbBytes, 0), 0) },
  translation: { draft: items.filter((x) => x.translation === 'draft').length, missing: items.filter((x) => x.translation === 'missing').length, egAliases: items.filter((x) => x.aliases.eg.length).length },
  byBodyPart: Object.fromEntries(Object.entries(items.reduce((m, x) => ((m[x.bodyPart] = (m[x.bodyPart] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])),
  byEquipment: Object.fromEntries(Object.entries(items.reduce((m, x) => (x.equipment.forEach((q) => (m[q] = (m[q] ?? 0) + 1)), m), {})).sort((a, b) => b[1] - a[1])),
  datasetBytes: statSync(OUT).size,
  brokenMedia,
  links: linked.map((x) => ({ id: x.id, name: x.name.en, formaId: x.formaId })),
};
mkdirSync(resolve('data/catalog-reports'), { recursive: true });
writeFileSync(`${REPORT}.json`, JSON.stringify(report, null, 2));
const md = [
  '# ExerciseDB V1 import (generated — do not edit)',
  '',
  `Version **${version}** · source fetched ${raw.fetchedAt} · ${raw.total} records advertised, ${raw.items.length} fetched.`,
  '',
  '| | Count |',
  '|---|---:|',
  `| Records | ${report.records} |`,
  `| Duplicate records folded into the exercise they repeat (same name, equipment, target, body part) | ${report.duplicateRecordsFolded} |`,
  `| … of which an identical GIF (exact duplicate) | ${exactDuplicates} |`,
  `| … of which a dead GIF link (404 at the source; the exercise keeps its working GIF) | ${brokenMedia.length} |`,
  `| … of which a different GIF (kept as an alternate demonstration) | ${alternateDemos} |`,
  `| ExerciseDB exercises | ${items.length} |`,
  `| … the same movement as a curated Forma item (linked; the Forma item gains the demonstration) | ${linked.length} |`,
  `| … standalone | ${standalone.length} |`,
  `| Variations linked (\`variantOf\`, kept separate) | ${report.variantsLinked} |`,
  `| **Final catalog** (${forma.length} curated + ${standalone.length} ExerciseDB) | **${report.finalCatalogCount}** |`,
  `| Exercises with a GIF / without | ${withGif.length} / ${items.length - withGif.length} |`,
  `| Arabic names (draft) / missing | ${report.translation.draft} / ${report.translation.missing} |`,
  `| Dataset file | ${(report.datasetBytes / 1e6).toFixed(2)} MB |`,
  `| List thumbnails (WebP, served with the app) | ${(report.media.thumbBytes / 1e6).toFixed(2)} MB |`,
  `| GIFs (served from their original URL, never bundled) | ${(report.media.gifBytesAtSource / 1e6).toFixed(1)} MB at source |`,
  '',
  '## Linked to curated Forma items',
  '',
  '| ExerciseDB | Forma |',
  '|---|---|',
  ...linked.map((x) => `| ${x.name.en} (\`${x.id}\`) | \`${x.formaId}\` |`),
  '',
  brokenMedia.length ? '## Broken media links\n\n' + brokenMedia.map((b) => `- \`${b.sourceId}\` ${b.name}: ${b.error}`).join('\n') : '## Broken media links\n\nNone.',
  '',
].join('\n');
writeFileSync(`${REPORT}.md`, md);
console.log(JSON.stringify({ version, items: items.length, linked: linked.length, standalone: standalone.length, finalCatalogCount: report.finalCatalogCount, exactDuplicates, alternateDemos, variants: report.variantsLinked, withGif: withGif.length, broken: brokenMedia.length, translation: report.translation, bytes: report.datasetBytes }));
