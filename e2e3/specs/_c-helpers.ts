import type { Page } from '@playwright/test';
import { expect, type Db } from '../fixtures';
import { cairoDay } from './_dates';

/** Shared helpers for the Phase-3 "C" specs (client journeys + messenger). */

export const CLIENT_A = 'e2e-client-a';
export const COACH_A = 'e2e-coach-a';

/** A minimal two-exercise workout plan for clientA (shape: src/types WorkoutPlan; stored like `workoutPlan.save`). */
export function workoutPlanDoc(opts: { withVideoUrl?: boolean } = {}) {
  const now = Date.now();
  const ex = (id: string, name: string, muscle: string, extra: object = {}) => ({
    id,
    name,
    targetMuscle: muscle,
    warmupSets: '',
    warmupSetCount: 0,
    workingSets: 2,
    repRange: '8-12',
    rir: '2',
    tempo: '-',
    notes: { en: '', ar: '' },
    restSec: 60,
    videoId: null,
    videoUrl: null,
    ...extra,
  });
  return {
    _id: CLIENT_A,
    clientId: CLIENT_A,
    id: CLIENT_A,
    name: 'C-Spec Plan',
    days: [
      { id: 'c-day-1', dayIndex: 0, title: 'C Push Day', focus: 'Chest', exerciseIds: ['c-ex-bench', 'c-ex-fly'] },
      { id: 'c-day-2', dayIndex: 1, title: 'C Pull Day', focus: 'Back', exerciseIds: ['c-ex-row'] },
    ],
    exercises: {
      'c-ex-bench': ex('c-ex-bench', 'C Bench Press', 'chest'),
      'c-ex-fly': ex('c-ex-fly', 'C Cable Fly', 'chest', opts.withVideoUrl ? { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } : {}),
      'c-ex-row': ex('c-ex-row', 'C Barbell Row', 'back'),
    },
    updatedAt: now,
  };
}

export async function seedWorkoutPlan(db: Db, opts: { withVideoUrl?: boolean } = {}) {
  await db.deleteMany('clientWorkoutPlans', { _id: CLIENT_A });
  await db.insertOne('clientWorkoutPlans', workoutPlanDoc(opts));
}

/** Poll a DB predicate until truthy (server copies arrive via async sync passes). */
export async function pollDb<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 20_000, stepMs = 500): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last: T = await fn();
  while (!ok(last) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, stepMs));
    last = await fn();
  }
  return last;
}

/** A tiny but real PNG (canvas-rendered in the page so it decodes everywhere). */
export async function makePng(page: Page, color = '#d46a3a', size = 64): Promise<Buffer> {
  const b64 = await page.evaluate(
    ([c, s]) => {
      const cv = document.createElement('canvas');
      cv.width = s as number;
      cv.height = s as number;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = c as string;
      ctx.fillRect(0, 0, s as number, s as number);
      ctx.fillStyle = '#fff';
      ctx.fillRect(8, 8, 16, 16);
      return cv.toDataURL('image/png').split(',')[1];
    },
    [color, size],
  );
  return Buffer.from(b64, 'base64');
}

/** Text with no "NaN"/"undefined" leaking into the rendered page. */
export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

/** Today's day key as the app computes it (the config pins the browser to Africa/Cairo). Read it per test, never at module load. */
export function todayKey(): string {
  return cairoDay(Date.now()); // B3.9.0: one Cairo-day implementation for every spec (`_dates.ts`)
}

export type AppLocale = 'en' | 'ar' | 'ar-eg';
/** The language controls' labels (coach / admin account chips, client Settings › Preferences) → the locale each applies. */
export const LOCALE_OF: Record<string, AppLocale> = { English: 'en', EN: 'en', 'العربية': 'ar', 'ع': 'ar', 'مصري': 'ar-eg' };

/**
 * B3.9.0 — the deterministic end of a language switch (replaces a fixed `waitForTimeout(600)`).
 *
 * `useSettings.setLocale` (src/stores/settingsStore.ts) first applies the language (`<html lang>`), then
 * writes it to the account's `settings` and `profile` singletons in the account's OWN local database
 * (`forma-u-<uid>`, object stores `settings` / `profile`, key `value` — src/data/localScope.ts,
 * LocalRepository.ts). The next page load reads the language from there, so navigating before both
 * writes land can come back in the old language. This waits until `<html lang>` and both stored copies
 * carry `locale`.
 *
 * Why not the server's `syncSingletons`: a coach's / admin's language never leaves the device (the
 * `sync.*` procedures are client-only and the coach runtime never syncs — see 61-b0-trust "coach session
 * makes no client sync calls"), and a client's copy is only pushed on its next sync pass (boot, focus or
 * every 120 s), which is after the navigation this wait protects.
 */
