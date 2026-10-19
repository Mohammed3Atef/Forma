# B3 — Implementation log

> One section per B3 milestone. Each records what changed, the API contract before and after, consumers, compatibility / migration notes, the tests that prove it, and what is still open.
> Plan and decisions: `B3_COACH_BLUEPRINT.md`, `B3.0.1_SECURITY_OWNERSHIP_PLAN.md`, `B3_SUBSCRIPTION_EXTEND_FREEZE_DECISION.md`. Backlog: `FORMA_MASTER_REMAINING_BACKLOG.md`.

---

## B3.0.1 — Security & ownership hardening (2026-10-16)

**Scope (owner, 2026-10-16):** B3-S01 (+ S01b), S02 (+ the assessment private note), S03, S04, S05, S06 (date-based read-only, R-6), S07 (Extend E2 + Freeze F-C) and S14 (per-coach conversations, R-4 = Option C), with the defaults R-1 (admin private-note reads audited), R-2 (admin corrections audited), R-3, R-5, R-7.
**Not changed:** the coach UI (B3.1+), the B2 client experience (only the functional changes below), the marketing site, public auth visuals, legal pages, the Admin shell. No deploy, push, commit or production data change.

### 1. Changed API contracts

Every refusal is a fixed reason code (`error.data.reason`, via `CommercialReason`), never private data. New codes: `ACCOUNT_NOT_ACTIVE`, `CONVERSATION_CLOSED`, `NO_ACTIVE_COACH`, `RELATIONSHIP_ENDED`, `SUBSCRIPTION_CHANGED`, `RENEWAL_REQUIRED`, `FREEZE_NOT_ALLOWED`, `FREEZE_INVALID_WINDOW`, `FREEZE_OUT_OF_TERM`, `NOT_FROZEN`; sync adds `SUBSCRIPTION_READ_ONLY`.

| # | Procedure | Before | After | Consumers / compatibility |
|---|---|---|---|---|
| S01 | `coachClients.list({ clientId })` | Every relationship doc, full, to any coach with ANY relationship (incl. ended) | Client self and `users.read`: unchanged. Active coach: own docs full, others reduced to `_id, coachId, clientId, status, createdAt, updatedAt, endedAt, endReason, mode`. Former coach: own docs only. Others: `FORBIDDEN` | `CoachTimeline` (names + dates only — unaffected), `getClientAssignment` (own active doc — unaffected). Same document shape, fields omitted |
| S01b | `adminUsers.get` | Full contact profile to anyone with a relationship doc in either direction, any status | Full only for self, `users.read`, or an **active** relationship (either direction); everyone else the existing name card | Workspace header / `fetchMyCoach` (active — unchanged), timeline / transfer names (name card has name + photo) |
| S02 | `coachNotes.list` | All notes to the active coach | Active coach: shared notes + **own** private notes (+ legacy notes written since their current relationship began). Admin `clients.readAll`: all, with an `adminAuditLogs` row `coachNotes.readPrivate` (ids + count, never text) when another author's private note is returned. Client: unchanged | Workspace Notes / Overview / anchored notes — a new coach no longer sees the previous coach's private notes (intended) |
| S02 | `coachNotes.update` / `delete` | No author check | Author only (or `clients.writeAll`). Another author's private note → `NOT_FOUND`; another author's shared note → `FORBIDDEN`; missing → `NOT_FOUND` (delete used to succeed silently) | No UI caller today |
| S02 | `assessment.*` (`coachNotes` field) + `setCoachNotes` | One shared `privateNotes.assessment`; any coach reads it; a new coach's first write overwrote it | Per-author storage `privateNotes.assessmentByAuthor.<authorId> = { text, updatedAt }`. A coach reads only their own (legacy single note: its `updatedBy` author only; with no author: only if the client never had another coach). Admin: current coach's note (else legacy), audited `assessment.readPrivateNote`. Writes touch only the caller's entry; the caller's own legacy note is superseded; a pre-B0 inline note is moved (never deleted) out of the client-written object | `CoachClientAssessment` — same response shape (`coachNotes` string) |
| S03 | `invites.getByCode` (public) | The whole invite (email, phone, name, coach id, price / subscription template, creator, claim fields) | `{ _id, status, claimable, expiresAt, coachName?, displayName?, hasEmail, emailHint? }` (`m•••@gmail.com`). Per-IP limit 30 / 10 min → `TOO_MANY_REQUESTS` | `AcceptInvite` (updated). RC2 clients simply don't pre-fill |
| S03 | `invites.claim` (public) | No rate limit | Per-IP limit 10 / 10 min. Unchanged otherwise (an emailed invite is claimed with its own email) | — |
| S04 | `messages.send / edit / delete / react` | Any account status | `accountStatus === 'active'` required → `FORBIDDEN` `ACCOUNT_NOT_ACTIVE`. `list`, `markRead`, `coachThreadsSummary` stay readable | Suspended users see the suspended screen; a queued send fails permanently with a readable reason |
| S05 | `coachClients.updateSubscription` | Owning coach could change an ENDED relationship | Owning coach only while active → `CONFLICT` `RELATIONSHIP_ENDED`. `clients.writeAll` may correct any relationship; every admin change writes an `adminAuditLogs` row `subscription.<op>` (relationship id + status, before / after dates) | Subscription panel (active clients only) |
| S07 | `updateSubscription` `extend` | `endAt + days`, any status | `max(now, endAt) + days`; stored expired / ended / cancelled / pending → `RENEWAL_REQUIRED`; frozen allowed, window untouched | Panel preview already used `max(now, end)` |
| S07 | `updateSubscription` `freeze` | Immediate, `endAt` unchanged, any dates | Scheduled (F-C): validity F1–F5 (`FREEZE_NOT_ALLOWED` / `FREEZE_INVALID_WINDOW` / `FREEZE_OUT_OF_TERM`); stores `freezeCredit = until − max(from, startAt)`; `endAt += freezeCredit` | Panel freeze sheet + freeze-request accept |
| S07 | `updateSubscription` `unfreeze` | Any status → active; `endAt` unchanged | Only a stored `frozen` term (`NOT_FROZEN` otherwise); gives back unused whole days (decision doc §0.5); legacy freezes cleared without moving `endAt` | Panel |
| S07 | every `updateSubscription` | Unconditional write | Compare-and-set on `subscription.updatedAt` (`SUBSCRIPTION_CHANGED` on a lost race); appends a `subscriptionEvents` entry (`{ at, op, actorRole, before, after }`, capped 200) in the same write | Additive field; the client's own relationship read shows it (dates and statuses only, no actor id) |
| S07 | `effectiveSubscriptionStatus` (client + server copies) | Frozen while `now < frozenUntil` (ignoring `frozenFrom`) | A freeze with `freezeCredit` is frozen only inside `[frozenFrom, frozenUntil)`; a freeze stored before B3.0.1 keeps the old meaning (no silent migration). Parity proven by a shared vector | `useSubscription`, panel, client list, dashboards |
| S06 | `sync.push` (`workoutLogs`, `nutritionLogs`, `cardioLogs` only) | Accepted any valid record | Refuses a record (`rejected: [{ id, reason: 'SUBSCRIPTION_READ_ONLY' }]`) only when its **activity day** lies wholly (every time zone) inside a window the stored data proves read-only (U1–U5, plan §6.2). The rest of the batch applies; other collections, deletions, pulls and coach writes unchanged | B1+ clients keep the record dirty, retry every pass, show "Sync failed" plus a specific explanation; RC2 shows a generic failure |
| S14 | `messages.list` (incl. `since`, `before`) | Whole thread to the active coach | A coach sees only `coachId == me` plus legacy messages they wrote; client and `clients.writeAll` see everything | Coach thread / inbox — previous coach's messages disappear for the new coach (intended) |
| S14 | `messages.send` | `coachId` = sender coach / current coach | New optional input `coachId` (the conversation it was composed in): mismatch → `CONFLICT` `CONVERSATION_CLOSED`; client without a coach → `NO_ACTIVE_COACH`. An already-delivered retry (same `clientMsgId`) still returns the original. Coach-bound notification carries `coachId` | Outbox handler sends the bound `coachId`; RC2 omits it (server uses the current coach, as before) |
| S14 | `messages.edit / delete / react` | Thread access + sender / window | Plus: outside a coach's own conversation → `NOT_FOUND`; a client acting on an earlier conversation → `FORBIDDEN` `CONVERSATION_CLOSED` | Client history rows offer no reactions / edit / delete |
| S14 | `messages.markRead` | Marked every incoming message; cleared every coach message notification for the client | Coach: only their own conversation; notification cleanup limited to the caller's own feed | — |
| S14 | `messages.coachThreadsSummary` | Last message + unread over the whole thread | Only the coach's own conversation | Inbox previews and unread badge |
| S14 | Notifications (`notify`, `createNotification`, `notifications.list / markRead`) | Coach feed = every coach-bound row for active clients | Coach-bound rows store the recipient `coachId`; a coach sees their own, plus legacy rows created since their current relationship began; self-addressed rows unchanged | Bell / feed; no preview of an earlier coach's messages |
| S14 | `/api/media` (`message`) | Thread access + active account | Plus, for a client: an active coach is required and an optional `coachId` (conversation) must match → 403 `forbidden` | Client `uploadFile` maps 403 to the permanent `UploadError('forbidden')` (it was retried as `failed`) |

**Data model (all additive, no migration, no rewrite of existing documents):** `subscription.freezeCredit`; `coachClients.subscriptionEvents`; `clientProfiles.privateNotes.assessmentByAuthor`; `notifications.coachId`; `messages.send` input `coachId`; outbox `message.send` payload `coachId`; `/api/media` meta `coachId`.

### 2. UI changes (functional only — no redesign)

- **Client chat (`Messages`, `MessageThread`):** messages outside the current coach's conversation are grouped above it under "Earlier conversations · read-only · N" (collapsed, 44 px toggle with `aria-expanded`), shown with a neutral avatar, with no reactions / edit / delete. A client with no coach sees that history read-only under the existing "no coach" state, with no composer; nothing renders when there is none. Every queued message carries its conversation. Refused sends say why (`messages.conversationClosed / noActiveCoach / accountNotActive`, `upload.forbidden`).
- **Invite claim (`AcceptInvite`):** an emailed invite shows the masked address read-only; the phone field starts empty. Visuals unchanged.
- **Coach subscription panel:** Extend shown for stored active / trial / frozen terms (not cancelled / expired — Renew); Freeze for a running active term; Unfreeze while a freeze is scheduled or running; "Freeze scheduled: from → until" line; the freeze sheet shows the server's reason and bounds the dates (today … term end); accepting a client freeze request now applies the freeze **before** marking the request accepted.
- **Settings › Sync detail:** logs refused as `SUBSCRIPTION_READ_ONLY` are explained ("dated outside your coaching subscription … stay on this device and sync once your coach extends or renews").
- **Strings:** 18 new keys in EN; 22 in AR and AR-EG (with the Arabic plural forms).

### 3. Implementation notes and refinements made while coding (documented in the decision docs)

- **F5 first-day freezes:** the date picker sends local midnight and a term usually starts later that day, so a freeze may begin on the term's first calendar day (`from ≥ startAt − 1 day`), while only frozen time inside the paid term is credited (`freezeCredit = until − max(from, startAt)`). No free time is created.
- **Early unfreeze:** the client keeps compensation for each frozen day actually used inside the paid term (`ceil` to whole days, never above the credit); unused days are removed. Worked example unchanged (end 3 Nov).
- **Renewal gaps (U4) and extension lapses (U5)** are narrowed by any later term's start, so a coach who back-dates a renewal over a gap makes the refused logs syncable on the next pass.
- **Media policy:** the new client conversation check runs after the type / size checks, so 413 / 415 answers are unchanged.
- **`getClientIp`** tolerates a request without headers (test contexts).

### 4. Tests

**New (all green):**

| File | Covers | Tests |
|---|---|---|
| `api/coach-clients/_subscriptionRules.test.ts` | E2 table, F1–F5, unfreeze branches incl. the worked example, scheduled vs legacy effective status, U1–U5, day bounds, lifetime clipping, keep-transfer, back-dated renewals, unprovable cases | 33 |
| `api/_trpc/routers/b301Messaging.test.ts` | S14 transfer A → B (messages, `since` / `before`, summary, notifications, A loses access), client keeps all tagged, outbox retry bound to A refused, delivered retry idempotent, earlier conversation read-only, coach `NOT_FOUND`, markRead scoping, admin fallback, no-coach client, notification scoping incl. legacy rows; S04 suspended coach / client / every non-active status; media binding | 12 |
| `api/_trpc/routers/b301Ownership.test.ts` | S01 matrix + reduced shape; S01b matrix both directions; S02 notes (transfer, NOT_FOUND / FORBIDDEN, author edits, former coach, client view, admin audit without text, legacy authorship); assessment per-author (transfer, legacy with / without author, migration, admin audit); S03 shape, mask, claim with / without email, rate limits; S05 + admin audit | 20 |
| `api/_trpc/routers/b301Subscription.test.ts` | S07 via the API (extend, lapsed extend, refusals, compare-and-set under 5 concurrent calls, scheduled freeze, refusals, cancel, legacy freeze, admin audit); S06 via `sync.push` (offline after expiry, in-term late, nutrition / cardio, other collections, pre-term / pre-relationship / pending / no coach, renewal gap + back-dated retry, lapsed extension, scheduled freeze + cancel, batch independence) | 16 |
| `src/lib/subscriptionParity.test.ts` | Client and server `effectiveSubscriptionStatus` agree (16-case vector × 61 days) + panel freeze helpers | 18 |
| `src/lib/errorKind.test.ts` | Server reason kept on permanent refusals; upload `forbidden` is permanent | 3 |
| `src/components/MessageThread.history.test.tsx` | History collapsed / expanded, sends bound to the current coach, no-coach history-only, nothing when empty | 4 |
| `src/data/sync/syncTruth.test.tsx` (+2), `src/data/sync/contract.test.tsx` (+1) | Read-only explanation shown / not shown; refused log kept, counted, retried, accepted when covered | 3 |
| `e2e3/specs/81-b301-security.spec.ts` | Browser: coach sees only own conversation; client history separated and read-only, new message bound to the current coach; scheduled freeze (status stays Active, end moves by the frozen days, cancel restores) | 3 |

**§T — existing tests changed (each reflects an approved rule change; no guarantee weakened):**

