# Phase-3 E2E results — agent A (auth, signup/trial, plan requests, admin)

Ports 5201/5301, project `chromium-1440`. Final full run: **`e2e-out/a-15/`** (all 4 files, 23 passed / 3 failed / 1 skipped, 10.2 min).
The one timeout in a-15 ("every admin destination") was re-run alone in **`e2e-out/a-16/`** (PASS, 41 s) after raising its budget.
Screenshots are on disk at `e2e-out/<run>/shots/<spec>/<test>/<name>.png`, and also attached in `e2e-out/<run>/report/`.

Adaptations:
- Spec §7 "Choose Paid Plan from marketing" becomes signup → Trial → request Pro from My Plan, because marketing has one CTA and `?plan=` is intentionally dead.
- My Plan shows the trial end **date**, not "15 days". The test checks `endsAt - startedAt == 15 d` in the DB and that the end date appears in the UI.
- Harness workaround in `_a-helpers.ts` (`noHmr`): see H-1. It stubs the Vite HMR websocket in every context the specs open. Production builds have no HMR socket, so this does not change product behaviour.

| journey | spec:test | result | evidence (e2e-out/…) | notes |
|---|---|---|---|---|
| UI login + role redirects (coach→/coach/dashboard, client→/, super→/admin) | 10-auth:10 | PASS | a-15/shots/10-auth-spec-ts/UI-login-role-redirects-coach-client-super/ | |
| Wrong password: error shown, stays on /login | 10-auth:27 | PASS | a-15/shots/10-auth-spec-ts/wrong-password-shows-an-error-and-stays-on-login/ | "Invalid email or password." |
| Coach logout → anonymous → login as coachB: no coachA data | 10-auth:37 | PASS | a-15/shots/10-auth-spec-ts/coach-logout-anonymous-next-login-as-a-different-coach-shows/ | dashboard + clients list show only Client Bilal |
| Client logout (confirm dialog) → login as clientB: no clientA data | 10-auth:62 | PASS | a-15/shots/10-auth-spec-ts/client-logout-confirm-dialog-anonymous-next-login-as-a-diffe/ | sign-out sits on the Settings → Account tab |
| Refresh keeps the session | 10-auth:92 | PASS | a-15/shots/10-auth-spec-ts/refresh-keeps-the-session/ | |
| Revoked refresh token → reload → login, no loop, no error | 10-auth:106 | PASS | a-15/shots/10-auth-spec-ts/revoked-session-reload-lands-on-login-no-loop-no-error/ | at most 2 `auth.refresh` calls in 4 s; no `login-error` |
| Login rate limit (11 bad attempts, throwaway email) | 10-auth:124 | PASS | a-15/shots/10-auth-spec-ts/login-rate-limit-11-bad-attempts-for-one-email-friendly-erro/ | 11th attempt gets 429 "Too many attempts — please wait a bit and try again."; form stays usable |
| Forgot password: generic confirmation (known + unknown email) | 10-auth:144 | PASS | a-15/shots/10-auth-spec-ts/forgot-password-shows-the-generic-confirmation/ | same dialog for both, so no enumeration |
| Reset via `/reset/<raw>` → login with new password; old one rejected; token single-use; restored | 10-auth:161 | PASS | a-15/shots/10-auth-spec-ts/reset-password-via-link-login-with-the-new-password-then-res/ | clientFree restored to `env.password` (asserted 200) |
| Signed-in user opens `/invite/ANYCODE` → interstitial → switch → anonymous invite screen | 10-auth:191 | PASS | a-15/shots/10-auth-spec-ts/signed-in-user-opening-invite-code-sees-the-interstitial-sig/ | URL kept; `invite-invalid` shown |
| Signed-in user opens `/reset/<token>` → interstitial → switch → reset form | 10-auth:204 | PASS | a-15/shots/10-auth-spec-ts/signed-in-user-opening-reset-token-sees-the-interstitial-sig/ | |
| Google sign-in | 10-auth:216 | BLOCKED | — | `test.skip`: needs real Google Identity Services + a Google-issued ID token |
| Landing pricing (live 499 EGP / 15 d / 2 / 25) → Start Trial → signup → Trial active, limit 2, 0 requests | 11-signup-trial:8 | PASS | a-15/shots/11-signup-trial-spec-ts/landing-pricing-Start-Trial-signup-coach-on-active-Trial-no-/ | exactly one CTA (`/login?signup=1`); DB: trial/active/maxClients 2, `coachPlanRequests` count 0 |
| (a) Trial coach requests Pro: current plan stays Trial 0/2; request card shows Pro/25, awaiting, 24h countdown; DB snapshot {pro, 499, 25}; type trial_upgrade | 12-plan-requests:44 | PASS | a-15/shots/12-plan-requests-spec-ts/a-trial-coach-requests-Pro-current-plan-stays-Trial-Requeste/ | price on the card is checked separately in (a2) |
| (a2) Coach's Requested Plan card shows the price (499) | 12-plan-requests:117 | FAIL | a-15/shots/12-plan-requests-spec-ts/a2-coach-Requested-Plan-card-shows-the-snapshot-price-499-EG/ | E-A-1 |
| (b) Super sees the request (Pro/25/499 EGP) → confirms → coach tab becomes Pro / 0/25 without reload | 12-plan-requests:75 | PASS | a-15/shots/12-plan-requests-spec-ts/b-super-confirms-coach-My-Plan-becomes-Pro-25-without-manual/ | coach UI updated **49 s** (a-15) / **56 s** (a-5) after confirm, via the 60 s poll; focus did not trigger it (E-A-3). DB: confirmed; `startedAt == confirmedAt`; term 30 d |
| (c) Awaiting request past its deadline → cron → `expired`; Trial and account unchanged; expired copy shown, no "client limit" error | 12-plan-requests:130 | PASS | a-15/shots/12-plan-requests-spec-ts/c-awaiting-request-past-its-deadline-cron-expires-it-Trial-a/ | cron response `{"expirePlanRequests":{"checked":1,"expired":1}}` |
| (d) coachPro re-requests Pro → `renewal`; plan stays Pro/Active/25; super rejects (confirm dialog) → plan untouched; coach sees "Declined" | 12-plan-requests:161 | PASS | a-15/shots/12-plan-requests-spec-ts/d-Pro-coach-re-requests-Pro-renewal-plan-stays-Pro-active-su/ | coachPro's request rows removed afterwards |
| (e) Pro tier edited to 599 while a request is pending → marketing shows 599; admin detail keeps 499 + stale-snapshot note; confirm applies 499/25 | 12-plan-requests:203 | PASS | a-15/shots/12-plan-requests-spec-ts/e-tier-price-edited-while-a-request-is-pending-marketing-sho/ | tier price restored to 499 through the UI (asserted in DB) |
| Super: all 12 admin destinations render, no permanent skeleton, no 5xx | 13-admin:27 | FLAKY | a-16/shots/13-admin-spec-ts/every-admin-destination-renders-no-permanent-spinner-no-5xx/ | a-15: timed out on /admin/governance (Splash "Loading…" > 20 s while 4 suites shared the machine); a-9 and a-16: PASS; 4xx/5xx list empty |
| Super: accounts search / role filter / status filter / row → sheet | 13-admin:42 | PASS | a-15/shots/13-admin-spec-ts/accounts-search-role-status-filters-row-detail-sheet/ | |
| Super: coaches list → preview → coach detail | 13-admin:82 | PASS | a-15/shots/13-admin-spec-ts/coaches-list-coach-detail/ | |
| Super: banner with https CTA → BannerHost shows it to coachA → delete (confirm) → gone; `javascript:` CTA refused | 13-admin:100 | FAIL | a-15/shots/13-admin-spec-ts/banners-create-https-CTA-shows-for-a-coach-delete-javascript/ | create, render, delete and the refusal itself (no row stored) all work. Fails only because the refusal dialog shows raw zod JSON (E-A-2) |
| Plain admin: sidebar has no Coaches/Plans/Subscriptions/Media; the 4 deep links + `/admin/coaches/:id` redirect to /admin | 13-admin:166 | PASS | a-15/shots/13-admin-spec-ts/sidebar-has-no-super-only-destinations-deep-links-redirect-t/ | |
| Plain admin: mobile bottom nav + Menu sheet have no super-only items | 13-admin:188 | PASS | a-15/shots/13-admin-spec-ts/mobile-bottom-nav-menu-sheet-have-no-super-only-destinations/ | 390×844 context |
| Plain admin: ⌘K palette has no Coaches/Subscriptions | 13-admin:206 | PASS | a-15/shots/13-admin-spec-ts/K-palette-has-no-Coaches-Subscriptions-commands/ | options: Accounts, Assignments, Governance |
| Plain admin: allowed pages work, no 403 | 13-admin:224 | PASS | a-15/shots/13-admin-spec-ts/allowed-pages-work-with-no-403-during-normal-navigation/ | `admin-http-errors.json` = [] (no 4xx/5xx at all) |

