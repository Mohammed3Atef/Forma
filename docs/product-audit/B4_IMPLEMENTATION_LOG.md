# B4 — Implementation log (premium exercise & food library + release hardening)

Continues the per-phase series (`B0` … `B3_IMPLEMENTATION_LOG.md`). The owner brief of 2026-10-22, "FORMA — B4", sets the rules: work locally, no git or deploy actions, no production change, nothing deleted, every imported item licence-verified.

---

## Checkpoint 1 — current state and release safety (2026-10-22)

### 1.1 Verified state (not assumed)

| Question | Evidence | Answer |
|---|---|---|
| Branch / HEAD / working tree | `git status -sb`, `git log` | `development` at **`82e00cc` "updates"**. The tree was clean at the start of B4. `82e00cc` holds B3.8 final + the security hotfix + B3.9 in one commit (316 files, the same as the certified snapshot `03-b39-final`: 242 tracked + 74 untracked). |
| Pushed? | `git ls-remote https://github.com/Mohammed3Atef/Forma.git` (read-only); the remote `main` fetched into `FETCH_HEAD` only | **No.** On GitHub, `development` = `e7663ab` (2026-10-04) and `main` = `ec38591`, "Merge pull request #7" of `e7663ab`. None of the 12 local commits from B0 `f1151c0` to `82e00cc` is on GitHub. `git fetch` over SSH fails with "Permission denied (publickey)" on this machine, which is a likely reason a push did not land. |
| Deployed? | `vercel ls --prod`, `vercel inspect https://www.useforma.fit` | **No.** `www.useforma.fit` serves deployment `dpl_H1LfEqNWKQCGdEhYbYE4VPbgupXo`, created 2026-10-04 22:35:19, 3 s after the merge `ec38591`. Vercel's Git integration deploys `main` to production on push. The production entry bundle (`/assets/index-CIivkq9d.js`) contains none of the B3.9 markers (`skipToContent`, `data-surface`, `RATE_LIMITED`, `DESTINATION_NOT_ACCEPTING`). |
| Is the P0 live in production? | `git show ec38591:api/_trpc/routers/auth.ts` | **Yes.** `const origin = ctx.req.headers?.origin \|\| process.env.APP_BASE_URL \|\| 'https://www.useforma.fit'`, and the same for welcome emails. `api/_lib/appUrl.ts` does not exist in production. Tokens are stored hashed. The only code path that logs the link (`email.ts` with no `RESEND_API_KEY`) does not run there: `RESEND_API_KEY` is set for Production (names only: `vercel env ls`). |
| Production env (names only, values not read) | `vercel env ls` | `APP_BASE_URL` is **not set**. After the fix deploys, production uses the built-in canonical origin `https://www.useforma.fit`, and Preview deployments send no emails (fail-safe). **`MONGODB_URI` is shared by Preview and Production**, and the `E2E_*` test-account credentials are set for Production. → B4-R1. |

The backlog rows REL-01 and REL-03 described production as "RC2 cf3a5d9 via CLI". That is out of date and is corrected in the backlog.

### 1.2 Rate limits (B36-R4) — review against the approved numbers

The numbers are unchanged:
- `messages.send`: 300 per sender and 60 per conversation per 10 min;
- `invites.create`: 30 per creator per hour and 5 per destination address per 24 h.

| Check | Before | Now | Test |
|---|---|---|---|
| Atomic across instances | one `$inc` upsert per call | unchanged | `b39Security` "concurrent sends are counted exactly" (70 → 60) |
| Race-safe first hit | a duplicate-key loser retries as an update | unchanged; now pinned: 50 concurrent first hits → one counter with count 50, exactly 30 admitted | "the first hits of a new window race safely" |
| Sender **and** conversation limits | both enforced | unchanged; sender limit pinned concurrently across 3 conversations | "per sender, concurrently across conversations" |
| Idempotent retries don't consume quota | replay checked before the limit | unchanged; 10 concurrent retries of one message store one copy | "concurrent retries of one message store it once" |
| Authorization before any mutation | the counters were charged **before** the conversation checks: a send refused as `CONVERSATION_CLOSED` or `NO_ACTIVE_COACH` still used quota | **Fixed:** the limits run after every refusal, immediately before the write. The test fails against `82e00cc` (4 counters charged) and passes now. | "a send refused for its conversation uses no quota" |
| Outbox keeps the message and respects `retryAfter` | it kept the message, but retried after 30 s with exponential backoff, ignoring `retryAfter` (up to 10 min): it re-sent into a closed window | **Fixed:** `classifyError` carries `retryAfterMs`; the outbox's next attempt = max(backoff, `retryAfter`) | `outbox.test` "a rate-limit refusal keeps the op and waits…", `errorKind.test` |
| Broadcast partial failures reported accurately | a rate-limited recipient read as a bare "Not sent" | **Fixed:** its own result, "Not sent — sending limit reached. Retry in a few minutes" (EN / AR / AR-EG) | `messagesApi.test` "a recipient refused by the send limit…" |
| Stable machine reason on 429 | `RATE_LIMITED` + `retryAfter` on the wire | unchanged | "per conversation: 60 in the window…" |
| Retry guidance localized | `errors.rateLimited*` with Arabic plural forms | unchanged, plus the broadcast string | — |
| No bypass through other procedures | — | verified: `messages.send` is the only message insert and `invites.create` the only invite insert (`git grep`); broadcast is a fan-out of `send` | — |
| Email normalized before the per-address limit | lowercased only: `victim+1@…` or `v.ictim@gmail.com` counted as new addresses | **Fixed:** `mailboxKey()` (lowercase, `+tag` dropped, Gmail dots and googlemail→gmail). Only the counter key changes; the email still goes to the address as typed. | "one mailbox, one per-address counter…" |
| Counters expire | TTL `rateLimits.ttl_expiresAt`, `expiresAt` = window end | unchanged; pinned | "…the counter expires with its window" |
| The limiter holds no private details | counter ids held the raw email, IP and account ids (`invites.email:victim@…`, `auth.login:<ip>:<email>`) | **Fixed:** the key part is a SHA-256 digest. Counting is unchanged. On deploy, counters restart once. | "counters never hold an email address, IP or account id in clear" |
| Failed deliveries / retries never duplicate | `clientMsgId` unique index + replay | unchanged | as above |

