/**
 * B4 — build the curated exercise dataset `data/catalog/exercises.json` from the curation sheets
 * (Forma-written content) + the cached wger snapshot (identity + licensed media) + the media
 * review record. Deterministic and idempotent: the same inputs produce a byte-identical file, an
 * item's `rev` rises only when its content changes, and the dataset version only when any item
 * does. Writes only local files — never a database, never a CDN.
 *
 *   node scripts/catalog/build-exercises.mjs [--dry-run]
 *
 * Then validate: `npx vitest run api/catalog` (schema, licences, duplicates, legacy mapping).
 * Outputs: data/catalog/exercises.json, data/catalog-reports/exercises-build.json
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CACHE_ROOT } from './lib/fetchCache.mjs';
import { candidateMedia, loadExerciseSheets, loadMediaReview } from './lib/curation.mjs';

const DRY = process.argv.includes('--dry-run');
const OUT = resolve('data/catalog/exercises.json');
const REPORT = resolve('data/catalog-reports/exercises-build.json');
const LEGACY = resolve('public/data/exercise-library.json');

const snapshot = JSON.parse(readFileSync(join(CACHE_ROOT, 'wger-snapshot.json'), 'utf8'));
const review = loadMediaReview();
const sheets = await loadExerciseSheets();
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const prevById = new Map((previous?.items ?? []).map((i) => [i.id, i]));
const legacyIds = new Set(JSON.parse(readFileSync(LEGACY, 'utf8')).map((e) => e.id));

const LICENSE = { 1: 'CC-BY-SA-3.0', 2: 'CC-BY-SA-4.0', 3: 'CC0-1.0' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4' };
/** B4.1: licensed wger videos re-encoded to H.264 MP4 by convert-videos.mjs (local files; hosting is an owner step). */
const CONVERSIONS = resolve('data/catalog-reports/video-conversions.json');
const converted = new Map((existsSync(CONVERSIONS) ? JSON.parse(readFileSync(CONVERSIONS, 'utf8')).files : []).map((f) => [f.key, f]));
const accepted = (r) => r === 'ok' || (typeof r === 'object' && r?.ok === true);
const wgerById = new Map(snapshot.exercises.map((e) => [e.id, e]));
const problems = [];

/** Content identity of an item: everything but its revision number. */
const contentHash = (item) => createHash('sha256').update(JSON.stringify({ ...item, rev: undefined })).digest('hex');
/** `rev` right after `status`, so the file reads naturally. */
const withRev = ({ id, status, ...rest }, rev) => ({ id, status, rev, ...rest });

function authorOf(m) {
  const named = (m.license_author ?? '').trim();
  // An email address is not a credit line; fall back to the project credit.
  if (named && !named.includes('@')) return named;
  return 'wger.de contributors';
}

/** B4.1: the re-encoded copy (H.264 MP4, ≤ 720p) of a wger video, for Forma's catalog CDN. */
function cdnVideo(s, c, conv, r, ok, cdnPath = conv.cdnPath, posterCdnPath = conv.posterCdnPath) {
  return {
    id: `vid_wger_${c.wger.id}`,
    kind: 'video',
    url: c.url,
    hosting: 'forma-cdn',
    cdnPath,
    role: 'alternate',
    ...(r?.label ? { label: r.label } : {}),
    format: 'mp4',
    mime: 'video/mp4',
    codec: 'h264',
    width: conv.output.width,
    height: conv.output.height,
    bytes: conv.output.bytes,
    durationSec: conv.output.durationSec,
    poster: { cdnPath: posterCdnPath, width: conv.poster.width, height: conv.poster.height, bytes: conv.poster.bytes },
    license: LICENSE[c.wger.license],
    author: c.credit ?? authorOf(c.wger),
    sourcePage: `https://wger.de/en/exercise/${s.wger}/view/`,
    source: { provider: 'wger', id: String(c.wger.id) },
    verified: ok ? 'visual' : 'source-link',
    rights: 'verified',
    review: ok ? 'approved' : 'pending',
    publication: ok ? 'published' : 'unpublished',
  };
}

