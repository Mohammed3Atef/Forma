// Extract real video hyperlinks from the Google Sheet's XLSX export.
// CSV/HTML exports strip inserted hyperlinks, but XLSX preserves them as
// per-cell <hyperlink> entries. We reconstruct rows + the link column and emit
// JSON mapping each exercise name -> video URL.
import { unzipSync, strFromU8 } from 'fflate';
import { writeFileSync } from 'node:fs';

const SHEET_ID = '1Sn4Vs7pI8xXIti4uRlthh2Q027KKFDjv7_T8aQF1weg';
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

const colToNum = (ref) => {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) };
};

const res = await fetch(URL, { redirect: 'follow' });
if (!res.ok) throw new Error(`xlsx fetch failed: HTTP ${res.status}`);
const buf = new Uint8Array(await res.arrayBuffer());
const files = unzipSync(buf);

// Shared strings table.
const sst = [];
if (files['xl/sharedStrings.xml']) {
  const xml = strFromU8(files['xl/sharedStrings.xml']);
  for (const si of xml.split('<si>').slice(1)) {
    const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
    sst.push(texts.join(''));
  }
}

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

// Find worksheet files and pick the one with the most HYPERLINK formulas (the training tab).
const sheetFiles = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
let best = null;
for (const f of sheetFiles) {
  const xml = strFromU8(files[f]);
  const linkCount = (xml.match(/HYPERLINK\(/g) || []).length + (xml.match(/<hyperlink /g) || []).length;
  if (!best || linkCount > best.linkCount) best = { f, xml, linkCount };
}
if (!best) throw new Error('no worksheet found');

// Parse row-by-row so cell matches never bleed across rows.
const cellText = (attrs, inner) => {
  const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
  if (!vMatch) return '';
  return /t="s"/.test(attrs) ? (sst[Number(vMatch[1])] ?? '') : decode(vMatch[1]);
};

const out = [];
const seen = new Set();
for (const rowM of best.xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const rowXml = rowM[1];
  let exercise = '';
  let url = '';
  for (const cM of rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const colLetters = cM[1];
    const attrs = cM[2];
    const inner = cM[3] ?? '';
    let col = 0;
    for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);
    col -= 1;
    if (col === 2) exercise = cellText(attrs, inner).trim(); // column C = Exercise
    const hl = inner.match(/HYPERLINK\(\s*&quot;([^&]+)&quot;/);
    if (hl) url = decode(hl[1]).trim();
  }
  if (!exercise || exercise === 'Exercise' || !url) continue;
  const key = exercise.toLowerCase();
  if (seen.has(key)) continue; // dedupe repeated days (Push/Pull appear twice)
  seen.add(key);
  out.push({ name: exercise, url });
}

writeFileSync('video-links.json', JSON.stringify(out, null, 2));
console.log(`Worksheet ${best.f} had ${best.linkCount} hyperlinks; extracted ${out.length} unique exercise links.`);
console.log(JSON.stringify(out, null, 2));
