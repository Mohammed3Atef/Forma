#!/usr/bin/env node
/**
 * Bundle report (B3.9 C0) — what a coach downloads on the FIRST visit to each screen of a
 * Vite production build, against the budgets in scripts/bundle-budgets.json.
 *
 *   node scripts/bundle-report.mjs [distDir=dist] [--json <file>] [--strict] [--budgets <file>]
 *
 * Read-only: it only reads <distDir>/index.html and <distDir>/assets/*.js.
 *
 * Definitions
 *  - Sizes are KB = 1000 bytes and gzip = zlib default level (6) per file — the same numbers
 *    `vite build` prints. Every file is compressed on its own (that is how it is served).
 *  - entry      the module script index.html loads (fallback: the largest assets/index-*.js).
 *  - static closure of a chunk = the chunk + every chunk reachable through STATIC imports
 *    (`import{…}from"./X.js"`, `import"./X.js"`, `export…from"./X.js"`). Dynamic `import()`
 *    calls are lazy routes/tabs and are NOT followed.
 *  - first visit of a screen = the union of its chunks' static closures MINUS what is already
 *    loaded: the entry's closure (base "entry") or the entry's + CoachApp's (base "coach").
 *  - JS only: lazy coach chunks carry no CSS of their own (all app CSS is in the entry's sheet).
 *
 * Budgets: `tolerancePct` (default 0) is allowed on top of each budget. With --strict the exit
 * code is 1 when any measured value is above budget × (1 + tolerance), or a budgeted screen's
 * chunk is missing from the build (renamed/merged — re-baseline deliberately).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- args ------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
let distArg = null;
let jsonOut = null;
let strict = false;
let budgetsPath = path.join(HERE, 'bundle-budgets.json');
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') jsonOut = argv[++i];
  else if (a === '--strict') strict = true;
  else if (a === '--budgets') budgetsPath = argv[++i];
  else if (a === '--help' || a === '-h') {
    console.log('node scripts/bundle-report.mjs [distDir=dist] [--json <file>] [--strict] [--budgets <file>]');
    process.exit(0);
  } else if (a.startsWith('--')) {
    console.error(`unknown option ${a}`);
    process.exit(2);
  } else distArg = a;
}
const DIST = path.resolve(distArg ?? path.join(HERE, '..', 'dist'));
const ASSETS = path.join(DIST, 'assets');
if (!fs.existsSync(ASSETS)) {
  console.error(`No build at ${DIST} (missing assets/). Run \`npx vite build\` first.`);
  process.exit(2);
}

/**
 * Screens. `chunks` are chunk-name prefixes (the part before Rollup's `-<hash>.js`); a screen's
 * first visit is the union of their closures. `base` says what is already in memory on arrival.
 */
const SCREENS = [
  { name: 'CoachApp', chunks: ['CoachApp'], base: 'entry', label: 'coach shell (CoachApp + its closure)' },
  { name: 'CoachToday', chunks: ['CoachToday'], base: 'coach', label: 'Today' },
  { name: 'CoachClients', chunks: ['CoachClients'], base: 'coach', label: 'Clients directory' },
  { name: 'Workspace', chunks: ['CoachClientWorkspaceLayout', 'WorkspaceSummary'], base: 'coach', label: 'client workspace (layout + Summary)' },
  { name: 'CoachClientSubscriptionTab', chunks: ['CoachClientSubscriptionTab'], base: 'coach', label: 'package screen (subscription tab)' },
  { name: 'Business', chunks: ['CoachBusiness', 'OverviewTab'], base: 'coach', label: 'Me › Business (+ Overview tab)' },
  { name: 'CoachLibrary', chunks: ['CoachLibrary'], base: 'coach', label: 'Library' },
  { name: 'CoachMessages', chunks: ['CoachMessages'], base: 'coach', label: 'Messages' },
  { name: 'CoachWorkoutEditor', chunks: ['CoachWorkoutEditor'], base: 'coach', label: 'workout editor' },
  { name: 'CoachNutritionEditor', chunks: ['CoachNutritionEditor'], base: 'coach', label: 'nutrition editor' },
  { name: 'ClientApp', chunks: ['ClientApp'], base: 'entry', label: 'client shell (ClientApp + its closure)' },
];

// ---- build graph -----------------------------------------------------------------------------
const files = fs.readdirSync(ASSETS).filter((n) => n.endsWith('.js'));
const fileSet = new Set(files);
const cache = new Map();
function info(file) {
  let v = cache.get(file);
  if (!v) {
    const buf = fs.readFileSync(path.join(ASSETS, file));
    v = { raw: buf.length, gzip: zlib.gzipSync(buf).length, text: buf.toString('utf8') };
    cache.set(file, v);
  }
  return v;
}