## FINDINGS

- **E-A-1 (P2)** — The coach's "Requested Plan" card never shows the price the coach will be asked to pay. It shows only label and client count ("Desired plan: Pro · 25 clients"). The super-admin card does show `499 EGP`.
  Repro: trial coach → `/coach/plan` → Request upgrade → Pro · 25 → Send.
  Evidence: `e2e-out/a-15/shots/12-plan-requests-spec-ts/a2-coach-Requested-Plan-card-shows-the-snapshot-price-499-EG/requested-card.png`, plus the a-15 report.
  Suspect: `src/pages/coach/CoachPlan.tsx:115` renders no `r.planSnapshot.priceMonthly` / `currency`.
- **E-A-2 (P3)** — Saving a banner with a `javascript:` CTA is correctly refused server-side (nothing stored). The admin, however, gets an alert whose body is the raw zod issue array (`[{"code":"custom","message":"Link must start with http:// or https://","path":["ctaHref"]}]`). The client does not pre-validate either: `type="url"` accepts `javascript:`.
  Repro: `/admin/banners` → New banner → Button link `javascript:alert(1)` → Save.
  Evidence: `e2e-out/a-15/shots/13-admin-spec-ts/banners-create-https-CTA-shows-for-a-coach-delete-javascript/javascript-cta-refused.png`.
  Suspect: `src/pages/admin/AdminBanners.tsx:52` (`onErr` shows `e.message` verbatim) and `api/_trpc/routers/banners.ts:24` (zod error with no tRPC `errorFormatter` flattening).