| Test | Change | Why |
|---|---|---|
| `certification.test.ts` › adminUsers.get | Asserted that an ENDED relationship keeps both sides' contact details visible. Now: active → full both ways; after ending → name card both ways | Owner O-16 / B3-S01b |
| `certification.test.ts` › empty message rejected | The attachment-only positive case now gives the client a coach | B3-S14: a client message needs a conversation (`NO_ACTIVE_COACH`) |
| `messages.test.ts` › suspended client | "can still send" → "can list / markRead, cannot send" | Owner O-17 / B3-S04 |
| `notePrivacy.test.ts` › storage | Reads the note from `privateNotes.assessmentByAuthor[coach]` (still outside the client-written object) | B3-S02 per-author storage |
| `mediaApi.test.tsx` (2 cases) | A 403 maps to `UploadError('forbidden')` instead of `failed` | A refusal must not be retried forever |
| `e2e3/specs/20-coach-core.spec.ts` › invite claim | Expects the masked email (read-only) and an empty phone instead of the full address | Owner R-5 / B3-S03 |
| `e2e3/specs/20-coach-core.spec.ts` › restore seed state | Also removes the plans, notes, check-ins, plan versions and notifications the file created for clientFree (asserts the workout plan is gone) | Test-isolation gap found by the B3.0.1 full run: spec 80 Journey A expects the seeded "no coach, no plan" client. Reproduced identically on the B2 commit `be3e357` (specs 20 → 80 in a clean worktree), so it is not caused by B3.0.1; spec 80 itself is unchanged |

### 5. Verification (final code, 2026-10-17)

| Gate | Result |
|---|---|
| Typecheck `tsc -b --noEmit` | **PASS** (exit 0) |
| Architecture boundaries `scripts/check-boundaries.mjs` | **PASS** |
| Unit + API `vitest run` (api + ui projects) | **PASS — 640 / 640 tests in 76 files** (B2 baseline 531 in 69; +109 new B3.0.1 tests, 0 removed) |
| Production build `npm run build` | **PASS** — entry `index` 460.10 kB / 149.20 kB gzip (B2: 458.51 / 148.65; +0.55 kB gzip = new strings + messaging rules), `CoachApp` 63.15 / 17.73 (unchanged), `ClientApp` 44.91 / 13.89, precache 172 entries (unchanged) |
| Browser — full e2e3 suite, all projects (chromium 1440 / 1280 / 1024, tablet 768, mobile 430 / 390, webkit-iphone) | **PASS — 231 passed + 1 skipped of 232** (the skip is the pre-existing Google sign-in case). First full run on this code: 230 passed + 1 skipped + 1 failed (spec 80 Journey A — the spec 20 isolation gap in §T, reproduced identically on `be3e357`); after the spec 20 restore fix: 20 → 80 → 81 = 25 / 25, then the final full run above |
| Browser — prod-build PWA `e2e3/pwa/pwa-check.mjs` | **PASS** on the outcomes (B0–B2 baseline): SW controls the page; offline reload renders from precache; offline banner shows and clears; update reload deferred while visible (0 navigations) and applied once hidden (build B served). The "new SW waiting" probe read `false` (the new worker did not linger in `waiting`); B3.0.1 changed no service-worker, manifest or update code. Known baseline page error "Unexpected token '<'" (analytics path answered with `index.html` by the local static server) |
| Browser — prod-build signed-in offline boot `e2e3/pwa/b1-client-offline-boot.mjs` | **PASS** — offline relaunch renders the signed-in client, no login screen, lazy runtime chunks served by the SW (none from the network), offline navigation to a lazy screen works |
| Physical devices | **Not run** (none available) — the R-01…R-26 checklist is unchanged and still open |

### 5.1 Contracts preserved (B0 / B1 / B2, blueprint §2 C1–C25)

All 25 contracts stay green through their named tests (full api / unit / e2e3 suites above). Two certified behaviours were deliberately changed by owner decision and their tests updated (§T): adminUsers.get no longer exposes contacts across an ENDED relationship (B0 CO-03 test → stricter), and a suspended client can no longer send messages (O-17). Every other change is additive or a stricter server rule with an unchanged response shape.

### 5.2 Owner review (2026-10-17) and the changes it required

