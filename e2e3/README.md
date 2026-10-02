# Phase-3 browser E2E harness (`e2e3/`)

Isolated: every run boots its own stack (`e2e3/env/server.mjs`) — in-memory Mongo replica set
(seeded by `env/seed-data.mjs`), a local Bunny stand-in (uploads land in `e2e-out/<run>/bunny-stub/`,
served back at `http://127.0.0.1:<STUB_PORT>/cdn/...`), email disabled, `vite dev` with the full
API in-process (`/api/trpc`, `/api/media`, `/api/cron/daily-maintenance`). The production
suite in `e2e/` + `playwright.config.ts` is NOT used for Phase 3.

## Run

```
E2E_RUN_ID=<name> E2E_PORT=5199 E2E_STUB_PORT=5299 \
  npx playwright test -c playwright.e2e3.config.ts --project=chromium-1440 e2e3/specs/<file>
```

- Output (traces, screenshots, videos, HTML report, `results.json`, server log, uploaded stub files)
  goes to `e2e-out/<E2E_RUN_ID>/` — never shared between runs. Use a distinct `E2E_RUN_ID` per run.
- Parallel runs: use distinct `E2E_PORT` / `E2E_STUB_PORT` pairs (each run gets its own server,
  DB and Vite cache). Never point two runs at the same port.
- Projects: `chromium-1440` = functional journeys (files NOT matching `responsive.` / `touch.`);
  `*.responsive.spec.ts` run on chromium-1280/1024, tablet-768, mobile-430/390;
  `*.touch.spec.ts` run on mobile-430/390 and `webkit-iphone`.
- Chromium has a fake microphone (`--use-fake-device-for-media-stream`); grant it per context with
  `as(role, { permissions: ['microphone'] })`.

## Fixtures (`e2e3/fixtures.ts`) — import `test, expect, ready, shot` from `../fixtures`

- `as(role, contextOptions?)` → `{ context, page }`: a FRESH context with a real session for a seeded
  account. Roles: `super`, `admin` (plain admin), `coachA` (trial, 1/2 clients, has clientA),
  `coachB` (trial, 1/2, has clientB), `coachPro` (paid Forma, base 25, 0 clients), `clientA`, `clientB`,
  `clientFree` (no coach). Password for UI logins: `env.password` (`E2e-Pass-2026!`). Emails in `env.accounts`.
- `anon()` → anonymous context. Use separate contexts per user; never reuse one across users.
- `db` → scoped DB ops on the run's DB (`findOne/find/count/updateOne/updateMany/insertOne/deleteMany`,
  `resetToken(userId)` → raw reset token, `bunnyPuts()`). Use for setup that would take minutes via UI
  (backdating a request's deadline, seeding 250 messages) and for asserting persisted state.
- `audit` (auto): records console errors, page errors, 4xx/5xx, failed requests for every context;
  attached as `console-network.json`; an unexplained 5xx / uncaught page error fails the test.
  Expected ones: `audit.allow5xx(/regex/)`, `audit.allowPageError(/regex/)` — always with a comment why.
- `ready(page)` waits for a signed-in app; `shot(page, testInfo, name)` attaches a screenshot.
- Cron: `POST /api/cron/daily-maintenance` with `Authorization: Bearer ${env.cronSecret}`.

## Rules

- Data: seeded accounts are shared by all specs in a run (workers: 1, files run in order). A spec that
  mutates seeded state must either use data it creates itself or restore what it changed in `afterAll`.
- Evidence: attach a screenshot (`shot`) at each journey milestone; failures auto-retain trace + video.
- Classify every journey PASS / FAIL / BLOCKED / FLAKY. Never weaken an assertion to make it pass.
- Product code under `src/` and `api/` is NOT edited by spec authors — report defects with evidence.
