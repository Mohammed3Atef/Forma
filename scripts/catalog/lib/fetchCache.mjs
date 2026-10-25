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

/**
 * `retries` (B4.2): a 429 or 5xx is retried that many times, waiting `Retry-After` (or a doubling
 * back-off from 5 s) — each retry still counts against the request budget.
 */
export function createFetcher(source, { delayMs = 750, maxRequests = 60, refresh = process.argv.includes('--refresh'), timeoutMs = 30_000, retries = 0 } = {}) {
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
    let res;
    for (let attempt = 0; ; attempt += 1) {
      if (requests >= maxRequests) throw new Error(`[${source}] request budget of ${maxRequests} exhausted — re-run to resume from the cache`);
      const wait = last + delayMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      requests += 1;
      last = Date.now();
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || attempt >= retries || !(res.status === 429 || res.status >= 500)) break;
      const after = Number(res.headers.get('retry-after'));
      const backoff = Number.isFinite(after) && after > 0 ? after * 1000 : 5000 * 2 ** attempt;
      log.push({ url, from: 'retry', at: new Date().toISOString(), status: res.status, waitMs: backoff });
      await new Promise((r) => setTimeout(r, Math.min(backoff, 120_000)));
    }
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
