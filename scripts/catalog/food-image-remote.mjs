#!/usr/bin/env node
/**
 * B4.2 — remote food pictures: the reviewed Commons pictures served from Wikimedia's own image
 * servers until (or instead of) Forma's catalog CDN, so foods show their picture without any upload.
 *
 *   node scripts/catalog/food-image-remote.mjs      # then: node scripts/catalog/build-foods.mjs
 *
 * For every approved / needs-replacement picture in `data/catalog-reports/food-images.json` it asks
 * the Commons API (bounded, cached — `lib/fetchCache.mjs`; 50 files per request) for the original's
 * size and Wikimedia's own renditions at its STANDARD widths (other widths are refused): 120 px for
 * lists, 500 px for cards. A picture narrower than a step uses its original file for that step.
 * Writes `remote: { thumbUrl, cardUrl, width, height }` into each report entry. Nothing is copied.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFetcher } from './lib/fetchCache.mjs';

const REPORT = resolve('data/catalog-reports/food-images.json');
const API = 'https://commons.wikimedia.org/w/api.php';
const STEPS = { thumb: 120, card: 500 };
const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const f = createFetcher('commons-remote', { delayMs: 1000, maxRequests: 20 });

const entries = Object.entries(report.foods).filter(([, r]) => (r.status === 'approved' || r.status === 'needs-replacement') && r.file);
const byTitle = new Map(entries.map(([id, r]) => [r.file, id]));
const titles = [...byTitle.keys()];
const info = new Map(); // title → { width, height, original, thumb, card }

for (const [step, width] of Object.entries(STEPS)) {
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: String(width), titles: batch.join('|') });
    const r = await f.json(`${API}?${q}`);
    const norm = new Map((r.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of r.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const title = norm.get(p.title) ?? p.title;
      const cur = info.get(title) ?? { width: ii.width, height: ii.height, original: ii.url };
      // Wikimedia answers a step wider than the file with the file itself.
      // Wikimedia adds tracking parameters to the URLs it returns; the file URL itself is all that is kept.
      cur[step] = (ii.width > width && ii.thumburl ? ii.thumburl : ii.url).split('?')[0];
      info.set(title, cur);
    }
  }
}

let done = 0;
const missing = [];
for (const [id, r] of entries) {
  const x = info.get(r.file);
  if (!x?.thumb || !x?.card) {
    missing.push(id);
    continue;
  }
  r.remote = { thumbUrl: x.thumb, cardUrl: x.card, width: x.width, height: x.height };
  done += 1;
}
writeFileSync(REPORT, JSON.stringify(report, null, 1)); // the generator's own format (build-food-images.mjs)
console.log(JSON.stringify({ pictures: entries.length, withRemote: done, missing, requests: f.stats().requests }));
if (missing.length) process.exitCode = 2;
