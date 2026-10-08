export const CHUNK_RELOAD_GUARD_KEY = 'forma:chunk-reload-attempted';

/** True for the "a lazy import 404'd" family of errors — almost always a stale
 *  chunk reference left over from before a new deployment replaced the build,
 *  never a real code bug. Browsers phrase this differently. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(message);
}

/**
 * Reload ONCE to pick up the new build after a stale-chunk error (guarded via
 * sessionStorage so a genuinely broken chunk can't loop forever). Returns true
 * when the reload is under way.
 */
export function reloadOnceForStaleChunk(error: unknown): boolean {
  if (!isStaleChunkError(error)) return false;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)) return false;
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
  } catch {
    /* private-browsing / storage blocked — still attempt the reload */
  }
  window.location.reload();
  return true;
}
