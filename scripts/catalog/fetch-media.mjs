/**
 * B4 — download ONLY the media the exercise curation selects, for review (visual check, codec
 * check, sizes). Bounded (hard cap per run), sequential, polite, resumable (an existing file is
 * not fetched again). Files land in e2e-out/.cache/catalog/wger-media/ (git-ignored) and are only
 * ever read as data — never executed. Nothing is uploaded anywhere.
 *
 *   node scripts/catalog/fetch-media.mjs [--videos] [--max=250]
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CACHE_ROOT } from './lib/fetchCache.mjs';
import { selectedMedia } from './lib/curation.mjs';

const max = Number((process.argv.find((a) => a.startsWith('--max=')) ?? '--max=250').slice(6));
const withVideos = process.argv.includes('--videos');
// --sheets=03-,04-  only the media of those curation sheets (parallel reviewers never fetch the same file)
const only = process.argv.find((a) => a.startsWith('--sheets='))?.slice(9).split(',').filter(Boolean) ?? null;
const dir = join(CACHE_ROOT, 'wger-media');
mkdirSync(dir, { recursive: true });
const snapshot = JSON.parse(readFileSync(join(CACHE_ROOT, 'wger-snapshot.json'), 'utf8'));

const wanted = (await selectedMedia(snapshot, only)).filter((m) => withVideos || m.kind === 'image');
let fetched = 0;
let skipped = 0;
for (const m of wanted) {
  const file = join(dir, m.file);
  if (existsSync(file) && statSync(file).size > 0) {
    skipped += 1;
    continue;
  }
  if (fetched >= max) {
    console.log(`cap of ${max} downloads reached — re-run to continue`);
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
  const res = await fetch(m.url, { headers: { 'User-Agent': 'FormaCatalogBuilder/1.0 (+https://www.useforma.fit)' }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) {
    console.warn(`  ! ${res.status} ${m.url}`);
    continue;
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  fetched += 1;
}
console.log(`media: ${wanted.length} selected · ${fetched} downloaded · ${skipped} already cached → ${dir}`);
