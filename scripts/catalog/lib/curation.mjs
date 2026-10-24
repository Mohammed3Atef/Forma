/**
 * B4 — the exercise curation sheets (Forma-written content + the wger record each one takes its
 * identity / media from) and the media-review record.
 *
 * Sheets: scripts/catalog/curation/exercises/*.mjs, each `export default [ entry, … ]`:
 *   { id, wger?, replaces?, media?: false, maxImages?, name: [en, ar], aliases: { en, ar, eg },
 *     bodyPart, primary, secondary, equipment, pattern, mechanics, difficulty, laterality,
 *     variantOf?, en: { setup, steps, cues, mistakes, safety }, ar: { … } }
 * Review: scripts/catalog/curation/media-review.json — { "img:<wgerImageId>": "ok" | "reject: why",
 *   "vid:<wgerVideoId>": "ok" | "reject: why" } — written after LOOKING at each file
 *   (images) or playing it in Chrome (videos). Nothing unreviewed is ever published.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CURATION_DIR = resolve('scripts/catalog/curation');

export async function loadExerciseSheets(only = null) {
  const dir = join(CURATION_DIR, 'exercises');
  const entries = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs') && (!only || only.some((o) => x.startsWith(o)))).sort()) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    for (const e of mod.default) entries.push({ ...e, sheet: f });
  }
  return entries;
}

/** media-review.json plus any media-review.<group>.json (one per reviewer, so parallel reviews never collide). */
export function loadMediaReview() {
  const out = {};
  for (const f of readdirSync(CURATION_DIR).filter((x) => /^media-review(.[a-z0-9-]+)?.json$/.test(x)).sort()) {
    const r = JSON.parse(readFileSync(join(CURATION_DIR, f), 'utf8'));
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('_')) continue;
      if (k in out && JSON.stringify(out[k]) !== JSON.stringify(v)) throw new Error(`${f}: ${k} reviewed differently elsewhere`);
      out[k] = v;
    }
  }
  return out;
}

/** A review value accepts the file: "ok" or { ok: true, credit }. */
const accepted = (r) => r === 'ok' || (typeof r === 'object' && r?.ok === true);

const IMAGE_FORMATS = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif' };
export const extOf = (url) => (url.split('?')[0].split('.').pop() ?? '').toLowerCase();

/** The candidate media of one curated entry, in display order, each with an inclusion decision. */
export function candidateMedia(entry, snapshot, review) {
  if (!entry.wger || entry.media === false) return [];
  const ex = snapshot.exercises.find((x) => x.id === entry.wger);
  if (!ex) return [];
  const out = [];
  const images = [...ex.images].sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.id - b.id).slice(0, entry.maxImages ?? 2);
  for (const i of images) {
    const ext = extOf(i.image);
    const key = `img:${i.id}`;
    const r = review[key];
    let reason = null;
    if (!IMAGE_FORMATS[ext]) reason = `format .${ext} not served`;
    else if (![1, 2].includes(i.license)) reason = `licence id ${i.license} not on the allow-list`;
    else if (!r) reason = 'pending visual check';
    else if (!accepted(r)) reason = String(r);
    out.push({ kind: 'image', key, wger: i, url: i.image, format: IMAGE_FORMATS[ext] ?? ext, file: `img-${i.id}.${ext}`, reason, credit: r?.credit ?? null });
  }
  for (const v of snapshot.videos.filter((x) => x.exercise === entry.wger).sort((a, b) => a.id - b.id)) {
    const ext = extOf(v.video);
    const key = `vid:${v.id}`;
    const r = review[key];
    let reason = null;
    if (v.codec !== 'h264') reason = `${v.codec} — needs transcoding to H.264 (owner media step)`;
    else if (ext !== 'mp4') reason = `H.264 in .${ext} — needs remux to MP4 (owner media step)`;
    else if (v.license !== 2 && v.license !== 1) reason = `licence id ${v.license} not on the allow-list`;
    else if (!r) reason = 'pending playback check';
    else if (!accepted(r)) reason = String(r);
    out.push({ kind: 'video', key, wger: v, url: v.video, format: 'mp4', file: `vid-${v.id}.${ext}`, reason, credit: r?.credit ?? null });
  }
  return out;
}

/** Everything the review needs downloaded: all candidate images, and the H.264 MP4 videos. */
export async function selectedMedia(snapshot, only = null) {
  const sheets = await loadExerciseSheets(only);
  const review = loadMediaReview();
  return sheets
    .flatMap((e) => candidateMedia(e, snapshot, review))
    .filter((m) => (m.kind === 'image' ? !/^(format|licence)/.test(m.reason ?? '') : m.wger.codec === 'h264' && extOf(m.url) === 'mp4'));
}

/** B4.1: the food curation sheets (scripts/catalog/curation/foods/*.mjs), in sheet order. */
export async function loadFoodSheets() {
  const dir = join(CURATION_DIR, 'foods');
  const entries = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    for (const e of mod.default) entries.push({ ...e, sheet: f });
  }
  return entries;
}
