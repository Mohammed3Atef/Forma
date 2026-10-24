/**
 * B4 — pull the wger exercise catalog into the local source cache (read-only on wger's side).
 *
 *   node scripts/catalog/fetch-wger.mjs [--refresh]
 *
 * Pulls `exerciseinfo` (paged, 100 per request), plus the license, language, muscle, equipment
 * and category tables, and the video table (codec / size / licence per video). About 15
 * requests; cached under e2e-out/.cache/catalog/wger, so a re-run is free and resumable.
 * Writes a compact snapshot `e2e-out/.cache/catalog/wger-snapshot.json` that the exercise
 * build step reads. Media files are NOT downloaded here.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_ROOT, createFetcher } from './lib/fetchCache.mjs';

const API = 'https://wger.de/api/v2';
const f = createFetcher('wger', { maxRequests: 40 });

async function all(path, pageSize = 100) {
  const out = [];
  let url = `${API}/${path}${path.includes('?') ? '&' : '?'}limit=${pageSize}&offset=0&format=json`;
  for (let page = 0; url && page < 30; page += 1) {
    const body = await f.json(url);
    out.push(...body.results);
    url = body.next ? `${body.next}${body.next.includes('format=json') ? '' : '&format=json'}` : null;
  }
  return out;
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

const [licenses, languages, muscles, equipment, categories, videos, exercises] = [
  await all('license/'),
  await all('language/'),
  await all('muscle/'),
  await all('equipment/'),
  await all('exercisecategory/'),
  await all('video/'),
  await all('exerciseinfo/'),
];

const MEDIA_KEYS = ['id', 'uuid', 'license', 'license_title', 'license_object_url', 'license_author', 'license_author_url', 'license_derivative_source_url', 'author_history'];
const snapshot = {
  source: 'wger.de',
  api: API,
  fetchedAt: new Date().toISOString(),
  counts: { exercises: exercises.length, videos: videos.length },
  licenses: licenses.map((l) => pick(l, ['id', 'full_name', 'short_name', 'url'])),
  languages: languages.map((l) => pick(l, ['id', 'short_name', 'full_name'])),
  muscles: muscles.map((m) => pick(m, ['id', 'name', 'name_en', 'is_front'])),
  equipment: equipment.map((e) => pick(e, ['id', 'name'])),
  categories: categories.map((c) => pick(c, ['id', 'name'])),
  videos: videos.map((v) => ({ ...pick(v, [...MEDIA_KEYS, 'exercise', 'video', 'is_main', 'size', 'duration', 'width', 'height', 'codec', 'codec_long']) })),
  exercises: exercises.map((e) => ({
    id: e.id,
    uuid: e.uuid,
    category: e.category?.id ?? e.category,
    muscles: (e.muscles ?? []).map((m) => m.id),
    musclesSecondary: (e.muscles_secondary ?? []).map((m) => m.id),
    equipment: (e.equipment ?? []).map((q) => q.id),
    variationGroup: e.variation_group ?? null,
    license: e.license?.id ?? e.license,
    licenseAuthor: e.license_author ?? '',
    authors: e.author_history ?? [],
    lastUpdate: e.last_update_global ?? e.last_update,
    names: Object.fromEntries((e.translations ?? []).map((t) => [t.language, t.name])),
    translationLicenses: Object.fromEntries((e.translations ?? []).map((t) => [t.language, t.license])),
    images: (e.images ?? []).map((i) => ({ ...pick(i, [...MEDIA_KEYS, 'image', 'is_main', 'style']) })),
    videoIds: (e.videos ?? []).map((v) => v.id),
  })),
};
const out = join(CACHE_ROOT, 'wger-snapshot.json');
writeFileSync(out, JSON.stringify(snapshot, null, 1));
const s = f.stats();
console.log(`wger: ${snapshot.counts.exercises} exercises, ${snapshot.counts.videos} videos → ${out}`);
console.log(`requests: ${s.requests} network, ${s.cached} from cache`);
