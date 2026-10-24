/**
 * B4.1 slice 2 — the reviewable mapping of the owner-preferred video source
 * ("Free Exercise DB with Videos", github.com/michael-lemarec/free-exercise-db-api: 317 exercises,
 * 593 videos) onto the Forma catalog and the legacy 909-exercise starter. READ-ONLY: it reads the
 * source's dataset and licence pages (bounded, cached — `lib/fetchCache.mjs`), the committed Forma
 * datasets and the legacy starter file, and writes a report. It imports nothing, hosts nothing and
 * plays nothing: every source video is BLOCKED until its rights are cleared (B4_MEDIA_RIGHTS_AND_QA
 * §6), and no source text (instructions, cues) is copied — only ids and names, as references.
 *
 *   node scripts/catalog/fedb-mapping.mjs
 *   → data/catalog-reports/fedb-mapping.json (+ .md)
 *
 * Confidence (never a merge — a mapping is applied only by a reviewed, owner-approved step):
 *  - exact     same movement: the names agree once spelling, compounds, "one/single" and the
 *              equipment word are normalised, and the equipment is compatible;
 *  - variant   the source adds a modifier the Forma item lacks (incline, close-grip, single-arm,
 *              seated, reverse …) — a DIFFERENT exercise, listed against its nearest Forma item;
 *  - none      no Forma item — a candidate for curation.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFetcher } from './lib/fetchCache.mjs';

const REPO = 'michael-lemarec/free-exercise-db-api';
const fetcher = createFetcher('fedb', { maxRequests: 5 });
const repo = await fetcher.json(`https://api.github.com/repos/${REPO}`);
const source = await fetcher.json(`https://raw.githubusercontent.com/${REPO}/main/data/exercises.json`);
const read = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));
const forma = read('data/catalog/exercises.json').items.filter((e) => e.status === 'published');
const legacy = read('public/data/exercise-library.json');
/** Reviewed decisions (by source name) — they override the automatic match below. */
const review = read('scripts/catalog/curation/fedb-review.json');
const formaById = new Map(forma.map((e) => [e.id, e]));
const problems = [];

// ---- normalisation (English names; deliberately conservative)
const SYN = [
  [/\bbycicle\b/g, 'bicycle'],
  [/\bpush ?ups?\b/g, 'pushup'],
  [/\bpress ?ups?\b/g, 'pushup'],
  [/\bpull ?ups?\b/g, 'pullup'],
  [/\bchin ?ups?\b/g, 'chinup'],
  [/\bsit ?ups?\b/g, 'situp'],
  [/\bstep ?ups?\b/g, 'stepup'],
  [/\bpull ?downs?\b/g, 'pulldown'],
  [/\bpush ?downs?\b/g, 'pushdown'],
  [/\bdead ?lifts?\b/g, 'deadlift'],
  [/\bskull ?crushers?\b/g, 'skullcrusher'],
  [/\bkick ?backs?\b/g, 'kickback'],
  [/\bcross ?overs?\b/g, 'crossover'],
  [/\bflyes\b/g, 'fly'],
  [/\bflies\b/g, 'fly'],
  [/\bone[ -]?(arm|leg)\b/g, 'single $1'],
  [/\bsingle[ -]?(arm|leg)\b/g, 'single $1'],
  [/\bdb\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\bez[ -]?(bar|barbell)\b/g, 'ezbar'],
  [/\blever(age)?\b/g, 'machine'],
  [/\bbody ?weight\b/g, ''],
  [/\btriceps\b/g, 'tricep'],
  [/\bbiceps\b/g, 'bicep'],
  [/\bcrunches\b/g, 'crunch'],
];
const singular = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') ? w.slice(0, -1) : w);
function tokens(name) {
  let t = name.toLowerCase().replace(/[’']/g, '').replace(/[()]/g, ' ').replace(/[^a-z0-9]+/g, ' ');
  for (const [re, to] of SYN) t = t.replace(re, to);
  return t.split(' ').filter(Boolean).map(singular);
}
const EQUIP_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'band', 'kettlebell', 'smith', 'ezbar', 'weighted', 'sled', 'rope', 'stability', 'ball', 'with', 'on', 'the', 'a']);
const MODIFIERS = new Set(['incline', 'decline', 'close', 'wide', 'narrow', 'grip', 'reverse', 'single', 'alternate', 'alternating', 'seated', 'standing', 'lying', 'kneeling', 'prone', 'supine', 'bent', 'over', 'hammer', 'preacher', 'concentration', 'front', 'rear', 'side', 'lateral', 'overhead', 'sumo', 'romanian', 'stiff', 'bulgarian', 'split', 'goblet', 'jump', 'pause', 'deficit', 'assisted', 'weighted', 'twisting', 'oblique', 'cross', 'body', 'floor', 'svend', 'pike', 'diamond', 'archer', 'spider', 'drag', 'zottman', 'svend', 'w', 'y', 't', 'iso', 'isometric', 'half', 'partial', 'rack', 'pin', 'box', 'hack', 'v', 'neutral', 'underhand', 'overhand', 'high', 'low', 'upright', 'tempo', 'band', 'resisted', 'banded', 'elevated', 'feet', 'knee', 'hip']);
const EQUIP_MAP = { 'leverage machine': ['machine'], 'body weight': ['bodyweight', 'pull-up-bar', 'dip-station', 'bench', 'box'], band: ['band'], barbell: ['barbell'], rope: ['cable', 'jump-rope'], 'stability ball': ['stability-ball'], cable: ['cable'], dumbbell: ['dumbbell'], 'ez barbell': ['ez-bar'], kettlebell: ['kettlebell'], weighted: ['plate', 'bodyweight'], 'sled machine': ['machine'], 'smith machine': ['smith-machine'] };