**Two recommendations; the owner decides (not implemented):**
- **B4-R3:** the per-address invite limit is shared across coaches. A malicious coach can use up an address's 5 per day and block other coaches from inviting that person for 24 h. A 429 also tells a coach that "someone" invited the address several times today. Option: when the per-address limit is reached, still create the invite but skip the email (the code and link are shown in the app). This keeps inbox protection without the denial of service.
- **B4-R4:** capacity has no hard ceiling (25 base + add-ons). A broadcast to a roster above ~300 needs two 10-minute windows. The broadcast sheet now says so truthfully. If add-ons push rosters past 250, consider a separate broadcast budget.

### 1.3 P0 B39A-S01 — verification

- Locally, `appUrl.ts` builds every emailed link (reset, invite, welcome) on the trusted origin only. `appUrl.test` (6) and the 8 link tests in `b39Security` cover: forged `Origin` / `Host` / `X-Forwarded-Host` / `Forwarded`; production with no value; an invalid value fails safe (nothing sent, no token stored, same reply); tokens and links never logged.
- The canonical production origin `https://www.useforma.fit` matches the production alias (`vercel inspect`).
- **Production is NOT fixed (urgent blocker).** It stays exposed until a build containing `appUrl.ts` is deployed.

**Owner incident checklist (execute in order; nothing here was run):**
1. **Deploy** a build containing `api/_lib/appUrl.ts`: `82e00cc` plus the B4 checkpoint-1 changes, or a hotfix-only build.
   - Pushing `main` deploys production automatically.
   - Pushing `development` creates a **Preview that uses the production database** (B4-R1).
   - Optional: set `APP_BASE_URL=https://www.useforma.fit` for **Production only**. Leave Preview unset, so previews send no emails.
2. **Verify** with your own inbox: request a reset with a forged `Origin` (e.g. `curl -H 'Origin: https://evil.example' …/api/trpc/auth.requestPasswordReset`). The email must link to `https://www.useforma.fit/reset/…`. Record the deployment id (`vercel inspect https://www.useforma.fit`).
3. **Invalidate reset tokens issued before the deploy.** This marks them and deletes nothing; the TTL reaps them.
   ```js
   // count first
   db.passwordResets.countDocuments({ used: false, expiresAt: { $gt: new Date() }, createdAt: { $lt: ISODate('<deploy time>') } })
   // then
   db.passwordResets.updateMany({ used: false, createdAt: { $lt: ISODate('<deploy time>') } }, { $set: { used: true, invalidatedReason: 'B39A-S01', invalidatedAt: new Date() } })
   ```
   Tokens live 1 h, so this closes the last hour.
4. **Review the provider logs.** In Resend → Emails, cover from **2026-09-21** (the first commit that built links from `Origin`; which production deployment first shipped it was not checked, so start at the commit date) to the deploy time.
   - Check every "Reset your Forma password", "Welcome to Forma" and "… invited you to Forma" email. Any link host other than `www.useforma.fit` or the Vercel aliases means a suspected attack; list those recipients.
   - Invite links matter as well: the invite code is the capability to claim an account. Check `signupInvites` claimed after a suspicious email.
   - Vercel runtime logs (retention depends on the plan) do not record request headers. Resend is the primary evidence.
5. **For each affected user:**
   - revoke sessions with `db.refreshTokens.updateMany({ userId: '<id>', revoked: false }, { $set: { revoked: true } })`; access tokens expire within 15 min;
   - send a fresh reset from the fixed build;
   - notify the user;
   - check PDPL breach-notification duties with counsel.
