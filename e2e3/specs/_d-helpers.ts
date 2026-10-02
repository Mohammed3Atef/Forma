import zlib from 'node:zlib';
import type { Page, Request } from '@playwright/test';
import type { Db } from '../fixtures';

/**
 * Agent-D shared helpers (media / errors / cache / layout / a11y / network).
 * Pure test utilities — nothing here touches product code.
 */

// ---- real image bytes ------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A real, decodable RGB PNG (w×h, colourful gradient; `noise` makes it incompressible → big). */
export function png(w = 64, h = 64, noise = false): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      if (noise) {
        raw[o++] = (Math.random() * 256) | 0;
        raw[o++] = (Math.random() * 256) | 0;
        raw[o++] = (Math.random() * 256) | 0;
      } else {
        raw[o++] = (x * 255) / w;
        raw[o++] = (y * 255) / h;
        raw[o++] = 128;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** ~`bytes` of MP4-ish bytes (ftyp header + filler). Not playable — the upload path doesn't care. */
export function fakeMp4(bytes: number): Buffer {
  const b = Buffer.alloc(bytes, 0x11);
  Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]).copy(b, 0);
  return b;
}

// ---- Bunny stand-in ---------------------------------------------------------

export type Put = { path: string; bytes: number; contentType: string };
export async function putsSince(db: Db, before: number): Promise<Put[]> {
  return (await db.bunnyPuts()).slice(before);
}

// ---- network watching -------------------------------------------------------

export interface Watched {
  url: string;
  method: string;
  headers: Record<string, string>;
  at: number;
}
/** Records every request a page makes (URL + headers) — for the "no storage key from the browser" check and procedure counts. */
export function watch(page: Page): Watched[] {
  const out: Watched[] = [];
  page.on('request', (r: Request) => out.push({ url: r.url(), method: r.method(), headers: r.headers(), at: Date.now() }));
  return out;
}
export const STUB_KEY = 'e2e-stub-key-not-a-real-bunny-password';
/** Requests that leak a storage credential: an AccessKey header, or the zone key anywhere in URL/headers. */
export function leaks(reqs: Watched[]): Watched[] {
  return reqs.filter((r) => Object.keys(r.headers).some((h) => h.toLowerCase() === 'accesskey') || r.url.includes(STUB_KEY) || Object.values(r.headers).some((v) => v.includes(STUB_KEY)) || /\/storage\//.test(new URL(r.url).pathname));
}
export const mediaCalls = (reqs: Watched[]) => reqs.filter((r) => /\/api\/media\//.test(r.url)).map((r) => new URL(r.url).pathname);

/** tRPC procedure names in a request URL (handles batching `a.b,c.d`). */
export function procsOf(url: string): string[] {
  const m = url.match(/\/api\/trpc\/([^?]+)/);
  return m ? decodeURIComponent(m[1]).split(',') : [];
}

/** The page's own bearer access token, captured from its next outgoing tRPC request. */
export async function bearerOf(page: Page, trigger?: () => Promise<unknown>): Promise<string> {
  const wait = page.waitForRequest((r) => r.url().includes('/api/trpc/') && !!r.headers().authorization, { timeout: 20_000 });
  if (trigger) await trigger();
  const req = await wait;
  return req.headers().authorization;
}

/** POST to /api/media/<action> from INSIDE the page (same origin, cookies), with the given bearer. */
export async function mediaFetch(page: Page, action: string, opts: { query?: Record<string, string>; body?: string | number[]; contentType?: string; bearer?: string | null; json?: unknown }) {
  return page.evaluate(
    async ({ action, query, body, contentType, bearer, json }) => {
      const q = query ? '?' + new URLSearchParams(query).toString() : '';
      const headers: Record<string, string> = {};
      if (bearer) headers.Authorization = bearer;
      let payload: BodyInit | undefined;
      if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(json);
      } else if (body !== undefined) {
        headers['Content-Type'] = contentType ?? 'application/octet-stream';
        payload = typeof body === 'string' ? body : new Uint8Array(body);
      }
      const r = await fetch(`/api/media/${action}${q}`, { method: 'POST', headers, body: payload, credentials: 'omit' });
      let j: unknown = null;
      try {
        j = await r.json();
      } catch {
        /* non-json */
      }
      return { status: r.status, json: j as Record<string, unknown> | null };
    },
    { action, query: opts.query, body: opts.body, contentType: opts.contentType, bearer: opts.bearer ?? null, json: opts.json },
  );
}

/** Fire a tab refocus the way a returning user does: bring to front + visibilitychange + focus. */
export async function refocus(page: Page) {
  await page.bringToFront();
  await page.evaluate(() => {
    try {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    } catch {
      /* ignore */
    }
    // Bubbling, exactly like a real tab switch — React Query v5 listens on window.
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    window.dispatchEvent(new Event('focus'));
  });
}
/** Make a page believe it was hidden (so a later refocus is a real hidden→visible transition). */
export async function blur(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    // Bubbling, exactly like a real tab switch — React Query v5 listens on window.
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));
  });
}

// ---- layout ----------------------------------------------------------------

export async function overflow(page: Page) {
  return page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const iw = window.innerWidth;
    let culprit = '';
    if (sw > iw + 1) {
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.right > iw + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
          culprit = `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 80)} right=${Math.round(r.right)}`;
          break;
        }
      }
    }
    return { scrollWidth: sw, innerWidth: iw, ok: sw <= iw + 1, culprit };
  });
}

/**
 * The seed gives every client a stub assessment ({ basic: { fullName } }) that crashes
 * assessment-reading views (TypeError on health.*). Journeys that need those views use a
 * complete, wizard-shaped submitted assessment; callers restore the previous one after.
 */
export function completeAssessment(prev: Record<string, unknown> | undefined, name: string) {
  return {
    ...(prev ?? {}),
    basic: { fullName: name, dateOfBirth: '1998-01-01', age: 28, gender: 'female', heightCm: 172, weightKg: 70 },
    goals: { primaryGoal: 'fat_loss', goalPriorities: [] },
    lifestyle: { occupation: 'desk', sleepHours: 8, activityLevel: 'moderate', trainingDaysPerWeek: 3 },
    training: { level: 'beginner', location: 'commercial_gym' },
    health: { injuries: [], noInjuries: true, hasMedicalConditions: false },
    nutrition: { likes: [], dislikes: [], allergies: [], mustHaveFoods: [], budget: 'medium', mealsPerDay: 3 },
    motivation: { biggestChallenge: 'consistency', commitmentLevel: 7 },
    progressPhotos: {},
    completionPercentage: 100,
    completed: true,
    completedAt: Date.now() - 9 * 86_400_000,
    updatedAt: Date.now() - 9 * 86_400_000,
  };
}
