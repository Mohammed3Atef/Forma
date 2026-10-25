/**
 * B4.1 slice 3 — pictures for the curated food catalog. Reads the REVIEWED decisions
 * (scripts/catalog/curation/food-images.*.json — every approved photo was looked at by a person:
 * right food, right state, licence CC0 / PD / CC BY / CC BY-SA, no brand, no people, no watermark),
 * fetches one bounded rendition per approved photo from Wikimedia Commons (1024 px, cached), and
 * makes two light WebP variants WITHOUT metadata (sharp drops EXIF / XMP / ICC text): a square
 * `thumb` for lists and a `card` for the serving chooser. Files stay in e2e-out/.cache (git-ignored);
 * NOTHING is uploaded — hosting on Forma's public catalog CDN is an owner step.
 *
 *   node scripts/catalog/build-food-images.mjs
 *   → data/catalog-reports/food-images.json              (coverage + one record per food)
 *   → data/catalog-reports/catalog-media-upload-foods.json (what the owner uploads, with checksums)
 *
 * Tools: sharp is not a project dependency — installed in the ignored e2e-out/.tools folder.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { CACHE_ROOT } from './lib/fetchCache.mjs';
import { loadFoodSheets } from './lib/curation.mjs';

const sharp = createRequire(resolve('e2e-out/.tools/package.json'))('sharp');
const CURATION = resolve('scripts/catalog/curation');
const SRC = join(CACHE_ROOT, 'food-images', 'src');
const OUT = join(CACHE_ROOT, 'food-images', 'out');
for (const d of [SRC, OUT]) mkdirSync(d, { recursive: true });
const REPORT = resolve('data/catalog-reports/food-images.json');
const UPLOADS = resolve('data/catalog-reports/catalog-media-upload-foods.json');
const UA = 'FormaCatalogBuilder/1.0 (https://www.useforma.fit; food image curation, low volume)';
const LICENSES = new Set(['CC0-1.0', 'PD', 'CC-BY-2.0', 'CC-BY-2.5', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-2.0', 'CC-BY-SA-2.5', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0']);
/** Approved but a better photo is wanted (still correct and licensed): shown, flagged for replacement. */
/**
 * Lead spot check of every processed thumbnail (contact sheets, 2026-10-24): would mislead a reader.
 * Keyed by food AND file (B4.3): a later review may approve a different photo for the same food.
 */