6. **Record REL-02 evidence:** deployment id and commit; the count from step 3; the review window and number of emails reviewed; foreign hosts found (n); users revoked; date and reviewer.

### 1.4 Indexes — review and preflight (nothing built)

**What a deploy would build on its own.**
- Five API modules self-ensure indexes on first use. Compared with production `ec38591`, the only new runtime indexes are the four on **`clientPayments`** (B3.8): two unique (`uniq_coach_request`, `uniq_reverses`) and two plain.
- Production has no code that writes that collection, so it starts empty and the unique builds cannot collide (B4-R2: accepted, documented).
- Every other runtime index already runs in production.

**Built only by the owner-run script.**
- Added since production: `syncRecords.clientId_collection_finished_date` and `notifications.clientId_forRole_seenAt` (additive), and `coachClients.uniq_active_client` (unique; duplicate preflight).
- No exercise or food search index exists. B4's catalog is served without one (see the architecture docs).

**New tooling** (`scripts/indexes/`):
- `manifest.mjs`: **the** declarative list. The init script and the preflight read it. A test checks that every runtime-ensured index in `api/` is listed.
- `preflight.mjs`: **read-only**, using `listCollections`, `listIndexes`, `estimatedDocumentCount`, `$match`/`$group` aggregation and `explain`. It reports present / missing / conflicting indexes, unique indexes blocked by duplicates (with sample ids), and the plans of the hot queries.
- `node scripts/index-preflight.mjs [--json]`: explicit `MONGODB_URI` only (never `.env`), prints the target without credentials.
- **`node scripts/mongo-init-indexes.mjs` is now a dry run by default.**
  - It creates only with `--apply`.
  - It never builds a unique index over duplicates and never replaces a conflicting definition.
  - Legacy drops (index only) happen only with `--apply`.
  - Before this change it created indexes immediately against whatever `.env` pointed at.
- Tests: `scripts/indexes/indexManifest.test.ts` (5):
  - the manifest covers the runtime indexes;
  - the preflight changes nothing (fingerprint of every document and index);
  - duplicate active relationships block `uniq_active_client` and are listed;
  - a same-name / different-key index is reported as a conflict and left alone;
  - a re-run of `--apply` is a no-op;
  - the probes use the expected index;
  - credentials are redacted.

**Owner preflight for production (read-only):**
```
MONGODB_URI='<production uri>' MONGODB_DB=forma node scripts/index-preflight.mjs > index-preflight-prod.txt
```
Expected missing: the three script-only B3.9 indexes and the four `clientPayments` indexes. A `uniq_active_client` duplicate means data to resolve before building; nothing is changed automatically.

### 1.5 Baselines carried into B4

- **Unit + API:** 1,204 / 1,204 at B3.9. Now plus 6 security, 1 classifier, 1 outbox, 1 broadcast and 5 index tests.
- **e2e3:** 369 passed + 1 approved skip.
- **Bundle:** the reviewed B3.9 baseline (`scripts/bundle-budgets.json`).
- **Library payload:** PF-11, 835 KB per coach library fetch.

### 1.6 Findings opened at checkpoint 1

| ID | Finding | Status |
|---|---|---|
| B4-R1 | Preview and Production share `MONGODB_URI` (and Production carries `E2E_*` test credentials). A preview of `development` would run new code, including its runtime index builds, against production data. | Open — owner config (separate Preview database before pushing `development`) |
| B4-R2 | A deploy builds the four new `clientPayments` indexes at runtime | Accepted — empty collection in production; listed in the manifest |
| B4-R3 | The cross-coach per-address invite limit can be used to block invites to an address for 24 h | Open — owner decision (option above) |
| B4-R4 | A roster above ~300 needs two windows for one broadcast | Documented — the result is truthful |
| B4-F1 … F4 | Quota charged for refused sends; outbox ignored `retryAfter`; broadcast lacked a rate-limit result; limiter keys in clear and email variants uncounted | **Fixed** (tests above) |

---

## Checkpoint 2 — sources and licences (2026-10-22)

Full write-up: `B4_SOURCE_RESEARCH_AND_LICENSES.md`.

**Decisions:**
- **USDA FoodData Central (CC0)** for every food value and portion weight.
- **wger** for exercise identity and *reviewed* CC BY-SA media only; no wger text is copied.
- **Forma writes** all names, Arabic and Egyptian aliases, instructions and recipes.
- **Rejected:** Free Exercise DB with Videos (no licence chain for the videos), ExerciseDB / AscendAPI and derivatives, scraped image sets, FAO tables (non-commercial), the Kaggle copy of NNI, and an OFF bulk import (ODbL share-alike).
- **The existing OFF lookup** is kept as a per-food, attributed lookup.

**FD-03 fix:**
- The food lookup credited "wger.de (CC BY-SA)" and kept no provenance.
- It now shows the ODbL notice with links, and stores `source: open-food-facts / ODbL-1.0` with the source URL on each row.

## Checkpoint 3 — the exercise catalog (2026-10-22)

