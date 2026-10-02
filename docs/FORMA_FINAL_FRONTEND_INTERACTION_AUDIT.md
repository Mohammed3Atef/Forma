# Forma — Final Frontend Interaction / Wiring Certification (Phase 2)

Date: 2026-09-25 · Scope: static + component-level audit of every interactive frontend surface. No browser E2E (Phase 3), no redesign, no new features, no production data touched.

**Source of truth for Phase 3.** This file is the index, the reconciliation, the fix log and the verdict. The full per-interaction certification tables (≈1,300 rows, one per control, with handler → service → tRPC → success / error / invalidation / navigation / mobile-equivalent / status / finding ID) are in the eight slice reports, which are part of this report:

| Slice | File | Controls / rows | Findings |
|---|---|---|---|
| Routes, navigation, shells, PWA, RTL nav | [audit-phase2/01-routes-navigation.md](audit-phase2/01-routes-navigation.md) | 66 routes, every `navigate`/`Link`/`href` | R-1…R-22 |
| Public, auth, plans & payments | [audit-phase2/02-public-auth-plans.md](audit-phase2/02-public-auth-plans.md) | 102 rows, 13 forms, 17 plan/account states | P-1…P-32 |
| Client app | [audit-phase2/03-client-ui.md](audit-phase2/03-client-ui.md) | 178 rows (~205 controls), 18 forms, 26 empty states | C-1…C-30 |
| Coach app | [audit-phase2/04-coach-ui.md](audit-phase2/04-coach-ui.md) | 214 rows, 27 forms, 32 mutations traced | K-1…K-31 |
| Messenger, media, notifications, toasts | [audit-phase2/05-messenger-media.md](audit-phase2/05-messenger-media.md) | 71 controls, 8 media call sites, 68 toasts | M-1…M-28 |
| Admin / super-admin | [audit-phase2/06-admin-ui.md](audit-phase2/06-admin-ui.md) | ~131 controls, 29 protected actions | A-1…A-32 |
| Services ↔ callers, query-key registry, storage | [audit-phase2/07-services-cache.md](audit-phase2/07-services-cache.md) | 173 procedures, full key registry | S-1…S-28 |
| Cross-cutting: security, i18n, a11y, RTL, empty/error states | [audit-phase2/08-crosscutting.md](audit-phase2/08-crosscutting.md) | 140 queries, 92 mutations, 80 empty states | X-1…X-27 |

The slice reports record findings as found. **Their status after this pass is in §5–§6 below** — a slice row marked BROKEN whose finding ID is listed in §5 is now fixed.

## 0. Verification (after every change in this pass)

| Command | Result |
|---|---|
| `npx tsc -b --noEmit` | clean |
| `npm run build` | OK (154 precache entries) |
| `npm run test -- --run` (both vitest projects) | **26 files · 253 tests · 253 passed**, run twice, deterministic |
| Built-bundle secret scan (`dist/`) | `VITE_BUNNY` 0 · `BUNNY_API` 0 · `AccessKey` 0 · `MONGODB_URI` 0 · `JWT_ACCESS` 0 · `RESEND_API` 0 · `CRON_SECRET` 0 · `mongodb+srv` 0; only `VITE_ANALYTICS_SRC` appears (public by design) |

There was no component-test setup before this phase. `vitest.config.ts` now has two projects: `api` (node + mongodb-memory-server, as before) and `ui` (jsdom + Testing Library, `src/**/*.test.tsx`, setup `src/test/setup.ts`). `npm run test` runs both; there is no separate frontend test command.

## 1. Route inventory (summary — full table in slice 01)

| App | Routes | Shell | Notes |
|---|---|---|---|
| Anonymous | 6 (`/`, `/experience`, `/login`, `/invite/:code`, `/reset/:token`, `*`→Login) | none | installed PWA skips marketing |
| Client | 24 + `*` | `AppShell` (+ `SubscriptionGate`, assessment gate) | mobile-only by design |
| Coach | 29 + `*` (9 nested workspace tabs) | `ResponsiveShell` + `CoachPlanBanner`; editors behind `CoachPlanGate` | `/coach` now redirects to a real tab |
| Admin / super admin | 16 + `*` | `ResponsiveShell`, **role-specific nav** (this pass) | 4 super-only pages redirect a plain admin |
| All signed-in apps | +2 each: `/invite/:code`, `/reset/:token` | `SignedInInterstitial` (this pass) | were silently redirected home |