const SPOT_CHECK_REJECT = {
  ff_chickpeas_boiled: { file: 'File:Boiled sanag alu27.11.13. (74).JPG', reason: 'the colour cast makes the chickpeas read as green peas — misleading' },
  ff_egg_white_raw: { file: 'File:Bowl of egg whites.jpg', reason: 'shown as a yellow liquid that reads as oil or yolk — misleading' },
  ff_potato_boiled: { file: 'File:Pellkartoffeln 2.jpg', reason: 'cannot be told from raw potatoes — a raw-looking photo for a cooked food' },
};
const NEEDS_REPLACEMENT = {
  ff_ful_with_oil: 'authentic Egyptian ful, but a creamy layer may be tahini, which the recipe does not include — replace with ful dressed with oil only',
  ff_whey_protein: 'chocolate-flavoured powder that could be read as cocoa — replace with an unflavoured, unbranded scoop',
};
/** Wikimedia appends tracking parameters to file URLs; licence links can be protocol-relative. */
const cleanUrl = (u) => (u ? String(u).split('?')[0] : null);
const httpsUrl = (u) => (!u ? null : u.startsWith('//') ? `https:${u}` : u.replace(/^http:\/\//, 'https://'));

const decisions = {};
for (const f of readdirSync(CURATION).filter((x) => /^food-images\.[a-z]\.json$/.test(x)).sort()) {
  for (const [id, d] of Object.entries(JSON.parse(readFileSync(join(CURATION, f), 'utf8')))) {
    if (id.startsWith('_')) continue;
    // A later sheet may re-decide a food an earlier one left without a picture (B4.3, sheet e: a new
    // photo, or a newer reason it has none); a food whose approved photo passed the spot check is never re-decided.
    if (decisions[id]?.status === 'approved' && SPOT_CHECK_REJECT[id]?.file !== decisions[id].file) throw new Error(`${f}: ${id} decided twice`);
    decisions[id] = { ...d, reviewer: f, ...(decisions[id] ? { supersedes: `${decisions[id].reviewer} (${decisions[id].status})` } : {}) };
  }
}
const previous = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : { foods: {} };
const foods = await loadFoodSheets();

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
let requests = 0;
async function json(url) {
  requests += 1;
  if (requests > 400) throw new Error('request budget exhausted — re-run to resume from the cache');
  await new Promise((r) => setTimeout(r, 700));
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
/** One 1024-px rendition of the approved file, cached (never the full original). */
async function source(foodId, file) {
  const cached = readdirSync(SRC).find((x) => x.startsWith(`${foodId}.`));
  const meta = join(SRC, `${foodId}.json`);
  if (cached && !cached.endsWith('.json') && existsSync(meta) && JSON.parse(readFileSync(meta, 'utf8')).file === file) return readFileSync(join(SRC, cached));
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024&titles=${encodeURIComponent(file)}`;
  const page = Object.values((await json(api)).query.pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) throw new Error(`no rendition for ${file}`);
  requests += 1;
  await new Promise((r) => setTimeout(r, 700));
  const res = await fetch(info.thumburl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} ${info.thumburl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (info.thumburl.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  writeFileSync(join(SRC, `${foodId}.${ext}`), buf);
  writeFileSync(meta, JSON.stringify({ file, thumburl: info.thumburl, fetchedAt: new Date().toISOString() }));
  return buf;
}

const records = {};
const uploads = [];
for (const food of foods) {
  const d = decisions[food.id];
  if (!d) {
    records[food.id] = { status: 'pending', reason: 'not reviewed yet' };
    continue;
  }
  if (d.status === 'approved' && SPOT_CHECK_REJECT[food.id]?.file === d.file) {
    records[food.id] = { status: 'rejected', reason: `lead spot check: ${SPOT_CHECK_REJECT[food.id].reason}`, file: d.file, reviewer: d.reviewer };
    continue;
  }
  if (d.status !== 'approved') {
    records[food.id] = { status: d.status === 'missing' ? 'missing' : 'rejected', reason: d.reason ?? null, reviewer: d.reviewer };
    continue;
  }
  if (!LICENSES.has(d.license)) {
    records[food.id] = { status: 'rejected', reason: `licence ${d.license} not on the allow-list`, reviewer: d.reviewer };
    continue;
  }
  const prev = previous.foods?.[food.id];
  const rev = prev?.file === d.file ? (prev.rev ?? 1) : (prev?.rev ?? 0) + 1;
  try {
    const src = await source(food.id, d.file);
    const dir = join(OUT, food.id);
    mkdirSync(dir, { recursive: true });
    // A transparent cut-out (PNG) gets a white ground, like the other photos (B4.3).
    const card = await sharp(src).rotate().flatten({ background: '#ffffff' }).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer({ resolveWithObject: true });
    const thumb = await sharp(src).rotate().flatten({ background: '#ffffff' }).resize(160, 160, { fit: 'cover', position: 'centre' }).webp({ quality: 70 }).toBuffer({ resolveWithObject: true });
    const variants = {};
    for (const [name, out] of [['card', card], ['thumb', thumb]]) {
      const file = join(dir, `r${rev}-${name}.webp`);
      writeFileSync(file, out.data);
      const cdnPath = `catalog/foods/${food.id}/r${rev}-${name}.webp`;
      variants[name] = { cdnPath, width: out.info.width, height: out.info.height, bytes: out.data.length, sha256: sha256(out.data) };
      uploads.push({ cdnPath, localFile: `e2e-out/.cache/catalog/food-images/out/${food.id}/r${rev}-${name}.webp`, mime: 'image/webp', bytes: out.data.length, sha256: variants[name].sha256 });
    }
    records[food.id] = {
      status: NEEDS_REPLACEMENT[food.id] ? 'needs-replacement' : 'approved',
      ...(NEEDS_REPLACEMENT[food.id] ? { note: NEEDS_REPLACEMENT[food.id] } : {}),
      rev,
      file: d.file,
      pageUrl: d.pageUrl,
      originalUrl: cleanUrl(d.originalUrl),
      license: d.license,
      licenseUrl: httpsUrl(d.licenseUrl || null),
      author: d.author,
      credit: d.credit || null,
      alt: d.alt,
      reviewNote: d.note ?? null,
      reviewer: d.reviewer,
      variants,
    };
  } catch (e) {
    records[food.id] = { status: 'pending', reason: `approved, but the file could not be processed: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`, reviewer: d.reviewer };
  }
}

const count = (s) => Object.values(records).filter((r) => r.status === s).length;
const summary = { foods: foods.length, approved: count('approved'), needsReplacement: count('needs-replacement'), pendingReview: count('pending'), missing: count('missing'), rejected: count('rejected'), withImage: count('approved') + count('needs-replacement'), requests };
writeFileSync(REPORT, `${JSON.stringify({ generatedBy: 'scripts/catalog/build-food-images.mjs', summary, foods: records }, null, 1)}\n`);
writeFileSync(UPLOADS, `${JSON.stringify({ note: 'Owner hosting step: upload each localFile to the PUBLIC catalog zone at cdnPath, then set FORMA_CATALOG_MEDIA_URL. Nothing here is uploaded automatically.', files: uploads.length, bytes: uploads.reduce((n, u) => n + u.bytes, 0), uploads }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
