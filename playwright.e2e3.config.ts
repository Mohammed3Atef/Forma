import { defineConfig, devices } from '@playwright/test';

/**
 * Phase-3 browser E2E against an ISOLATED local environment
 * (`e2e3/env/server.mjs`: in-memory Mongo, local Bunny stand-in, email off).
 * Unlike `playwright.config.ts` (which targets production), nothing here can
 * touch shared data.
 *
 * Output isolation: every run gets its own folder `e2e-out/<runId>/` for
 * traces, screenshots, videos, the HTML report, the stub's uploaded files and
 * the server log. No two runs (or suites) share `test-results/` /
 * `e2e-report/`. Pass `E2E_RUN_ID` to name a run; ports are overridable so
 * several runs can coexist (`E2E_PORT`, `E2E_STUB_PORT`).
 */
process.env.E2E_RUN_ID ??= `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
process.env.E2E_PORT ??= '5199';
process.env.E2E_STUB_PORT ??= '5299';
const RUN_DIR = `e2e-out/${process.env.E2E_RUN_ID}`;
process.env.E2E_RUN_DIR = RUN_DIR;
const baseURL = `http://127.0.0.1:${process.env.E2E_PORT}`;

// Fake mic/camera (a generated tone) so voice-message tests record real audio
// without a device; permission itself is still granted/denied per context.
const fakeMedia = { launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } };
const desktop = (w: number, h = 900) => ({ ...devices['Desktop Chrome'], viewport: { width: w, height: h }, ...fakeMedia });

export default defineConfig({
  testDir: './e2e3/specs',
  outputDir: `${RUN_DIR}/artifacts`,
  fullyParallel: false,
  workers: 1, // one shared server + DB; specs own their data but run serially for determinism
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: `${RUN_DIR}/report`, open: 'never' }], ['json', { outputFile: `${RUN_DIR}/results.json` }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Africa/Cairo',
  },
  webServer: {
    command: 'node e2e3/env/server.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    env: { E2E_PORT: process.env.E2E_PORT, E2E_STUB_PORT: process.env.E2E_STUB_PORT, E2E_RUN_DIR: RUN_DIR },
  },
  projects: [
    // Functional journeys — one desktop browser.
    { name: 'chromium-1440', use: desktop(1440), testIgnore: [/responsive\./, /touch\./] },
    // Responsive / RTL visual pass across the matrix.
    { name: 'chromium-1280', use: desktop(1280), testMatch: /responsive\./ },
    { name: 'chromium-1024', use: desktop(1024, 768), testMatch: /responsive\./ },
    { name: 'tablet-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true }, testMatch: /responsive\./ },
    { name: 'mobile-430', use: { ...devices['Pixel 7'], viewport: { width: 430, height: 932 } }, testMatch: /(responsive|touch)\./ },
    { name: 'mobile-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /(responsive|touch)\./ },
    // Real WebKit with touch — iOS long-press, sheets.
    { name: 'webkit-iphone', use: { ...devices['iPhone 14'] }, testMatch: /touch\./ },
  ],
});