Unreachable components: `RolePlaceholder` (dead), `CoachClientActivity` (legacy deep-link only), `ClientSettings` (`/settings/app` redirect stub), `Experience` (URL-only). All other pages are routed or composed by a routed page. **Broken navigation targets: 0** (every `navigate`/`Link`/`href` resolves to a defined route; `Experience.tsx` has 9 placeholder `href="#"` links — S-25, P2 open).

## 2. Reconciliation (§40)

**tRPC callers vs backend.** Authoritative dump of `appRouter._def.procedures`: **173** = Phase 1's 171 + `media.status` + `media.listImages` (added in the blocker pass).

| Class | Count | Explanation |
|---|---|---|
| Typed frontend callers (`trpc.<r>.<p>.query/mutate`) | **152** | Phase 1's 150 + the 2 media procedures |
| Reached by raw `fetch` | 1 | `auth.refresh` (`platformApi.ts` — deliberate, avoids the 401→refresh recursion; Phase 1 had filed it as test-only) |
| Test-only | 5 | `coachAssets.exercises.update`, `coachAssets.billingPlans.get`, `coachNotes.update/delete`, `measurements.delete` |
| No caller | 15 | identical to Phase 1's list (factory CRUD completeness, `health.ping`, orphans after the summary consolidation) |
| Frontend references to a procedure that doesn't exist | **0** | |

152 + 1 + 5 + 15 = 173. No unexplained difference.

**Service exports vs callers.** Every Phase-1 dead wrapper resolved (slice 07 §b has all 83 unused exports):

| Wrapper | Verdict |
|---|---|
| `accountsApi.setPermissions` | missing product interaction (no per-account permission editor; backend + `users.manageRoles` exist) — A-8, P2 open |
| `coachApi.setCoachTargets` | missing product interaction (clients consume targets; no coach editor) — S-17, P2 open |
| `coachAssetsApi.save/deleteNutritionTemplate` | missing product interaction (no nutrition templates tab) — S-17, P2 open |
| `coachApi.saveClientProfile`, `coachPlanApi.createTrialPlan` | dead code (signup creates the trial server-side) |
| `inviteApi.claimInvite` / `unclaimInvite`, `coachClientsApi.archiveAndClearCoachData` | intentional stubs (superseded by server-side flows) |
| `notificationsApi.notify` | intentional no-op; the trial-reminder chain that calls it is a double no-op (T-4, still documented; no UI copy promises reminders) |

**Persistent-state actions vs backend mutations.** Every control whose behaviour type is BACKEND_MUTATION in slices 02–06 maps to one of the 96 mutations (or to local IndexedDB + `sync.push` for client-owned data). Two controls mapped to the *wrong* mutation and one control to *no effective* mutation — all fixed (K-1, A-3, M-4/C-4 below). Feature-flag toggles write `flags.save` but nothing reads `flags` for gating (A-7) — documented as inert, P2.

## 3. Query-key registry (§6)

Full registry and mutation→query matrix: slice 07 §d–§e. Resolution of every Phase-1 inconsistency:

| Keys | Verdict |
|---|---|
| `['coachPlans', coachId]` shared by `listCoachPlans(id)` and `listCoachPlans(id, true)` | **Real collision — FIXED**: management page now `['coachPlans', coachId, 'withArchived']`; prefix invalidation refreshes both |
| `['coachPlan', id]` vs `['coachPlanAdmin', id]` | different apps (coach vs super-admin), never co-mounted; admin mutations invalidate the admin key — harmless |
| `['user', id]` / `['coachUser', id]` / `['myCoach', id]` | same procedure, different screens/apps; status changes now invalidate `user` + `coachUser` prefixes — harmless |
| `['myClients', id]` vs `['adminCoachClients', id]` | coach vs admin app; admin assignments now invalidate `adminCoachClients` — harmless |
| `['assessment', uid]` vs `['clientAssessment', id]` | client's own read vs coach read, different sessions — harmless |
| `['coachPlanTiers']` vs `['coachPlanTiers', 'all']` | covered by prefix invalidation — harmless |