- **E-A-3 (P3)** — After a super confirms a request, an open coach My Plan tab does **not** update on focus/visibility. It waits for the 60 s `refetchInterval`, so the coach saw the update 49–56 s later. The 70 s budget is met, but the "refetch on focus" promise does not hold here because the request data is still fresh (default staleTime 60 s).
  Evidence: `coach-ui-update-latency.txt` in `e2e-out/a-15/results.json` and in a-5.
  Suspect: `src/pages/coach/CoachPlan.tsx:35` (no `staleTime: 0` / `refetchOnWindowFocus: 'always'` on the request query).
- **E-A-4 (P3)** — Every new banner first calls `banners.update`, gets a 404, then falls back to `create`. This is console/network error noise on a normal create.
  Evidence: `console-network.json` of the banners test (a-9, a-15).
  Suspect: `src/services/platform/bannersApi.ts:59-68`.
- **E-A-5 (P2, intermittent, unconfirmed root cause)** — In run `e2e-out/a-12/`, **every** `coachPlanRequests.*` call (`get`, `listPending`, `submit`) returned HTTP 500 for the whole run, across all users. That broke all plan-request journeys and the admin subscription pages. The same specs on fresh servers (a-13, a-14×2, a-15, a-16) had zero 5xx. The machine was overloaded at the time (`net::ERR_INSUFFICIENT_RESOURCES` in the same run). Response bodies were not captured then; `noHmr()` now logs every 5xx body to `e2e-out/<run>/a-5xx-bodies.log`.
  Suspect: `api/coach-plans/_data.ts:132-135`. `coachPlanRequestsCol()` runs `createIndex` (unique partial index) on **every** call, so any failure or contention in that index build fails every request that touches the collection.
  Evidence: `e2e-out/a-12/results.json` (console-network attachments of 10-auth:10, 12-*, 13-admin:27).

### Harness / environment notes (not product defects; for the harness owner)
- **H-1** — `vite dev` watches the repo root. Playwright writes trace `*.html` under `e2e-out/` (for **all** concurrent runs, e.g. `e2e-out/d-4/...`, `e2e-out/b-3/...`). Vite then broadcasts "page reload", and every open app page in every run reloads mid-test (51 reloads in `e2e-out/a-7/server.log`). That caused splash-stuck and "page closed" failures in a-7/a-8. Workaround is `noHmr()` in `e2e3/specs/_a-helpers.ts`. The proper fix is `server.watch.ignored: ['**/e2e-out/**']` for the e2e Vite instance.
- **H-2** — The isolated frontend still picks up `VITE_GOOGLE_CLIENT_ID` (and analytics) from the real `.env`. Contexts load `accounts.google.com/gsi/button` with the production client id (403 "origin not allowed") and `va.vercel-scripts.com`, which are external calls from the "isolated" stack. `e2e3/env/server.mjs` only blanks the server-side `GOOGLE_CLIENT_ID`.
- **H-3** — In run a-8 the in-memory mongod died mid-run (`ECONNREFUSED`), so every later test failed at `as()`. This was likely external: another process or agent stopping `mongod`. It did not recur.
- **H-4** — Fixture `shot()` attachments are inline-only. Specs here use `snap()`, which also writes PNGs to `e2e-out/<run>/shots/…` so evidence can be cited by path.
