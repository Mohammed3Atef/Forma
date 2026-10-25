#!/usr/bin/env node
/**
 * B4.2 — pull the ExerciseDB V1 dataset (https://oss.exercisedb.dev, provider decision: owner).
 *
 *   node scripts/catalog/fetch-exercisedb.mjs [--refresh]
 *
 * Walks `GET /api/v1/exercises?limit=25&after=<cursor>` to the end (cursor pagination, 25 is the
 * documented maximum) plus the three vocabulary lists, politely: sequential, 1.5 s apart, 429 / 5xx
 * retried with back-off, every response cached on disk (`e2e-out/.cache/catalog/exercisedb/`), so an
 * interrupted pull resumes. Writes the raw snapshot the importer reads:
 *   e2e-out/.cache/catalog/exercisedb-raw.json   { fetchedAt, api, total, vocab, items[] }
 * The snapshot is the provider's data, untouched; nothing here is served.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createFetcher, CACHE_ROOT } from './lib/fetchCache.mjs';

const API = 'https://oss.exercisedb.dev/api/v1';
const OUT = `${CACHE_ROOT}/exercisedb-raw.json`;
const f = createFetcher('exercisedb', { delayMs: 1500, maxRequests: 140, retries: 4 });

const vocab = {};
for (const v of ['bodyparts', 'muscles', 'equipments']) {
  const r = await f.json(`${API}/${v}`);
  vocab[v] = (r.data ?? []).map((x) => x.name ?? x);
}

const items = [];
const seen = new Set();
let cursor = null;
let total = null;
for (let page = 0; page < 200; page += 1) {
  const url = `${API}/exercises?limit=25${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`;
  const r = await f.json(url);
  if (!r.success) throw new Error(`page ${page}: success=false`);
  total ??= r.meta.total;
  for (const x of r.data) {
    if (seen.has(x.exerciseId)) continue; // a cursor overlap must not double a record
    seen.add(x.exerciseId);
    items.push(x);
  }
  if (!r.meta.hasNextPage) break;
  if (!r.meta.nextCursor || r.meta.nextCursor === cursor) throw new Error(`page ${page}: no progress (cursor ${cursor})`);
  cursor = r.meta.nextCursor;
}

const snapshot = { fetchedAt: new Date().toISOString(), api: API, total, vocab, items };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot));
const s = f.stats();
console.log(JSON.stringify({ total, fetched: items.length, vocab: Object.fromEntries(Object.entries(vocab).map(([k, v]) => [k, v.length])), requests: s.requests, fromCache: s.cached, retries: s.log.filter((l) => l.from === 'retry').length, out: OUT }));
if (items.length !== total) {
  console.error(`WARNING: fetched ${items.length} of ${total} advertised`);
  process.exitCode = 2;
}
