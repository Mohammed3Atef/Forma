import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Environment loading + validation for the Forma E2E suite.
 *
 * The app reads `VITE_FIREBASE_*` at build time (Vite loads `.env` itself), but
 * the Playwright *test process* (Node) also needs those vars plus the
 * `E2E_*` accounts to drive logins and talk to Firestore directly. Node does
 * not auto-load `.env`, so we parse it here (zero dependencies) and merge it
 * into `process.env` without clobbering anything already set by the shell/CI.
 */

let loaded = false;

/** Parse `.env` at the repo root and merge into process.env (idempotent). */
export function loadDotEnv(): void {
  if (loaded) return;
  loaded = true;
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip optional surrounding quotes.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export const FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

/** The four E2E roles → the env var pair that holds their credentials. */
export const ACCOUNT_ENV: Record<RoleKey, { email: string; password: string }> = {
  super_admin: { email: 'E2E_SUPER_EMAIL', password: 'E2E_SUPER_PASSWORD' },
  admin: { email: 'E2E_ADMIN_EMAIL', password: 'E2E_ADMIN_PASSWORD' },
  coach: { email: 'E2E_COACH_EMAIL', password: 'E2E_COACH_PASSWORD' },
  client: { email: 'E2E_CLIENT_EMAIL', password: 'E2E_CLIENT_PASSWORD' },
};

export type RoleKey = 'super_admin' | 'admin' | 'coach' | 'client';

/** Required vars for a full run. The API key + project + app id are the hard
 * minimum for Firebase to initialise; the rest enable the full surface. */
export const REQUIRED_ENV: string[] = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'E2E_SUPER_EMAIL',
  'E2E_SUPER_PASSWORD',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_COACH_EMAIL',
  'E2E_COACH_PASSWORD',
  'E2E_CLIENT_EMAIL',
  'E2E_CLIENT_PASSWORD',
];

/** Returns the list of required env vars that are missing or blank. */
export function missingEnv(): string[] {
  loadDotEnv();
  return REQUIRED_ENV.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
}

/**
 * Throws a clear, actionable error naming EVERY missing variable. Called from
 * global-setup so a misconfigured environment fails fast and unmistakably.
 */
export function assertEnv(): void {
  const missing = missingEnv();
  if (missing.length > 0) {
    throw new Error(
      `[forma-e2e] Missing required environment variable(s):\n` +
        missing.map((k) => `  - ${k}`).join('\n') +
        `\n\nAdd them to .env (see .env.example) or export them before running the suite.`,
    );
  }
}

export interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

/** The Firebase web config, read from env (after loadDotEnv). */
export function firebaseEnvConfig(): FirebaseEnvConfig {
  loadDotEnv();
  return {
    apiKey: process.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID ?? '',
  };
}

/** Resolved credentials for a role (after loadDotEnv). */
export function credsFor(role: RoleKey): { email: string; password: string } {
  loadDotEnv();
  const keys = ACCOUNT_ENV[role];
  return {
    email: process.env[keys.email] ?? '',
    password: process.env[keys.password] ?? '',
  };
}

/** True when a real Firebase project is configured for this run. */
export function hasFirebase(): boolean {
  loadDotEnv();
  return Boolean(process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_PROJECT_ID);
}