Architecture: `B4_EXERCISE_LIBRARY_ARCHITECTURE.md`. Media: `B4_MEDIA_RIGHTS_AND_QA.md`.

**Pipeline** (`scripts/catalog/`):
- wger snapshot of 932 exercises, cached and bounded;
- 8 curation sheets with 134 exercises, all with EN + AR instructions and Egyptian aliases;
- a per-file media review (216 candidate files: 79 included, 137 excluded with reasons);
- real-Chrome video checks;
- a deterministic build.

**Server:**
- versioned dataset files, validated by a zod contract;
- in-memory search for EN / AR / EG with typos;
- `catalog.*` tRPC procedures: read-only, capped at 50, no database read;
- the `FORMA_CATALOG` production switch (off by default in production).

**App:**
- **Plan-editor picker:** "Forma library" / "My library", preview, mixed selection, full copies with `catalogId`, `catalogRev`, `names`, `instructions` and `mediaCredits`.
- **Coach library:** a Forma view plus "Save to my library" (copy `cat-<id>`, never twice).
- **Client exercise page:** the name in the reader's language, "How to do it", per-file credits.
- **Display names:** the workout, routine and session views use the localized catalog name unless the coach renamed the exercise.
- **Sync:** `SYNCED_EXERCISE_FIELDS` carries the new fields.

**Covers (with named tests):**
- EX-02, EX-09, EX-10, EX-12, EX-13, EX-14 / JR-06 and EX-19 for catalog exercises;
- B3-S11 (`source` kept on exercise saves).

## Checkpoint 4 — the food catalog (2026-10-22)

Architecture: `B4_FOOD_LIBRARY_ARCHITECTURE.md`.

**Data:**
- USDA bulk files: SR Legacy 2018-04, FNDDS 2024-10, Foundation 2026-04, each with a SHA-256 manifest.
- 9 curation sheets with 190 foods: 177 source values, 8 labelled nearest-match estimates and 5 recipe estimates.
- Portions only from the food's own USDA portion table.
- Six Egyptian items are deliberately left out rather than invented.

**Maths:** one shared calculation (server + client mirror, parity test) with deterministic rounding:
- grams first;
- kcal to an integer, macros to 0.1 g;
- totals equal the sum of the rows.

**App:**
- **Coach nutrition editor:** Forma-food search and a serving chooser. A catalog row gets a serving editor that recomputes from per-100 g. A hand-typed macro drops the provenance, and the editor says so.
- **Client custom food:** the same search and serving chooser.
- **Servings:** shown in the reader's language with grams (`quantityText`).
- **Rows:** keep `per100g`, `portion`, `foodState`, `verification`, `sourceNote` and `source`. The legacy fields are still written, so older readers keep working.

**Covers (with named tests):**
- FD-03, plus the B4 food items listed in the backlog update.

## Checkpoint 5 — migration rehearsal (2026-10-22) — stopped at the owner gate

Plan: `B4_IMPORT_AND_MIGRATION_PLAN.md`. Done locally:
- the read-only production inventory script (`scripts/catalog/inventory.mjs`; the test proves it changes nothing);
- the legacy → catalog mapping (`data/catalog-reports/legacy-mapping.{json,md}`):
  - exercises 909 → 180 exact / 105 to review / 624 keep;
  - foods 84 → 72 mapped (14 to review) / 12 keep;
- the shadow comparison of old vs new search (`shadow-{exercises,foods}.md`).

**Nothing was applied to any database.** Steps A–F, and the archive candidates, wait for the owner.

## Checkpoint 6 — certification (2026-10-22 / 23)

Report: `B4_CERTIFICATION_REPORT.md`. **Problems found during certification, and fixed:**