// B4.1 pre-pass: a reviewed video that shows a DIFFERENT exercise (e.g. the dumbbell Romanian
// deadlift filed under the barbell one) is attached to that exercise (`moveTo`) — never shown here.
const movedTo = new Map();
for (const s of sheets) {
  for (const c of candidateMedia(s, snapshot, review)) {
    const r = review[c.key];
    const conv = c.kind === 'video' ? converted.get(c.key) : null;
    if (!r?.moveTo || !accepted(r) || conv?.status !== 'converted') continue;
    const target = r.moveTo;
    const file = `catalog/exercises/${target}/vid-${c.wger.id}`;
    movedTo.set(target, [...(movedTo.get(target) ?? []), { media: cdnVideo(s, c, conv, r, true, `${file}.mp4`, `${file}-poster.webp`), wger: s.wger, from: s.id }]);
  }
}

const seen = new Set();
const items = [];
const excluded = [];
for (const s of sheets) {
  if (seen.has(s.id)) problems.push(`${s.id}: duplicate id (${s.sheet})`);
  seen.add(s.id);
  const wger = s.wger ? wgerById.get(s.wger) : null;
  if (s.wger && !wger) problems.push(`${s.id}: wger ${s.wger} not in the snapshot`);

  const media = [];
  for (const c of candidateMedia(s, snapshot, review)) {
    const conv = c.kind === 'video' && /needs (transcoding|remux)/.test(c.reason ?? '') ? converted.get(c.key) : null;
    if (conv?.status === 'converted') {
      // Published only once a person has looked at it (media-review: `vid:<id>`); served only once
      // the CDN is configured. A clip of another exercise went to that exercise (pre-pass above).
      const r = review[c.key];
      const ok = accepted(r);
      if (ok && r?.moveTo) {
        excluded.push({ provider: 'wger', id: `video:${c.wger.id}`, reason: `${s.id}: shows another exercise — moved to ${r.moveTo}` });
        continue;
      }
      if (r && !ok) {
        excluded.push({ provider: 'wger', id: `video:${c.wger.id}`, reason: `${s.id}: ${String(r)}` });
        continue;
      }
      media.push(cdnVideo(s, c, conv, r, ok));
      continue;
    }
    if (c.reason) {
      const why = conv?.status === 'skipped' ? `${c.reason}; not converted: ${conv.reason}` : c.reason;
      excluded.push({ provider: 'wger', id: `${c.kind}:${c.wger.id}`, reason: `${s.id}: ${why}` });
      continue;
    }
    media.push({
      id: `${c.kind === 'image' ? 'img' : 'vid'}_wger_${c.wger.id}`,
      kind: c.kind,
      url: c.url,
      hosting: 'source',
      role: 'alternate',
      ...(review[c.key]?.label ? { label: review[c.key].label } : {}),
      format: c.format,
      mime: MIME[c.format],
      ...(c.kind === 'video' ? { codec: 'h264', width: c.wger.width, height: c.wger.height, bytes: c.wger.size, durationSec: Number(c.wger.duration) || undefined } : {}),
      license: LICENSE[c.wger.license],
      author: c.credit ?? authorOf(c.wger),
      sourcePage: `https://wger.de/en/exercise/${s.wger}/view/`,
      source: { provider: 'wger', id: String(c.wger.id) },
      verified: 'visual', // every included file was looked at (image) or played in Chrome (video) — media-review.json
      rights: 'verified',
      review: 'approved',
      publication: 'published',
    });
  }
  const moved = movedTo.get(s.id) ?? [];
  media.push(...moved.map((m) => m.media));
  // The first published file of each kind is the primary demonstration; the rest are alternates.
  for (const kind of ['video', 'image']) {
    const first = media.find((m) => m.kind === kind && m.publication === 'published') ?? media.find((m) => m.kind === kind);
    if (first) first.role = 'primary';
  }

  const sources = wger
    ? [{ provider: 'wger', id: String(s.wger), url: `https://wger.de/en/exercise/${s.wger}/view/`, role: media.length ? 'media' : 'identity', license: LICENSE[wger.license] ?? 'CC-BY-SA-3.0', description: wger.names[2] ?? wger.names[Object.keys(wger.names)[0]] }]
    : [];
  // A clip moved here from another wger record names that record as its media source.
  for (const w of new Set(moved.map((m) => m.wger))) {
    if (w === s.wger) continue;
    const rec = wgerById.get(w);
    sources.push({ provider: 'wger', id: String(w), url: `https://wger.de/en/exercise/${w}/view/`, role: 'media', license: LICENSE[rec?.license] ?? 'CC-BY-SA-4.0', description: rec?.names?.[2] ?? 'wger exercise' });
  }
  const legacy = [s.wger, ...(s.replaces ?? [])].filter(Boolean).map((n) => `wger-${n}`).filter((id) => legacyIds.has(id));

  const body = {
    id: s.id,
    status: 'published',
    name: { en: s.name[0], ar: s.name[1] },
    aliases: { en: s.aliases?.en ?? [], ar: s.aliases?.ar ?? [], eg: s.aliases?.eg ?? [] },
    bodyPart: s.bodyPart,
    primaryMuscles: s.primary,
    secondaryMuscles: s.secondary ?? [],
    equipment: s.equipment,
    pattern: s.pattern,
    mechanics: s.mechanics,
    difficulty: s.difficulty,
    laterality: s.laterality,
    instructions: { en: s.en, ar: s.ar },
    media,
    sources,
    content: { license: 'FORMA-PROPRIETARY', author: 'Forma', review: s.review ?? 'draft', translation: s.translation ?? 'draft' },
    ...(s.variantOf ? { variantOf: s.variantOf } : {}),
    legacyIds: legacy,
  };
  const prev = prevById.get(s.id);
  const rev = !prev ? 1 : contentHash(prev) === contentHash(body) ? prev.rev : prev.rev + 1;
  items.push(withRev(body, rev));
}
for (const s of sheets) if (s.variantOf && !seen.has(s.variantOf)) problems.push(`${s.id}: variantOf ${s.variantOf} is not a catalog id`);

