/**
 * B4.1 slice 2 — make the LICENSED wger demonstration videos (CC BY-SA 4.0, all by "Goulart") that
 * B4 excluded for their format (HEVC, or H.264 in .MOV) playable everywhere: download (bounded,
 * polite, resumable), re-encode to H.264 MP4 at ≤ 720p (Main profile, faststart, no audio — demos
 * are silent; nothing is trimmed, cropped or overlaid, so each file stays an unmodified work: a
 * format change is not an adaptation, CC BY-SA 4.0 §2(a)(4)), cut a light WebP poster, and capture
 * three review frames per video. Everything lands in e2e-out/.cache/catalog/ (git-ignored); NOTHING
 * is uploaded — hosting on Forma's catalog CDN is an owner step (B4_MEDIA_RIGHTS_AND_QA §4).
 *
 *   node scripts/catalog/convert-videos.mjs [--max-download=20] [--max-mb=100]
 *   → data/catalog-reports/video-conversions.json   (per file: source, output, sha256, review state)
 *
 * Tools: ffmpeg / ffprobe / sharp are NOT project dependencies — install them into the ignored
 * folder e2e-out/.tools (`npm i ffmpeg-static ffprobe-static sharp` there).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CACHE_ROOT } from './lib/fetchCache.mjs';
import { candidateMedia, extOf, loadExerciseSheets, loadMediaReview } from './lib/curation.mjs';

const tools = createRequire(resolve('e2e-out/.tools/package.json'));
const FFMPEG = tools('ffmpeg-static');
const FFPROBE = tools('ffprobe-static').path;
const sharp = tools('sharp');
const arg = (name, dflt) => Number((process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).split('=')[1]);
const maxDownload = arg('max-download', 20);
const maxMb = arg('max-mb', 100);

const RAW = join(CACHE_ROOT, 'wger-media', 'raw');
const OUT = join(CACHE_ROOT, 'converted');
const FRAMES = join(CACHE_ROOT, 'video-check', 'converted');
for (const d of [RAW, OUT, FRAMES]) mkdirSync(d, { recursive: true });
const REPORT = resolve('data/catalog-reports/video-conversions.json');
const previous = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : { files: [] };
const reviewed = new Map(previous.files.map((f) => [f.key, f.review]));

const snapshot = JSON.parse(readFileSync(join(CACHE_ROOT, 'wger-snapshot.json'), 'utf8'));
const sheets = await loadExerciseSheets();
const review = loadMediaReview();
const wanted = sheets.flatMap((e) => candidateMedia(e, snapshot, review).filter((m) => m.kind === 'video' && /needs (transcoding|remux)/.test(m.reason ?? '')).map((m) => ({ entry: e, m })));

const probe = (file) => JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,profile,width,height,pix_fmt,r_frame_rate', '-of', 'json', file]).toString());
const BIG = { maxBuffer: 64 * 1024 * 1024 };
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

let downloads = 0;
const files = [];
for (const { entry, m } of wanted) {
  const v = m.wger;
  const key = m.key;
  const row = { key, exercise: entry.id, wgerVideo: v.id, sourceUrl: v.video, license: 'CC-BY-SA-4.0', author: v.license_author || 'wger.de contributors', sourcePage: `https://wger.de/en/exercise/${v.exercise}/view/`, source: { codec: v.codec, container: extOf(v.video), bytes: v.size, durationSec: Number(v.duration), width: v.width, height: v.height } };
  if (v.size > maxMb * 1e6) {
    files.push({ ...row, status: 'skipped', reason: `source file ${(v.size / 1e6).toFixed(0)} MB > ${maxMb} MB cap — the exercise has another demonstration; fetch later if wanted` });
    continue;
  }
  const raw = join(RAW, `vid-${v.id}.${extOf(v.video)}`);
  if (!(existsSync(raw) && statSync(raw).size === v.size)) {
    if (downloads >= maxDownload) {
      files.push({ ...row, status: 'pending-download' });
      continue;
    }
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(v.video, { headers: { 'User-Agent': 'FormaCatalogBuilder/1.0 (+https://www.useforma.fit; one-time media conversion)' }, signal: AbortSignal.timeout(600_000) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(raw));
      downloads += 1;
    } catch (e) {
      // A dropped connection leaves a partial file: the size check above re-fetches it next run.
      files.push({ ...row, status: 'download-failed', reason: String(e instanceof Error ? e.message : e) });
      continue;
    }
    if (statSync(raw).size !== v.size) {
      files.push({ ...row, status: 'download-failed', reason: 'incomplete download' });
      continue;
    }
  }
  const dir = join(OUT, entry.id);
  mkdirSync(dir, { recursive: true });
  const mp4 = join(dir, `vid-${v.id}.mp4`);
  const poster = join(dir, `vid-${v.id}-poster.webp`);
  // A previous run can leave a partial file (e.g. the encoder ran out of memory): an output whose
  // duration does not match the source's is encoded again — and a failed encode leaves nothing behind.
  const complete = () => {
    try {
      return Math.abs(Number(probe(mp4).format.duration) - Number(v.duration)) < 1;
    } catch {
      return false;
    }
  };
  if (!existsSync(mp4) || !complete()) {
    for (const f of [mp4, poster]) rmSync(f, { force: true });
    try {
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', raw, '-map', '0:v:0', '-an', '-vf', "scale='if(gt(a,1),min(1280,iw),-2)':'if(gt(a,1),-2,min(1280,ih))',fps=30", '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '26', '-threads', '4', '-movflags', '+faststart', mp4]);
    } catch (e) {
      rmSync(mp4, { force: true });
      files.push({ ...row, status: 'convert-failed', reason: String(e instanceof Error ? e.message.split('\n').slice(-2).join(' ') : e).slice(0, 300) });
      continue;
    }
    if (!complete()) {
      rmSync(mp4, { force: true });
      files.push({ ...row, status: 'convert-failed', reason: 'output duration does not match the source' });
      continue;
    }
  }
  const out = probe(mp4);
  const vs = out.streams[0];
  const duration = Number(out.format.duration);
  if (!existsSync(poster)) {
    const png = execFileSync(FFMPEG, ['-v', 'error', '-ss', String(Math.max(0.5, duration / 3)), '-i', mp4, '-frames:v', '1', '-vf', 'scale=640:-2', '-f', 'image2pipe', '-vcodec', 'png', '-'], BIG);
    await sharp(png).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 70 }).toFile(poster);
  }
  const strip = join(FRAMES, `${entry.id}__vid-${v.id}.png`);
  if (!existsSync(strip)) {
    const frames = [0.2, 0.5, 0.8].map((p) => execFileSync(FFMPEG, ['-v', 'error', '-ss', String(duration * p), '-i', mp4, '-frames:v', '1', '-vf', 'scale=-2:240', '-f', 'image2pipe', '-vcodec', 'png', '-'], BIG));
    const metas = await Promise.all(frames.map((f) => sharp(f).metadata()));
    const width = metas.reduce((s, m) => s + m.width, 0) + 8 * 4;
    const label = Buffer.from(`<svg width="${width}" height="36"><rect width="100%" height="100%" fill="#111"/><text x="8" y="24" font-family="Arial" font-size="18" fill="#fff">${entry.id} · wger vid ${v.id} · ${entry.name[0].replace(/&/g, '&amp;')}</text></svg>`);
    let x = 8;
    const composites = [{ input: label, left: 0, top: 0 }];
    for (const [i, f] of frames.entries()) {
      composites.push({ input: f, left: x, top: 40 });
      x += metas[i].width + 8;
    }
    await sharp({ create: { width, height: 240 + 48, channels: 3, background: '#222' } }).composite(composites).png().toFile(strip);
  }
  const ps = await sharp(poster).metadata();
  files.push({
    ...row,
    status: 'converted',
    output: { file: `${entry.id}/vid-${v.id}.mp4`, codec: vs.codec_name, profile: vs.profile, pixFmt: vs.pix_fmt, width: vs.width, height: vs.height, durationSec: Math.round(duration * 100) / 100, bytes: Number(out.format.size), bitrate: Number(out.format.bit_rate), sha256: sha256(mp4) },
    poster: { file: `${entry.id}/vid-${v.id}-poster.webp`, width: ps.width, height: ps.height, bytes: statSync(poster).size },
    cdnPath: `catalog/exercises/${entry.id}/vid-${v.id}.mp4`,
    posterCdnPath: `catalog/exercises/${entry.id}/vid-${v.id}-poster.webp`,
    reviewFrames: `e2e-out/.cache/catalog/video-check/converted/${entry.id}__vid-${v.id}.png`,
    review: reviewed.get(key) ?? 'pending — look at the review frames',
  });
}
const summary = {
  candidates: wanted.length,
  converted: files.filter((f) => f.status === 'converted').length,
  skipped: files.filter((f) => f.status === 'skipped').length,
  pendingDownload: files.filter((f) => f.status === 'pending-download').length,
  failed: files.filter((f) => /failed/.test(f.status)).length,
  approved: files.filter((f) => f.review === 'approved').length,
  sourceBytes: files.filter((f) => f.status === 'converted').reduce((n, f) => n + f.source.bytes, 0),
  outputBytes: files.filter((f) => f.status === 'converted').reduce((n, f) => n + f.output.bytes + f.poster.bytes, 0),
};
writeFileSync(REPORT, `${JSON.stringify({ generatedBy: 'scripts/catalog/convert-videos.mjs', note: 'Converted files live in e2e-out/.cache/catalog/converted (not committed, not uploaded). Hosting is an owner step.', summary, files }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