export async function waitForLocaleSaved(page: Page, locale: AppLocale) {
  await expect.poll(() => page.evaluate(() => document.documentElement.lang), { message: '<html lang> after the language switch' }).toBe(locale);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          // Exactly one signed-in account per context in these specs: its database is the only `forma-u-*` one.
          const names = (await indexedDB.databases()).map((d) => d.name ?? '').filter((n) => n.startsWith('forma-u-'));
          if (names.length !== 1) return `account databases: ${names.length}`;
          return new Promise<Record<string, unknown> | string>((resolve) => {
            const req = indexedDB.open(names[0]);
            req.onupgradeneeded = () => req.transaction?.abort(); // never create or upgrade the app's database
            req.onerror = () => resolve('database not readable yet');
            req.onsuccess = () => {
              const idb = req.result;
              idb.onversionchange = () => idb.close(); // never block the app's own upgrades
              const stores = ['settings', 'profile'].filter((s) => idb.objectStoreNames.contains(s));
              if (stores.length < 2) {
                idb.close();
                resolve('stores not created yet');
                return;
              }
              const out: Record<string, unknown> = {};
              const tx = idb.transaction(stores, 'readonly');
              for (const s of stores) {
                const get = tx.objectStore(s).get('value');
                get.onsuccess = () => {
                  out[s] = (get.result as { locale?: unknown } | undefined)?.locale ?? null;
                };
              }
              tx.oncomplete = () => {
                idb.close();
                resolve(out);
              };
              tx.onerror = tx.onabort = () => {
                idb.close();
                resolve('read failed');
              };
            };
          });
        }),
      { message: `the account's stored settings + profile carry "${locale}" before navigating away` },
    )
    .toEqual({ settings: locale, profile: locale });
}

/** A synced client record as stored by `sync.push`. */
export interface SyncRec<T = Record<string, unknown>> {
  _id: string;
  clientId: string;
  collection: string;
  recordId: string;
  data: T;
  updatedAt: number;
  syncedAt: number;
}

/** A one-meal nutrition plan for clientA (shape: src/types MealPlan; stored like `nutritionPlan.save`). */
export async function seedNutritionPlan(db: Db) {
  const now = Date.now();
  await db.deleteMany('clientNutritionPlans', { _id: CLIENT_A });
  await db.insertOne('clientNutritionPlans', {
    _id: CLIENT_A,
    clientId: CLIENT_A,
    id: CLIENT_A,
    name: 'C-Spec Meals',
    meals: [
      {
        id: 'c-meal-1',
        slot: 'breakfast',
        label: { en: 'C Breakfast', ar: 'فطور' },
        items: [{ id: 'c-food-oats', name: { en: 'C Oats', ar: 'شوفان' }, quantity: '80 g', protein: 10, carbs: 50, fats: 5, calories: 285 }],
      },
    ],
    targets: { calories: 2000, protein: 150, carbs: 200, fats: 60 },
    supplements: [],
    waterTargetMl: 3000,
    beverageNotes: [],
    generalNotes: [],
    updatedAt: now,
  });
}

/**
 * `vite dev` serves the app UNBUNDLED (hundreds of module requests per cold
 * page). With four isolated stacks running on one machine, Chromium sometimes
 * answers a module fetch with `net::ERR_INSUFFICIENT_RESOURCES`, which surfaces
 * as "Failed to fetch dynamically imported module" for a lazy role app. It is a
 * dev-server/host-load artefact (production ships bundled chunks) — every
 * other page error still fails the test.
 */
export function allowDevModuleStorm(audit: { allowPageError: (re: RegExp) => void }) {
  audit.allowPageError(/Failed to fetch dynamically imported module: http:\/\/127\.0\.0\.1:\d+\/src\//);
}

/** Bulk insert through the env control API (the `db` fixture only exposes insertOne). */
export async function insertMany(collection: string, docs: object[]) {
  const stub = `http://127.0.0.1:${process.env.E2E_STUB_PORT ?? '5299'}`;
  const r = await fetch(`${stub}/__e2e/db`, { method: 'POST', body: JSON.stringify({ op: 'insertMany', collection, doc: docs }) });
  if (!r.ok) throw new Error(`insertMany failed: ${r.status} ${await r.text()}`);
}

/** A seeded thread message (shape: api/messages/_data.ts MessageDoc). */
export function seedMessage(i: number, createdAt: number, from: 'client' | 'coach' = i % 2 ? 'coach' : 'client') {
  return {
    _id: `c-seed-${String(i).padStart(3, '0')}`,
    clientId: CLIENT_A,
    coachId: COACH_A,
    fromUserId: from === 'client' ? CLIENT_A : COACH_A,
    fromRole: from,
    body: `seed-${String(i).padStart(3, '0')}`,
    seenAt: createdAt + 1000,
    createdAt,
    updatedAt: createdAt,
  };
}

/** Minimal-but-plausible bytes for non-image attachments (the app never decodes them server-side). */
export const FAKE_MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2'), Buffer.alloc(512, 7)]);
export const FAKE_MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 0, 0]), Buffer.alloc(1024, 0xff)]);
export const FAKE_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