Approved for a local checkpoint, with these decisions:
1. First-day freezes — approved (compensation only inside the term; already so).
2. Early unfreeze counts the unfreeze day — approved **with the resulting end date shown before confirmation** → the Unfreeze dialog now states the end date (`unfreezeEndAt` in `src/lib/subscription.ts`, parity-tested against the server's `applyUnfreeze` for every freeze case, every hour across a week).
3. Back-dated renewals — approved **if explicitly confirmed, audited and explained** → `isBackdatedRenewal` (server `_subscriptionRules.ts`, client mirror, parity-tested); the term sheet asks "Start in the past?" and explains that the client's blocked logs from that date will sync; the `setTerm` audit event carries `backdated: true`.
4. B301-R1 / R2 / R3 accepted as documented **MVP limitations**, not security guarantees; kept in the backlog.
5. No tagging / migration of legacy untagged messages. Any back-fill would first need a read-only inventory and ownership-confidence report and separate approval. Superseded in practice by the owner's clean-launch direction (all current data is disposable; production starts empty), so no inventory tooling is built now; the separate Clean Launch / Fresh Start Plan covers the reset.
6. MD-01 / 02 / 03 and physical-device testing stay release blockers.
7. Follow-up tracked (B301-R4): records refused as `SUBSCRIPTION_READ_ONLY` must stay durable without being pushed again on every sync pass.

Tests added for 2–3: `subscriptionParity.test.ts` (+2), `b301Subscription.test.ts` (+1), `e2e3/specs/81` (+1: back-dated renewal confirm + audit flag; the freeze case now also checks the end date in the Unfreeze dialog).

### 6. Remaining risks and owner items

1. **R-6 — what the stored history cannot prove is not enforced** (accepted, never guessed): terms overwritten before B0 (no renewal history before CO-15, which is not deployed); freezes stored before B3.0.1 (their real start is not recorded); cancellations kept only in the archive; stints lost to B3-S13 re-assignment upserts. Logs dated in those periods are accepted, as before.
2. **Client-generated dates:** the server refuses logs **dated** outside authorized time; it cannot prove when an activity happened. A modified client can back-date a log into a paid period. No anti-back-dating guarantee is claimed (it would need server-stamped evidence).
3. **Time-zone grace:** a day is refused only when it lies wholly inside a read-only window in every time zone, so up to about one day around each boundary is accepted.
4. **Legacy messages without `coachId`** are hidden from coaches (except their own lines). If production holds pre-Mongo messages, current coaches stop seeing those lines; the client and super-admins still see them. A `coachId` back-fill would be a separate, explicit owner action.
5. **Attachment URLs are still public and permanent (MD-02, deferred):** S14 hides an earlier conversation's attachments in the app, but a URL already known can still be fetched. MD-02 (private zone, signed URLs) is the real fix.
6. **Legacy freezes** keep the old behaviour (immediate, no compensation) until a coach unfreezes them; a one-off compensation would be an owner action.
7. **Per-IP invite limits** (30 lookups, 10 claims per 10 min) could affect many invitees behind one shared IP; adjustable constants.
8. **Admin read audits are best-effort** (`writeAudit` never blocks the read); the subscription audit trail is also written atomically on the relationship (`subscriptionEvents`).
9. **Production still runs RC2** (R-7): nothing here is deployed; installed RC2 clients will show generic messages for the new refusals after a deploy.
10. **Physical-device checks** (R-01…R-26) are unchanged and still open; nothing here was verified on a real device.

---

## B3.1 — Coach shell (2026-10-17)

**Scope (owner, 2026-10-17):** the Coach Shell only — Today · Clients · Messages · Library + a Me entry, desktop rail, mobile tabs, route migration, semantic Back, deep links, unsaved-changes protection, RTL / a11y, visual QA. Design references: the marketing site's identity and the B2 client (not the legacy coach UI).
**Not changed:** the Client App (one import path only, §1.8), the marketing site, auth / legal pages, the Admin shell, every API / server rule (B3.0.1 untouched), and the B3.2+ screens inside the shell. No commit, push, deploy or data change. Under the owner's clean-launch direction (2026-10-17) nothing in B3.1 depends on, migrates or deletes existing data.
Route table, semantic parents, Back ownership and selector changes: **`B3_COACH_ROUTE_MIGRATION.md`**. Screenshots and findings: **`B3_VISUAL_QA.md` §B3.1**.

### 1. What changed

1. **`CoachShell`** (`src/components/coach/CoachShell.tsx`, new) replaces `ResponsiveShell` for the coach. It is built from the B2 client's primitives (`AppHeader`, `TabBar`, `SideRail`), not the legacy `DesktopTopBar` / `BrandBar` / `SidebarNav`:
   - < 768 px: header (wordmark on destinations, Back on sub-pages) + 4 tabs; the avatar in the header opens **Me**;
   - 768–1023 px: a **72 px icon rail** (brand mark, icons with `aria-label` + `title`, compact unread badge, Me avatar at the foot); no tab bar;
   - ≥ 1024 px: the **240 px labelled rail** (wordmark, labels, Me with the coach's name);
   - header end: ⌘K search (≥ 768), sync status, notifications bell (transitional until B3.2, O-5), Me avatar (phones);
   - kept from `ResponsiveShell` on purpose: the single banner region (C12 / C23), the phone bottom padding the chat composer cancels, full-bleed pages; `--desktop-topbar-h: 3.5rem` so sticky detail panels clear the 56 px header.
2. **One navigation model** (`src/config/coachNav.ts`, new): the four destinations, the area of every coach route (`coachTabFor`, `coachAreaFor`), destination roots (`isCoachRoot`), screens that draw their own Back (`coachPageOwnsBack`) and therefore never get a second one from the shell (`coachShellShowsBack`). Clients is lit inside a client (NAV-K11); Library for templates; Today for check-ins, assessments and notifications.
3. **Me hub** (`/coach/me`, `src/pages/coach/CoachMe.tsx`, new): Business (Revenue & renewals, Client packages, Reports & exports), Forma (subscription with the live trial / plan state), Coaching (Check-ins, Assessments, Adherence — transitional until B3.2 / B3.3), Account (Account & preferences, Help & support via WhatsApp — replaces the floating button), Sign out (confirmed).
4. **Routes** (`src/apps/CoachApp.tsx`): `/coach` → `/coach/dashboard` on every breakpoint (was Clients on phones — IA-K01); `/coach/me` added; every other URL unchanged, so stored notification targets and bookmarks keep working.
5. **Semantic parents** (`src/lib/navContract.ts`): templates → Library; plan / settings / revenue / reports / subscription-plans → Me; Me and every other `/coach/<section>` → Today (was `/coach`, a redirect). With in-app history, Back stays real history (B1 contract).
6. **Unsaved-changes guard on every shell exit:** tabs, rail and rail Me through `onNavigate` → `confirmLeave()`; header avatar and shell Back (`useBack`) through `confirmLeave()`; the bell, every ⌘K command, the plan banner and notification toasts through `useGuardedNav` (NAV-K05, shell part).
7. **⌘K** (`CommandHost.tsx`): indexes the whole roster on a cold start (the dashboard query, fetched only while the palette is open for a coach); "Send broadcast" (which only opened the inbox) is now "Open messages"; a "Me" command (DT-08, partly).
8. **Icons:** the coach app renders inside `SiteIconSet` (the website icon set the B2 client uses). `siteIcons.tsx` moved from `components/client/` to `components/shared/`; `ClientApp.tsx` changes only that import.
9. **`SideRail`** (`components/ui/TabBar.tsx`): new `testId` and `collapsible` props; the client's defaults (`client-rail`, never collapsed) are unchanged.
10. **Library:** a "Programs" segment links to `/coach/templates` (until Library › Programs lands in B3.7).
11. **Removed from the coach:** `COACH_NAV` / `COACH_SIDEBAR` / `NAV` (`config/nav.ts`), the coach branch of `NavMenuSheet`, `CoachIndex`, the floating WhatsApp button, the grouped sidebar, the ☰ menu. The admin shell still uses `ResponsiveShell`, `SidebarNav`, `BrandBar`, `NavMenuSheet` and `WhatsAppFab` — no dead code was left.
12. **i18n:** `coachNav` and `coachMe` in `en`, `ar`, `ar-eg` (plurals for trial days).

### 2. Contracts

- B0 / B1 / B2 contracts (blueprint §2 C1–C25): the client's code paths are untouched; the full unit / API and e2e3 suites below cover them. C12 / C23 (one banner region, composer padding) are kept in the new shell; C3 (per-coach editor drafts) is what protects work on a hardware / browser Back.
- B3.0.1: no API, server or rule change.
- Two coach behaviours changed by design and their tests updated (§T): the coach's header avatar opens **Me** (was Settings), and `/coach` opens Today on phones (was Clients).

### 3. Tests

| Test | What it proves |
|---|---|
| `src/config/coachNav.test.tsx` (new, 4) | four destinations in order; the lit destination for 22 routes; roots without Back; no second Back on screens that own one; semantic parents |
| `src/components/coach/CoachShell.test.tsx` (new, 4) | tabs + rail, Clients lit inside a client, unread badge; Back ownership; a dirty editor stays on Cancel (tab, rail, Me) and leaves on Leave |
| `src/lib/navContract.test.tsx` (updated) | the new coach parents |
| `src/config/nav.test.tsx` (updated) | the coach case removed with `COACH_NAV` |
| `e2e3/specs/46-a11y.spec.ts` (+1 target) | axe sweep of the Me hub (`/coach/me`) |
| `e2e3/specs/85-b3-coach.spec.ts` (new, 7) | phone IA (4 tabs, Me, `/coach` → Today, NAV-K11, no ☰ / WhatsApp); tablet 72 px rail with accessible names, desktop 240 px rail; 7 cold deep links light their destination and Back goes up the IA; ⌘K on a cold `/coach/me` finds the client and opens it inside the shell (DT-08); dirty editor: rail Today, rail Me, bell and a ⌘K command all ask and Cancel keeps the edit; Arabic rail on the right with a mirrored Back; the 48-shot visual matrix with overflow / `dir` / translation assertions |

**§T — test changes forced by the new shell** (selector table in the route-migration doc §6): spec 20 (`coach-rail`, `rail-clients`), spec 23 (`rail-clients`; the avatar test now walks `rail-me` → `/coach/me`), spec 46 (accessible-name roots `coach-rail` + `app-header`), `_b-helpers.appReady` (accepts `coach-rail`), `_d-layout` (coach nav keys, rail, `/coach/library` and `/coach/me` in the layout sweep, `aria-label` fallback for the collapsed rail).

### 4. Verification (final code, 2026-10-17)

| Gate | Result |
|---|---|
| Typecheck `tsc -b --noEmit` | **PASS** (exit 0) |
| Architecture boundaries `scripts/check-boundaries.mjs` | **PASS** |
| Unit + API `vitest run` | **PASS — 650 / 650 tests in 78 files** (B3.0.1: 643 in 76; +8 new, −1 removed with `COACH_NAV`) |
| Production build `npm run build` | **PASS** — entry `index` 461.54 kB / 149.72 kB gzip (B3.0.1: 460.10 / 149.20; +0.52 kB gzip = navigation strings), `CoachApp` 63.69 / 17.50 (was 63.15 / 17.73), `ClientApp` 38.82 / 12.22 (was 44.91 / 13.89 — the website icon set now sits in a shared 8.99 kB chunk used by both apps), precache 172 entries (unchanged) |
| Browser — full e2e3 suite, all projects (chromium 1440 / 1280 / 1024, tablet 768, mobile 430 / 390, webkit-iphone) | **PASS — 238 passed + 1 skipped of 239** in 40.0 min (the skip is the pre-existing Google sign-in case; B3.0.1 had 232 + spec 81's review test; +6 for spec 85) |
| Browser — after the full run (two test additions only, no app change) | 85 (now 7 tests, + the ⌘K cold-roster case) and 46 (+ the Me hub axe target): **18 / 18** |
| Accessibility — axe (WCAG 2.1 A / AA) | coach dashboard and Me hub: **0 violations of any impact**; accessible names on every rail / header control (spec 46) |
| Visual QA | 48 shots, 390 / 768 / 1024 / 1440 × EN / AR: **0 px overflow, correct `dir` and translated navigation on every shot** — `B3_VISUAL_QA.md` |
| Physical devices | **Not run** (none available) |

### 5. Backlog outcome (B3.1-mapped items)

| Outcome | Items |
|---|---|
| **Fixed** | NAV-K11 (+ IA-K01 from the IA audit, not a backlog entry) |
| **Mitigated** — shell part done, the rest named for a later milestone | NAV-K02 → B3.4 / B3.5 · NAV-K05 → B3.4 / B3.5 (in-page links) · VS-07, VS-13, DT-07, RM-33 → B3.2–B3.8 · VS-14 → B3.2 / B3.4 / B3.7 · DT-08 → B3.7 (New exercise / food commands) · JR-08 → B3.4 / B3.5 · RM-48, DT-10 → admin shell (B5, outside B3) |
| **Moved** to the milestone that owns the screen | CO-29, NAV-K09 → B3.4 · NAV-K06 → B3.5 · NAV-K07 → B3.6 · DT-11 → B3.3 · CO-33, NT-10 → B3.2 · RM-30 → B3.2 / B3.6 · AX-05 → B3.2–B3.8 |
| **Needs a product decision** | RM-79 — the PWA manifest shortcuts are one list for every role: remove them, or keep client-only shortcuts? |
| Already closed earlier (folded) | CO-28, VS-12 (→ JR-08) · CO-30 (→ CO-04, B0) · NT-12 (→ CL-38, B2) · RM-34 (B2) |

### 6. Known limits and risks

1. **Browser / hardware Back cannot be intercepted** (`BrowserRouter`, no data router) — unchanged B1 limit; the editors' per-coach drafts keep the work and `beforeunload` covers reload / close.
2. **In-page links still skip the guard** (History chip, client-cap link, template editor) until B3.4 / B3.5 rebuild those screens.
3. **The bell stays until B3.2** (O-5), so messages are still signalled twice (CO-33 / RM-30).
4. **Workspace and editors keep their own header and Back** until B3.4 / B3.5; on phones the shell header's start slot is empty on those screens.
5. **Transitional rows in Me** (Check-ins, Assessments → Today in B3.2; Adherence → Clients sort in B3.3) and Business pages at their old URLs until `/coach/business` (B3.8).
6. **Admin still has the old chrome**, including the WhatsApp button (RM-48 / DT-10 admin part).
7. Visual QA used the standard e2e3 seed and Chromium emulation only; no physical-device evidence.

**Status: implemented and verified locally — awaiting owner review. No B3.1 commit without approval; B3.2 not started.**

---

## B3.2 — Coach Today queue (2026-10-17)

**Owner brief (2026-10-17):** B3.1 approved. (1) One local B3.1 commit of only the reviewed work; (2) remove the role-agnostic PWA shortcuts (RM-79); (3) build B3.2, a genuinely actionable Coach Today, grounded in real authorized data, with honest loading / empty / offline / stale / error states, the bell / message duplication resolved without losing useful notifications, EN / AR / Egyptian Arabic, RTL, accessibility, 360–1440 px. No commit of B3.2, push or deploy without approval; stop for review before B3.3.
**Rules of the queue:** `B3_TODAY_QUEUE.md` (sources, criteria per item, states, limits). **Not changed:** the client app, marketing, auth / legal, the super-admin / admin experience (admin keeps its bell and Notifications page), B3.0.1 server rules. No production data or credentials touched.

### 0. Owner decisions 1 and 2

1. **B3.1 committed locally as `cdba889`** ("Phase B3.1: coach shell", 33 files), not pushed. The staged diff was checked file by file. Left out: `B1_P1_TRIAGE.md` and `FORMA_CLEAN_LAUNCH_PLAN.md` (owner), the REL-04 row of the backlog (it points at the excluded plan; the committed backlog was regenerated without it), and an `ar-eg` wording change (check-in status "submitted": متبعوتة → مبعوتة) that B3.1 did not make. All of these stay in the working tree.
2. **RM-79: the manifest has no `shortcuts`** (`vite.config.ts`; the comment records why). `e2e3/pwa/pwa-check.mjs` now also records the manifest as Chromium parses it, plus Chromium's own installability verdict. The tool fix found while doing this: a second DevTools session left attached cancels Playwright's offline emulation, so the session is detached right after the check (the first runs falsely showed "offline banner: false"; the app was fine).

### 1. What changed

1. **Today** (`src/pages/coach/today/`, `/coach/dashboard`) replaces the dashboard. Who · why (with evidence) · one action, in five sections: To review, Requests, Unread messages, Subscriptions, Coaching. Plus a summary ("N things need you"), kind chips (`?focus=`), "Updated hh:mm · Refresh", Forma notices, the onboarding checklist (first clients only) and Coming up. Desktop ≥ 1024 has two panes (queue + the selected item's panel, **J / K**). On phones a check-in opens a review sheet and a transfer opens a decision sheet; every other row opens its exact route.
2. **Queue derivation** `src/lib/coachToday.ts`: a pure function over seven sources with per-kind availability, so a failure never reads as "nothing to do". The criteria table is `B3_TODAY_QUEUE.md` §3. Notable rules:
   - check-ins only if requested by this coach (a transferred client's old check-in is not queued);
   - "lapsed" excludes cancelled / ended terms;
   - "needs a plan" only after the assessment is reviewed and with neither plan;
   - "no workout in 7 days" (O-20) only with a training plan, a running term, an active account and ≥ 7 days on the roster;
   - plan-based items are omitted (never guessed) if the server lacks the O-7 fields.
3. **Data** `useTodaySources.ts`: separate queries on the keys other screens already use. Threads and the notification feed come from the existing shared pollers. The thread poller gained an optional error listener and an immediate `refreshCoachThreadsSummary` (`messagesApi.ts`), so Today can tell "no unread" from "couldn't load" without a second poll.
4. **Server, O-7 (additive):** `coachClients.dashboardSummaries` returns `hasWorkoutPlan` / `hasNutritionPlan`, true when the client's plan has ≥ 1 day / ≥ 1 meal. These are two bounded aggregations on `_id`, and only array sizes leave the database. No schema change, no stored field, no migration. Older clients ignore the fields; Today omits plan-based items without them.
5. **Shared review / decision components:** `CheckInReviewForm` + `CheckInComparison` (`components/coach/CheckInReview.tsx`) now serve both Today and the check-ins page (the review UI is no longer built twice, RM-19); empty feedback asks before marking reviewed (CO-13). `TransferRequestCard` (`components/coach/TransferRequestCard.tsx`) serves Today and the Clients incoming strip. The strip no longer makes one user lookup per request for the client's name (it comes from the roster), and Approve is no longer the primary style (blueprint §6.1).
6. **Bell → Today (O-5):** the coach shell has no bell and mounts the notification toasts itself (the bell was their only mount). `/coach/notifications` → Today. Admin is unchanged.
7. **Routes:** `/coach/assessments` → `/coach/dashboard?focus=assessments` (list page deleted). `/coach/checkins` is **kept** (bulk "request this week", awaiting / overdue) until B3.3, a recorded deviation from blueprint §5.3. Me › Coaching drops Assessments. ⌘K "Review assessments" opens Today filtered.
8. **Banners (O-6):** "paid term ends within 5 days" and "plan request awaiting payment" now show on Today only. Lapsed / suspended and over-capacity stay app-wide. The trial card sits on Today.
9. **Removed after verifying importers:** `CoachDashboard`, `dashboard/{Overview,Clients,Engagement,Content}Panel`, `dashboard/parts`, `ui/QuickActions`, `CoachAssessments`; 34 unused `coachDash.*` strings and `coachMe.assessments` (each confirmed unused in `src/`). Admin's own `OverviewPanel`, `AnalyticsPanel` / `ReportsPanel` (Revenue / Reports) and `coachDashboardQuery` (Clients, ⌘K, switcher, Revenue, Reports) stay.
10. **i18n:** a `coachToday` namespace in `en`, `ar`, `ar-eg` with full Arabic plural forms (zero / one / two / few / many / other). The client's own words are bidi-isolated (U+2068 / U+2069) so English text can't reorder the Arabic sentence.

### 2. API contract

| Procedure | Before | After | Consumers |
|---|---|---|---|
| `coachClients.dashboardSummaries` | `{ clientId, workouts7d, lastActivity, assessment, fullName, toReview }[]` | **+** `hasWorkoutPlan: boolean`, `hasNutritionPlan: boolean` (same authorization, same roster, same order) | Today (new fields); Clients, Adherence, Revenue / Reports, ⌘K (unchanged use) |

No other server change. B32-P1 and B32-P2 in `B3_TODAY_QUEUE.md` §8 are proposals, not implemented.

### 3. Tests

| Test | Proves |
|---|---|
| `src/lib/coachToday.test.ts` (new, 25) | every criterion and boundary: per-coach check-ins (incl. legacy), 7-day / 30-day edges, frozen / cancelled / ended exclusions, O-7 omission on older servers, O-20 inactivity, one row per client per kind, ordering, focus, a 40-client roster, failed / loading / stale sources never "empty" |
| `src/pages/coach/today/CoachToday.test.tsx` (new, 13) | each screen state (loading, error, offline, new coach, all clear only when trustworthy, partial, stale, offline-cached); exact routes; the phone review sheet incl. the empty-feedback confirm; desktop panel + J / K; chips and `?focus` (incl. the legacy name); section cap |
| `api/.../coachClients.test.ts` (+1) | O-7 through the real save path: a full plan, an empty saved plan, a malformed legacy field, no plan, another coach's client never included, other coach FORBIDDEN |
| `CoachShell.test.tsx`, `coachNav.test.tsx` (updated) | no bell, toasts mounted; the redirected routes light nothing |
| `e2e3/specs/86-b3-today.spec.ts` (new, 13) | new coach; no bell + redirects; O-6; the busy-coach fixture (every kind with evidence, another coach's data never shown); axe on queue / sheet / panel EN + AR; every row's exact place; review in place (DB shows reviewed + feedback); desktop panel + J / K + transfer decided (DB shows rejected); freshness via Refresh; failing backend → Retry; offline; Arabic; the 18-shot visual matrix |
| `e2e3/specs/42-errors.spec.ts` (+1 screen) | Today without its roster is an error with Retry, never "all caught up" |

**§T — changes forced by B3.2:**
- spec 85: the guard test drops the bell exit (no bell), and Me no longer lists Assessments;
- spec 60: the composer-reachability check uses the app-wide over-capacity banner, since "term ending" is Today-only under O-6 (same geometry assertions);
- `pwa-check.mjs`: manifest + installability step, with the DevTools session detached afterwards.

### 4. Verification (final code, 2026-10-17)

| Gate | Result |
|---|---|
| Typecheck `tsc -b --noEmit` | **PASS** |
| Boundaries | **PASS** |
| Unit + API `vitest run` | **PASS — 689 / 689 in 80 files** (B3.1: 650 in 78; +39) |
| Build | **PASS** — entry 464.55 / 150.52 kB gzip (B3.1: 461.54 / 149.72; +0.80 kB gzip = the eager English strings); `CoachToday` chunk 27.16 / 9.01; `CoachApp` 63.33 / 17.56; `ClientApp` unchanged 38.82 / 12.22; precache 172 entries |
| Targeted e2e3 (1440: 00, 10, 20, 23, 42, 46, 85, 86) | **73 passed + 1 skipped** (the Google sign-in case) |
| Full e2e3, all projects | **PASS — 254 passed + 1 skipped of 255** in 42.1 min on the final code (the skip is the pre-existing Google sign-in case). Count: B3.1's 239 + its two review additions (⌘K cold roster, Me axe) = 241, + 13 (spec 86) + 1 (spec 42 Today). An earlier full run gave the same result before the last Today panel-width fix (§B3_VISUAL_QA T5); every gate was re-run after it |
| Accessibility (axe WCAG 2.1 A / AA) | Today (coachA) **0**; Me **0**; busy queue, review sheet and desktop panel, EN + AR **0 / 0 / 0 / 0 / 0 / 0** |
| PWA (RM-79) | manifest parsed with **no errors and no shortcuts**; name, start URL, standalone, 3 icons unchanged; **0 installability errors**; SW, offline reload, offline banner, deferred update **PASS**; signed-in offline boot **PASS**. Re-run on the final build with the same result. Tool note: the offline-boot runner must start the isolated stack in a fresh directory; reusing one fails `MongoMemoryReplSet` start-up (a harness issue, not the app) |
| Visual QA | 18 full-page shots (busy: 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR, + `ar-eg` 390 / 1440; all-clear 390 / 1440 × EN / AR) — **0 px overflow, correct `dir`**; `B3_VISUAL_QA.md` §B3.2 |
| Physical devices | **Not run** |

### 5. Backlog outcome (B3.2-mapped items)

| Outcome | Items |
|---|---|
| **Fixed** | CO-05, JR-02 (+ DT-02 folded), CO-17, RM-17, RM-41, CO-33, RM-79 |
| **Mitigated** | CO-06 (Clients / switcher flags → B3.3 / B3.4) · CO-13 (per-client page → B3.4) · RM-19 (check-ins page stays → B3.3) · CD-09 (RoleAccount → B3.8) · B3-S12 (server types: a server decision) · RM-30 (coach side) |
| **Not done — needs owner OK** | NT-10: persisting announcement dismissals also changes the client home (B2 behaviour) → B3.9 |

**Certification:** no B3 certification report exists yet (blueprint: B3.9). The B2 client certification is unaffected; the client app did not change. B0 / B1 / B2 contracts stay green through the full suites above; the B0 composer-reachability contract (C12 / C23) is still tested in spec 60, now with the over-capacity banner.

### 6. Known limits and risks

1. **Freeze requests** come from the coach's newest-50 notification feed. An old pending request can drop out of that window behind newer message notifications. It stays on the client's Subscription page. The real fix is B32-P1, an additive server filter that needs approval.
2. **Clients / ⌘K / the client switcher** still use the old `needsAttention` flag and `toReview` (any coach's submitted check-in) until B3.3 / B3.4. Today does not.
3. **`/coach/checkins` stays** (owner-visible deviation, §1.7).
4. **Time zones:** inactivity compares the client's workout date with the coach's local date (± 1 day).
5. **Batched failures:** one failing procedure fails its tRPC batch, so the usual failure is the roster error with Retry. Per-section error lines appear when a single source fails (unit-tested).
6. **Bidi in the shared check-in summary:** the client's notes show trailing punctuation on the wrong side in Arabic (an existing component also used by the client; not changed under "preserve B2"). Tracked for B3.9 RTL polish.
7. Visual QA used fixtures on the isolated stack and Chromium emulation; no physical devices.

**Status (first pass):** implemented and verified locally, then reviewed by the owner (conditional approval, §7).

### 7. Owner review (2026-10-17) — conditional approval and the follow-ups it required

Approved with three conditions before the B3.2 commit.

**B32-P1 — pending freeze requests no longer depend on notifications.**
- **Server (additive, read-only):** `subscriptionRequest.pendingForCoach` (`api/_trpc/routers/clientCheckIns.ts`) returns every `pending` request document among the caller's **active** clients, only if it was made after that relationship began. A previous coach's request, or one from an earlier stint, is never exposed.
  - Authorization: self or `users.read`, the same rule as the coach's other roster summaries; a suspended coach keeps read-only access (R-3).
  - Cursor-paginated on (requestedAt, clientId), ≤ 200 per page. One document per client, so no duplicates.
  - The freeze apply / decide / cancel paths, their audit events and their concurrency rules are unchanged.
- **Client:** `listPendingFreezeRequests` reads every page. Today's freeze kind now depends on roster + `freezeRequests`, and Today no longer reads the notification feed at all (toasts still do).
- **Invalidation:** the Subscription page invalidates `coachFreezeRequests` and `coachRelationships` after any decision or term change, so the queue updates immediately.
- **Evidence:**
  - `b32FreezeRequests.test.ts` (5): still listed after 60 newer notifications, while the feed itself has lost it; leaves on reject / cancel / accept / relationship end; never another coach's or a pre-hand-over request; a 250-client roster pages completely with ties and no duplicates; a suspended coach reads.
  - e2e3 86: 60 newer notifications → still on Today with its dates → rejected on the Subscription page → gone from Today; the DB shows `rejected`.

**NT-10 — announcement dismissals.**
- `src/lib/bannerDismissals.ts` + `BannerHost`: a dismissal is stored per signed-in user (`localStorage`, the same per-account pattern as the toast baseline) and per announcement **content version** (a hash of title, body, link and style). Toggling dates or active doesn't change the version.
- A dismissed informational announcement stays away across launches; a new or edited one shows. A `warning` announcement is dismissed for the session only.
- Critical plan, payment and account notices are not announcements and have no dismiss. Same look for coach and client.
- **Evidence:**
  - `BannerHost.test.tsx` (6): coach and client across a relaunch; edited and new announcements; warning returns next launch; account switch on one device; offline relaunch.
  - e2e3 86 (3): coach Today and client home, dismiss → new tab (a new session) → still hidden → admin edits → shown; warning returns.
  - Spec 13 (admin announcement lifecycle) still passes.

**`/coach/checkins` kept until B3.3** (owner-approved). It holds the bulk weekly request and the awaiting / overdue view; it is removed only once B3.3 ships the replacement, and the URL keeps working.

**Environment finding during close-out (not the app):**
- Drive C: is full (~0.3 GB free), so the in-memory MongoDB refused to start for the unit tests ("available disk space … less than required minimum"). It looked like 20 failing coach-plan tests.
- Fix: test runs now use a temp directory on D: (`e2e-out/.tmp`, gitignored), and 144 scratch databases of finished e2e3 runs (`e2e-out/*/mongo-data`, ~20 GB) were removed. Reports, screenshots and visual-QA folders cited as evidence were kept.
- The owner's C: drive was not touched.

**Final verification (the code being committed):**

| Gate | Result |
|---|---|
| Typecheck / boundaries | PASS / PASS |
| Unit + API | **701 / 701 in 82 files** (+12 since §4: 5 freeze-request API, 6 BannerHost, 1 queue rule) |
| Build | PASS — entry 464.62 / 150.54 kB gzip; `CoachToday` 27.38 / 9.05; `CoachApp` 63.33 / 17.56; `ClientApp` 38.82 / 12.21 (unchanged); precache 172 entries |
| Full e2e3, all projects | **258 passed + 1 skipped of 259** (41.9 min; the skip is the Google sign-in case). The first close-out run had 256 passed + 2 failed:
  - NT-10 client test: the client account was in Arabic at that point (another spec's Arabic session synced its language back after its own restore — a pre-existing harness race), so the button was "إغلاق", not "Dismiss". The test now matches the label in all three locales and passes 3 / 3.
  - Spec 31 "load older" scroll anchoring: a timing flake under full-suite load. It passes 3 / 3 on its own, passed in both earlier B3.2 full runs, and B3.2 touched no thread code.
  The clean re-run above is the evidence of record |
| PWA + signed-in offline boot (final build) | manifest parsed, no shortcuts, 0 installability errors; SW, offline reload, offline banner, deferred update **PASS**; signed-in offline boot **PASS** |
| Visual recheck, Today (390 / 768 / 1024 / 1440 × EN / AR + all widths in the matrix) | 18 / 18 matrix shots, 0 px overflow, correct `dir` (`e2e-out/b32-close2/b32-visual/`); looked at 390 AR, 768 EN, 1024 AR, 1440 EN: unchanged apart from the freeze row now showing the requested dates |
| Contracts | B0 / B1 / B2 / B3.0.1 / B3.1 suites all inside the full run above (incl. spec 33 / 60 composer, 61 trust, 70 foundation, 80 client, 81 security, 85 shell) |

**Status: B3.2 closed with the owner's follow-ups — committed locally as `739cc33` ("Phase B3.2: coach Today queue", 52 files; not pushed). B3.3 follows.**

---

## B3.3 — Clients directory (2026-10-17)

**Owner brief (2026-10-17):** B3.2 approved on conditions (B32-P1, NT-10, keep `/coach/checkins` until B3.3, close B3.2 safely in one commit). Then B3.3, the premium Clients directory:
- keep Add Existing Client, invitations and every supported client action;
- work for 0, 1, 25, 100 and many clients;
- scope the legacy Needs-attention / `toReview` logic strictly to the current coach;
- define each status precisely, with no speculative risk, misleading flags or false inactive states;
- meaningful filters and sorting, keep bulk weekly check-in requests and awaiting / overdue while migrating `/coach/checkins`, and keep old URLs working;
- mobile-first list, practical tablet, dense desktop table without horizontal overflow;
- honest states; EN / AR / AR-EG, RTL, keyboard; carry the remaining issues to their milestones.

Stop for review: no commit, no B3.4, no push or deploy.
**Rules of the directory:** `B3_CLIENTS_DIRECTORY.md` (sources, every state and filter, sorts, weekly check-ins, layouts, server changes, limits). **Not changed:** the client app, marketing, auth / legal, the admin shell. No production data or credentials touched; no database reset; isolated fixtures only (`e2e-dir-` ids, removed after each run).

### 0. B3.2 close-out

Committed locally as `739cc33` ("Phase B3.2: coach Today queue", 52 files) after a file-by-file review of the staged diff, not pushed. Left in the working tree as before: `B1_P1_TRIAGE.md`, `FORMA_CLEAN_LAUNCH_PLAN.md`, the backlog's REL-04 row, and the `ar-eg` wording change (متبعوتة → مبعوتة).

### 1. What changed

1. **Clients** (`src/pages/coach/CoachClients.tsx` + `src/pages/coach/clients/`): header with capacity and **Add client**; incoming transfer requests; search (name, email, phone; contact details are never shown in a row); task chips (All, Needs you, Check-ins to review, Renewals due, Lapsed, Weekly check-ins); a Filter & sort sheet; the desktop table; the phone / tablet list; the weekly check-ins view; "Your transfer requests". Every view is in the URL.
2. **Model** `src/lib/coachDirectory.ts` (pure): package state, this week's check-in state, activity, plans, needs (Today's queue, `buildTodayQueue`, so "Needs you" is Today's list), filtering, sorting (unknown values last), bulk-request eligibility.
3. **Shared data** `src/hooks/useCoachSources.ts` (moved from `today/useTodaySources.ts`): Today and Clients read the same queries. Relationships use the new `view: 'summary'` (active only, no audit trail).
4. **Only this coach's work (server):** `dashboardSummaries.toReview` and `checkIns.listForCoachClients` count only check-ins this coach requested (legacy ones only when created after the relationship began). `checkIns.request` refuses a week a previous coach holds instead of returning that coach's check-in.
5. **`/coach/checkins` → Clients › Weekly check-ins** (`?view=checkins`). Same groups (to review, overdue, awaiting, not requested, done), review in order with the shared form, and the bulk request, now only to clients with a running package and an active account, in batches of 10. A week held by a previous coach is reported as such, not as a failure to retry. **`/coach/adherence` → `?sort=workouts`.** Both pages and Me › Coaching are removed; the URLs redirect.
6. **Add client:** the chooser + invite panel moved to `clients/AddClientSheet.tsx` (same test ids). **O-4:** closing the sheet no longer revokes uncopied links (CO-37). Revoking is compare-and-set on the server, so it never overwrites a claim.
7. **"Your transfer requests"** (B3-C06): status and Cancel while pending. The server no longer tells the requester who coaches the client (`fromCoachId` omitted, CO-03).
8. **⌘K** reads the light `myClients` roster (no dashboard load). The old `needsAttention` flag (still used by the client switcher) no longer marks "0 workouts this week" on its own (CO-06).
9. **Accessibility found by axe:**
   - the shared `bad` pill's red text is ~4.1:1 on its tint, so these screens use a new AA-safe token `danger.text` (#FF6B62); the shared style is B3.9 (B33-R1);
   - the phone Filter button had no accessible name;
   - chip counts were dimmed below AA.
10. **Visual-QA fixes:**
    - short "last workout" forms in the table ("6 days ago"; the header says "Last workout");
    - rebalanced column widths and non-wrapping pills at 1024;
    - the phone header keeps Add on the title row;
    - a shorter search placeholder;
    - the filter sheet's Clear / Done pinned in a footer;
    - tablet two-column dividers (a `divide-y-0` conflict zeroed the row borders);
    - names truncated in the table carry a tooltip.
11. **Lazy route:** Clients was the only eager coach page (a leftover from when it was the phone landing). It is now lazy like Today, which keeps the shared queue code out of the shell chunk.
12. **i18n:**
    - a `coachClients` namespace in `en`, `ar`, `ar-eg` with full Arabic plurals (incl. "Ends in N days");
    - `checkin.weekTaken`;
    - 30 strings orphaned by the removed pages and the old list deleted, each confirmed unused in `src/` (`coachMe.coaching / checkins / adherence`, `coachDash.sendReminders…`, `checkin.section*`, `trust.clients.*`, …).

### 2. API contract

| Procedure | Before | After | Consumers |
|---|---|---|---|
| `coachClients.dashboardSummaries` | `toReview` = any submitted check-in of the client | `toReview` = a submitted check-in **this coach** requested (legacy: created after this relationship began). Same shape and authorization | Clients, ⌘K / switcher (`needsAttention`), Reports |
| `checkIns.listForCoachClients` | latest + previous check-in of each active client, any coach | the same, from **this coach's** check-ins only | Today, Clients |
| `checkIns.request` | an existing week was returned as-is | a coach asking for a week a previous coach holds gets `CONFLICT` `CHECKIN_WEEK_TAKEN`; own weeks stay idempotent; admins unchanged | Clients (bulk), the client's Check-ins page |
| `coachClients.list` | full documents | optional `view: 'summary'` drops `subscriptionEvents`, `subscriptionHistory`, `inviteCode` (default unchanged) | Today, Clients |
| `transfers.list({type:'outgoing'})`, `transfers.create` | returned `fromCoachId` | omitted (the incoming list keeps it) | Clients |
| `invites.revoke` | unconditional `$set: revoked` | only while not `claimed`; otherwise `CONFLICT` | Add client |

No schema change, no migration, no stored field. Authorization unchanged everywhere.

### 3. Tests

| Test | Proves |
|---|---|
| `src/lib/coachDirectory.test.ts` (new, 30) | every package state and boundary (7-day expiring, frozen, ended / cancelled, pending, none, unknown); check-in states incl. a previous coach's and legacy check-ins; activity / plans unknown vs none; filters, sorts (unknowns last, both directions), eligibility |
| `src/pages/coach/CoachClients.test.tsx` (new, 9) | loading, error, offline, empty, no-match, partial; URL filters and sorts; `?new=1`; no contact details in rows |
| `api/_trpc/routers/b33Directory.test.ts` (new, 7) | `toReview` across a hand-over and for legacy check-ins (also as admin); `listForCoachClients` never sends a previous coach's check-in; `request` refuses a previous coach's week (incl. legacy) but stays idempotent for its own; `list` summary view (size, authorization); outgoing transfers never carry `fromCoachId`; revoke never overwrites a claim |
| `e2e3/specs/87-b3-clients.spec.ts` (new, 19) | 0 clients (EN / AR shots); 1 client (no contact details, search by email / phone, no-match); old URLs; O-4; outgoing transfers (payload has no current coach); the mixed 25 (every state; Needs you = Today; deep links, reload, Back; sorts; desktop 1024 / 1280 / 1440 with no overflow, keyboard, row menu; phone / tablet Show more; partial and roster failure; offline; Arabic; axe EN + AR on list, filters, table, check-ins; the visual matrix; weekly check-ins with the bulk request and the review queue, checked in the DB); **210 clients** (pages of 50, sorting across pages, Show more to 210, search, payload per client) |
| Updated: `CoachToday.test.tsx`, `coachNav.test.tsx` | the moved data hook; the removed routes |

**§T — spec changes forced by B3.3** (rows no longer show contact details; new table hooks; moved pages):
- 20 / 21 / 23 find clients by `data-client-id` and open them by the name link;
- 61 accepts "No package";
- 85 drops the Me rows and deep-links `/coach/clients?view=checkins`.

### 4. Verification (final code, 2026-10-17)

| Gate | Result |
|---|---|
| Typecheck `tsc -b --noEmit` | **PASS** |
| Boundaries | **PASS** |
| Unit + API `vitest run` | **PASS — 747 / 747 in 85 files** (B3.2: 701 in 82; +46) |
| Build | **PASS**. Entry 466.77 / 151.03 kB gzip (B3.2: 464.62 / 150.54; +0.49 kB gzip, the English strings). `CoachApp` **35.43 / 11.30** (B3.2: 63.33 / 17.56; the old Clients page left the shell chunk). New lazy `CoachClients` 47.66 / 13.79. `CoachToday` 17.01 / 5.84 (shared code now in a common chunk). `ClientApp` 38.92 / 12.23 (B3.2: 38.82 / 12.21): no client-app source changed (`git diff`); most likely Rollup re-assigning a module the deleted coach pages shared. Precache 173 entries |
| Spec 87 alone | **19 / 19**, re-run after each fix found by the earlier runs (axe, visual QA, the 210-client fixture); the full run below covers the final code |
| Full e2e3, all projects | **PASS — 277 passed + 1 skipped of 278** in 45.5 min on the final code (`e2e-out/b33-full-a`; the skip is the pre-existing Google sign-in case). Count: B3.2's 259 + 19 (spec 87). Includes every B0 / B1 / B2 / B3.0.1 / B3.1 / B3.2 suite (33 / 60 composer, 61 trust, 70 foundation, 80 client, 81 security, 85 shell, 86 Today) |
| Accessibility (axe WCAG 2.1 A / AA) | Clients list and filters (390), table and weekly check-ins (1440), EN + AR: **0 violations** on all 8 scans (the first run found the three issues in §1.9; fixed) |
| PWA (final build) | manifest parsed, no shortcuts, 0 installability errors; SW, offline reload, offline banner, deferred update **PASS** (known baseline page error, the analytics path); signed-in offline boot **PASS** |
| Visual QA | 26 full-page shots, **0 px overflow, correct `dir`**; `B3_VISUAL_QA.md` §B3.3 |
| Physical devices | **Not run** |

### 5. Backlog outcome (B3.3-mapped items)

| Outcome | Items |
|---|---|
| **Fixed** | TB-01, CO-34, CO-37, RM-19, RM-47 (product call, for review), B32-P2, B3-C09 |
| **Mitigated** | CO-06 (the client switcher → B3.4) · TB-08 (the shared DataTable → B3.7 / B3.8) · TB-07, DT-11 (other lists → B3.6–B3.8) · PF-07 (notes / targets keys → B3.4 / B3.5; no prod measurement yet) · RM-18 (Reports → B3.8) · CO-36 (other "plan" meanings → B3.8) · B3-C06 (transfer notifications → server decision) |
| **Deferred (owner)** | RM-28: both add paths kept (O-3); one Add client entry, one sheet |
| **Not done** | B3-S13 (stale fields on a re-assigned relationship: a server change outside the B3.3 scope → proposed with B3.4) |
| **New** | B33-R1 shared pill contrast → B3.9 · B33-R2 mid-week hand-over week (owner decision) · B33-R3 check-in history across coaches in the workspace (owner decision, B3.4) · B33-R4 time-zone day boundaries → B3.9 |

### 6. Known limits and risks

1. **Mid-week hand-over:** the previous coach's request holds the week (one check-in per client per week). The new coach can ask from next week. The bulk request says so (B33-R2).
2. **Workspace history:** the client's Check-ins page still lists check-ins a previous coach requested. Today and Clients no longer do. Whether a new coach should see that history is a product decision for B3.4 (B33-R3).
3. **Day boundaries:** "last workout", inactivity and "this week" use the coach's local date against the client's local workout date (± 1 day across time zones) → B3.9 (B33-R4).
4. **The client switcher** still shows the old "Needs attention" pill (now without the "0 workouts" trigger) → B3.4.
5. **Paging is on the device:** the whole roster loads once (bounded queries, the first batch is about 1.1 KB per client — 227 KB for 210 clients — and the first rows show in 1.4 s on the dev stack). Server-side paging only if rosters grow far beyond that.
6. **Shared `bad` pill contrast** stays below AA on the client and admin screens until B3.9 (B33-R1).
7. **Bidi in the shared check-in summary** (B32-R1) → B3.9. **Editor navigation guards** (NAV-K02 / NAV-K05) → B3.4 / B3.5. **Physical-device certification** and **MD-01 / 02 / 03** remain release blockers.
8. Visual QA used isolated fixtures and Chromium emulation; no physical devices.

### 7. Owner decisions requested

1. **Server changes beyond the approved `toReview` fix** (all privacy or integrity, additive or narrower, tested in `b33Directory.test.ts`):
   - `listForCoachClients` scoping;
   - `checkIns.request` refusing a previous coach's week;
   - `list` summary view;
   - outgoing transfers without `fromCoachId`;
   - compare-and-set revoke.

   Keep or revert each.
2. **RM-47:** the account state shows only when it blocks the client (Pending / Frozen / Trashed), never as a filter. Confirm.
3. **B33-R3:** does a new coach see the client's check-ins from previous coaches in the workspace (B3.4)?
4. **B33-R2:** should a new coach be able to take over the previous coach's unsubmitted request for the hand-over week (a server change)?
5. **B33-R1:** fix the shared `bad` pill colour in B3.9 (a small visual change on the client and admin screens too)?

**Environment:** drive C: is effectively full (0.08 GB free at close-out). Every test run used the temp directory on D: (`e2e-out/.tmp`); C: was not touched. Scratch databases of finished runs are pruned after each run.

### 8. Owner review (2026-10-18) — decisions

1. **All five server changes kept** (§7.1): check-in summaries scoped to the current coach; a previous coach's week never returned; the optional `view: 'summary'` (full-view consumers unchanged); outgoing transfers without the current coach's identity (server-side); compare-and-set revoke.
2. **Account status approved** as shown only when it blocks access, with no account filter, and worded as the account so it is never confused with a paused package: the pill now reads **Account pending / Account frozen / Account trashed** ("Paused" is the package). Spec 87 asserts "Account frozen".
3. **B33-R3 → B3.4:** a new coach must not see check-ins owned by a previous coach (answers, photos, feedback, comments), enforced on the server across every workspace consumer. The client keeps their own history; super-admin under the existing audited policy.
4. **B33-R2 → B3.4:** the incoming coach may request the same training week as a **new record of their own**, never taking over, exposing or touching the old one; no duplicates; legacy records handled conservatively; stop and ask if a migration would be needed.
5. **B33-R1 → B3.9** (approved): fix the shared red pill token / component to AA with client and admin visual regressions; open until verified.

**Close-out verification (the code being committed, 2026-10-18):** typecheck PASS · boundaries PASS · unit + API **747 / 747** in 85 files · build PASS (entry 466.86 / 151.06 kB gzip; `CoachClients` 47.72 / 13.81; `CoachApp` 35.43 / 11.31; `ClientApp` 38.92 / 12.24; precache 173) · targeted e2e3 on 1440 (00, 20, 21, 23, 61, 85, 86, 87) **81 / 81**. The full suite (277 passed + 1 skipped of 278, §4) ran on the same code before the account-pill wording change, the only change since.

**Status: B3.3 approved — closed with one local checkpoint commit. B3.4 follows.**

---

## B3.4 — Client workspace (2026-10-18)

**Owner brief (2026-10-18):** B3.3 reviewed. The decisions:
1. keep all five B3.3 server changes;
2. account status shown only when it blocks access, never confusable with a paused package;
3. a new coach must not see a previous coach's check-ins — server-enforced on every workspace path;
4. the incoming coach may request the hand-over week as a new record of their own — stop if a migration would be needed;
5. the shared red pill fix goes to B3.9;
6. close B3.3 in one local commit.

Then B3.4 only: Summary · Plan · Progress · Profile. Its requirements:
- check-in ownership and the mid-week rule;
- scoped "Needs attention" in the switcher;
- transferred / re-assigned clients (B3-S13);
- every existing workflow preserved, private notes and per-author assessment privacy kept, unsaved edits protected;
- exact deep links, old routes compatible;
- no fake numbers;
- no B3.5 editor redesign.

Stop for review: no commit, no B3.5, no push or deploy.

**Not changed:** the client app's screens (one data-layer line, §1.2), marketing, auth / legal, admin. No production data or credentials touched; no database reset; isolated fixtures only (`e2e-ws-` ids, removed after each run).

### 0. B3.3 close-out

- Account pill renamed per decision 2 ("Account pending / frozen / trashed").
- Gates on the final code: typecheck / boundaries PASS, unit + API 747 / 747, build PASS, targeted e2e3 81 / 81.
- Committed locally as `28035b6` ("Phase B3.3: coach Clients directory", 50 files; not pushed) after a file-by-file review of the staged diff.
- Left unstaged and unchanged: `B1_P1_TRIAGE.md`, `FORMA_CLEAN_LAUNCH_PLAN.md`, the backlog's REL-04 lines (the committed backlog was generated without them) and the `ar-eg` wording hunk (staged copy reverted, working copy kept).

### 1. What changed

**1.1 Check-in ownership (decision 3) — server.** `api/_trpc/routers/clientCheckIns.ts`.
- A coach reads, reviews and deletes **only their own** check-ins on every path: `get`, `list`, `review`, `delete`, and `listForCoachClients` (since B3.3).
- "Own" means the coach requested it (`coachId`), or — legacy, no `coachId` — it was created after that coach's current relationship began. Legacy records are never given an owner: one from before the relationship belongs to nobody that coach can see.
- **Client:** keeps their whole history. Only a request a previous coach left open (not actionable) is left out of their list.
- **Admin** (`users.read`): unchanged, full access.
- Other coach-side readers were checked: Today / Clients / switcher read the scoped summaries; notifications are coach-scoped since B3.0.1, and a previous coach's late answer no longer notifies the new coach; Reports only count this coach's check-ins to review (scoped since B3.3), and no export carries check-in content. Media (check-in photos) is reachable only through the records, and MD-02 (public CDN URLs) stays the release blocker it was.

**1.2 Mid-week hand-over (decision 4) — server, additive, no migration.** One record per client per week stays the rule (`_id = clientId__week`). When a different coach already holds the week, the incoming coach's request creates **their own** record, `clientId__week__coachId`.
- **Old record:** never reassigned, returned, reviewed, cancelled or edited.
- **No duplicates:** a repeat or concurrent request returns the coach's one record, because the `_id` is unique; a duplicate-key race re-reads ownership before choosing the key.
- **Client side:** the client-facing id is the record's key. It is still the week for every first record, so every existing link, draft and outbox key is unchanged. `checkInApi.toCheckIn` reads it from `_id`; that is the one client-app line.
- **Older app versions:** superseded after the owner review — two client generations, told apart by `byKey` (§8.1).
- **Notifications** carry the key (`/check-in/week__coachId`).
- B3.3's `CHECKIN_WEEK_TAKEN` refusal and its wording are gone.
- The schema, indexes (`clientId_weekStart`, `coachId`), the B1.6 idempotent submit (`submitOpId`) and the status compare-and-set are unchanged.

**1.3 B3-S13 — clean re-activation.** `api/coach-clients/_service.ts`: re-activating a relationship that ended (assign back, or a transfer back) now replaces the document with a clean active one, compare-and-set on "not active".
- The whole previous stint — dates, how it ended, mode, term, archived terms, audit trail, invite code — moves into `previousStints`. Nothing from an earlier stint survives on the active document, and nothing is lost.
- Another coach sees stint facts only (timeline); the summary view leaves stints out; the coaching history shows each stint as its own row.
- Two racing activations: exactly one wins, and the loser's capacity slot is returned.

**1.4 The workspace** (`src/components/coach/CoachClientWorkspaceLayout.tsx`, `src/pages/coach/workspace/`, pure rules `src/lib/coachWorkspace.ts`):
- **Header** (one, compact): Back · the client (opens the switcher) · package pill + days left · **Account …** pill when blocked · Message (icon on phones, named everywhere) · More (Call, Switch client, **Release** — destructive, confirmed with its consequences, error shown, lands on Clients with history replaced). A client not on this coach's roster gets a clear state with a way to Clients.
- **Sections:** Summary · Plan · Progress · Profile. Switching replaces history, so Back returns to the opener (NAV-K08). Every link goes through the unsaved-changes guard.
- **Summary:**
  - **Needs you:** exactly Today's items for this client; a waiting check-in is reviewed in place.
  - **Training:** this week against the plan (the client app's own rule), last 7 / 28 days, last workout.
  - **Body:** latest weigh-in and the change since a dated earlier weigh-in.
  - **Plan**, this coach's **check-in state**, and the **latest note**.
  - **Actions:** Edit plan, and Request this week's check-in when eligible.
  - A failed source says so, with Retry; nothing reads as zero.
- **Plan:** a card per plan (training, nutrition with its targets, cardio): what it holds, when it changed, Edit, History. A missing plan offers Build (training also "From a template"); a failed read is an error, never "no plan" (C1). Editors open as full-screen tasks without workspace chrome (one Back), and Back lands on Plan.
- **Progress** (`?view=`), replacing the retired "view as client" layout (RM-20 / CO-20):
  - **Week:** seven real days — workout with the plan day's name, meals eaten of planned, cardio minutes; tap a day for its full log; previous weeks back to 8.
  - **Nutrition, Cardio, Photos:** the existing views.
  - **Body:** weight trend, plus measurements with the coach entry kept; compare now defaults to the latest two entries and includes custom parts (TB-05).
  - **Check-ins:** this coach's only.
  - Anchored notes on every view. `…/checkins` (a notification target) opens Check-ins.
- **Profile:** Assessment, Notes (author-private, B3.0.1), Package & billing, Coaching history (with archived stints), Contact (tel / mailto, LTR-isolated). The sections keep their URLs, with a "‹ Profile" way back.
- **Package actions** (CO-14-R / RM-26): one primary (Set term / Renew), Freeze / Unfreeze beside it, everything else in "More package actions" (Set price, Extend, **End package**, **Cancel package** — the terminal ones apart and confirmed).
- **Assessment** (CO-38, partial): on phones the review comes before the long answers, and Mark reviewed keeps a changed private note.
- **Switcher** (CO-06): the shared roster sources and Today's rules — a client is marked only when Today has work for them, and the row says why; switching keeps the section.
- **Old routes:** `…/view`, `…/view/:tab` redirect to the matching Progress view; every other workspace URL is unchanged. Semantic parents: editor → Plan, Profile section → Profile, check-ins → Progress, section → Summary, Summary → Clients.
- **Removed** after verifying importers: `CoachClientDetail.tsx`, `CoachViewLayout.tsx`; 22 strings they and the old tab rail used.
- **Lazy routes:** the layout and each section are lazy (the shell chunk shrank, §4).

### 2. API contract

| Procedure | Before | After |
|---|---|---|
| `checkIns.get / list / review / delete` (coach) | any check-in of an assigned client | only the coach's own (the key's week resolves to the coach's record) |
| `checkIns.list / get` (client) | every record, the week as the key | with `byKey` (this release): every record except a previous coach's open request, exact by key; a previous coach's open request read by key is flagged `closed`. Without `byKey` (older apps): one record per week — the current coach's, else the week's first (§8.1) |
| `checkIns.request` (coach) | B3.3: `CONFLICT CHECKIN_WEEK_TAKEN` when another coach held the week | a new record `week__coachId` of the coach's own; idempotent and race-safe; admin unchanged |
| `checkIns.submit` | the plain-week record | with `byKey`: the record named by the key. Without (older apps, their queued submissions): the week's single open request; `CONFLICT` `CHECKIN_AMBIGUOUS` / `CHECKIN_STALE` (also `data.reason`) instead of guessing; a client submission into a previous coach's open request is refused for every generation; the coach notice only when the record is the current coach's (§8.1) |
| `coachClients.transfer` (`keep`) | copied the previous coach's whole package to the new coach | carries the term only — the previous coach's price, plan name, billing cycle and note stay in their ended record (§8.1) |
| `coachClients.assign`, transfer accept | `$set` over an ended document (stale fields survived) | clean active document, previous stint in `previousStints`; compare-and-set |
| `coachClients.list` | — | summary view also leaves out `previousStints`; other coaches' records carry stint facts only |

No schema migration, no index change, no stored-data rewrite. Authorization unchanged everywhere except the narrowing above.

### 3. Tests

| Test | Proves |
|---|---|
| `api/_trpc/routers/b34CheckInOwnership.test.ts` (new, 10) | A → transfer → B requests week W as a distinct record; A's record byte-for-byte untouched; B can't read / review / delete A's (by week or by A's key); A can't read B's; 6 concurrent requests → one record (also for a first-time week); the client sees one actionable request (B's) and an old app's plain-week submit lands on B's, replayed idempotently; coach notice to B about B's record; A's reviewed week stays in the client's history and never reaches B (answers, photos, feedback); A returning sees only A's; legacy records before / after the relationship; admin full access, unrelated coach FORBIDDEN; B3-S13: assign back starts clean with the stint archived whole, A → B → A transfer, stint facts only to another coach, summary view without stints, racing assigns → one activation, slot returned |
| `b33Directory.test.ts` (updated) | B3.3's request test now asserts the B3.4 decision (own record, never A's; admin unchanged) |
| `_capReservation.test.ts` (updated) | the failed-relationship-write case now fails the compare-and-set `replaceOne` (was `updateOne`) — slot still returned |
| `src/lib/coachWorkspace.test.ts` (new, 8) | section of every URL (editors chrome-less), same place for another client, legacy view redirects, week stats (the client app's rule, 7 / 28-day windows, in-progress not counted), weight trend, week rows (unknown days are "—") |
| `navContract.test.tsx` (updated) | the new semantic parents and section navigation |
| `e2e3/specs/88-b3-workspace.spec.ts` (new, 13) | not-on-roster state; Summary numbers from fixture logs and a check-in reviewed in place (DB); sections replace history, cold deep links, old URLs; Plan → editor (one Back) → Plan; Progress week → day → back, body, check-ins; the transferred client (no previous-coach content in any response, own record created, coach B's untouched, timeline facts only); trial / paused / expired / frozen-account / incomplete-assessment; package actions; switcher; release; Arabic; axe EN + AR at 390 / 1440 on five pages; the 34-shot matrix |

**§T — spec changes forced by B3.4:**
- 20: Extend opens from "More package actions"; Release from the header More, confirmed via the dialog, landing on Clients;
- 23: the workspace tabs became sections; the editor has one Back (no workspace header), the shell rail is the second guarded exit, and leaving lands on Plan; a Profile section's cold Back goes to Profile.
- 87: the bulk weekly request now gives the hand-over client this coach's own record for the week (owner decision 4), so all eligible clients are asked; the previous coach's record is asserted untouched.

### 4. Verification (final code)

| Gate | Result |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 765 / 765 in 87 files** (B3.3: 747 in 85; +18) |
| Build | **PASS**. Entry 469.23 / 151.81 kB gzip (B3.3: 466.86 / 151.06; +0.75 kB gzip, the new strings). `CoachApp` **24.06 / 7.99** (B3.3: 35.43 / 11.31 — the workspace layout and sections are lazy). Workspace chunks: layout 8.47 / 3.35, Summary 10.85 / 3.40, Plan 4.00 / 1.49, Progress 28.74 / 8.40, Profile 4.21 / 1.80. `CoachClients` 41.83 / 11.99. `CoachToday` 17.16 / 5.90. `ClientApp` 39.02 / 12.27 (B3.3: 38.92 / 12.24 — the check-in id line, §1.2). Precache 184 entries |
| Full e2e3, all projects | **PASS — 290 passed + 1 skipped of 291** in 48.7 min on the final code (`e2e-out/b34-full-b`; the skip is the long-standing Google sign-in case). Count: B3.3's 278 + 13 (spec 88). An earlier full run had 283 passed + 1 skipped + 7 failed: six were one bug, arrows double-flipped in Arabic (visual QA W10, fixed); the seventh was spec 87 asserting the B3.3 behaviour that decision 4 replaced (updated, §T). The targeted re-run (44 / 45 at every width, 87, 88) gave 86 / 86 before the final full run |
| Spec 88 alone | 13 / 13 |
| Accessibility (axe WCAG 2.1 A / AA) | Summary, Plan, Progress, Profile, package actions × EN / AR × 390 / 1440 (20 scans): **0 violations** |
| PWA (final build) | manifest parsed, no shortcuts, 0 installability errors; SW, offline reload, offline banner, deferred update **PASS** (known baseline page error from the analytics path); signed-in offline boot **PASS** |
| Visual QA | 34 full-page shots, **0 px overflow, correct `dir`**; `B3_VISUAL_QA.md` §B3.4 |
| Physical devices | **Not run** |

### 5. Backlog outcome (B3.4-mapped items)

| Outcome | Items |
|---|---|
| **Fixed** | CO-06, CO-08, CO-09, CO-14-R, CO-20, CO-29, CO-40, RM-20, RM-26, RM-35, RM-43, CD-05, CD-07, VS-09, NAV-K08, NAV-K09, B3-S13, B33-R2, B33-R3 |
| **Mitigated** | CO-13, CO-38, TB-05, PF-22 (→ B3.9) · NAV-K02, NAV-K05, JR-08, PF-07 (→ B3.5) · VS-14 (→ B3.7) |
| **Moved** | B2-R03 → B3.9 (shared with the client app) · RM-83 → B5 (server data model) |
| **Unchanged** | OD-NOTES (owner decision) |
| **New** | B34-R1 legacy plans open "unsaved" in the editor (→ B3.5) · B34-R2 Progress reads 8 weeks of logs (→ B5) |

### 6. Known limits and risks

1. **Older app versions after the mid-week rule:** measured against the actual RC2 and B3.3 builds in the owner review — nothing misrouted or lost; the three things an older app can't do in a hand-over week are listed in §8.5 (B34-R4).
2. **Editors on legacy plans** report "Unsaved changes" as soon as they open (B34-R1, B3.5).
3. **Progress covers 8 weeks** from bounded log reads (B34-R2); older days show "—".
4. **Check-in history across a coach's own stints:** a coach who gets a client back sees their own earlier check-ins (they own them); never another coach's.
5. **Not built in B3.4:** an assessment highlights summary (CO-38), the per-client check-ins layout (CO-13), date-ranged logs.
6. **Carried:** the shared red pill (B33-R1) and check-in bidi (B32-R1) → B3.9; time-zone day boundaries (B33-R4) → B3.9; editor guards and draft behaviour (NAV-K02 / K05) → B3.5; physical-device certification and MD-01 / 02 / 03 remain release blockers.

### 7. Owner decisions requested (answered in §8)

1. Keep the client-app data-layer line (§1.2: the check-in id is the record's key) — the only client change in B3.4.
2. The `previousStints` archive (B3-S13): keep the whole earlier stint (term, prices, audit trail) on the relationship document, visible in full to that coach and to admins, and as facts only to other coaches?
3. Older-app compatibility (§6.1): acceptable until the PWA update reaches every device, or force an update before release?
4. OD-NOTES (still open from B0): may a coach share assessment feedback with the client?

**Environment:** drive C: is effectively full; every run used `D:\Gym\e2e-out\.tmp`.

**Status (before the review): B3.4 implemented and verified locally — not committed. Stopped for the owner's review; B3.5 not started.**

### 8. Owner review (2026-10-18) — compatibility and privacy gate

**Owner decisions:**
1. Check-in identity approved, with focused regression tests for same-week records of different owners.
2. Archived stints approved with privacy boundaries: a coach keeps their own commercial records; other coaches get timeline facts only; history never reopens a live workspace; admin audit preserved. No business-model change, no data migration.
3. Older-app compatibility is a **release gate**: a matrix against the actual previous builds; backward-compatible server preferred; never discard pending offline data, force a destructive reload or redirect a submission; no forced-update policy without separate approval.
4. Assessment feedback: product decision approved, implementation deferred to the backlog with a proposed milestone.
5. Close B3.4 in one local commit (owner edits preserved), then B3.5.

**8.1 What changed after the review**

*Server* (`api/_trpc/routers/clientCheckIns.ts`). Two client generations, told apart by `byKey` — sent by this release on `get`, `list` and `submit`, and recorded on the submissions it queues:
- **This release:** the key names the record exactly. The client's list holds every record except a previous coach's open request.
- **Older apps** (RC2, B3.3, and submissions they queued before updating) address a week:
  - they get one record per week: the current coach's when there is one, else the week's first, never a previous coach's open request — so the list, the screen and the submission name the same record;
  - a submission by week goes only to the week's **single open request**;
  - two open requests → refused (`CONFLICT`, `CHECKIN_AMBIGUOUS`); the only open one a previous coach's → refused (`CHECKIN_STALE`). Refused, never redirected;
  - a replay of an already delivered submission (same op id) is found first and returns it.
- **Every generation:** a client submission into a previous coach's open request is refused (`CHECKIN_STALE`). A `week__coachId` key (notification links) is exact for both.
- A client reading a previous coach's open request **by key** gets it flagged `closed` (nothing else changes).
- The refusals carry `error.data.reason` (`CommercialReason`, two new codes); the message is unchanged, so older apps show their usual error.

*Client:*
- `checkInApi`: `byKey: true` on `get` / `list`; `submit` sends it only when told. The outbox handler tells it for submissions queued by this release (payload `byKey: true`), never for ones queued by B3.3 — those are resolved the way B3.3 meant them.
- `CheckIn`: a closed request reads "This check-in has closed" — why, "Your answers are still saved on this device" with the saved answers read-only, and Open check-ins. No wizard, no leave guard; nothing moved, sent or discarded. A refusal with `CHECKIN_STALE` reloads into that state. 4 strings × EN / AR / AR-EG.
- `WeeklyCheckIn.id` documented as the record key; `closed?` added (client reads only).

*Privacy fix found by the new tests* (`api/coach-clients/_service.ts`): a transfer that keeps the term copied the previous coach's **price, plan name, billing cycle and package note** into the new coach's relationship. It now carries the term only (status, dates, freeze state); the previous coach's commercial details stay in their own ended record. **Visible change:** after such a transfer the new coach sets their own price.

**8.2 Same-week identity — verified**

| Concern | Mechanism | Test |
|---|---|---|
| Record vs calendar week | `_id = clientId__key`; key = week or `week__coachId`; `weekStart` stays the week | `checkInApi.test.tsx` (two records of one week: distinct ids, same week) |
| Drafts | `forma.checkinDraft.v1.<uid>.<key>` | `CheckIn.test.tsx` — the week's draft never fills or is overwritten by the second coach's record |
| Offline outbox | scope / dedupe `checkin:<key>`; `byKey` on this release's ops | `CheckIn.test.tsx` — two offline submissions stay two operations, each to its own record; an op without `byKey` is sent as its week |
| Cached state | React Query `['checkIn', uid, key]` | same |
| Notifications | `entityId` / route = key; resolved by key | `b34CompatPrivacy.test.ts` (B's resolved, A's not); `notificationTaxonomy.test.tsx` |
| Deep links | `/check-in/<key>`; old `/check-in/<week>` links | matrix S1, S2 (§8.4) |
| Retries | `submitOpId` replay before open-request resolution | `b34CompatPrivacy.test.ts`, `b34CheckInOwnership.test.ts`; matrix S1 (3 taps → 1 request) |
| Client history | keeps previous coaches' completed records | `b34CheckInOwnership.test.ts`; matrix S1 |
| Coach queries | ownership on every path | `b34CheckInOwnership.test.ts`, `b34CompatPrivacy.test.ts` |

**8.3 Archived stints — who sees what** (`b34CompatPrivacy.test.ts`)

| Viewer | Gets |
|---|---|
| Active coach | their relationship, archived stints in full (prices, audit trail) |
| Former coach (ended, transferred away) | their own records, read-only; the live client is closed — profile, workout logs, plan, notes, check-ins, assessment: `FORBIDDEN` |
| Re-assigned coach (a third coach) | no previous coach's price, private notes, private assessment note, check-ins, subscription history or invite code; the client's own assessment answers, yes |
| Suspended active coach | read-only access to their own records |
| Unrelated coach | `FORBIDDEN` |
| Admin | everything; reading a coach's private assessment note stays audited |

**8.4 Older clients — compatibility matrix.** `e2e3/pwa/b34-checkin-compat.mjs` runs the actual builds, each a production bundle with its own service worker, against one isolated stack with the new API:
- **RC2** `cf3a5d9` — the build live in production;
- **B3.3** `28035b6` — the first with drafts and the offline outbox;
- this build.

Result: **81 / 81 checks pass**, 0 page errors (`e2e-out/b34-compat-4/matrix.json`, screenshots alongside). Locally the Vercel analytics script is stubbed; without that it falls back to `index.html`, the known baseline error.

| Scenario | RC2 / B3.3 (older) | This build |
|---|---|---|
| S1 — A's week completed, B asks again | Home → `/check-in/W` opens B's request; history one row per week (B's); A's old link opens B's request; B's link opens B's; submit → **B's record**, A's reviewed record unchanged; 3 taps → 1 request | Home → `/check-in/W__B`; history both records; A's old link → A's reviewed summary with A's feedback; submit → B's |
| S2 — A's request left open, B's new | Home opens B's request; **submit by week refused** — both records untouched, error shown, answers kept (B3.3 also in its draft); B's notification link → submit lands on **B's** | Home → B's key; A's old link → closed notice; submit → B's |
| S3 — B3.3 submission queued offline, app updated before delivery | (a) same coach: the new build shows it queued and **delivers it itself** to A's record, by week as queued, once the kept backoff runs out (27 s); the draft cleared only then. (b) hand-over and B's request meanwhile: the new build **sends it and the server refuses it** — nothing written to either record; closed notice with the saved answers; Home shows B's request | — |
| S4 — B3.3 queued, B3.3 delivers after a hand-over | refused; A's record untouched; shown unsent with Retry / Edit answers; answers kept | — |
| S5 — B3.3 draft, app updated mid-check-in | (a) same coach: the new build reopens the check-in **with the draft**. (b) hand-over meanwhile: closed notice with the draft shown; nothing sent | — |
| S6 — RC2 mid-check-in, app updated | RC2 reloads into the new build when backgrounded (its existing rule); the check-in reopens and submits to A. Typed answers are not carried — RC2 never saved them, the same as any RC2 reload | — |
| S7 — no hand-over (baseline) | Home → `/check-in/W`, submit → A's record, coach notified once | same |

**8.5 What an older app can't do** (documented as B34-R4; no forced update):
1. **History in a hand-over week:** one record per week (the current coach's). The previous coach's completed record of that week reappears after the update.
2. **Two open requests in one week:** submitting from Home or history (by week) is refused with the app's generic error, and the answers stay. The new coach's notification link works, and after the update Home works.
3. **Answers written for the previous coach's request** (draft or queued) are never moved to the new request. After the update the closed notice shows them read-only, so they can be re-entered.

No server rule can do better without guessing which request the answers were meant for; the owner's rule is refusal over redirection. The previous coach's request notification stays in the client's feed and opens the closed notice.

**Update mechanism (proposal — nothing implemented):** both older builds already update themselves.
- RC2 checks every minute and on focus, and reloads into a new version when the app goes to the background.
- B3.3 and later show the update control and apply at a safe point (never mid-check-in).

So an installed app reaches this release at its next use. The restricted cases need a mid-week hand-over, a second request and an app not yet updated. **Proposed: no forced update.** If a guarantee is wanted, the safe option is a minimum-version refusal on check-in submission only, which older apps show as an error with the answers kept. It needs owner approval and is not built.

**8.6 Assessment feedback** → backlog **B34-R3** (P2, proposed **B5**: O-19 keeps new assessment-feedback features out of B3). The contract:
- private notes are never published or copied;
- a separate client-visible field or snapshot, published by an explicit coach action;
- server authorization and coach ownership; publication audited;
- clients read only published feedback;
- transfers expose no previous coach's private notes.

OD-NOTES is marked decided.

**8.7 Tests added or changed**

| Test | Proves |
|---|---|
| `api/_trpc/routers/b34CompatPrivacy.test.ts` (new, 8) | Both generations in the common hand-over (ids, lists, exact keys, idempotent retries); the double-open week (refused by week, both untouched, B's link works for both, B's notification resolved and A's not, A's link reads `closed`, `data.reason`); answers queued for A refused; no hand-over unchanged; stints (own in full, others facts); former coach: own records, no live data; third coach: no prices / notes / private assessment note / check-ins; unrelated, suspended, admin |
| `b34CheckInOwnership.test.ts` (updated) | client calls made by key, as this release makes them |
| `src/services/platform/checkInApi.test.tsx` (new, 4) | key-not-week ids; `byKey` on get / list; submit sends `byKey` only when told |
| `src/pages/CheckIn.test.tsx` (+5) | drafts per record; two offline submissions → two operations by key; a B3.3-queued op sent as its week; closed state (answers shown, no wizard, no guard, draft kept); refusal → closed, nothing left queued |
| `notificationTaxonomy.test.tsx` (+2 assertions) | a second coach's record's notification opens `/check-in/W__coachId` |
| `e2e3/specs/88-b3-workspace.spec.ts` (+1, now 14) | the transferred client opens the previous coach's left-open request: closed notice with the saved answers, EN + AR at 390, `dir`, no overflow, axe 0, B's record untouched |
| `e2e3/pwa/b34-checkin-compat.mjs` (new) | the matrix in §8.4 |

**8.8 Verification after the review**

| Gate | Result |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 782 / 782 in 89 files** (+17) |
| Build | **PASS**. Entry 469.52 / 151.90 kB gzip (+0.09 kB gzip, the closed-notice strings); `CheckIn` 13.25 / 4.31; `ClientApp` 39.02 / 12.27; `CoachApp` 24.06 / 7.99; precache 184 entries |
| Compatibility matrix (RC2 + B3.3 + this build) | **81 / 81** |
| PWA (final build) | manifest, installability, SW, offline reload, offline banner, deferred update into the new build **PASS** (the known analytics-path page error); signed-in offline boot **PASS** |
| Full e2e3, all projects | **290 passed + 1 skipped + 1 failed of 292** in 48.2 min (`e2e-out/b34-full-c`; B3.4's 291 + the new spec-88 test). The one failure was that new test: its fixture client had no client profile, so the client app opened first-run setup over the page (the closed notice itself had rendered — page snapshot). Fixed in the test (the client gets a profile for the run, removed afterwards); spec 88 re-run **14 / 14** (`e2e-out/b34-88-c`) |
| Physical devices | **Not run** |

**8.9 Backlog:**
- B33-R2, B33-R3 and B3-S13 cite the new evidence.
- **New:** B34-R3 assessment feedback (proposed B5) · B34-R4 older-app limits (Mitigated, release hardening, owner to confirm) · B34-R5 `messagesApi.test.ts` (B1.13) sits outside both Vitest projects and never runs (→ B3.6).
- OD-NOTES decided.

**Status: B3.4 closed after the owner review — committed locally (not pushed). B3.5 next.**

## B3.5 — Plan editors (2026-10-18)

**Owner brief (2026-10-18, with the B3.4 review):** Premium Plan Editors only.
1. Fix B34-R1 first: an older training plan must not open "unsaved"; normalise it for editing without writing anything; keep version history, drafts and compare-and-set.
2. Rebuild the training, nutrition and cardio editors for phones and a dense desktop.
3. Preserve every field: RIR, tempo, notes, sets / reps, nutrition instructions, cardio and step targets where supported.
4. Coach ownership with the client read-only; a failed load is never an empty plan; unsaved work protected (tabs, navigation, reload, browser Back, offline) as far as the architecture allows; version history and conflict resolution kept.
5. No unapproved schema change, silent migration or destructive save.
6. EN / AR / AR-EG, RTL, accessibility, 360–1440. B2 client, admin, marketing, auth and legal unchanged.

Stop for review: no commit, no B3.6, no push or deploy.

**Not changed:** no client-app screen, admin, marketing, auth / legal; the server, except one additive procedure added in the owner review (`coachTargets.update`, §8 — no schema, index or data change). Shared additions only: an `arrowDown` icon, the `typeLocalized` helper beside `applyLocalizedEdit` (unchanged), and a relative import in `lib/workoutPresets.ts`; the client bundle's `ClientApp` chunk is byte-identical. No production data touched; isolated fixtures only (`e2e-ed-` ids, removed after each run).

### 1. What changed

**1.1 B34-R1 — older plans open unchanged** (`src/lib/workoutPlanModel.ts`, `src/hooks/usePlanEditor.ts`).
- The B1 builder migrated days without `sections` the moment it opened (random section id, a localised title) and reported that as an edit: the plan read "Unsaved changes", a draft was written, every exit asked, and update installs waited.
- Now the editor works on a **normalised working copy taken before the baseline**: a flat day (`exerciseIds` only) or a `sections: []` day gets ONE implicit, untitled section whose id is derived from the day and encodes its stored shape. Opening changes nothing, twice the same.
- On save a day that is still in that shape is written back **exactly as stored** (no `sections` key / `sections: []`); a day the coach gives named sections is stored with them (sections stay in the data model, O-8).
- `usePlanEditor` gains `normalize` / `serialize` (applied to server data, drafts, saved responses and reloads), opens on a fresh read when a cached copy exists, reports a restored draft (`draftRestored`, with `revertToSaved`), and fails a save at once when offline instead of showing "Saving…" until reconnect. Load gate, `baseUpdatedAt` compare-and-set, overwrite re-read, version capture and per-coach drafts are unchanged (C1–C4).
- The same model runs the template editor.

**1.2 The editor frame** (`src/components/coach/editor/PlanEditorShell.tsx`, blueprint §6.4 shared rules).
- Phones: a full-screen task (its own layer above the shell header and tabs, like the client check-in). Tablet / desktop: a page in the shell.
- One header: the only Back, the title, the client's name, History, and a More menu.
- A bottom bar with the save state (`saving · changed elsewhere · offline — kept on this device · not saved · unsaved · saved · all saved`) and Save. It sits outside the scrolling body, so it never covers an input, and on phones it is lifted above the on-screen keyboard (`useKeyboardInset`, Visual Viewport API; elsewhere it keeps its place).
- Shared notices: changed elsewhere (load latest / keep mine), not saved, offline (Save disabled, "your changes are kept on this device"), restored draft (Discard).
- **History as a sheet** (`PlanHistorySheet.tsx`, RM-39): save with a note, the versions, restore. Restore asks first — and says unsaved edits will be discarded — then the editor reloads the restored plan (B3-S10). The old `…/versions/:kind` route is behind the plan gate (B3-C02) and goes back to its editor (NAV-K10).
- Before a plan exists the frame shows the B0 gate without any Save (C1); "No plan yet" adds **Start from a template** for training.

**1.3 Training** (`src/components/coach/editor/TrainingBuilder.tsx`, `ExerciseProgrammingSheet.tsx`; replaces `PlanBuilder.tsx`, deleted).
- Phones: two levels — the plan (name, template line, client context, days) and a day (title, focus, its exercises). The header Back steps from a day up to the plan. Desktop: the days as a tree on the left (the selected day's exercises listed under it), the selected day on the right as a dense table (exercise · sets × reps · rest · RIR · tempo · actions).
- Sections: a day with only its untitled section shows no header; named sections (title + type: warm-up, working, mobility, finisher…) are groups. Unknown stored types are shown as "Workout" and never rewritten.
- Rows: name, `sets × reps`, rest, RIR, tempo, a video mark; move up / down (through the whole day, crossing sections) and one options menu (move to section, duplicate, delete with confirmation). Days and sections move from their menus.
- **Programming sheet** (B3-C03 / O-10, CO-26-R): name, presets, working and warm-up sets, reps, rest, **RIR**, **tempo**, notes EN + AR, progression notes, video (link or upload). Library metadata (muscle, category, equipment, tags) is edited only in the Library. Applying changes only the fields the coach changed; the library link logic is kept (a synced-field edit turns automatic updates off and says so; Update / Reconnect).
- **Picker**: search, muscle and equipment filters, a media mark, "Recently used" (per coach, on this device), "Create a new exercise" as the last row; a library that fails to load is an error with Retry — not "your library is empty" (it was).
- Save as template from the More menu; it saves the stored shape.

**1.4 Nutrition** (`src/pages/coach/CoachNutritionEditor.tsx`, `src/lib/nutritionPlanModel.ts`).
- Targets first (kcal, protein, carbs, fat, water) with **planned vs target as four rows** (planned / target, signed difference; foods without macros counted as incomplete, never as 0 kcal).
- Meals collapsed to name · slot · foods · kcal (the first one open); open: bilingual label, slot as one select, foods with move up / down and a confirmed delete; meals move from their menu.
- One food sheet: your foods, the food database search, name EN + AR, quantity, macros, approved alternatives, custom foods. Applying keeps every untouched field — the alternatives snapshot changes only when the coach picks another group or none (a group deleted from the library keeps the snapshot the client already has; before, it was silently dropped).
- Supplements: name, dose EN + AR, timing EN + AR, move up / down, confirmed delete (it had none).
- **Notes for the client** and **Drinks** (`generalNotes`, `beverageNotes`, O-10): bilingual rows, add / move / delete; blank rows are not saved.
- Substitution policy as switches. Desktop: meals, supplements, notes left; targets, totals, policy right.
- Found and fixed: the meal label trimmed itself on every keystroke, so a typed space vanished ("Big b" → "Bigb"). Live fields now use `typeLocalized` (no trim); the plan is trimmed when saved.

**1.5 Cardio** (`src/pages/coach/CoachCardioEditor.tsx`, `src/services/platform/coachTargetsApi.ts`).
- Sessions (type, duration, frequency, notes) with move up / down and a confirmed delete; desktop keeps the session form beside the list.
- **Daily movement** (O-11, CO-19): steps per day and cardio minutes per day — the targets the client already sees. One Save: the plan through compare-and-set, then the changed targets through the server's per-field compare-and-set (`coachTargets.update`, owner review §8.1); both kept in local drafts (§8.2). A targets-only change does not create a plan version. A failed targets read disables only the targets.
- Session notes stay one text (the model and the client app store a string; a bilingual field is a data-model change — B35-R1).

**1.6 Templates** (`src/pages/coach/CoachWorkoutTemplateEditor.tsx`): the same builder and frame; the shared guard on every exit and a draft per coach and template (B3-C01); a failed load is an error, a missing template "not found" (it used to open a blank template that would save as a new one); Save and Back replace the editor in history (NAV-K04). Templates stay last-write-wins (O-13).

**1.7 Robustness**: each editor normalises missing lists, labels, names and doses in the working copy only (older / malformed stored data opens instead of crashing; nothing is invented or written until Save).

**1.8 Strings**: 107 keys in English and 119 in Arabic and Egyptian Arabic (all six Arabic plural forms); 15 keys the old builder used are removed; the cardio hint no longer promises a Targets screen. The client's own text in rows is isolated (`<bdi>`), so English names keep their place in Arabic rows.

### 2. Data and API contract

| | Before | After |
|---|---|---|
| Training plan read → editor | days without sections migrated on open (random id), plan "unsaved" | normalised copy before the baseline; nothing changes until Save |
| Training plan save | the migrated shape | days still in their stored shape written back exactly; named sections stored as sections; `exerciseIds` = sections flattened |
| Exercise edit | the B1 form (no RIR / tempo; muscle / category / tags editable here) | programming fields incl. RIR / tempo; untouched fields kept exactly |
| Food edit | the item rebuilt (a deleted group dropped its alternatives) | untouched fields kept; alternatives change only on a new choice |
| Daily targets | not settable by coaches | `coachTargets.update`: changed fields + the values they were edited from, one atomic compare-and-set (owner review §8.1) |
| Template open | failed load → blank template | error / not found |

No schema migration, no index change, no stored-data rewrite. Authorization unchanged (plans and targets: assigned coach / admin write, client read-only — `planSafety.test.ts`).

### 3. Tests

| Test | Proves |
|---|---|
| `src/lib/workoutPlanModel.test.ts` (new, 8) | flat / `sections: []` days round-trip byte-for-byte and deterministically; sectioned days pass through; unknown kinds; new days stay flat; named sections; moves cross sections; remove / duplicate keep `exerciseIds` in sync and ids stable; malformed data |
| `src/lib/nutritionPlanModel.test.ts` (new, 6) | real totals and incomplete foods; untouched food edits are identity; group change / none / deleted group; new food; blank notes; malformed plans |
| `src/pages/coach/CoachWorkoutEditor.test.tsx` (+5, now 8) | B34-R1 (opens clean, no guard, a name-only save keeps the days and exercises); RIR / tempo applied with every other field kept; phones: Back steps up a level; restored draft + Discard; offline: Save disabled, bar says kept |
| `src/pages/coach/CoachNutritionEditor.test.tsx` (new, 4) | opens clean with four total rows; untouched food apply is a no-op; bilingual label / dose / notes, reorder, every other field saved as it was; typed spaces kept; blank notes and confirmed supplement delete |
| `src/pages/coach/CoachCardioEditor.test.tsx` (new, 2) | targets-only change saves the targets, not a plan version; sessions reorder and keep their fields; a failed targets read never blocks the plan |
| `src/services/platform/coachTargetsApi.test.tsx` (new, 3) | only changed fields are sent, with their edited-from values; the conflict refusal is recognised; reads (owner review) |
| `src/hooks/useKeyboardInset.test.tsx` (new, 2) | the inset the on-screen keyboard covers (scrolled or not); 0 when closed, for browser-chrome jitter, or without the Visual Viewport API |
| `e2e3/specs/89-b3-editors.spec.ts` (new, 12) | the B34-R1 plan in the browser (DB untouched); training round-trip in the DB (sections, order, RIR / tempo / notes AR / progression, untouched exercise and day byte-for-byte, `weeklyVolume`, meta); phones full-screen task + Back; nutrition round-trip; cardio + targets merge + client notified; reload / offline / browser Back with drafts; History (note, restore with unsaved edits); no plan yet + picker; templates (not found, guard, history replace); Arabic; axe EN + AR × 390 / 1440 on the three editors and two sheets; the visual matrix |

**§T — spec changes forced by B3.5:**
- 22: the day shows its sections directly (no section level) — `openSection` asserts the section instead of clicking into it; exercise rows are opened by `builder-exercise-open` (the row's move / options buttons are named after the exercise too); the video mark is `ex-row-video` (was the 🎬 character).

### 4. Verification (before the owner review — final results in §8.4)

| Gate | Result |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 812 / 812 in 95 files** (B3.4: 782 in 89; +30; final run after the last fixes). One earlier full run reported a teardown error in `coachAssets.test.ts` with every test passing; it passed alone (23 / 23) and in the next full run |
| Build | **PASS**. Entry 472.99 / 152.95 kB gzip (B3.4: 469.52 / 151.90; +1.05 kB gzip — the new strings). `ClientApp` 39.02 / 12.27 (byte-identical). `CoachApp` 24.24 / 8.05. Editor chunks (lazy): `TrainingBuilder` 26.86 / 7.98, `CoachNutritionEditor` 25.13 / 7.31, `CoachCardioEditor` 10.79 / 3.85, `CoachWorkoutEditor` 5.59 / 2.46, `CoachWorkoutTemplateEditor` 4.34 / 2.02, `PlanHistorySheet` 3.97 / 1.68. Precache 186 entries |
| Full e2e3, all projects | **PASS — 303 passed + 1 skipped of 304** in 51.8 min (`e2e-out/b35-full-a`; the skip is the long-standing Google sign-in case). Count: B3.4's 292 + spec 89 (12). Before it: the editor-related specs 20 / 22 / 23 / 43 / 61 / 85 / 88 — 62 / 62 on the rebuild |
| Spec 89 alone | 12 / 12 (`e2e-out/b35-89-d`, after the last visual fix E5 — a select's padding, CSS only) |
| Accessibility (axe WCAG 2.1 A / AA) | training, programming sheet, nutrition, food sheet, cardio × EN / AR × 390 / 1440 (20 scans): **0 violations** |
| PWA (production build) | manifest, installability, SW, offline reload, offline banner, deferred update into the new build **PASS** (the known analytics-path page error); signed-in offline boot **PASS** |
| Visual QA | 39 full-page shots, **0 px overflow, correct `dir`**; `B3_VISUAL_QA.md` §B3.5 |
| Physical devices | **Not run** |

### 5. Backlog outcome (B3.5-mapped items)

| Outcome | Items |
|---|---|
| **Fixed** | B34-R1, CO-25, CO-10, JR-07, CO-12, TB-03, DT-04, B3-C01, B3-C02, B3-C03, B3-C05, B3-S10, RM-39, NAV-K02, NAV-K04, NAV-K05, NAV-K10, TS-05, CO-41, JR-08 |
| **Mitigated** | B3-C04 (cardio notes → B35-R1) · CO-19, RM-67, PF-07, PF-12, RTL-06, RTL-10, CD-08 (→ B3.9) · CO-39, CO-26-R, IA-K07 (→ B3.7) · NAV-K06, RM-11 (→ B5) |
| **Moved** | TS-04 → B3.7 (library sync) · RM-88 → B5 |
| **New** | B35-R1 bilingual cardio notes (approved, B5) · B35-R2 targets without CAS, B35-R3 target edits not drafted (both fixed in the owner review, §8) · B35-R4 old migration drafts restore once |

### 6. Known limits and risks

1. **Browser / hardware Back** is not blocked (BrowserRouter; levels and sheets are not history entries — NAV-K06). Work is never lost: the draft is restored with a notice on return.
2. **Daily targets** — fixed in the owner review (§8): per-field compare-and-set and local drafts.
3. **Cardio notes** stay one language until B5 (B35-R1, approved).
4. **The keyboard lift** uses the Visual Viewport API; it is verified by unit logic and layout, not on physical devices.
5. **Old drafts** from the previous builder's migration restore once as unsaved (with Discard) — B35-R4; a clean launch has none.
6. **Templates** stay last-write-wins (O-13).
7. **Physical devices**, screen readers beyond axe, and very large plans (hundreds of exercises in a day) are not covered.

### 7. Owner decisions requested (answered in §8)

1. B35-R1: make cardio session notes bilingual (a data-model change touching the client Cardio screen) — now, later, or not?
2. The visible changes for review: older plans open clean; the programming sheet no longer edits library metadata (CO-26-R); daily steps / cardio minutes are set in the cardio editor and the client is notified when they change; nutrition meals start collapsed (the first open).

**Status (before the review): B3.5 implemented and verified locally — not committed. Stopped for the owner's review; B3.6 not started.**

### 8. Owner review (2026-10-19) — data-integrity fixes before the commit

**Owner decisions:**
1. **B35-R1, bilingual cardio notes:** yes, deferred to **B5** (model, API and the client's Cardio screen together). The notes behave as before in B3.5.
2. **The exercise sheet:** approved — canonical library metadata is edited only in the Library; a coach's programming and notes stay editable in the plan.
3. **Nutrition meals collapsed, the first open:** approved; keyboard access, focus and screen-reader labels kept.
4. **Browser Back:** accepted for now, provided drafts restore reliably and the coach is told; the missing guard (NAV-K06) stays in the backlog.
5. **B35-R2 and B35-R3** had to be fixed before the commit.

**8.1 B35-R2 — daily-target concurrency.**
- *What exists:* one `coachTargets` document per client (water, steps, cardio minutes, calories, protein); the client app reads it (`clientSync`). Writers: `coachTargets.set` (whole-document replace, no concurrency check; no client build calls it — RC2 and B3.3 only read targets) and a fresh-start transfer (archives the document, then deletes it).
- *Change — the smallest backward-compatible server change:* a new procedure, **`coachTargets.update`**: a **per-field compare-and-set**. The editor sends only the fields it changed and, for each, the value it had when the edit started. The server applies them in ONE atomic `findOneAndUpdate` filtered on those values. On a mismatch nothing is written: `CONFLICT`, reason `TARGETS_CONFLICT`.
  - Fields not in the change are never touched, and a change to them (water, calories, protein) never conflicts — no document-wide conflicts for unrelated data.
  - Created only when the editor expected every changed field to be unset and there is no document; two editors creating at once → one wins, the other conflicts.
  - Same authorization as `set` (`canWriteCoachOwned`: the client's assigned active coach, or `clients.writeAll`), the same client notice. Targets writes were never audited; that is unchanged. No schema, index or data change. `set` is kept unchanged for compatibility.
- *Detected:* another tab or device, a write through `set`, and a fresh-start transfer clearing the targets.
- *In the cardio editor:* "The daily targets changed somewhere else" with a table of **yours** vs **saved now**, then **Keep mine** (retries from the saved values — still compare-and-set) or **Use the saved ones**. The bar says "Not saved — changed elsewhere". The edits and their draft stay until resolved.

**8.2 B35-R3 — daily targets in the draft (and drafts made before a change elsewhere).**
- Target edits have their own draft beside the plan's: `targetsDraft:<coach>:<client>`, holding the values and the values they were edited from (`useDailyTargetsEditor`).
- It is written on every change and survives navigation, reload, browser Back and offline. It is cleared only by a successful save, "Use the saved ones", "Discard them", or a confirmed "Leave" — **never by a failed or conflicted save**.
- A restored draft is announced. When the server changed since, the notice says so and saving is checked against the old values (a conflict) — **newer data is never overwritten automatically**.
- **Plan drafts follow the same rule now.** A draft records the revision it was edited from (`{ v: 2, plan, base }`). Before, a draft older than the server copy was ignored and later overwritten — the coach's work was silently lost. Now it is restored on its own base and announced as stale; saving it hits the plan's compare-and-set (keep mine / load latest). Drafts written before this change (a bare plan) are still read — not migrated, not deleted. Contract C3 is refined accordingly.
- Keys are per coach and per client: no cross-client or cross-account leakage.
- Templates (no compare-and-set, O-13) keep the previous rule: a draft older than the saved template is not restored.

**8.3 Tests added in the review**

| Test | Proves |
|---|---|
| `api/_trpc/routers/b35TargetsConcurrency.test.ts` (new, 6) | create only when unset (the second creator conflicts); two tabs from the same values → exactly one save lands, the other `TARGETS_CONFLICT`, and the loser can retry from the new values; a water change meanwhile never conflicts and untouched targets are kept; clearing one target; the client notice; targets cleared by a fresh-start transfer → conflict, nothing recreated; a `set` write is detected; authorization (client, unrelated coach refused; admin allowed) and bad input |
| `src/pages/coach/CoachCardioEditor.test.tsx` (now 8) | only changed fields sent, with their edited-from values; conflict panel (mine vs saved) keeps the draft, Keep mine retries from the saved values; Use the saved ones drops the draft; a failed save keeps it; leaving and returning restores it; a draft made before a change is stale — Save conflicts, Discard returns to the saved values; drafts are per client and coach |
| `src/pages/coach/CoachWorkoutEditor.test.tsx` (now 12) | a plan draft made before a change is restored on its own base, announced as stale, Save is refused (conflict) and the draft stays; an older bare-plan draft is still read; Discard bases the next save on the current revision; no cross-client / cross-coach draft |
| `e2e3/specs/89-b3-editors.spec.ts` (now 15) | two coach tabs on the targets (conflict shown with both values, DB never overwritten, keep mine / use the saved ones, water untouched); target drafts through reload, browser Back and offline, cleared on save, Discard; a plan draft made before another tab saved → stale, conflict, keep mine, the other version kept in History |

**8.4 Verification (final code)**

| Gate | Result |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 828 / 828 in 96 files** (before the review: 812 in 95; +16 — targets concurrency 6, cardio editor +6, workout editor +4) |
| Build | **PASS**. Entry 473.50 / 153.13 kB gzip (B3.4: 469.52 / 151.90). `ClientApp` 39.02 / 12.27 (same size as B3.4). `CoachApp` 24.24 / 8.05. Editors (lazy): `TrainingBuilder` 26.88 / 7.99, `CoachNutritionEditor` 25.15 / 7.32, `CoachCardioEditor` 14.24 / 4.92, `CoachWorkoutEditor` 5.61 / 2.47, `CoachWorkoutTemplateEditor` 4.47 / 2.08, `PlanHistorySheet` 3.97 / 1.68. Precache 186 entries |
| Full e2e3, all projects | **PASS — 306 passed + 1 skipped of 307** in 49.7 min (`e2e-out/b35r-full-a`; the skip is the long-standing Google sign-in case). Count: B3.4's 292 + spec 89 (15) |
| Spec 89 after the last test was added | **16 / 16** (`e2e-out/b35r-89-b`) — adds the targets conflict panel and the stale-draft notice, EN + AR at 390, axe 0 |
| Focused | concurrency: two tabs, `set` writes, transfer clearing, creates (API 6 + e2e); drafts: reload, browser Back, offline, discard, stale, per client / coach (unit 12 + e2e 3); legacy plans (unit + e2e B34-R1, unchanged) |
| Accessibility (axe WCAG 2.1 A / AA) | the editors and sheets × EN / AR × 390 / 1440 (20 scans) + the targets conflict panel with the stale notice × EN / AR at 390 (2 scans): **0 violations** |
| Visual QA | 39 matrix shots, 0 px overflow, correct `dir` (unchanged layouts); the conflict panel and stale notice reviewed EN 1440 / AR 390; `B3_VISUAL_QA.md` §B3.5 |
| PWA (production build) | manifest, installability, SW, offline reload, offline banner, deferred update **PASS** (the known analytics-path page error); signed-in offline boot **PASS** |
| Physical devices | **Not run** |

The stale-draft notice was worded more generally after the full run ("the saved version changed" — it covers targets too); a string-only change, unit suite re-run 828 / 828.

**8.5 Backlog:**
- B35-R2 and B35-R3 → **Fixed**.
- B35-R1 → approved **B5** enhancement.
- NAV-K06 (browser / hardware Back) stays **Mitigated** and visible (B5).
- New **B35-R5**: retire `coachTargets.set` (no caller left) once no older build can run — B5.

**8.6 Remaining limitations:**
1. Browser / hardware Back is not blocked (NAV-K06); drafts restore with a notice.
2. Cardio session notes stay one language until B5 (B35-R1).
3. Templates stay last-write-wins (O-13).
4. The keyboard lift and everything else are not verified on physical devices.
5. `coachTargets.set` remains, unconditional, for compatibility (no caller; B35-R5).

**Status: B3.5 closed after the owner review — committed locally (not pushed). B3.6 not started.**
