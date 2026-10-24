/**
 * B4 — download the USDA FoodData Central bulk files the food catalog is built from (CC0 1.0;
 * "Source: USDA FoodData Central" is credited). Three official files, ~11 MB zipped in total:
 * SR Legacy (CSV, final release 2018-04), FNDDS 2021-2023 (JSON, 2024-10-31), Foundation Foods
 * (JSON, 2026-04-30). No API key, no scraping. Resumable: a file whose checksum is already
 * recorded is not downloaded again. Extracted with the system `tar` into
 * e2e-out/.cache/catalog/usda/<name>/ — data only, never executed.
 *
 *   node scripts/catalog/fetch-usda.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_ROOT } from './lib/fetchCache.mjs';

export const USDA_FILES = [
  { name: 'sr_legacy', release: '2018-04', url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip' },
  { name: 'survey_fndds', release: '2024-10-31', url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip' },
  { name: 'foundation', release: '2026-04-30', url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip' },
];

// Windows: the system bsdtar (handles .zip); Git's GNU tar on PATH reads 'D:' as a remote host.
const TAR = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const dir = join(CACHE_ROOT, 'usda');
mkdirSync(dir, { recursive: true });
const manifestPath = join(dir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

for (const f of USDA_FILES) {
  const zip = join(dir, `${f.name}.zip`);
  const target = join(dir, f.name);
  if (manifest[f.name]?.sha256 && existsSync(zip) && existsSync(target)) {
    console.log(`${f.name}: cached (${manifest[f.name].sha256.slice(0, 12)}…)`);
    continue;
  }
  const res = await fetch(f.url, { headers: { 'User-Agent': 'FormaCatalogBuilder/1.0 (+https://www.useforma.fit)' }, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 60 * 1024 * 1024) throw new Error(`${f.name}: ${buf.length} bytes — larger than expected, refusing`);
  writeFileSync(zip, buf);
  mkdirSync(target, { recursive: true });
  execFileSync(TAR, ['-xf', zip, '-C', target]);
  manifest[f.name] = { url: f.url, release: f.release, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), fetchedAt: new Date().toISOString() };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log(`${f.name}: ${(buf.length / 1e6).toFixed(1)} MB → ${target}`);
}