const keyOf = (ts) => ts.filter((t) => !EQUIP_WORDS.has(t)).sort().join(' ');
const formaIndex = forma.map((e) => ({ e, keys: [e.name.en, ...e.aliases.en].map((n) => ({ ts: tokens(n), key: keyOf(tokens(n)) })) }));
const legacyIndex = legacy.map((l) => ({ l, key: keyOf(tokens(l.name)) }));

function equipmentOk(src, e) {
  const allowed = EQUIP_MAP[src.equipment] ?? [];
  return e.equipment.some((q) => allowed.includes(q));
}

const rows = source.map((s) => applyReview(s, autoMatch(s)));

function applyReview(s, row) {
  const r = review[s.name];
  if (!r) return { ...row, review: 'auto' };
  const { formaNameEn, formaNameAr, formaAliasesEg, formaEquipment, formaPrimaryMuscles, formaVariant, nearestNameEn, nearestNameAr, nearestAliasesEg, nearestEquipment, nearestPrimaryMuscles, nearestVariant, nearestFormaId, variantModifiers, formaId, ...base } = row;
  const id = r.formaId ?? r.nearestFormaId ?? null;
  const e = id ? formaById.get(id) : null;
  if (id && !e) problems.push(`${s.name}: reviewed id ${id} is not a published catalog item`);
  const out = { ...base, confidence: r.confidence, formaId: r.confidence === 'exact' ? id : null, review: 'reviewed', reviewNote: r.note ?? null };
  if (r.confidence === 'variant' && e) Object.assign(out, { nearestFormaId: id }, formaFields(e, true));
  if (r.confidence === 'exact' && e) Object.assign(out, formaFields(e));
  return out;
}

function autoMatch(s) {
  const ts = tokens(s.name);
  const key = keyOf(ts);
  const sourceVideos = ['male', 'female'].filter((g) => s.videos?.[g]).length;
  const base = { sourceId: s.id, sourceName: s.name, sourceEquipment: s.equipment, sourceBodyPart: s.bodyPart, sourceTarget: s.target, videoCount: sourceVideos, videoLicense: 'blocked — rights unverified (seller unknown; not licensed by the repository)' };
  // exact: same normalised name (or alias) with compatible equipment
  const exact = formaIndex.find(({ e, keys }) => equipmentOk(s, e) && keys.some((k) => k.key === key));
  const legacyHit = legacyIndex.filter((x) => x.key === key).map((x) => x.l.id);
  const legacyMatch = legacyHit.length ? legacyHit.slice(0, 3) : [];
  if (exact) return { ...base, confidence: 'exact', formaId: exact.e.id, ...formaFields(exact.e), legacyMatch };
  // variant: the source = a Forma item + modifier(s) (or minus modifiers) with compatible equipment
  let best = null;
  for (const { e, keys } of formaIndex) {
    if (!equipmentOk(s, e)) continue;
    for (const k of keys) {
      const fk = new Set(k.key.split(' ').filter(Boolean));
      const sk = new Set(key.split(' ').filter(Boolean));
      if (!fk.size || !sk.size) continue;
      const extraS = [...sk].filter((t) => !fk.has(t));
      const extraF = [...fk].filter((t) => !sk.has(t));
      const shared = [...sk].filter((t) => fk.has(t)).length;
      const extras = [...extraS, ...extraF];
      if (shared >= 1 && extras.length && extras.every((t) => MODIFIERS.has(t)) && extras.length <= 3) {
        const score = shared - extras.length * 0.5;
        if (!best || score > best.score) best = { e, score, extras };
      }
    }
  }
  if (best) return { ...base, confidence: 'variant', formaId: null, nearestFormaId: best.e.id, variantModifiers: best.extras, ...formaFields(best.e, true), legacyMatch };
  return { ...base, confidence: 'none', formaId: null, legacyMatch };
}