// Order is stable (sheet order); the content hash decides whether anything changed.
const changed = !previous || previous.items.length !== items.length || items.some((i, n) => previous.items[n]?.id !== i.id || prevById.get(i.id)?.rev !== i.rev) || JSON.stringify(previous.excluded) !== JSON.stringify(excluded);
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
const version = !changed ? previous.version : previous?.version?.startsWith(today) ? `${today}-${Number(previous.version.split('-')[1]) + 1}` : `${today}-1`;
const dataset = {
  kind: 'exercises',
  version,
  builtAt: changed ? new Date().toISOString() : previous.builtAt,
  generator: 'scripts/catalog/build-exercises.mjs',
  sources: [
    { provider: 'wger', version: `api v2 snapshot ${snapshot.fetchedAt.slice(0, 10)}`, retrievedAt: snapshot.fetchedAt, license: 'CC BY-SA 3.0 / 4.0 (per item)', attribution: 'Exercise images and videos: wger.de contributors (per-item authors), CC BY-SA' },
    { provider: 'forma', version, retrievedAt: snapshot.fetchedAt, license: '© Forma', attribution: 'Names, translations, instructions and classification written by Forma' },
  ],
  excluded,
  items,
};

const used = new Set(items.flatMap((i) => i.sources.map((s) => Number(s.id))));
const report = {
  version,
  changed,
  curated: items.length,
  published: items.filter((i) => i.status === 'published').length,
  // B4.1: 'now' = published and served from its source today; 'afterHosting' adds the published
  // Forma-CDN files (served once the owner uploads them and sets FORMA_CATALOG_MEDIA_URL).
  withVideo: items.filter((i) => i.media.some((m) => m.kind === 'video' && m.publication === 'published' && m.hosting === 'source')).length,
  withVideoAfterHosting: items.filter((i) => i.media.some((m) => m.kind === 'video' && m.publication === 'published')).length,
  withImage: items.filter((i) => i.media.some((m) => m.kind === 'image' && m.publication === 'published')).length,
  withoutMedia: items.filter((i) => !i.media.some((m) => m.publication === 'published')).length,
  mediaIncluded: items.reduce((n, i) => n + i.media.length, 0),
  videosPublished: items.reduce((n, i) => n + i.media.filter((m) => m.kind === 'video' && m.publication === 'published').length, 0),
  videosPendingReview: items.reduce((n, i) => n + i.media.filter((m) => m.kind === 'video' && m.review === 'pending').length, 0),
  mediaExcluded: excluded.length,
  mediaExcludedByReason: excluded.reduce((m, e) => {
    const k = e.reason.replace(/^[^:]+: /, '').split(' — ')[0];
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {}),
  wgerTotal: snapshot.exercises.length,
  wgerUsed: used.size,
  wgerNotSelected: snapshot.exercises.length - used.size,
  legacyMapped: items.reduce((n, i) => n + i.legacyIds.length, 0),
  problems,
};

// B4.1: what the owner uploads to the public catalog CDN (hosting step): each published Forma-hosted
// file and poster, its CDN path, the local converted file, size and checksum — nothing else.
const convByVideo = new Map([...converted.values()].filter((f) => f.status === 'converted').map((f) => [`vid_wger_${f.wgerVideo}`, f]));
const uploadManifest = items.flatMap((i) =>
  i.media
    .filter((m) => m.hosting === 'forma-cdn' && m.publication === 'published')
    .flatMap((m) => {
      const conv = convByVideo.get(m.id);
      if (!conv) {
        problems.push(`${i.id}/${m.id}: Forma-hosted but no converted file`);
        return [];
      }
      return [
        { cdnPath: m.cdnPath, localFile: `e2e-out/.cache/catalog/converted/${conv.output.file}`, mime: 'video/mp4', bytes: conv.output.bytes, sha256: conv.output.sha256 },
        { cdnPath: m.poster.cdnPath, localFile: `e2e-out/.cache/catalog/converted/${conv.poster.file}`, mime: 'image/webp', bytes: conv.poster.bytes },
      ];
    }),
);
const UPLOADS = resolve('data/catalog-reports/catalog-media-upload.json');

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else if (DRY) {
  console.log(`dry run — ${changed ? 'WOULD WRITE' : 'no change'} ${version}`, JSON.stringify(report, null, 1));
} else {
  mkdirSync(resolve('data/catalog-reports'), { recursive: true });
  if (changed) writeFileSync(OUT, `${JSON.stringify(dataset, null, 1)}\n`);
  writeFileSync(REPORT, `${JSON.stringify(report, null, 1)}\n`);
  writeFileSync(UPLOADS, `${JSON.stringify({ note: 'Owner hosting step (B4_MEDIA_RIGHTS_AND_QA §4): upload each localFile to the PUBLIC catalog zone at cdnPath, then set FORMA_CATALOG_MEDIA_URL. Nothing here is uploaded automatically.', files: uploadManifest.length, bytes: uploadManifest.reduce((n, f) => n + f.bytes, 0), uploads: uploadManifest }, null, 1)}\n`);
  console.log(`${changed ? 'wrote' : 'unchanged'} ${OUT} (${version}): ${report.published} published · video ${report.withVideo} · image ${report.withImage} · none ${report.withoutMedia} · media excluded ${report.mediaExcluded}`);
}
