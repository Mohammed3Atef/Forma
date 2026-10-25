import { useEffect, useState } from 'react';
import { trpc } from '@/services/trpc';

/**
 * MD-02 (B4.3; dormant until the owner configures it) — personal media (avatars, progress /
 * assessment / check-in photos, message attachments) is shown through short-lived signed URLs the
 * server makes for a viewer who may see it (`media.sign`). Stored data keeps the bare URL.
 *
 * Off (the server says `signedDelivery: false`), every URL is used as stored — no request, no delay
 * beyond the one `media.status` answer the upload pickers already load. On, a personal URL is
 * swapped for its signed one (batched, cached until shortly before it expires); one this viewer may
 * not see resolves to `null` (the caller shows its placeholder).
 */
const PERSONAL_PATH = /\/Forma\/[A-Za-z0-9_-]{1,64}\/(?:(?:avatar|assessment|checkin|messages)\/[A-Za-z0-9_./-]+|[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5})$/;
/** Looks like personal Forma media (decided by path; the server checks the host and the viewer). */
export const looksPersonal = (url: string | null | undefined): url is string => {
  if (!url || !/^https?:\/\//.test(url)) return false;
  try {
    return PERSONAL_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

type Signed = { url: string; expires: number };
const cache = new Map<string, Signed | null>();
const waiting = new Map<string, Array<(v: string | null) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let statusPromise: Promise<boolean> | null = null;
/** The answer once known — so later renders decide synchronously (no placeholder flash when off). */
let known: boolean | null = null;
const MARGIN_SEC = 60;

/** Whether the server signs personal media (asked once per session). */
export function signedDeliveryEnabled(): Promise<boolean> {
  statusPromise ??= trpc.media.status
    .query()
    .then((s) => (known = !!(s as { signedDelivery?: boolean }).signedDelivery))
    .catch(() => {
      statusPromise = null; // offline / signed out — ask again next time
      return false;
    });
  return statusPromise;
}

function fresh(url: string): string | null | undefined {
  if (!cache.has(url)) return undefined;
  const v = cache.get(url)!;
  if (v === null) return null;
  return v.expires - MARGIN_SEC > Date.now() / 1000 ? v.url : undefined;
}

async function flush() {
  flushTimer = null;
  const batch = [...waiting.keys()].slice(0, 100);
  const resolvers = batch.map((u) => [u, waiting.get(u)!] as const);
  for (const u of batch) waiting.delete(u);
  if (waiting.size) flushTimer = setTimeout(() => void flush(), 0);
  try {
    const { signed } = await trpc.media.sign.mutate({ urls: batch });
    for (const [u, rs] of resolvers) {
      const s = signed[u] ?? null;
      cache.set(u, s);
      for (const r of rs) r(s?.url ?? null);
    }
  } catch {
    for (const [, rs] of resolvers) for (const r of rs) r(null);
  }
}

/** The URL to show for a stored media URL, signed when the server signs personal media. */
export function resolveMediaUrl(url: string): Promise<string | null> {
  return signedDeliveryEnabled().then((on) => {
    if (!on || !looksPersonal(url)) return url;
    const hit = fresh(url);
    if (hit !== undefined) return hit;
    return new Promise<string | null>((resolve) => {
      waiting.set(url, [...(waiting.get(url) ?? []), resolve]);
      flushTimer ??= setTimeout(() => void flush(), 20);
    });
  });
}

/**
 * Hook form: the URL to use; `undefined` while a signature is being fetched (signing on — render a
 * placeholder); `null` when this viewer may not see it. While the server has not said it signs, the
 * stored URL is returned as it is (no behaviour change while MD-02 is dormant).
 */
export function useMediaSrc(url: string | null | undefined): string | null | undefined {
  const personal = looksPersonal(url);
  // Until the server has said it signs (dormant by default), the stored URL is used as it is.
  const [src, setSrc] = useState<string | null | undefined>(() => (personal && known === true ? fresh(url!) : url));
  useEffect(() => {
    if (!personal) {
      setSrc(url);
      return;
    }
    let live = true;
    void resolveMediaUrl(url!).then((v) => live && setSrc(v));
    return () => {
      live = false;
    };
  }, [url, personal]);
  return src;
}

/** Tests: forget everything this module learned. */
export function __resetMediaDeliveryForTests() {
  cache.clear();
  waiting.clear();
  statusPromise = null;
  known = null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
