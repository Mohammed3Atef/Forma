#!/usr/bin/env node
/**
 * B4.2 — ExerciseDB demonstrations: one look at every GIF, kept OUT of the app bundle.
 *
 *   node scripts/catalog/fetch-exercisedb-media.mjs [--max=N]
 *
 * For each record of the raw snapshot (`fetch-exercisedb.mjs`):
 *  - downloads its GIF once into the ignored build cache (`e2e-out/.cache/catalog/exercisedb-gifs/`),
 *    politely (sequential, 250 ms apart, retries on 429 / 5xx) and resumably (cached files are reused);
 *  - records what the importer needs: sha256 (an IDENTICAL file marks an exact duplicate), bytes,
 *    width × height, frame count — or the failure, so a broken link is reported, never hidden;
 *  - makes the list thumbnail: one still (the middle frame — the movement under way), 120 px square
 *    WebP, no metadata → `public/catalog/edb/<exerciseId>.webp` (~2–4 KB; served with the app, never
 *    precached, never in a JS chunk). The GIF itself stays at its original URL and loads only when a
 *    reader opens the exercise.
 * Writes `e2e-out/.cache/catalog/exercisedb-media.json` { [exerciseId]: { sha256, bytes, width,
 * height, frames, thumb: { path, bytes } } | { error } }.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { CACHE_ROOT } from './lib/fetchCache.mjs';

const sharp = createRequire(resolve('e2e-out/.tools/package.json'))('sharp');
const RAW = join(CACHE_ROOT, 'exercisedb-raw.json');
const GIFS = join(CACHE_ROOT, 'exercisedb-gifs');
const THUMBS = resolve('public/catalog/edb');
const OUT = join(CACHE_ROOT, 'exercisedb-media.json');
const UA = 'FormaCatalogBuilder/1.0 (+https://www.useforma.fit; catalog build, low volume)';
const max = Number(process.argv.find((a) => a.startsWith('--max='))?.slice(6) ?? Infinity);
mkdirSync(GIFS, { recursive: true });
mkdirSync(THUMBS, { recursive: true });

const raw = JSON.parse(readFileSync(RAW, 'utf8'));
const media = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
let network = 0;
let last = 0;

async function download(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const wait = last + 250 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    network += 1;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) }).catch((e) => ({ ok: false, status: 0, error: e }));
    if (res.ok) {
      const type = res.headers.get('content-type') ?? '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (!/^image\/gif/.test(type) || buf.subarray(0, 4).toString('latin1') !== 'GIF8') throw new Error(`not a GIF (${type})`);
      return buf;
    }
    if (res.status && res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 4000 * 2 ** attempt));
  }
  throw new Error('gave up after retries');
}

let done = 0;
for (const x of raw.items) {
  if (done >= max) break;
  const id = x.exerciseId;
  const gifFile = join(GIFS, `${id}.gif`);
  const thumbFile = join(THUMBS, `${id}.webp`);
  if (media[id]?.sha256 && existsSync(gifFile) && existsSync(thumbFile)) continue;
  done += 1;
  try {
    const buf = existsSync(gifFile) ? readFileSync(gifFile) : await download(x.gifUrl);
    if (!existsSync(gifFile)) writeFileSync(gifFile, buf);
    const meta = await sharp(buf, { animated: true }).metadata();
    const frames = meta.pages ?? 1;
    const page = Math.floor(frames / 2);
    const thumb = await sharp(buf, { page }).resize(120, 120, { fit: 'cover' }).webp({ quality: 62 }).toBuffer();
    writeFileSync(thumbFile, thumb);
    media[id] = { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length, width: meta.width, height: meta.pageHeight ?? meta.height, frames, thumb: { path: `/catalog/edb/${id}.webp`, bytes: thumb.length } };
  } catch (e) {
    media[id] = { error: String(e?.message ?? e) };
  }
  if (done % 50 === 0) {
    writeFileSync(OUT, JSON.stringify(media));
    console.log(`[edb-media] ${done} processed (${network} downloads)`);
  }
}
writeFileSync(OUT, JSON.stringify(media));
const vals = Object.values(media);
console.log(JSON.stringify({ records: raw.items.length, withMedia: vals.filter((v) => v.sha256).length, failed: vals.filter((v) => v.error).length, downloads: network, thumbBytes: vals.reduce((n, v) => n + (v.thumb?.bytes ?? 0), 0), gifBytes: vals.reduce((n, v) => n + (v.bytes ?? 0), 0) }));