function formaFields(e, nearest = false) {
  const p = nearest ? 'nearest' : 'forma';
  return {
    [`${p}NameEn`]: e.name.en,
    [`${p}NameAr`]: e.name.ar,
    [`${p}AliasesEg`]: e.aliases.eg,
    [`${p}Equipment`]: e.equipment,
    [`${p}PrimaryMuscles`]: e.primaryMuscles,
    [`${p}Variant`]: e.variantOf ?? null,
  };
}

const count = (c) => rows.filter((r) => r.confidence === c).length;
const videosIn = (c) => rows.filter((r) => !c || r.confidence === c).reduce((n, r) => n + r.videoCount, 0);
const summary = {
  source: { repo: REPO, license: repo.license?.spdx_id ?? null, pushedAt: repo.pushed_at, exercises: source.length, videos: videosIn() },
  forma: { published: forma.length, covered: new Set(rows.filter((r) => r.formaId).map((r) => r.formaId)).size },
  mapping: { exact: count('exact'), variant: count('variant'), none: count('none'), reviewed: rows.filter((r) => r.review === 'reviewed').length, autoUnreviewed: rows.filter((r) => r.review === 'auto').length },
  problems,
  videos: { advertised: 593, inDataset: videosIn(), verified: 0, eligible: 0, blocked: videosIn(), onExactMatches: videosIn('exact'), converted: 0, hosted: 0 },
};
mkdirSync(resolve('data/catalog-reports'), { recursive: true });
writeFileSync(resolve('data/catalog-reports/fedb-mapping.json'), `${JSON.stringify({ generatedBy: 'scripts/catalog/fedb-mapping.mjs', summary, rows }, null, 1)}\n`);

const md = [
  '# Video source mapping — Free Exercise DB with Videos (generated — do not edit)',
  '',
  `Source: github.com/${REPO} (repository licence ${summary.source.license}: code and metadata only). ${summary.source.exercises} exercises, ${summary.source.videos} videos.`,
  '',
  '**Every video is BLOCKED — rights unverified.** Nothing from this source is imported, hosted, published or streamed. Only ids and names are listed, as references.',
  '',
  '| Confidence | Exercises | Videos (blocked) |',
  '|---|---:|---:|',
  `| exact (same movement as a Forma item) | ${count('exact')} | ${videosIn('exact')} |`,
  `| variant (a different exercise — nearest Forma item shown) | ${count('variant')} | ${videosIn('variant')} |`,
  `| none (missing from Forma) | ${count('none')} | ${videosIn('none')} |`,
  '',
  `Forma items with an exact counterpart: ${summary.forma.covered} of ${summary.forma.published}.`,
  '',
  `Reviewed by a person: ${summary.mapping.reviewed}; automatic (exact = same normalised name + equipment; variant / none unreviewed): ${summary.mapping.autoUnreviewed}.${problems.length ? ` Problems: ${problems.join('; ')}` : ''}`,
  '',
  '| Source id | Source name | Equipment | Confidence | Review | Forma id | Forma name (EN / AR) | Legacy match | Videos |',
  '|---|---|---|---|---|---|---|---|---:|',
  ...rows.map((r) => `| ${r.sourceId} | ${r.sourceName} | ${r.sourceEquipment} | ${r.confidence}${r.variantModifiers ? ` (+${r.variantModifiers.join(', ')})` : ''} | ${r.review}${r.reviewNote ? ` — ${r.reviewNote}` : ''} | ${r.formaId ?? (r.nearestFormaId ? `≈ ${r.nearestFormaId}` : '—')} | ${r.formaNameEn ? `${r.formaNameEn} / ${r.formaNameAr}` : r.nearestNameEn ? `≈ ${r.nearestNameEn}` : '—'} | ${r.legacyMatch.join(', ') || '—'} | ${r.videoCount} |`),
];
writeFileSync(resolve('data/catalog-reports/fedb-mapping.md'), `${md.join('\n')}\n`);
console.log(JSON.stringify(summary, null, 1));