// Static import / re-export specifiers. `import(` (dynamic) never matches: after the keyword
// only a binding clause + `from`, or the quoted specifier itself, may follow.
const STATIC_RE = /(?<![\w$.])(?:import|export)\s*(?:(?:[\w$]+\s*,?\s*)?(?:\{[^{}]*\}|\*\s*as\s+[\w$]+|\*)?\s*from\s*|(?=["']))["'](\.{1,2}\/[^"']+?\.js)["']/g;
const depsMemo = new Map();
function staticDeps(file) {
  if (depsMemo.has(file)) return depsMemo.get(file);
  const out = new Set();
  for (const m of info(file).text.matchAll(STATIC_RE)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
    if (fileSet.has(target)) out.add(target);
  }
  depsMemo.set(file, out);
  return out;
}
function closure(roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of staticDeps(f)) stack.push(d);
  }
  return seen;
}

/** Chunk name = file name without Rollup's `-<8-char hash>.js`. */
const nameOf = (file) => (file.match(/^(.*)-[A-Za-z0-9_-]{8}\.js$/) ?? [])[1] ?? file.replace(/\.js$/, '');
function chunkFor(prefix) {
  const hits = files.filter((f) => nameOf(f) === prefix);
  if (hits.length === 0) return null;
  return hits.sort((a, b) => info(b).raw - info(a).raw)[0]; // same name twice: the largest is the page
}

function findEntry() {
  const html = fs.existsSync(path.join(DIST, 'index.html')) ? fs.readFileSync(path.join(DIST, 'index.html'), 'utf8') : '';
  const m = html.match(/<script[^>]+type="module"[^>]+src="\/?assets\/([^"]+\.js)"/) ?? html.match(/<script[^>]+src="\/?assets\/(index-[^"]+\.js)"/);
  if (m && fileSet.has(m[1])) return m[1];
  const idx = files.filter((f) => nameOf(f) === 'index').sort((a, b) => info(b).raw - info(a).raw);
  return idx[0] ?? null;
}

// ---- measure ---------------------------------------------------------------------------------
const kb = (bytes) => Math.round(bytes / 10) / 100; // KB (1000 B), 2 decimals
const sum = (set, key) => [...set].reduce((n, f) => n + info(f)[key], 0);

const entry = findEntry();
if (!entry) {
  console.error('Could not find the entry chunk (index.html script or assets/index-*.js).');
  process.exit(2);
}
const coachApp = chunkFor('CoachApp');
const baseEntry = closure([entry]);
const baseCoach = new Set([...baseEntry, ...(coachApp ? closure([coachApp]) : [])]);

let budgets = {};
try {
  budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
} catch (e) {
  if (strict) {
    console.error(`--strict needs a budgets file: ${budgetsPath} (${e.message})`);
    process.exit(2);
  }
}
const tol = Number(budgets.tolerancePct ?? 0);
const limit = (b) => b * (1 + tol / 100);
/** Status of one measured value against its budget (KB). Compared at the reported 2-decimal precision. */
function judge(value, budget) {
  if (budget == null) return { ok: true, text: 'no budget' };
  if (value <= limit(budget) + 1e-9) return { ok: true, text: 'OK' };
  return { ok: false, text: `OVER +${(((value - budget) / budget) * 100).toFixed(1)}%` };
}

const rows = [];
const failures = [];

// Entry chunk (alone — what every visitor downloads before anything else).
{
  const e = info(entry);
  const g = judge(kb(e.gzip), budgets.entryGzipKB);
  const r = judge(kb(e.raw), budgets.entryRawKB);
  rows.push({ key: 'entry', screen: `entry (${entry})`, chunks: 1, files: [entry], rawKB: kb(e.raw), gzipKB: kb(e.gzip), budget: { rawKB: budgets.entryRawKB ?? null, gzipKB: budgets.entryGzipKB ?? null }, status: !g.ok ? `gzip ${g.text}` : !r.ok ? `raw ${r.text}` : g.text === 'no budget' && r.text === 'no budget' ? 'no budget' : 'OK', ok: g.ok && r.ok });
  if (!g.ok || !r.ok) failures.push('entry');
  const extra = [...baseEntry].filter((f) => f !== entry);
  if (extra.length) rows.push({ key: 'entry-closure', screen: 'entry static closure (info)', chunks: baseEntry.size, files: [...baseEntry], rawKB: kb(sum(baseEntry, 'raw')), gzipKB: kb(sum(baseEntry, 'gzip')), budget: null, status: 'info', ok: true });
}