Also fixed: **the React Query cache is now cleared on sign-out and on session loss** (S-1 — the shared client outlived the session, so the next account on a device saw the previous account's cached lists and plan request). Defaults: `staleTime 60 s`, `refetchOnWindowFocus`, `retry 1`; focus refetch masks but does not replace a missing invalidation, so the gaps below were fixed rather than accepted.

## 4. Area certification summary

| § | Area | Result |
|---|---|---|
| 4 | Dead buttons / no-ops | Real dead controls found: client Sign out, avatar Remove, in-session video, iOS message actions, coach account Freeze/Trash, incoming-transfer Approve, Add-Existing transfer panel, Pro renewal — **all fixed**. Remaining: 9 `href="#"` on `/experience` (P2), metric tiles without onClick (P3) |
| 5 | Button → backend | every persistent action traced; wrong-procedure cases fixed (K-1, A-3); no fire-and-forget core mutation remains in the fixed paths; 10 mutations without `onError` (X-26) — 3 fixed (assessment), rest P2 open |
| 7 | Forms EDIT→SAVE→REFETCH | fixed the three non-round-tripping forms: admin/banner dates (A-9), measurement clearing (C-11), client name → account (C-6); avatar removal (M-4) |
| 8 | Drafts/autosave | editor drafts could silently override a newer server plan — **fixed** (K-16, `lib/draft.ts`); drafts not keyed per coach (S-23, P3) |
| 9 | Destructive actions | confirmations added for payment Reject; remaining unconfirmed (A-5 preview Suspend, K-24 supplement delete, C-25) P2/P3 |
| 12 | Role/permission UI | plain admin no longer offered super-only destinations (nav, sidebar, ⌘K, member links, assignments capacity query); coach no longer shown account-status controls it can't use; coach Add-Existing no longer relies on a FORBIDDEN read |
| 13 | Plan/account state | never shows Paid active before confirmation (verified, slice 02 §c); Pro renewal now possible (`type:'renewal'`); coach plan refreshes as soon as the request flips to `confirmed`; trial vs request deadlines never conflated. Open: P-5 (renew/extend label ≠ behaviour), P-28 (Reactivate on a trial-expired coach ping-pongs with the cron), P-9 (pending-account copy) — P2 |
| 14 | Pricing → signup | live `coachPlanTiers.public`; `?plan=` fully dead and clean (no producer, not read); internal "no payment gateway" admin note removed from the public card; stale multi-plan i18n keys P3 |
| 19 | Messenger | fixed: voice Cancel produced a draft (M-1), Load-older pages wiped by polling (M-2), no action menu on iOS (M-3, touch long-press). Open P2: broadcast partial failure (M-5), badge staleness (M-7), double `markRead` (M-8), unread-backlog toast on load (M-9), no thread error/retry (M-10) |
| 21 | Media after migration | 8 call sites traced; no `VITE_BUNNY`/`bunnyUploadApi` reference; no raw storage path anywhere; 413/415/503 → `upload.*` keys exist in all locales; chunk progress monotonic (tested). Open: exercise video upload lacks progress/abort (M-12, P2), deleted photos stay on CDN (M-11, needs a `media.delete`), status flash (M-15, P3) |
| 22 | Search/filter/sort | admin Assignments client search now server-side (was a client-side filter over a 200-row slice — A-4); coach filters not URL-synced (P3) |
| 23–24 | Empty / loading / error | 131 of 140 queries never render `isError`; fixed on the plain-admin tab that spun forever; the rest (X-25) P2 open — they show empty-state copy on failure, not a permanent spinner, except `CoachRevenue` |
| 26 | Picker edge cases | `value = ''` reset everywhere; abort maps to `cancelled`; object-URL leaks in messenger drafts (M-13, P3) |
| 27 | Responsive parity | open P2: members/coaches row actions desktop-only (A-14), command palette has no mobile entry (R-15a), adherence rows not tappable on mobile (K-15) |
| 28 | RTL | charts forced LTR with explicit oldest→newest; chevron/ImageViewer mirroring gaps P3 |
| 29 | Accessibility | 94 inputs placeholder-labelled, clickable toast `div`, `<tr role=button>` — P2/P3 open (Phase 3 browser a11y pass) |
| 30 | Persisted state | tokens memory-only; storage holds UI flags; cross-account leak via query cache **fixed**; drafts/banner-dismissals/presence not user-scoped (P3) |
| 31 | Flags / banners | banner CTA links now http(s)-only (server + render); feature flags inert (A-7, P2) |
| 32 | PWA | update/deferred-reload flow verified unchanged; added `navigateFallbackDenylist: [/^\/api\//]` |
| 33 | Security | no bare `import.meta.env`, no user-controlled HTML sinks, bundle clean; open: coach `videoUrl` scheme not validated (X-2, P2); no CSP (documented) |
| 34 | i18n | 0 missing keys in en/ar/ar-eg, 0 placeholder mismatches (fixed the `{{unit}}` literal); new keys added in all three; ~10 sites render `LocalizedText.en` regardless of locale (X-8, P2) |

## 5. ISSUES FIXED IN THIS PASS

| ID(s) | Sev | Defect | Fix | Test |
|---|---|---|---|---|
| S-1 | **P1** (cross-account) | Query cache survived sign-out → next account saw previous account's cached data | `queryClient.clear()` in `signOut` and session-loss branch of `refreshAccount` | `sessionStore.test.tsx` |
| R-1 / P-1 / A-1 | P1 | Plain admin had a bottom-nav tab + sidebar item whose procedures are super-only → permanent skeleton | role-specific `ADMIN_NAV`/`SUPER_ADMIN_NAV` + sidebars; page redirects non-super, queries `enabled: isSuper`, error state | `config/nav.test.tsx` |
| R-2 / A-15 / A-17 | P2 | Plain admin routed to super-only pages (⌘K, members), silent FORBIDDEN capacity query | commands/entities gated, member coach rows → accounts search, `enabled: isSuper` | nav test |
| K-1 / S-28 | P1 | Incoming-transfer Approve succeeded, then a follow-up `releaseClient` always threw CONFLICT → every approval looked failed | removed the redundant call (resolve already moves the client) | `phase2.test.ts` |
| A-3 | P1 | Admin "Review" on a takeover request moved the client via `coachClients.transfer`, leaving the request pending forever | wizard resolves via `transfers.resolve('accept')` with admin overrides (mode / subscription), prefilled from the request; backend accepts overrides (fresh-start still `clients.writeAll`) | `phase2.test.ts` |
| A-4 | P1 | Assignments client search filtered a 200-row slice; requests for client #201+ had Review disabled | server-side debounced search (`adminUsers.list` search); missing request clients fetched by id | — (wiring; covered by existing adminUsers.list tests) |
| A-2 | P1 | Coach bulk Suspend changed only the account → plan/list/detail disagreed | bulk uses `setCoachSuspended` per coach (plan + account), allSettled report | — |
| K-2 | P1 | Add-Existing treated FORBIDDEN relationship reads as "unassigned" → "Assign to me" on other coaches' clients, transfer panel unreachable | ownership from `assignedCoachId` on the search row; only own relationship read | — |
| K-3 | P1 | Coach Freeze/Trash account buttons always FORBIDDEN | section only rendered with `users.manageStatus` | — |
| K-4 | P1 | Invite panel auto-revoked uncopied invites — including ones already emailed | invites created with an email are kept | — |
| P-30 | P1 | Paid coach could not renew (current tier excluded; `renewal` type unreachable) | current tier offered; server records `renewal`; server refuses Trial/archived/inactive tiers (P-8) | `phase2.test.ts` |
| M-4 / C-4 | P1 | Avatar Remove sent `undefined` (dropped by JSON) → photo never cleared | `photoUrl: null` → `$unset`; picker awaits the save and shows failure | `phase2.test.ts`, `AvatarPicker.test.tsx` |
| C-3 / S-27 | P1 | Client "Sign out" called a deprecated no-op | real `useSession.signOut()` behind a confirm | — |
| C-1 | P1 | Nutrition page hooks after early returns → crash when plan arrives while mounted | hooks hoisted above the returns | — (tsc can't see it; no hooks lint in repo — recommended) |
| C-2 | P1 | Failed subscription read (offline/5xx) showed the "subscription pending" wall to a paying client | gate only acts on a successful read | `SubscriptionGate.test.tsx` |
| C-5 | P1 | In-workout video button ignored coach `videoUrl` | coach URL first, same as ExerciseDetail | — |
| M-1 | P1 | Voice "Cancel" produced a draft | explicit discard flag | `useVoiceRecorder.test.tsx` |
| M-2 | P1 | Loaded-older messages wiped ≤5 s later by the poll | older pages kept in their own state, merged ahead of the live window; edits/reactions patch all copies | — |
| M-3 | P1 | No way to open message actions on iOS | pointer long-press (touch), movement-cancelled | — |
| K-16 | P1 (data loss) | Stale local editor drafts silently overrode a newer server plan | `pickFreshDraft` in all four editors | `lib/draft.test.ts` |
| A-9 | P2→form | Admin plan end date / banner dates re-rendered a day early east of UTC | local y-m-d on read (symmetric with local-midnight save) | verified in Cairo TZ |
| C-11 | P2→form | Emptied measurement values could never be saved | explicit `clear` list, client store + `measurements.save` | `phase2.test.ts` |
| C-6 | P2→form | Client's name edit never reached their account | debounced commit also updates `displayName` | — |
| R-3 | P2 | Invite/reset links unusable while signed in | `SignedInInterstitial` (sign out keeps the URL) in every role app; en/ar/ar-eg | — |
| R-4 / C-17 | P2 | Check-in back/close did nothing on deep links | `useBack('/check-ins')` | — |
| R-20 | P2 | `useBack` left the site after a `replace` navigation | history-index check (`history.state.idx`) | `useBack.test.tsx` |
| R-21 / K-10 (part) | P2 | Unsaved-changes guard bypassed by sidebar, menu sheet, top-bar avatar | all three routed through the guard | — |
| R-5 | P2 | Mobile `/coach` rendered inline with no active tab | always redirects to a real tab | — |
| S-2 | P2 | `coachPlans` key collision | distinct key | — |
| S-3/K-8, S-4/K-7, S-5/K-5, S-6/K-6, S-7, S-8, S-9, S-10, S-14 (part) | P2 | Missing invalidations after assign-template, subscription ops, check-in request/review, assessment review/reset/notes, exercise→template sync, save-as-template, member status, admin assignments | added the reader keys | — |
| P-6 | P2 | Coach saw Trial for minutes after payment confirmation | invalidate plan when request becomes `confirmed` | — |
| P-3 | P2 | Payment Reject unconfirmed | confirm dialog (new key, 3 locales) | — |
| P-7 | P2 | Core features with blank Arabic → raw zod error | Arabic falls back to English | — |
| P-2 | P2 | Public pricing card showed internal "no payment gateway" note | removed | — |
| X-1 / A-28 / X-3 (banner) | P2 | Banner CTA accepted `javascript:` | http(s)-only on save and render, `noopener` | `phase2.test.ts` |
| X-7 | P2 | Literal `{{unit}}` in profile header | placeholder removed in all locales | — |
| K-9 (part) | P2 | Assessment mutations silent on failure | `onError` dialogs | — |
| R-12 | P3 | Governance eyebrow said "Super admin" to admins | role-based | — |
| R-22 | P3 | SW served the SPA shell for top-level `/api/*` navigations | `navigateFallbackDenylist` | — |

## 6. ISSUES NOT FIXED (open, with reason)

No P0 and no P1 remain open. Open items are P2/P3 — each has a concrete fix in its slice report.

| ID | Sev | Item | Reason not fixed now |
|---|---|---|---|
| X-25, K-21, C-15, A-10 | P2 | 131/140 queries don't render `isError` (errors look like empty states; `CoachRevenue` spins) | cross-cutting pattern change across ~40 screens — best done once with a shared `QueryBoundary`; not a dead action |
| X-26, K-9 (rest), C-9, C-10 | P2 | remaining mutations without `onError` (release, notes, restore version, pricing plans, quick-create exercise, nutrition toggles) | same — consistent error-surface pass |
| M-5, M-6 | P2 | broadcast: all-or-nothing report, retry duplicates, "All" = filtered list | needs per-recipient idempotency keys (design change) |
| M-7, M-8, M-9, M-10, M-22 | P2 | unread badge staleness, double `markRead`, backlog toast on load, no thread error/retry, no focus refresh | polling-architecture polish; no data impact |
| M-11 | P2 | deleted progress photos stay on the CDN | needs a new owner-only `media.delete` procedure (backend feature) |
| M-12 | P2 | exercise video upload: no progress/abort, Save enabled mid-upload | UI work on one picker |
| P-4, P-5, A-12, A-13 | P2 | admin tier chips unconfirmed / "Renew"/"Extend" re-send the tier (endsAt = now + term) | changes admin plan semantics — needs a product decision on extend-vs-reset |
| P-28 | P2 | "Reactivate" on a trial-expired coach is re-pended by the next cron | should route to payment confirmation — product decision |
| P-9, P-10, P-11 | P2 | pending-account copy; changePassword kills the current session ≤15 min later; coach status labels | copy/UX; P-10 needs session re-issue design |
| A-5, A-6, A-14, A-16, A-18 | P2 | unconfirmed preview Suspend; super admin's own row actionable; desktop-only row actions; `setCoachSuspended` two calls; profile blur-saves silent | UI polish; A-16 needs one atomic server procedure |
| A-7, A-8, S-17 | P2 | feature flags inert; no permission editor; no coach-targets / nutrition-template UI | missing product features — out of scope ("no new features") |
| K-11, K-12, K-13, K-14, K-15, K-17 | P2 | library refresh vs unsaved editor; CoachPlanGate gaps on library/templates/notes; subscription sheets keep stale values; freeze-accept non-atomic; mobile adherence rows; three different client counts | editor/gate refinements; no data loss after K-16 |
| C-7, C-8, C-12, C-13, C-14 | P2 | notifications error state; food-search stale response; HEIC photo accepted locally; empty cardio entry; "start workout" opens another day's session | client polish |
| X-2 | P2 | coach `videoUrl` rendered without scheme check | should share the http(s) guard used for banners |
| X-6, X-8, X-12, X-13, X-22 | P2 | hardcoded aria-labels; `LocalizedText.en` rendered regardless of locale; mouse-only toast; 94 placeholder-only inputs; exercise-library empty state lacks CTA | i18n/a11y sweep (Phase 3 browser a11y pass) |
| R-15a, S-25 | P2 | no mobile command-palette entry; 9 `href="#"` on `/experience` | UI additions / public page cleanup |
| all P3 | P3 | dead code (83 unused exports), stale multi-plan i18n, RTL chevrons, raw audit action keys, user-unscoped drafts / dismissals / presence keys, etc. | cleanup |
| (tooling) | — | no `eslint-plugin-react-hooks` — C-1 was a hooks-order crash `tsc` can't catch | recommend adding the rule |

Food licensing/attribution for the external food database remains a tracked production/legal item (unchanged).

## 7. TESTS ADDED

| File | Project | Covers |
|---|---|---|
| `api/_trpc/routers/phase2.test.ts` (8) | api | avatar removal (`null` → unset); renewal / trial / archived request rules; admin transfer review closes the request with overrides; plain admin can't override into fresh-start; coach approve = exactly one move; measurement `clear`; banner http(s) links |
| `src/services/platform/mediaApi.test.tsx` (9) | ui | single vs chunked uploads, category-not-path, progress aggregation, error → i18n code mapping, 401 refresh-once, abort, `useUploadConfigured` |
| `src/config/nav.test.tsx` (3) | ui | plain admin never offered super-only destinations; super admin gets all; coach tabs ⊂ sidebar |
| `src/services/auth/sessionStore.test.tsx` (2) | ui | cache cleared on sign-out and session loss |
| `src/components/SubscriptionGate.test.tsx` (3) | ui | failed read keeps access; real "no subscription" still gates |
| `src/components/AvatarPicker.test.tsx` (2) | ui | Remove sends `null`, awaits, surfaces failure |
| `src/hooks/useVoiceRecorder.test.tsx` (3) | ui | cancel discards; stop returns file; cancel doesn't poison next recording |
| `src/hooks/useBack.test.tsx` (2) | ui | history-index rule; deep link + replace → fallback |
| `src/lib/draft.test.ts` (3) | api | stale-draft rule |
| `src/test/harness.test.tsx` (1) | ui | jsdom harness boots with i18n |

## FINAL TEST COUNT

**26 files · 253 tests · 253 passed** (`npm run test -- --run`, run twice; was 16 / 217 before this phase).

## 8. Phase 3 hand-off (must be verified in a real browser)

Items marked BLOCKED FROM STATIC/COMPONENT VERIFICATION in the slices, plus everything this pass changed on touch/scroll/timing paths: iOS long-press opening message actions (M-3), load-older scroll anchoring with the new merge (M-2), voice record/cancel on real devices (M-1), chunked 50 MB video upload end-to-end against the real `/api/media` function and Bunny, the signed-in invite/reset interstitial, the admin transfer review closing the request, sidebar/menu unsaved-changes prompts, RTL layout of every chevron/menu, and full keyboard/screen-reader passes (§29). The production steps from the blocker pass (rotate the Bunny password, swap Vercel env vars, run the index / report / reconcile scripts) still apply.

## VERDICT

**FRONTEND INTERACTIONS CERTIFIED WITH NON-BLOCKING LIMITATIONS**

Every P0/P1 found across the eight slices is fixed and the gate is green. No dead core button, no non-persisting form, no wrong-role destructive action, no wrong paid/trial state, and no critical media failure remains open, and no persistent-state interaction is unexplained. The open items in §6 are P2/P3, and each has a documented fix.

STOP — Phase 3 (browser E2E) not started.
