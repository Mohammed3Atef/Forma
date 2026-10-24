/**
 * B4 — playback check for candidate catalog videos: each downloaded file is opened in real
 * Chrome (Playwright, `channel: 'chrome'` — the codecs a user's browser has, not Chromium's
 * reduced set), must decode (`loadeddata`, a non-zero picture size and duration), and three frames
 * (25 / 50 / 75 %) are saved as PNGs so a reviewer can confirm it shows the right exercise.
 *
 *   node scripts/catalog/check-videos.mjs  → e2e-out/.cache/catalog/video-check/
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { CACHE_ROOT } from './lib/fetchCache.mjs';

const media = join(CACHE_ROOT, 'wger-media');
const out = join(CACHE_ROOT, 'video-check');
mkdirSync(out, { recursive: true });
// --only=vid-23,vid-64  check just those (parallel reviewers never share files)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean) ?? null;
const files = readdirSync(media).filter((f) => f.startsWith('vid-') && f.endsWith('.mp4') && (!only || only.includes(f.replace('.mp4', ''))));

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const results = [];
for (const f of files) {
  // A file:// page next to the files (about:blank may not load file:// media).
  const harness = join(media, `_player-${f}.html`);
  writeFileSync(harness, `<!doctype html><body style="margin:0;background:#000"><video id="v" src="${f}" muted playsinline preload="auto" style="width:960px;height:540px;object-fit:contain"></video></body>`);
  await page.goto(pathToFileURL(harness).href);
  const r = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const v = document.getElementById('v');
        const done = (ok, why) => resolve({ ok, why, w: v.videoWidth, h: v.videoHeight, duration: v.duration, mp4: v.canPlayType('video/mp4; codecs="avc1.640028"') });
        if (v.readyState >= 2) return done(true, 'loadeddata');
        if (v.error) return done(false, `error ${v.error.code}`);
        v.addEventListener('loadeddata', () => done(true, 'loadeddata'), { once: true });
        v.addEventListener('error', () => done(false, `error ${v.error?.code}`), { once: true });
        setTimeout(() => done(false, 'timeout'), 20_000);
      }),
  );
  const frames = [];
  if (r.ok) {
    for (const p of [0.25, 0.5, 0.75]) {
      await page.evaluate((t) => new Promise((res) => { const v = document.getElementById('v'); v.addEventListener('seeked', () => res(null), { once: true }); v.currentTime = v.duration * t; }), p);
      const shot = join(out, `${f.replace('.mp4', '')}-${Math.round(p * 100)}.png`);
      await page.screenshot({ path: shot });
      frames.push(shot);
    }
  }
  results.push({ file: f, ...r, frames });
  console.log(`${f}: ${r.ok ? 'PLAYS' : 'FAILS'} (${r.why}) ${r.w}x${r.h} ${Number(r.duration).toFixed(1)}s`);
}
await browser.close();
writeFileSync(join(out, `results-${Date.now()}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), browser: 'chrome (stable channel)', results }, null, 1));