// CoachApp chunk alone (the blueprint §9 "CoachApp chunk" measure).
if (coachApp) {
  const c = info(coachApp);
  const g = judge(kb(c.gzip), budgets.coachAppGzipKB);
  const r = judge(kb(c.raw), budgets.coachAppRawKB);
  rows.push({ key: 'coachAppChunk', screen: `CoachApp chunk (${coachApp})`, chunks: 1, files: [coachApp], rawKB: kb(c.raw), gzipKB: kb(c.gzip), budget: { rawKB: budgets.coachAppRawKB ?? null, gzipKB: budgets.coachAppGzipKB ?? null }, status: !g.ok ? `gzip ${g.text}` : !r.ok ? `raw ${r.text}` : g.text === 'no budget' && r.text === 'no budget' ? 'no budget' : 'OK', ok: g.ok && r.ok });
  if (!g.ok || !r.ok) failures.push('coachAppChunk');
} else {
  rows.push({ key: 'coachAppChunk', screen: 'CoachApp chunk', chunks: 0, files: [], rawKB: null, gzipKB: null, budget: null, status: 'MISSING', ok: false });
  failures.push('coachAppChunk (missing)');
}

for (const s of SCREENS) {
  const roots = s.chunks.map((p) => ({ prefix: p, file: chunkFor(p) }));
  const missing = roots.filter((r) => !r.file).map((r) => r.prefix);
  const budget = budgets.screens?.[s.name] ?? null;
  if (missing.length) {
    rows.push({ key: s.name, screen: s.name, label: s.label, chunks: 0, files: [], rawKB: null, gzipKB: null, budget, status: `MISSING ${missing.join(', ')}`, ok: false });
    if (budget) failures.push(`${s.name} (missing ${missing.join(', ')})`);
    continue;
  }
  const base = s.base === 'coach' ? baseCoach : baseEntry;
  const set = new Set([...closure(roots.map((r) => r.file))].filter((f) => !base.has(f)));
  const rawKB = kb(sum(set, 'raw'));
  const gzipKB = kb(sum(set, 'gzip'));
  const r = judge(rawKB, budget?.rawKB);
  const g = judge(gzipKB, budget?.gzipKB);
  const ok = r.ok && g.ok;
  const status = !budget ? 'no budget' : ok ? 'OK' : [!r.ok ? `raw ${r.text}` : null, !g.ok ? `gzip ${g.text}` : null].filter(Boolean).join(' · ');
  rows.push({ key: s.name, screen: s.name, label: s.label, base: s.base, roots: roots.map((x) => x.file), chunks: set.size, files: [...set].sort(), rawKB, gzipKB, budget, status, ok });
  if (!ok) failures.push(s.name);
}

// ---- output ----------------------------------------------------------------------------------
const fmt = (v) => (v == null ? '—' : v.toFixed(2));
const fmtBudget = (b) => {
  if (!b) return '—';
  const parts = [];
  if (b.rawKB != null) parts.push(`raw ≤ ${fmt(b.rawKB)}`);
  if (b.gzipKB != null) parts.push(`gz ≤ ${fmt(b.gzipKB)}`);
  return parts.join(' · ') || '—';
};
const lines = [];
lines.push(`Bundle report — ${DIST}`);
lines.push(`entry ${entry} · CoachApp ${coachApp ?? 'MISSING'} · KB = 1000 B · gzip = zlib level 6 per file · tolerance ${tol}% · budgets ${fs.existsSync(budgetsPath) ? path.relative(process.cwd(), budgetsPath) || budgetsPath : 'none'}`);
lines.push('First visit = the screen\'s chunk(s) + their static-import closure, minus what the entry (and, for coach screens, CoachApp) already loaded.');
lines.push('');
lines.push('| screen | chunks | raw KB | gzip KB | budget | status |');
lines.push('|---|---:|---:|---:|---|---|');
for (const r of rows) lines.push(`| ${r.screen}${r.label ? ` — ${r.label}` : ''} | ${r.chunks} | ${fmt(r.rawKB)} | ${fmt(r.gzipKB)} | ${fmtBudget(r.budget)} | ${r.status} |`);
lines.push('');
lines.push(failures.length ? `Over budget / missing: ${failures.join(', ')}` : 'All budgeted values within budget.');
console.log(lines.join('\n'));

if (jsonOut) {
  const out = {
    dist: DIST,
    generatedAt: new Date().toISOString(),
    units: { kb: 1000, gzip: 'zlib level 6, per file' },
    entry,
    coachApp,
    tolerancePct: tol,
    budgetsFile: fs.existsSync(budgetsPath) ? budgetsPath : null,
    rows,
    failures,
    pass: failures.length === 0,
  };
  fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
  fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(out, null, 2));
  console.log(`\nJSON written to ${path.resolve(jsonOut)}`);
}

process.exit(strict && failures.length ? 1 : 0);