| # | Found by | Problem | Fix | Test |
|---|---|---|---|---|
| C1 | e2e 89 / 22 / 20 | A Forma-first picker default hid quick-create and recently used exercises for coaches with their own library | Default = the stored choice, else "My library" when the coach has exercises; quick-create is always the last row | `ExercisePickerSheet.catalog.test.tsx`; e2e 89 / 22 |
| C2 | e2e 98 matrix | Library source chips were 34 px tall | `min-h-ui-hit` (44 px) | `98-b4-catalog` matrix (44 px check) |
| C3 | e2e 98 (client, AR) | Planned food quantities stayed in English for Arabic readers | `quantityText()` in client, coach view and editor | `catalogCopy.test` "the reader sees the serving in their language"; e2e 98 client |
| C4 | Visual QA (390 px) | The "no demonstration" tile was white on the dark sheet; long exercise names were cut at the same prefix ("ضغط البار على البنـ…" twice) | The no-demo tile uses the raised surface; names wrap to two lines | Screenshots `e2e-out/b4-cat-*/b4-visual/` |
| C5 | `@vercel/nft` trace | The function bundle would include the 300 KB of build reports in `data/catalog/reports` | Reports moved to `data/catalog-reports/`. The trace now contains only the two dataset files. | Trace run (certification report §4) |
| C6 | Profiling | Index build of 150–175 ms per cold instance; search p95 of about 14 ms (field text normalized twice, repeated labels re-normalized, typo distance recomputed per repeated word) | Memoised normalization and per-query word scores | Golden comparison: identical ids, order, scores and totals for 214 queries. Now 88–141 ms build, p95 about 4 ms. `searchQuality.test` |
| C7 | Doc review | Recipe estimates (koshary, ful, molokhia, mahshi, rice with vermicelli) showed no assumptions, and "Values: USDA FoodData Central" implied a single record | The card carries `recipeNote`; the chooser shows it plus "Forma recipe estimate from USDA … ingredients"; the saved row keeps it as `sourceNote` | `catalog.test` (card), `catalogCopy.test` "a recipe estimate keeps what it assumes", `CoachNutritionEditor.catalog.test` "a recipe estimate says what it assumes" |
| C8 | Data review | The `forma` dataset source carried `retrievedAt: 1970-01-01` | It carries the dataset's latest USDA retrieval date | `build-foods.mjs` dry run "no change" |
| C9 | Test gap | No UI test for the production default (catalog off) | Added; mutation-checked (fails with the catalog on) | `ExercisePickerSheet.catalog.test.tsx` "catalog switched off" |
| C10 | Bundle report (`scripts/bundle-report.mjs`) | The catalog UI was statically imported into the plan editors: workout editor first visit +17.7 %, nutrition editor +17.3 % over the B3.9 budget — downloaded even with the catalog off | `src/components/catalog/LazyCatalog.tsx`: the browser, preview, food picker and serving editor load on first use (precached for offline). Now +8.9 % / +11.4 % (the editors' own new logic). Budgets **not** changed: rebaseline is an owner decision (certification report §3). | `bundle-report.mjs`; coach and client offline boot PASS; e2e 98 |
| C11 | Test gap | B3-S11 and FD-03 had no test | `coachAssets.test` "B3-S11 / B4 …", mutation-checked (fails without `source` in the schema); `FoodSearchPicker.test` (fails at HEAD: no attribution, no provenance) | as named |
| C12 | Full e2e run, client nutrition screenshot | Food searches with no hit said "No exercises match your search" (the database lookup always had, and the new catalog picker copied it). The client sheet showed the Forma search unlabelled, its placeholder cut off by the category menu. | `catalog.foods.noResults` (EN / AR / AR-EG) in both pickers; the client sheet labels "Forma foods" like the coach editor; the search keeps 3/5 of the row | e2e 30, 98 re-run; unit |
| C13 | Full e2e run, `10-auth` | The login rate-limit test read the counter `_id` expecting the email in clear — B4 hashes it (C1 / B4-F4) | The test now checks that one login counter reached 11 in the window, and that no stored id holds the email or the IP | e2e 10 re-run |

**Left as is, recorded:**
- **`coachLib.dataAttribution`** is now unused: the food lookup shows the ODbL notice instead. Its AR-EG text is owner wording, so removal is left to the owner.
- **"Load starter library"** still seeds the 909 legacy exercises (migration plan, step F).

---

# B4.1 — independent coach quotas, exercise video library, visual food catalog (owner brief, 2026-10-23)

**State at start:**
- `development` at `82e00cc`, plus 67 uncommitted B4 paths.
- GitHub is unchanged: `main` = `ec38591`, `development` = `e7663ab` (`git ls-remote` over HTTPS).

## Slice 1 — every coach's quotas are its own (2026-10-23)

| Quota | Before | After (B4.1) |
|---|---|---|
| Messages per sender (300 / 10 min) | Authenticated sender | Unchanged: the authenticated sender (a coach's own id, never a browser value) |
| Messages per conversation (60 / 10 min) | sender › client | sender › server-resolved coach › client. The same for coaches; explicit for clients. |
| Invites per creator (30 / h) | Authenticated creator | Unchanged |
| Invites to one address (5 / 24 h) | **One counter per mailbox, shared by every coach** (B4-R3: one coach could block another; a refusal revealed someone else's invites) | **Per creator × canonical mailbox** (`mailboxKey`: case, `+tag`, Gmail dots). Staff creating for a coach use their own quota. |
| Inbox protection | — | **Infrastructure ceiling, not a quota** (`INVITE_EMAIL_CEILING`): at most 20 Forma invite emails per mailbox per 24 h across Forma. Past it, the invite is still created and the coach is told only "email not sent". |

**How charging works:**
- **One unit.** `consumeRateLimits()` charges the quotas of one operation together. If any refuses, every counter it charged is refunded, so a refused operation consumes no quota. `release()` refunds them when the write then fails, including a concurrent duplicate retry.
- **Concurrency.** Admission needs every counter within its limit after its own charge, and refunds only lower counts, so concurrency never admits more than the limit.
- **Unchanged infrastructure counters.** Login, sign-up, reset, invite lookup and claim (per IP) keep `enforceRateLimit()`.

**Invite email, made truthful:**
- **Sent inside the request.** Before, it was fire-and-forget, which a serverless function may never finish, and its outcome was unknown.
- **The invite records its outcome:** `emailStatus` = `sent` / `not-sent` / `unconfirmed` (8 s bound).
- **The reason stays on the server:** `emailIssue` = disabled / no trusted origin / provider error / timeout / inbox ceiling, so nothing hints at other coaches.
- **Coach view:** pending invites show "Email sent to …", "Email not sent — share the link instead." or "may not have arrived".
- **Send email again** (`invites.resendEmail`): owning coach only (anyone else gets NOT_FOUND); charged like a new invite to that address; refunded when nothing went out.
- EN / AR / AR-EG strings added.

**Tests:** `b39Security.test` "B4.1 — independent per-coach quotas" (10 new). Two B36-R4 / B4 tests were rewritten from "across coaches" to "per coach".

| Test | Proves |
|---|---|
| Coach A exhausts the sender quota; coach B unaffected | Isolation, messages |
| A full conversation of A; A's other conversations and B open | Isolation, conversations |
| A conversation refusal refunds the sender quota (counters exactly 5 and 3 / 2) | Refused operations consume nothing |
| Both coaches invite one address, 5 each; the 6th refused per coach | Isolation, invites |
| 12 concurrent invites to one address → 5 created; counters exactly 5 / 5 | Concurrency |
| A per-address refusal refunds the creator quota | Refunds |
| Client refused before any counter; another coach's `coachId` ignored; staff use their own quota | Authorization |
| Email outcome truthful; `emailIssue` never returned | Truthful delivery, no leakage |
| Resend: owner only, refunded when nothing sent, CONFLICT once revoked | Retry state |
| Inbox ceiling: invite still created, "not sent", B's own quota intact | Infrastructure protection |
| One coach's aliases and case changes share one counter (rewritten B4 test) | No bypass |

**Checkpoint run:** `npx vitest run` over every test file touching invites, messages, rate limits, the outbox and error classification: **18 files, 309 / 309 passed.** `tsc -b` clean. The outbox (`retryAfter`), broadcast (`rateLimited`) and replay tests pass unchanged.

## Slice 2 — exercise videos (2026-10-23 / 24)

### 2.1 The 593 videos of `michael-lemarec/free-exercise-db-api`: blocked

**Decision: not imported, hosted, published or streamed.** Rights could not be verified:
- **The repository licence is MIT.** It covers the code and the metadata, not the videos.
- **The README says the videos were bought from a third-party seller.** It does not name the seller or any licence that would allow redistribution.
- **The sample files carry no copyright or licence metadata.** They were re-encoded, and their drop-frame timecode suggests they were cut from commercial footage.
- **The upstream links are gone.** The hosting links return 404 and the demo site returns 410.

The rights-clearance request and the full blocked list are in `B4_MEDIA_RIGHTS_AND_QA.md` §6.

### 2.2 Mapping (`scripts/catalog/fedb-mapping.mjs` → `data/catalog-reports/fedb-mapping.{json,md}`)

- **Coverage.** 317 source exercises and 593 videos. A person reviewed 97 rows (`curation/fedb-review.json`); 220 were matched automatically.
- **Fields per row (JSON).** Source id, name, equipment and target; Forma id, EN and AR names, Egyptian aliases, equipment, muscles and variant; video count; licence status (always "blocked"); confidence; review note.

| Confidence | Source exercises | Videos (all blocked) |
|---|---:|---:|
| exact (same movement as a Forma item) | 97 | 184 |
| variant (a different exercise; nearest Forma item shown, never merged) | 109 | 208 |
| none (missing from Forma) | 111 | 201 |

**Forma items with an exact counterpart:** 91 of 164.

**Curated additions.** 30 exercises the source showed were missing (19 strength, 11 cardio and mobility; `curation/exercises/09-…`, `10-…`). The catalog now has **164** items (was 134).
- **Variations stay distinct items.** They are linked by `variantOf` (forward lunge → walking lunge, machine crunch → crunch, kettlebell deadlift → deadlift, stability-ball leg curl → lying leg curl).
- **Taxonomy.** Adds `elliptical` and `battle-ropes`.

### 2.3 The licensed path: wger videos (CC BY-SA 4.0) converted and reviewed

**Conversion** (`scripts/catalog/convert-videos.mjs`):
- **Format.** 720p H.264 Main, CRF 26, no audio, faststart, plus a WebP poster.
- **Licence.** A format conversion is not an adaptation under CC BY-SA 4.0 §2(a)(4).
- **Result.** 51 candidates: 46 converted, 5 skipped (over 100 MB at source), 0 failed. 1.39 GB of source became 146 MB.

**Review by a person** (`curation/media-review.video.json`), using contact strips of every converted file:

| Outcome | Videos | Reasons |
|---|---:|---|
| Approved | 33 | Each with a bilingual angle label ("Side view", "Several angles" …) |
| Rejected | 13 | Recognisable bystander faces (6); readable licence plates (1); an advertising poster with faces (1); same camera angle as a kept clip (3); a different variation (2) |
| Re-attributed | 2 of the 33 | vid 2 and 3 show the **dumbbell** Romanian deadlift: attached to that exercise, never to the barbell one |

**Catalog build (`exercises.json` v2026.10.24-1):**
- **Published videos.** 36: 33 Forma-hosted and 3 still served from the source.
- **Exercises with a video.** 3 now; **24 once the catalog CDN is set.**
- **Hosting manifest.** `data/catalog-reports/catalog-media-upload.json`: 66 files (33 MP4 + 33 posters), 99 MB. **Nothing was uploaded.**

**Video model** (`api/catalog/_lib/schemas.ts` `MediaSchema`):
- `hosting` (`source` / `forma-cdn`) and `cdnPath`.
- `role` (`primary` / `alternate`) and a bilingual `label`.
- `mime`, `codec`, `durationSec`, `width`, `height` and `poster`.
- `rights`, `review` and `publication`.

**Serving.**
- **Published means** verified, reviewed and approved (a schema refine).
- **`servedMedia()`** sends a Forma-hosted file only when `FORMA_CATALOG_MEDIA_URL` is set (https, or loopback for tests). That variable is unset in production.

**UI:**
- **Coach picker preview.** Every approved demo can be chosen (`catalog-demo-switch`).
- **Lazy loading.** The video loads only on tap: a poster button first, then `playsInline`, muted, looping.
- **Client exercise page.** An inline demo for catalog copies with an MP4; the poster or image otherwise.
- **Copies.** A plan copy keeps `videoPosterUrl`.

**Video counts (the checkpoint the brief asks for):**

| | of the 593 | Licensed alternative (wger) |
|---|---:|---:|
| Rights verified | 0 | 51 (CC BY-SA 4.0, per-file author) |
| Eligible | 0 | 46 converted |
| Mapped to Forma | 392 (exact + variant; reference only) | 46 |
| Converted | 0 | 46 |
| Approved | — | 33 (+3 already served) |
| Blocked | **593** | 13 rejected, 5 too large |

**Tests:**
- `media.test` (new): schema, `servedMedia`, CDN setting, API serving.
- `CatalogDemo.test` (3).
- `dataset.test`: media rules.
- e2e 98: three demos, poster then video.

## Slice 3 — food pictures (2026-10-24)

### 3.1 The catalog's pictures (`scripts/catalog/build-food-images.mjs`)

- **Sources.** Wikimedia Commons only: CC0, PD, CC BY 2.0–4.0, CC BY-SA 2.0–4.0, with author, licence and source per file. No Google Images, no product photography, no brand implied.
- **Review.** Four reviewers judged every candidate (`curation/food-images.{a,b,c,d}.json`). I then spot-checked every processed thumbnail on contact sheets.
- **Variants.** `card` (640 px WebP) and `thumb` (160 px square WebP).

| Of 190 foods | Count | |
|---|---:|---|
| Approved | 125 | Shown |
| Needs replacement | 2 | Shown, flagged for a better photo: ful with oil (a layer may read as tahini), whey protein (chocolate powder could read as cocoa) |
| Rejected | 3 | Would mislead: boiled chickpeas (read as green peas), raw egg white (reads as oil or yolk), boiled potato (looks raw) |
| Missing | 60 | Honest placeholder. No wrong or unlicensed photo was used to fill the gap |
| **With a picture** | **127** | |

**Hosting manifest.** `catalog-media-upload-foods.json`: 254 files, 4.55 MB, for the public catalog zone. **Nothing was uploaded.** Pictures are served only once `FORMA_CATALOG_MEDIA_URL` is set.

### 3.2 Model

**Catalog** (`FoodImageSchema`):
- `variants` (thumb and card) and bilingual `alt`.
- Licence, author and source page.
- `review` (approved / pending / needs-replacement), `publication`, `role`, `rev`, and the storage `cdnPath`.
- **No binary data in Mongo.**

**Library foods and plan items** (`FoodImageRef`) carry a **copy**:
- `source` (`upload` / `forma-catalog`), `url` and `thumbUrl`.
- Size, bilingual alt, `catalogFoodId`, credit, `rev` and `uploadedAt`.
- A plan keeps the picture it was saved with, whatever happens to the library food or the catalog.

### 3.3 What a coach can do

On a library food (Library › Foods) and on a plan item (nutrition editor):
- Add a photo, replace it, remove it, preview it.
- See progress, cancel an upload, and get a useful error. Retry resends the photo already prepared.
- Choose the approved Forma photo of a catalog food.

**How it behaves:**
- **The canonical picture is never changed.** A coach upload is the coach's own copy in their own folder.
- **A replacement is a new file** (next `rev`). Plans saved earlier keep the old one.

### 3.4 Security and ownership

- **Device.** The photo is decoded with orientation applied, scaled to at most 1600 px (thumbnail at most 320 px, never enlarged) and re-encoded. That drops all metadata before upload.
- **Server** (`api/media/_lib/imageSanitize.ts`):
  - **Type** is read from the bytes (JPEG / PNG / WebP).
  - **Metadata is stripped without re-encoding:** JPEG APP1 and APP3–15 and COM; PNG text, eXIf and tIME; WebP EXIF and XMP.
  - **Refused:** animated images (APNG, animated WebP), anything under 64 or over 8192 px a side or over 40 MP, and anything over 4 MB.
  - **Who and where.** Coaches only; stored at `Forma/<coachId>/foods/`.
- **On every save** (`api/coach-assets/_lib/foodImage.ts`). Library foods, swap groups, templates and plans must use the saving coach's own upload, or an approved catalog picture of that catalog food. Anything else is refused: another coach's photo, a client's private media (same CDN host), a path escape, a foreign host. Pictures already in the stored document stay, so history is editable after a catalog withdrawal or a transfer.
- **Client logs never supply a picture.** The client screens show only plan pictures, and an approved swap is logged without its picture.
- **Orphans** (`foodImageOrphans.ts`, super admin `media.foodImageOrphans`).
  - **What it reports.** Food photos no document references, older than 14 days.
  - **Report only.** Deleting files is an owner-approved storage step.

### 3.5 Display

**Where pictures appear:**
- Library foods (table and list, plus the detail).
- Nutrition-editor meal rows and the library picker.
- Catalog food rows and the serving card.
- The client's meal rows and the swap sheet.
- The coach's day view of a client.

**How they render:**
- Fixed boxes and lazy loading, with alt text in the reader's language.
- A quiet placeholder when a picture is missing or fails to load.
- RTL-aware.

**Tests:**
- **Server.** `imageSanitize.test` (6), `_media.test` (3 new), `foodImage.test` (4), `planSafety.test` (3), `coachAssets.test` (food pictures), `media.test` and `dataset.test` (catalog pictures), `foodImageOrphans.test` (2).
- **Client.** `catalogCopy.test` (3), `FoodImageEditor.test` (8), `FoodImage.test` (3).
- **e2e 99** (5 journeys): canonical picture, upload, replace, remove, fallback, ownership, client in Arabic.

**Checkpoint run (`b41-s3-2`): 11 / 11 passed** (specs 98 + 99).
- **Uploads.** Two files landed in `Forma/e2e-coach-pro/foods/` with no EXIF, author or description bytes.
- **History.** After a replacement the plan still shows the first file, and that file is still served.
- **Ownership.** Another coach gets "your own uploads" (400) and NOT_FOUND on update. A client's progress photo is refused. A client upload to `food` gets 403.

## Slice 4 — release hardening (2026-10-24)

- **`FORMA_CATALOG`** stays off in production:
  - Not set in Vercel (names checked).
  - The code default is off in production.
  - `FORMA_CATALOG_MEDIA_URL` is not set either.
- **Migration.** No environment was confirmed, so **no inventory or index preflight was run against any database**. The 909 legacy exercises are untouched.
  - **Plan to stop the starter seed** (not executed). Each step needs owner approval:
    1. Enable the catalog on a confirmed non-production database.
    2. Hide "Add the starter library" for exercises while the catalog is on. Foods, groups, supplements and programs keep seeding until their catalog equivalents are approved.
    3. Leave every coach's existing `wger-<n>` copies and every plan as they are. Offer "link to the Forma exercise" using the catalog's `replaces` mapping (180 legacy ids mapped); never replace automatically.
    4. Remove `public/data/exercise-library.json` only after the clean launch (REL-04).
- **Open Food Facts** stays a separate, labelled lookup: ODbL notice, `open-food-facts` provenance, no pictures from it. It now loads with the food sheet.
- **`coachLib.dataAttribution`** removed from en, ar and ar-eg. It was proven unused: no static or dynamic key reference, and its text ("exercise data provided by wger.de") was no longer true.
- **Bundle pass.** Before / after in `B4_CERTIFICATION_REPORT.md` §B4.1. Three changes:
  - Light helpers moved to `lib/catalogText`.
  - Photo editor and OFF search load with the food sheet (`food/LazyFood`).
  - The exercise picker loads on first open; catalog copy code loads on first catalog add or copy.
  - **No budget was raised.**
- **Blockers re-verified** (read-only: `git ls-remote` over HTTPS, `vercel ls` / `inspect`, `vercel env ls` names only). See the certification report.

## Slice 5 — certification (2026-10-24)

- **Code frozen**, then:
  - `tsc` clean and boundaries OK.
  - **1,338 / 1,338** unit tests passed.
  - Full e2e3 suite `b41-full-1`: **383 passed, 1 skipped (Google sign-in), 0 failed** of 384, with no retries.
  - PWA check and coach / client offline boot all passed.
- **Details** are in `B4_CERTIFICATION_REPORT.md` §B4.1.
- **Nothing was staged, committed, pushed, deployed, uploaded or enabled.**
