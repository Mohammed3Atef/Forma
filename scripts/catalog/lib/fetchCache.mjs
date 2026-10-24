/**
 * Polite, bounded, resumable HTTP fetch for the catalog source pulls (B4).
 *
 * - Every response is cached on disk under `e2e-out/.cache/catalog/<source>/` (git-ignored); a
 *   re-run reuses the cache, so an interrupted pull resumes where it stopped (`--refresh` re-fetches).
 * - Sequential, with a delay between network requests, a timeout, and a hard request budget per run:
 *   a source pull can never turn into an unbounded crawl.
 * - Cached files are DATA: they are parsed as JSON and never executed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CACHE_ROOT = resolve('e2e-out/.cache/catalog');
const USER_AGENT = 'FormaCatalogBuilder/1.0 (+https://www.useforma.fit; catalog curation, low volume)';

export function createFetcher(source, { delayMs = 750, maxRequests = 60, refresh = process.argv.includes('--refresh'), timeoutMs = 30_000 } = {}) {
  const dir = join(CACHE_ROOT, source);
  mkdirSync(dir, { recursive: true });
  let requests = 0;
  let last = 0;
  const log = [];

  const fileFor = (url) => join(dir, `${createHash('sha256').update(url).digest('hex').slice(0, 24)}.json`);

  async function json(url) {
    const file = fileFor(url);
    if (!refresh && existsSync(file)) {
      const cached = JSON.parse(readFileSync(file, 'utf8'));
      log.push({ url, from: 'cache', at: cached.fetchedAt });
      return cached.body;
    }
    if (requests >= maxRequests) throw new Error(`[${source}] request budget of ${maxRequests} exhausted — re-run to resume from the cache`);
    const wait = last + delayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    requests += 1;
    last = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`[${source}] ${res.status} for ${url}`);
    const body = await res.json();
    const fetchedAt = new Date().toISOString();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ url, fetchedAt, body }));
    log.push({ url, from: 'network', at: fetchedAt });
    return body;
  }

  return { json, stats: () => ({ source, requests, cached: log.filter((l) => l.from === 'cache').length, log }) };
}
