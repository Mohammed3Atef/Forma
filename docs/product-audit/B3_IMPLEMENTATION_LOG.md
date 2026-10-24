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

## B3.6 — Coach Messages (2026-10-19)

> **Authoritative result: §9.7** — certified green on the exact final tree (full e2e3 327 passed / 0 failed / 0 flaky / 1 approved skip of 328; unit + API 875 / 875) and committed locally by the owner as `8450dd8` on 2026-10-20 (not pushed). §4 and §9.6 are earlier runs, kept as history.

**Owner brief (2026-10-19, after the B3.5 commit 1588321):** Messages only — a premium coach inbox → conversation → reply → back to the inbox, built for 30+ active conversations, on the existing engine. Protected: server-side authorization and relationship checks, coach-scoped history (R-4 Option C), the client's read-only earlier conversations, no send to an ended / transferred / unauthorized relationship, suspended accounts read-only (O-17), the durable outbox and idempotent sends, no cross-account leakage, honest offline / upload states, unread counts and notification links, no duplicate polling. A message queued before a transfer must not be redirected. MD-01 / 02 / 03 stay launch blockers: no new public-URL path, no optimistic upload success. No client-app, website, auth / legal, admin, editor or subscription redesign; no second messaging state machine. Stop for review: no commit, no B3.7, no push or deploy.

**Not changed:** the messaging router's contracts (one verified bug fixed, §2), the outbox and its `message.send` handler, idempotency, the 5 s thread poll and the shared 20 s summary poll (no new poller), media upload paths and URLs, the client app's screens. The client's `Messages` page passes nothing new to the shared engine, so its presentation is unchanged; it does get the engine's correctness fixes (§1.4). No production data touched; isolated fixtures only (`e2e-msg-` ids, removed after each run).

### 1. What changed

**1.1 One Messages screen; the selection is the URL** (`src/pages/coach/CoachMessages.tsx`, DT-01).
- `/coach/messages` and `/coach/messages/:clientId` are the same screen. The old standalone thread page (`CoachMessageThread.tsx`) is gone.
- **≥ 768 px:** the inbox and the conversation side by side, sized from their real top edge to the viewport bottom (`useFillToBottomNav`), so a banner above never pushes the composer away (C12). Selecting another conversation **replaces** the history entry (switching is not a history trail); the first selection from the bare inbox pushes. A reload, a deep link or a notification opens the same conversation selected.
- **Phones:** the inbox, or the conversation as a **full-screen task** above the shell (own header and Back, no tab bar, ending at the top of the on-screen keyboard, one bottom safe area — MS-01 / MS-03). Back goes where you came from (history), from a cold link to the inbox.
- The shell's "don't toast the open conversation" rule now also holds on the split view (the path is the conversation's).

**1.2 Inbox** (`src/lib/coachInbox.ts`, `src/pages/coach/messages/InboxList.tsx`, `src/hooks/useCoachInbox.ts`; MS-09, CO-27).
- One row per active client, **newest conversation first** (then clients without messages, by name), from the roster and the shared thread summary — no request of its own on a timer.
- The name the coach knows them by (the Clients directory's rule, assessment name when the account name is the e-mail).
- Previews: the text, **"You: …"** for the coach's own last message, **"Message deleted"**, the media kind (photo / video / voice / file), the broadcast type. Time: today's time, Yesterday, a weekday this week, a date (with the year when not this year).
- Unread count per row (real number for screen readers, "99+" visually), a total in the header ("3 unread conversations" / "All read").
- **Search** by name or e-mail; **All · Unread** (the Broadcasts filter is gone, blueprint §6.5). The open conversation never disappears because of a filter or a search.
- Honest states: loading skeleton; the roster failing is an error with Retry (never "No clients"); the summary failing says "Couldn't refresh conversations — showing what was last loaded" (or "Couldn't load the latest messages" before the first answer) with Retry; no results / nothing unread each say so with Clear filters.
- Reading a conversation refreshes the unread badges at once (the summary is re-polled after a successful mark-read) instead of up to 20 s later.

**1.3 The conversation** (`src/pages/coach/messages/CoachThreadPane.tsx`; the engine in its coach presentation).
- Header: the recipient always named (avatar, name), then package and account state, last workout and this week's check-in — the Clients directory's own values (MS-04). No presence, typing, "online" or delivery signals: none exist.
- Quick actions: **Open client**, and **Request this week's check-in** when the client is eligible (the same rule and call as the workspace).
- **NAV-K07:** Open client returns to the workspace the conversation was opened from (history pops), and the workspace's Message returns to the conversation it came from; otherwise each pushes once.
- A client who is not (or no longer) on the roster: "This conversation isn't available" — nothing of the thread is fetched or shown, no composer, no actions.
- If the relationship ends **while the conversation is open** (released / transferred), the server's refusal is detected on the next poll: polling stops (no endless 403s), everything on screen is dropped, the composer goes, the state says why, and the inbox drops the row.

**1.4 The engine** (`src/components/MessageThread.tsx`). One engine for both apps (C11); everything coach-only is behind `variant="coach"`, which only the coach passes.
- *Coach presentation:*
  - **Unread divider (MS-05):** "N new messages" before the first unread, fixed for the visit. The conversation opens there when the unread run is taller than the screen, otherwise at the bottom.
  - **Read on view:** the coach marks the conversation read only once its newest message has been on screen (at the bottom, or on scrolling there) — not on open. (`markRead` still marks the whole conversation — B36-R2.)
  - **Sent / Seen on the last own message only (MS-11)** — no invented "delivered".
  - **Message actions** revealed on hover or keyboard focus at ≥ 768 (MS-12); long-press on touch as before.
  - **Per-conversation draft (MS-07):** unsent text is kept per account + client (`messageDraft:<coach>:<client>` in the device store the plan drafts use), across switching, leaving, reload and a failed queue; never shown in another client's composer; cleared once the message is in the outbox. Text only (a picked attachment stays in the composer until Send).
  - Send icon; one bottom safe area and none above an open keyboard (Visual Viewport).
  - **Compact voice-note player (MS-08):** play / pause, seek, the length (found by seeking when Chrome's WebM carries none); a file this browser can't play says so and offers it to open — never a dead player.
  - A send refused because the client is no longer assigned says "Not sent — this client is no longer assigned to you." (it used to be a bare "Couldn't send"), with Delete only — a retry can never succeed.
  - Offline: a line above the composer says sends wait on this device and go out when back online (the outbox already queued them).
- *Both apps (correctness, no visual change unless stated):*
  - **4,000-character guard:** the server's limit; a counter appears near it and Send is off above it (the text is kept) — a longer message used to be queued and fail forever (MS-07).
  - **One send per tap** (a synchronous guard; the outbox id was already the idempotency key).
  - **Mark-read once per new message:** the `since` polls keep a stale `seenAt: null` copy until the next full refresh, so every 5 s tick sent another `markRead` (MS-06). Now once per newest unseen message (retried if it fails).
  - **Message actions are a real menu:** `menu` / `menuitem` / `menuitemradio` roles, arrow keys, Home / End; focus moves into the desktop menu and back to where it came from.
  - **Attachment links:** an address that is not a web URL is never rendered as a link, image or media source (§2). Videos load metadata only.
  - Day separators: Today, **Yesterday**, a short date, a date with the year (MS-16); "N new messages" is plural-aware (Arabic's six forms).
  - **Mixed direction:** a message's own text keeps its direction in its bubble, the composer and the edit box (`dir="auto"`) — an English sentence in an Arabic conversation read "?Is it ok…".
  - Screen readers hear who wrote each message ("You wrote:" / "Amira wrote:", visually hidden); the message list is a focusable, named region so it can be scrolled from the keyboard (axe `scrollable-region-focusable` on phones).

**1.5 Broadcast** (`src/pages/coach/messages/BroadcastSheet.tsx`, `sendBroadcast`; MS-10, B3-C08).
- From the Messages menu. The audience is explicit — **every active client** or the ones chosen in the sheet — and never the inbox's filter or search.
- Type (announcement / offer / reminder / update), message with the same 4,000 limit, a preview of the bubble, "Send to N clients" with a confirmation.
- One `messages.send` per recipient, at most four at a time, **each with its own idempotency key** (`bc_<batch>_<client>`) and this coach's conversation id — so a client transferred meanwhile is refused (never reached through a new coach), and **Retry failed** re-sends only to the failed recipients with the same keys: nobody gets two copies.
- Result: "Sent to 9 of 10 clients", the failed ones by name with why (no longer your client / your account isn't active / no connection / couldn't send). Online only (a direct send, not the outbox — B36-R5); the sheet can't be closed mid-send.

**1.6 Other**
- `CoachClientWorkspaceLayout`: the Message button (NAV-K07).
- Coach shell: the Messages unread badge uses an AA-contrast solid red (axe; the shared badge style is the later a11y pass's — the client's badge is unchanged).
- `src/services/platform/messagesApi.test.ts` → `.tsx` so Vitest runs it (B34-R5).

### 2. API contract

| Change | Why | Compatibility |
|---|---|---|
| `messages.send`: `attachment.url` must be an `http(s)` URL (`isWebUrl`) | **Verified bug (B36-R1):** any non-empty string was accepted and rendered as a link / media source — a hand-made request could plant e.g. a `javascript:` URL in a coach's conversation. The new test fails on the old router. | Real attachments are always the upload's https CDN URL; local stacks use http. Older rows with another scheme are not deleted — they render as "Attachment unavailable". |
| `messages.markRead`: a receipt is recorded only by the message's **addressee** (client ← coach / platform, coach ← client, admin: none) — certification §9.2 | **Verified bug (B36-R8):** "every message not from my role" let an admin's read mark the coach's messages Seen, and a coach's read mark an admin's message to the client seen. Two new tests fail on the old router. | No caller relied on it (no admin screen marks threads read); client and coach behaviour in their own conversations is unchanged |
| `markThreadSeen` (client service) resolves to the server's `updated` count | Refresh badges only when something was marked | Additive (callers that ignore it are unchanged) |
| `subscribeMessages` / `subscribeOpenThread`: optional `onForbidden` | A coach's thread access ended: stop polling, say so | Additive; without it a refusal is a failed tick as before (the client app) |
| `sendBroadcast` replaces `broadcast` (client service) | Per-recipient keys, conversation id, results | The server procedure is unchanged (`messages.send` already dedupes on `clientMsgId`) |

No schema, index, data, notification or media change. Authorization is unchanged — every screen state above is driven by the server's own answers.

### 3. Tests

| Test | Proves |
|---|---|
| `src/lib/coachInbox.test.ts` (new, 6) | newest-first order; previews ("You:", deleted, media, broadcast, loading vs none); search by name / e-mail; Unread; the open conversation kept under any filter; time and day labels; badge text |
| `src/components/MessageThread.coach.test.tsx` (new, 18) | divider + count, where the thread opens (fits → bottom + read; long → at the divider, unread until the newest is on screen); the divider stays; no repeated mark-read on poll ticks; badges told after a read; Sent / Seen on the last own message only; menu roles + keyboard; non-web attachment URL never rendered; drafts per conversation (leave, return, never in another client, cleared by Send); one send per double tap; the 4,000 guard; "no longer assigned" refusal text (no Retry); the offline line; the screen-reader sender label; access ended mid-visit hides everything; **the client presentation unchanged** |
| `src/services/platform/messagesApi.test.tsx` (was never run, now 8) | B1.13 one fetch path; FORBIDDEN stops polling and reports once; other failures keep retrying; without a handler a refusal is a failed tick; mark-read count; broadcast: one send per recipient with stable keys + conversation id; partial failure reasons; Retry reuses the keys; suspended coach |
| `api/_trpc/routers/b36Messaging.test.ts` (new, 6) | a coach's message queued before a transfer A → B is refused (also without a conversation id) and reaches nobody; B sees nothing; A loses read and summary; the client's queued message for A is CONVERSATION_CLOSED, not delivered to B; broadcast fan-out idempotent (retries, one notification each), transferred recipient refused; released relationship: read / send / react / mark-read refused; suspended coach reads and marks read, queued send refused ACCOUNT_NOT_ACTIVE; attachment URLs |
| `e2e3/specs/90-b3-messages.spec.ts` (new, 16) | the owner's twelve cases (§4) plus NAV-K07, broadcast, axe and the visual matrix |
| `e2e3/specs/91-b3-coach-thread.touch.spec.ts` (new; mobile-390, mobile-430, WebKit iPhone) | full-screen conversation, composer the hit target, tap to send, long-press menu, Back |
| Updated: 60 (C12 re-certified: split pane ≥ 768, full-screen on phones), 23 (messages history: split selection, Open client), `_d-layout` (the Back chevron is checked where a Back exists) | |

### 4. Verification (first full run — superseded by §9.7)

| Gate | Result |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 866 / 866 in 100 files** (B3.5: 828 in 96; +38 — inbox model 6, the engine's coach view 18, `messagesApi` 8 (one case existed but never ran — B34-R5), B3.6 API 6) |
| Build | **PASS**. Entry 476.45 / 153.99 kB gzip (B3.5: 473.50 / 153.13 — mostly the new English strings, which ship in the entry). `ClientApp` 39.02 / 12.28 (B3.5: 39.02 / 12.27 — no client-screen code changed). `CoachApp` 24.06 / 8.02 (24.24 / 8.05; the old thread page is gone). `CoachMessages` (page, inbox, conversation pane, broadcast; lazy) 22.21 / 7.34. The shared message-engine chunk (lazy, loaded with a conversation in either app) 44.11 / 14.46 (B3.4 / B3.5: 32.30 / 10.61). Precache 184 entries |
| Full e2e3, all projects (`e2e-out/b36-full-a`) | **318 passed, 8 failed, 1 skipped of 327** in 1.8 h. Count: B3.5's 308 + spec 90 (16) + spec 91 (3 projects). **One failure was real:** axe `scrollable-region-focusable` on the conversation at 390 — fixed (the message list is a focusable, named region). **Seven were environmental:** pages whose `load` never fired while an external Google Fonts request hung (40 file picker, 41 media list, 51 legal TOC, 86 axe + matrix, 87 URL filters + matrix — none a Messages screen; their traces show no app request outstanding) |
| Re-run of every failed spec + the engine's (`e2e-out/b36-rerun-a`) | **101 / 101** — 23, 31, 40, 41, 51, 86, 87, 90 (spec 90 16 / 16 incl. axe) |
| Re-run of every other spec that opens a conversation, after the last engine change | desktop (`b36-rerun-b`: 30, 44, 47, 80, 81, 85) **39 / 41** — the two failures were `net::ERR_NETWORK_IO_SUSPENDED` (the machine's network was suspended mid-test) in 81, re-run below; responsive + touch (`b36-rerun-c`: 32, 33, 45, 60, 91 on 1280 / 1024 / 768 / 430 / 390 / WebKit iPhone) **66 / 66** |
| Final code | **31 + 81 + 90: 30 / 31 in `e2e-out/b36-final-e2e` (81 passes again) — the visual matrix timed out with 14 app contexts left open while the machine ran about ten times slower than earlier; the test now closes each context after its iteration and passes together with the axe test (`e2e-out/b36-final-matrix-b`: 2 / 2, 34 shots)** |
| Focused | the owner's twelve cases: inbox loading / sorting / search / unread (90); phone inbox → conversation → Back (90, 91); split view + selection in the URL (90, 23); drafts across navigation and reload (90 + unit); failed send and retry without duplicates (90: offline queue + a lost answer → one row); long history and scroll (90 unread + jump pill; 31 load older); Arabic / mixed text (90 + matrix); attachments / voice notes incl. a failing provider (90, 31, 40); transfer with a queued message (90 + API); ended / suspended (90 + API); notification deep links (90); keyboard / safe area (90 emulated Visual Viewport, 60, 91) |
| Polling (C24) | spec 47 (2 min idle on a coach conversation) within its budget — no new poller: the inbox and the nav badge share the 20 s summary; a read re-polls it once |
| Accessibility (axe WCAG 2.1 A / AA) | inbox, conversation and broadcast × EN / AR × 390 / 1440 (12 scans): **0 violations** after the badge contrast and conversation-region fixes (`B3_VISUAL_QA.md` §B3.6 M3, M6); specs 85–89 unchanged |
| Visual QA | 34 matrix shots + 17 test shots, **0 px overflow, correct `dir`**; `B3_VISUAL_QA.md` §B3.6 |
| PWA (production build) | manifest, installability, SW, offline reload, offline banner, deferred update **PASS** (the known `_vercel/insights` page error); signed-in offline boot **PASS** |
| Physical devices | **Not run** (no device available here) — R-17 stays open |

### 5. Backlog outcome (B3.6-mapped items)

| Outcome | Items |
|---|---|
| **Fixed** | B3-C08, CO-27, DT-01, MS-09, MS-10, NAV-K07, B34-R5; new **B36-R1** (attachment URL) |
| **Mitigated** — the coach side done, the rest later | MS-03, MS-04, MS-05, MS-07, MS-08, MS-11, MS-12, MS-13, MS-16, AX-09 (B5: the client's conversation, in-thread events, media dimensions / in-app files / viewer Back, an "up to here" read) |
| **Still open** | R-17 — the physical-device check on the B3 build (release gate) |
| **New** | Fixed in B3.6: B36-R1 attachment URLs http(s) only · B36-R8 Sent / Seen recorded only for the addressee. Open, B5: B36-R2 read "up to here" (API) · B36-R3 summary unread with a missing `seenAt` · B36-R4 no rate limit on `messages.send` (P1, launch blocker) · B36-R5 broadcast durability · B36-R6 a lost-answer retry after the relationship ended · B36-R7 client conversation parity · B36-R9 third-party requests on every page · B36-R10 the request deadline ends at response headers |

### 6. Known limits and risks

1. **Physical devices not run** (R-17 stays open): the keyboard lift, safe areas and WebM playback on iOS are verified only in emulation (Chromium phone profiles, WebKit iPhone profile, an emulated Visual Viewport keyboard).
2. **Attachments still use public, permanent URLs** (MD-01 / 02 / 03, owner-deferred launch blockers). B3.6 adds no new path; private attachments need the approved media work.
3. Mark-read is whole-conversation (B36-R2): the coach view only delays it until the newest is on screen.
4. Broadcast is online-only and not durable (B36-R5, certification §9.3): at most one copy per client within one open broadcast; a send with no answer is "not confirmed" (it may have arrived); abandoning the sheet keeps no record. Not exactly-once.
5. The client app's conversation keeps its B2 presentation (B36-R7).
6. A coach retry after the relationship ended reads "Not sent" even if an earlier attempt was delivered with its answer lost (B36-R6, rare).
7. `messages.send` has no rate limit (B36-R4); summary unread misses rows without a `seenAt` field (B36-R3; none exist today).

### 7. Owner decisions requested (answered in §9.4)

1. **Client parity (B36-R7):** adopt the coach presentation in the client's conversation (status on the last message, divider, draft, actions on hover) in B5 — or keep the B2 behaviour?
2. **Read up to what was shown (B36-R2):** an additive `markRead({ upTo })` — approve for B5?
3. **Broadcast durability (B36-R5):** keep it online-only, or a server-side fan-out / outbox batch later?
4. **Rate limit on `messages.send` (B36-R4):** approve a per-sender limit (B5)?

**Status (before certification): B3.6 implemented and verified locally — not committed. Stopped for the owner's review; B3.7 not started.**

### 9. Final certification (2026-10-20)

**Owner brief:** B3.6 accepted in principle, not committed. Re-run the complete suite on the exact final tree and explain the earlier network failures (environment, external requests, service worker or code — no longer timeouts, blanket retries, skips or weaker assertions); audit Sent / Seen; verify broadcast idempotency (a timeout after the server accepted, partial success, retrying the failed, lost answers) and document anything not guaranteed in B36-R5; record decisions on B36-R2 / R4 / R5 / R7; keep the transfer / queued-message privacy regression permanently. No B3.7, push, deploy, production data or cleanup.

**9.1 Why full runs failed — root causes (per-trace network error codes).**

The failing tests' traces were re-read for the browser's own network error codes (`_failureText`), and the Windows System log was read for the same hours (local time, UTC+3).

| Failure | Error codes in its trace | Cause |
|---|---|---|
| 40 file picker, 41 admin media list, 86 Today axe (first full run) | `ERR_CONNECTION_CLOSED` on the **Google Fonts** stylesheet; the **Vercel Analytics debug script** (`va.vercel-scripts.com`) never finished | **External requests.** `index.html` loads a render-blocking Google Fonts stylesheet and the app loads the Vercel Analytics script, so every page of the "isolated" stack depends on the internet; a stalled stylesheet blocks the page's `load`, and an unfinished request blocks `networkidle` |
| 86 Today matrix (first run) | `ERR_NETWORK_CHANGED`, `ERR_INTERNET_DISCONNECTED`, `ERR_NAME_NOT_RESOLVED` (fonts) + 1 `ERR_INSUFFICIENT_RESOURCES` | **The Wi-Fi dropped:** "WLAN AutoConfig detected limited connectivity, attempting automatic recovery" at 21:18:22, inside that run |
| 87 Clients URL filters + matrix (first run); 30 nutrition, 30 measurements, 85 coach matrix, 86 Today matrix (certification run) | `ERR_INSUFFICIENT_RESOURCES` (1–12 per trace) on the dev server's module and API requests | **Browser resource exhaustion on this machine:** measured during the certification run, commit charge **32.7 of 35.9 GB (91 %)** with 2.1 GB of RAM free; C: is full, so the page file cannot grow; a desktop Chrome session (the owner's profile) started at 01:36, the minute of the first certification failure. The dev stack serves the app unbundled (≈ 680 module requests per page load), so a refused module leaves a blank page and an unfinished request blocks `networkidle` |
| 81 (follow-up run) | `ERR_NETWORK_IO_SUSPENDED` | **Modern Standby** 22:54–23:47 with the network disconnected by policy |
| 51 legal page TOC (first run) | none (only the benign blocked analytics script) | No network cause; a scroll-position timing assertion; passed on every re-run |

- *Ruled out:* the **service worker** — `devOptions.enabled` is `false`, so none runs in the e2e3 dev stack (only the production-build PWA checks use one); **application code** — no failure was on a Messages screen; the failing specs are not touched by B3.6 except through the shared shell; every failing test passed when re-run on a fresh stack; and the browser's own error codes name the cause in each trace.
- *Not hidden:* no assertion, timeout or retry was relaxed. Two harness changes were made: the fixtures attach the requests still open when a test fails (a trace records only completed requests — that is how the 175 s `sync.singletonGet` was found), and spec 90's matrix / axe tests close each app context after use. The certification run held a keep-awake request (no standby mid-run).
- *Real findings recorded:* **B36-R9** — the app and the "isolated" stack depend on Google Fonts and the Vercel Analytics script (self-host / stub; owner decision, B5). **B36-R10** — the tRPC client's 30 s deadline ends when response headers arrive, so a stalled response body has no deadline (the 175 s open request).

**9.2 Sent / Seen.**
- **Seen is the server's read receipt and nothing else.** The screen shows Seen only when the server's copy of the coach's message carries `seenAt`. Nothing on the device sets it: sending (the server stores `seenAt: null`), the outbox's server copy, an idempotent retry, the coach opening or reloading the conversation and the coach's own mark-read all leave it unset. The bubble re-renders when `seenAt` changes (the memo compares it).
- **Who records it:** the client, when the client's app opens the conversation (or opens it from a message notification) — `messages.markRead` by the reader.
- **Fixed during the audit (B36-R8):** `markRead` marked "every message not from my role", so an admin's read could mark the coach's messages Seen and a coach's read marked an admin's message to the client seen. Now only the **addressee** records a receipt (client ← coach / platform; coach ← client; admin: none). Two of the three new API tests failed on the old router.
- *Known lag, not a false claim:* receipts arrive with the conversation's full refresh (≤ 20 s), so Seen can appear up to 20 s late. Sent is never shown for something not stored, Seen never for something not read; there is no "delivered" state.
- *Tests:* `b36Messaging.test.ts` "read receipts mean the ADDRESSEE read it" (3); `MessageThread.coach.test.tsx` (+2: the coach's own open / mark-read and repeated polls never show Seen, only the server copy does; a just-sent message says Sent); e2e3 90 "Seen is the client's read receipt" (Sent after sending, after the coach reloads and a full refresh, database `seenAt` null; Seen only after the client opens the conversation).

**9.3 Broadcast — what is and isn't guaranteed.**
- **Guaranteed:** within ONE broadcast (the open sheet) a client is stored **at most once**. Every recipient has its own key (`bc_<batch>_<client>`), every Retry reuses it, and the server stores one message per client + sender + key (a unique index; concurrent duplicates return the winner).
- **Truthful results (changed in certification):** a refusal from the server (no longer your client, account not active, any other 4xx) means nothing was stored — "Not sent". **No usable answer** (connection lost, a timeout — the client gives up after 30 s — or a server / gateway error) means the copy **may** have been stored — "Not confirmed — it may have arrived", never "sent" and never "not sent". The summary counts them apart ("Sent to 7 of 10 · 2 not sent · 1 not confirmed"); Retry re-sends only to those, inside the same batch, and no longer says "failed".
- **Leaving mid-send now asks first** (reload / closing the tab), because the rest of the batch would be abandoned.
- **Not guaranteed (B36-R5):** exactly-once delivery; a durable result — closing the sheet, a reload or a crash keeps no record of the batch, and recipients not reached yet are simply not sent; a NEW broadcast is a new message, so re-composing after a "not confirmed" result can give that client a second copy; a server error after the copy was stored can lose that client's notification (the retry returns the stored copy without notifying again).
- *Tests:* `messagesApi.test.tsx` (refusals vs unknown for 400 / 401 / 409 / 500 / a timeout / an HTML gateway page; a timeout after the server stored both copies → unknown, and the retry stores nothing new); `BroadcastSheet.test.tsx` (new, 2: the three outcomes reported apart and Retry re-sending only the other two in the same batch; leaving mid-send asks); `b36Messaging.test.ts` (idempotent fan-out); e2e3 90 broadcast (a released recipient → "1 not sent"; then the answers lost after the server stored the copies → "Sent to 0 of 2 · 2 not confirmed" with one copy each in the database, Retry → "Sent to 2 of 2", still one copy each).

**9.4 Owner decisions (2026-10-20) — recorded; B3.6 scope unchanged.**
- **B36-R7:** approved for B5 — the client conversation gets matching premium quality, with a simpler UX than the coach's.
- **B36-R2:** approved for B5 — server-backed partial-read cursors with correct unread and notification semantics.
- **B36-R5:** broadcast stays online-only for now; durable recipient-level jobs approved for B5 with truthful partial / unknown results.
- **B36-R4:** server-side per-sender message and broadcast rate limiting is **required before public launch** (429 / Retry-After handled) — now release-blocking.
- **Permanent regression:** the coach-transfer queued-message privacy tests (`b36Messaging.test.ts`; e2e3 90 "transfer with a message queued before it") are part of contract C11 in `B3_COACH_BLUEPRINT.md`.

**9.5 Changes made during certification.**

| Change | Where |
|---|---|
| Read receipts only from the addressee (B36-R8) | `api/_trpc/routers/messages.ts` (`markRead`) + 3 API tests |
| Broadcast results: refused vs not confirmed, summary counts, a neutral Retry label, leaving mid-send asks | `messagesApi.ts` (`BroadcastFailure`), `BroadcastSheet.tsx`, en / ar / ar-eg; unit, component and e2e tests |
| Seen semantics pinned | `MessageThread.coach.test.tsx` (+2), e2e3 90 (+1 test) |
| Open requests attached to a failed test | `e2e3/fixtures.ts` (diagnostics only) |
| One live app context at a time in spec 90's matrix / axe tests | `e2e3/specs/90-b3-messages.spec.ts` |
| Backlog: B36-R2 / R4 / R5 / R7 decisions, B36-R8 (fixed), B36-R9 (new); blueprint C11 | backlog, `B3_COACH_BLUEPRINT.md` |

**9.6 First certification attempt (exact final tree) — not green; superseded by §9.7.**

| Gate | Result |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 875 / 875 in 101 files** (before certification 866 in 100: +3 read-receipt API tests, +2 broadcast unit cases, +2 engine Seen cases, +2 `BroadcastSheet` tests) |
| Build | **PASS.** Entry 476.73 / 154.07 kB gzip (B3.5: 473.50 / 153.13). `ClientApp` 39.02 / 12.27 — identical to B3.5. `CoachApp` 24.06 / 8.02. `CoachMessages` 22.78 / 7.51 (lazy). Message-engine chunk 44.11 / 14.46 (lazy; B3.5 32.30 / 10.61). Precache 184 entries |
| PWA (production build) | manifest, installability, SW, offline reload, offline banner, deferred update **PASS** (the known `_vercel/insights` page error); signed-in offline boot **PASS** |
| **Full e2e3, all projects, exact final tree** (`e2e-out/b36-cert-full`, 1.4 h, keep-awake held) | **NOT GREEN — 323 passed, 4 failed, 1 skipped of 328.** The skip is the approved Google sign-in case. Spec 90 **17 / 17** (incl. axe, the Seen receipt, the lost-answer broadcast, transfer privacy), spec 91 **3 / 3** (390 / 430 / WebKit iPhone), spec 60 10 / 10, 31 / 32 / 33 / 40 / 47 / 80 / 81 all green |
| The 4 failures (unresolved in the full run) | `30-client` "nutrition: mark meal eaten + food search … → reload → persists" (3.0 min timeout; `sync.singletonGet` open 175 s); `30-client` "measurements: save → reload → persist …" (blank page — modules refused); `85-b3-coach` "visual QA matrix" (10 min timeout); `86-b3-today` "visual QA matrix" (15 min timeout). None is a Messages screen. Every trace carries `net::ERR_INSUFFICIENT_RESOURCES` (12 / 10 / 4 / 4) — the browser refused requests under the machine's memory pressure (§9.1) |
| Diagnostic re-run of exactly those 4 (`e2e-out/b36-cert-diag`, fresh stack) | **4 / 4 passed** in 3.5 min — consistent with the environmental cause; it does **not** turn the full run green |
| Accessibility (axe WCAG 2.1 A / AA) | spec 90's axe test in the full run: inbox, conversation and broadcast × EN / AR × 390 / 1440 — **0 violations** |
| Physical devices | **Not run** — R-17 stays open |

**9.7 Second certification attempt (2026-10-20, owner: "one final full-suite attempt under stable machine conditions") — GREEN.**
- *Conditions, measured before starting* (nothing deleted, no system setting changed): the owner freed memory — free RAM 0.7 → **6.0 GB**, commit charge 81 % → **65 %**, C: 17.4 GB and D: 20 GB free, no desktop Chrome, the VM stopped; on mains power. The run held a keep-awake request (released at the end). A sampler logged memory every minute (`e2e-out/.tmp/b36-cert2-memory.csv`, 63 samples): free RAM 1.95–5.73 GB, commit peak 91 % (the dev server grows during a run), no desktop Chrome at any point.
- *Same tree, same suite, nothing relaxed* (assertions, retries, skips and timeouts as before; `playwright.e2e3.config.ts` unchanged).

| Gate | Result |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 875 / 875 in 101 files** — incl. read receipts (`b36Messaging.test.ts`, 9), broadcast idempotency (`messagesApi.test.tsx` 10, `BroadcastSheet.test.tsx` 2), engine (`MessageThread.coach.test.tsx` 20) |
| Build / PWA / offline boot | **PASS / PASS / PASS** (the known `_vercel/insights` page error) |
| **Full e2e3, all projects** (`e2e-out/b36-cert-full2`, 56.7 min) | **GREEN — 327 passed, 0 failed, 0 flaky, 1 skipped of 328.** The skip is the approved Google sign-in case |
| Messages specs | 90 **17 / 17** (incl. the transfer / queued-message privacy regression, the Seen receipt, the offline queue + lost-answer retry, the broadcast lost-answer case, axe, the visual matrix), 91 **3 / 3** (390 / 430 / WebKit iPhone), 31 11 / 11, 32 3 / 3, 33 5 / 5, 60 10 / 10, 23 9 / 9, 81 4 / 4, 47 3 / 3 |
| Diagnostics | no failure, so no `pending-requests.json`; the network audit of all 328 tests recorded **no** `ERR_INSUFFICIENT_RESOURCES` |

The earlier failures (§9.1, §9.6) are therefore attributed to the machine's state at the time (memory pressure with a desktop browser running, a Wi-Fi drop, standby), not to the code; their evidence stays in `e2e-out/b36-full-a`, `b36-cert-full` and `b36-cert-diag`. B36-R9 (third-party requests on every page) and B36-R10 (the request deadline ends at response headers) remain tracked.

**Status: B3.6 certified — full e2e3 suite green on the exact final tree (§9.7). Committed locally by the owner as `8450dd8` on 2026-10-20 (not pushed).**

---

## B3.7 — Coach Library (2026-10-20)

**Owner brief (2026-10-20, after the B3.6 commit `8450dd8`):** the Library — Programs · Exercises · Foods (swap groups inside) · Supplements; responsive search, filters, sorting, paging and an explicit Select mode; truthful media (a video only when it can play, attribution when present, "No demo yet" otherwise); an understandable first-run starter library; the Library → template sync result kept visible with Retry; ⌘K "New exercise / New food" opening the real forms; old routes and deep links kept; EN / AR / AR-EG, RTL, accessibility, offline, phones. No new media assets, paid APIs or third-party exercise content; nothing coupled to the current wger media format or the per-coach starter copy (a future owned "Forma 3D Exercise Library" replaces them in B4+). Stop before commit.

**Owner decisions (2026-10-20):**
1. **RM-27** — remove the template preview; templates open read-first in the existing editor with an explicit Edit; old URLs redirect.
2. **Use in a client plan (exercise)** — choose a client, then that client's existing training editor opens with the exercise added as an **unsaved** change (B3.5 save, draft and conflict handling; never a silent write).
3. **Foods** — the same flow into the client's nutrition editor; no nutrition templates.
4. **CO-26-R** — reorder the existing exercise form metadata-first; no new fields, schema or backend work.
5. **TB-08** — a small reusable table / list foundation for the Library only; no refactor of other screens; within the performance budget.
6. Still deferred: O-9 nutrition templates (B5), O-13 template conflicts, EX-07 global catalog (B4), PF-11 payload (B4), MD-01 / 02 / 03 media (launch blockers unchanged).
7. Apply the four B3.6 documentation corrections first — done: the §B3.6 authoritative pointer to §9.7, the §4 and §9.6 headings, the §5 "New" row, the final status line, and the blueprint status.

**Not changed:** the API (no router, schema, index or data change — the starter seeding, exercise sync, saves and bulk deletes are the existing procedures); the plan editors' save / compare-and-set / draft / conflict logic (the hand-off only edits the working plan); media upload paths and URLs; the client app (`ClientApp` chunk byte-identical in size to B3.6); the admin `DataTable`; nutrition templates. No production data touched; isolated fixtures only (`e2e-lib-` ids and a test-created coach, removed after each run).

### 1. What changed

**1.1 One Library, four segments** (`src/pages/coach/library/CoachLibrary.tsx`; rules in pure `src/lib/libraryModel.ts`).
- Segments **Programs · Exercises · Foods · Supplements** as in-page tabs (`components/ui/SectionTabs`: underline, widths follow the labels so none is cut, one tab stop with arrow keys — mirrored in right-to-left — and Home / End, a `tabpanel`); Foods has **Foods · Swap groups** as a quiet `SegmentedControl`. Programs opens first (the blueprint order) — which also means opening the Library no longer downloads the exercise list.
- Everything about a list is in the URL (`?tab`, `?view=groups`, `?q`, `?muscle`, `?equipment`, `?video=1`, `?goal`, `?sort`, `?dir`): a reload, Back from a program and deep links restore it; the old `?tab=groups` is rewritten to Foods › Swap groups. One-shot intents `?new=1` (⌘K, DT-08) and `?open=<id>` (⌘K search) are read once and removed.
- Each segment is its own lazy chunk; detail views, forms, swap groups, the client picker, the first-run panel and the sync notice load only when used (§4).
- Header: the title, one primary "New …" that follows the segment (program, exercise, food, swap group, supplement) and a menu with "Add the starter library" (always available — idempotent).
- Writes are disabled with the reason when the coach's Forma plan has lapsed or the device is offline (reading stays open); a template's own page is readable while lapsed.

**1.2 Lists (TB-04, TB-08)** — `components/library/LibraryCollection` (new, Library-only):
- desktop (≥ 1024) a table with **real column names**, sortable headers (`aria-sort`), column priority (low-priority columns fold below 1280 instead of scrolling sideways), the row name as its open button and a row menu (Use in a client plan · Edit · Duplicate · Delete); pages of 50;
- phones and tablets a list (name, one line of facts, the demo state) with "Show more" in steps of 30;
- **bulk actions only in Select mode** (`Select` → checkboxes; a tap selects instead of opening; Delete asks first and reports a partial failure honestly — it used to be silent);
- the search has its own full-width row; filters inline on desktop, one "Filter & sort" sheet on phones; a live count ("12 of 215"); an empty list shows no search or Select (nothing to search yet — the B3.3 rule); a failed load says so with Retry (never "empty"); offline without data says offline.

**1.3 Exercises** (`ExercisesSegment.tsx`): search by name, muscle (also its translated label), equipment and tags, Arabic spelled loosely (diacritics; alef, ya and ta-marbuta forms); filters muscle (labels in the UI language), equipment and **Has video**; sorts Exercise · Muscle · Equipment · Demo. Every item opens **read-first** (`ExerciseView`: the demo, metadata, the defaults a plan starts from, instructions in the reader's language, tags, the source) with **Use in a client plan**, Edit and Delete.

**1.4 Honest media (B0 rule, ready for an owned catalog)** — `src/lib/libraryMedia.ts` decides what an exercise can show; the screens never read `videoUrl` / `imageUrl` themselves:
- `video` only for a link Forma can play (YouTube, an https video file); a file in a codec this device can't decode is reported by the player;
- `image` when there is no playable video but an image;
- `none` → **"No demo yet"** (row, column and detail placeholder); a stored link that can't play (Drive, Vimeo, non-https) is flagged and explained, never offered as a video;
- attribution from a provider table (`wger` → "wger.de · CC BY-SA"); an unknown provider shows its name. A later owned catalog changes this module, not the screens.

**1.5 First run (CO-23, EX-08, EX-23)** — an empty segment shows one panel: what the starter library is (programs, about 900 exercises from the open wger database, common foods with swap groups, supplements), that **most exercises have no demo video yet**, that it is a copy the coach owns, and **Add the starter library** next to "New …". The confirmation and the result dialog are the same from every entry point; running it again only fills in what is missing (stable ids). The "900+ exercises (many with video)" copy is removed.

**1.6 Foods and swap groups** (`FoodsSegment.tsx`, `SwapGroupsView.tsx`): foods show in the reader's language (both are searched), open read-first (serving, macros, the other-language name) with **Use in a client plan**, Edit and Delete; the food form keeps the B1.8 bilingual rule (an English edit never overwrites a real Arabic name) and takes Arabic digits. Swap groups keep their data and saves; their form's foods are a searchable checklist with the picked ones first (it was a wall of chips); a group keeps its creation time on edit.

**1.7 Supplements** (`SupplementsSegment.tsx`): name, dose and timing in both languages (the Arabic is kept unless edited — the nutrition editor's rule, B3-C04); read-first, then Edit or Delete.

**1.8 Programs and templates read-first (RM-27, CO-39)** — `ProgramsSegment.tsx` lists the workout templates (goal filter; sorts Program · Goal · Days · Updated). The **Templates list and the preview page are removed**: `/coach/templates` redirects to Library › Programs; `/coach/templates/:id` is the template's editor screen in **read-first** mode (`TemplateReadView`: every day, named section and exercise with its programming and a video mark; older flat days are read the way the builder reads them) with an explicit **Edit**, **Use in a client plan** (the existing assign — the client's current plan is kept as a version), Duplicate (opens the copy) and Delete. Unsaved edits from an earlier visit are announced ("Continue editing"). Edit, Save and Back replace history, so Back from a program returns to the Library and never into the builder. `git grep --untracked "CoachTemplatePreview|CoachExerciseLibrary|LoadStarterLibraryButton|pages/coach/CoachTemplates|coach-template-preview" -- src e2e3 api` finds nothing.

**1.9 Use in a client plan (Journey I; owner decisions 2–3)** — `src/lib/libraryHandoff.ts`, `components/coach/ClientPickList`, `components/coach/editor/LibraryAddPrompt`, `hooks/useHandoffParam`:
- from an exercise or food: choose a client (the roster query Today, Clients and ⌘K share; loading and failure are explicit) → that client's **existing** training / nutrition editor opens (`?addExercise=` / `?addFood=`, read once and removed);
- once the plan has loaded, the editor asks **where**: a day (or one of its named sections) / a meal, or a new day / meal; Cancel adds nothing; an item that no longer exists says so and adds nothing;
- the item goes into the **working plan only** — "Unsaved changes", the draft, the guard, Save with compare-and-set and the conflict banner are the editor's own (B3.5); nothing is written until Save;
- the copy is exactly what the editors' own pickers make: an exercise via `pickFromLibrary` (a new plan id, `libraryExerciseId` with sync on, every field and both languages); a food via the food sheet's library pick (both languages, serving, macros; no library-only fields). Untouched days keep their stored shape.

**1.10 Template sync result (TS-04)** — a failed Library → template sync after an exercise save is a **persistent notice** on the Library (any segment, `role="alert"`), kept per coach on the device (`data/librarySyncIssues.ts`) and so still there after a reload; **Retry** re-saves the exercise as it is on the server now (the server's propagation is idempotent and re-asserts the current values) and clears on success; Dismiss is explicit. A successful sync keeps its single toast ("Saved · 2 templates updated").

**1.11 ⌘K (DT-08)** — "New exercise" / "New food" open the creation form itself; searched exercises and foods open read-first (`?open=`); programs open read-first.

**1.12 Exercise form (CO-26-R)** — the Library's form (also the picker's quick-create) is grouped metadata-first: **About the exercise** (name, muscle, equipment, category, tags) · **Demo** (video link / upload with the honesty check) · **Instructions** (EN / AR) · **Defaults when added to a plan** (presets, sets, reps, rest, progression). Same fields; numbers take Arabic digits (`NumericField`); the B1.8 rules (untouched fields kept exactly, no silent detach, the Arabic kept) are unchanged.

### 2. API contract

No change. Calls used: `coachAssets.*.list / get / save / delete` (exercises, foods, foodGroups, supplements, workoutTemplates), `seedStarterLibrary`, `assignWorkoutTemplate`, the coach's roster, and the plan editors' existing reads and compare-and-set saves.

### 3. Tests

| File | What it pins |
|---|---|
| `src/lib/libraryModel.test.ts` (new, 11) | the URL (Programs default, the old `?tab=groups`, defaults not written, unknown values fall back, a "most first" sort starts descending); search (case, Arabic diacritics / letter forms, the translated muscle label, tags, both food languages, group foods, supplement dose); filters combine; "Has video" excludes a Drive link; natural name sort; the demo sort; options |
| `src/lib/libraryMedia.test.ts` (new, 4) | video only when playable (YouTube, an https file; a `.MOV` is a video the player may report as undecodable); a link that can't play is image-or-none and flagged; https-only images; "Has video" and the demo sort use one rule; attribution for wger, an unknown provider, none |
| `src/lib/libraryHandoff.test.ts` (new, 7) | Journey I integrity: targets (a plain day once, a sectioned day per section); the added exercise equals `pickFromLibrary` (a new id, the library link, every field, both languages), `exerciseIds` in step, nothing duplicated, the input untouched, an untouched flat day stored flat; a named section / a new day; the editor URL; the food item equals the food sheet's library pick; a meal / a new meal; sync notices recorded once and cleared by a success |
| `src/pages/coach/library/CoachLibrary.test.tsx` (new, 12) | Programs first; the honest first-run panel (no "many with video"); `?tab=groups`; tabs (one tab stop, arrow keys, Home); a program row opens `/coach/templates/:id`; demo badges per row and the source credit; "Has video" in the URL and the count; real column names and `aria-sort`; bulk only in Select mode; **TS-04** (a failed sync → a persistent notice that survives leaving; Retry re-saves the server copy and clears it); `?new=1` and `?open=` consumed once; "Use in a client plan" → the client's editor URL, nothing saved; phones: 30, then Show more |
| `src/pages/coach/CoachWorkoutTemplateEditor.test.tsx` (new, 5) | read-first: every day, section and exercise with its programming, no inputs, no Save; Edit replaces into the builder; an earlier draft is announced ("Continue editing"); not found; a lapsed plan = readable, not editable; Duplicate opens the copy; Delete asks, then Library › Programs |
| `src/pages/coach/CoachWorkoutEditor.test.tsx` (+2) | `?addExercise=`: asks for the day, adds a library-linked copy as an unsaved change, Save sends it with the usual compare-and-set and the other day unchanged; a new day; Cancel; a missing exercise adds nothing and says so |
| `src/components/coach/AssignTemplate.test.tsx` (new, 4 — owner final pass, §8.1) | a program is assigned only after a confirmation that names the program and the client and says the current plan is kept as a version; Cancel saves nothing; Assign saves once with `replaceExisting` and a version reason; all three languages name both |
| `src/lib/nutritionPlanModel.test.ts` (+3 — B37-R2, §9.2) | a new meal's name in both languages, equal to the bundles' "Meal" strings; what counts as an untouched generated name; a typed name replaces it in both languages, never a real translation |
| `src/pages/coach/CoachNutritionEditor.test.tsx` (+2, and +7 for B37-R2 — §9.2) | `?addFood=`: asks for the meal, adds the food in both languages as an unsaved change, Save keeps every other item and the targets; a new meal; a missing food |
| `src/lib/navContract.test.tsx`, `src/config/coachNav.test.tsx` (changed) | `/coach/templates`, `/coach/templates/:id` and `/new` go up to `/coach/library?tab=programs` |
| `e2e3/specs/92-b3-library.spec.ts` (new, 15) | first run (a coach created by the test: the honest panel EN / AR at 360 / 390 / 1440, labels never cut, no search on an empty list, add, adding again duplicates nothing, then a full-width search at 360 / 1440); **TB-04** with 210 rows (headers, sort + `aria-sort`, pages of 50, equipment / video filters, a reload keeps the view, no overflow at 360 / 390 / 430 / 768 / 1024 / 1280 / 1440, Show more); media honesty (Video / Image / No demo yet, a Drive link explained and never a player, the source credit); **Journey I** for an exercise and a food (Library → client → where → unsaved → Save → the stored copy checked field by field: bilingual, linked, nothing duplicated, the other day unchanged; Back returns to the Library as it was left); **RM-27 / CO-39** (the redirect, read-first with the exercises of flat days, an explicit Edit, Save + Back never loop, a cold deep link, Use in a client plan, not found); **TS-04** (a forced failed-sync answer → a persistent notice with `role=alert`, still there after 6 s and a reload; Retry re-saves; the notice goes); **DT-08** (⌘K New exercise / New food open the forms; a searched exercise opens read-first); Select mode on a phone; swap groups inside Foods (the old URL, the checklist, the saved foods); **CO-26-R** (the group order; a default edited, every other field and the Arabic kept); offline + payload (Programs downloads no exercise list; Exercises once; writes off offline); Arabic 390 / 1440; axe (14 scans); the visual matrix |
| Specs changed (guarantees unchanged, §7) | 22, 40, 85, 89; owner final pass (§8): 10 (deterministic across rate-limit windows, stronger per-attempt and server checks), 51 (clicks after `load` + web fonts), 92 RM-27 (the assign confirmation and Cancel); B37-R2 (§9): 20 (the stored name of a meal added in the browser) |
| Harness | `e2e3/fixtures.ts`: `as()` also accepts `{ id, label }` — an account a spec inserted itself (the first-run coach) |

### 4. Verification (first certification — the final results are in §8.4)

| Gate | Result (the reviewed tree) |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 918 / 918 in 106 files** (B3.6: 875 in 101; +43: 39 in five new files, +2 training editor, +2 nutrition editor) |
| Build | **PASS.** Entry 480.43 / 155.20 kB gzip (B3.6: 476.73 / 154.07 — the new English strings ship in the entry, as in earlier phases). `ClientApp` 39.02 / 12.28 — identical to B3.6. `CoachApp` 23.78 / 8.01 (24.06 / 8.02). Library: shell 19.95 / 7.50 · Programs 5.83 / 2.37 · Exercises 11.28 / 4.26 · Foods 11.88 / 4.33 · Supplements 7.47 / 2.95 · Swap groups 8.80 / 3.38 · table / list 4.42 / 1.66; on demand: exercise detail 3.08, exercise form 6.51, client picker 3.23, first-run panel 2.38, sync notice 1.96. Template screen (read-first + builder) 11.33 / 4.21 (B3.6: editor 4.51 + preview page 6.02). Precache 197 entries |
| Budget (blueprint §9: Library 28.5 KB, each screen ≤ +20 % → 34.2 KB) | **Largest Library chunk 19.95 KB ✓** (B3.6: 28.37). A first visit with every Library chunk it needs: Programs 30.2 · Supplements 31.8 · Exercises 35.7 · Foods 36.2 KB raw (B3.6, any tab: 34.6 incl. the exercise form); gzip 11.5–13.5 KB (B3.6: 8.9) — §6.5. Library payload (PF-11): not worse — opening the Library (Programs) downloads no exercise list; Exercises downloads it once (spec 92) |
| PWA (production build) / signed-in offline boot | **PASS** (0 installability errors; the known `_vercel/insights` page error) / **PASS** |
| **Full e2e3, all projects** (`e2e-out/b37-cert-full2`, 2.2 h including a 56-minute standby) | **339 passed, 3 failed, 0 flaky, 1 skipped of 343** (B3.6's 328 + spec 92's 15). The skip is the approved Google sign-in case. **None of the three failures is a Library spec or B3.7 code** — below |
| The 3 failures | spec 10 "login rate limit" ran 21:29:50 → 21:30:15, across the limiter's fixed 15-minute window boundary at 21:30, so its 11 attempts were counted in two windows (a clock-dependent test — B37-R4); spec 90 "unread … divider" ran 22:20:38 → 22:21:07 and **the laptop entered Modern Standby at 22:20:47** (event log; Wi-Fi off 22:21 → 23:16, power unplugged); spec 51 "legal: TOC highlights the section in view" (22:01) — no network or page error in its trace, a scroll-observer timing check (B37-R5). No auth, messaging or website code changed in B3.7. **Root causes and fixes: §8.3** |
| Isolated re-run of specs 10, 51, 90 (`e2e-out/b37-cert-diag`) | **33 passed, 1 skipped, 0 failed** |
| Library and touched specs in the full run | **92 15 / 15**; 22 4 / 4; 40 15 / 15; 85 7 / 7; 89 16 / 16; 23 9 / 9; 46 11 / 11; 31 11 / 11; layout 9 / 9 at 1440 / 1280 / 1024 / 768 / 430 / 390; 47 3 / 3 (polling budget) |
| Accessibility (axe WCAG 2.1 A / AA) | spec 92: 14 scans — Programs, Exercises, an exercise detail and "Use in a client plan" × EN / AR × 390 / 1440, plus swap groups, the editor's "Add to which day?" prompt and a program read-first × EN / AR at 1440: **0 violations** |
| Visual QA | **85 matrix shots, 0 px overflow, correct `dir`** (`e2e-out/b37-cert-full2/b37-visual/`); `B3_VISUAL_QA.md` §B3.7 |
| Physical devices | **Not run** — R-17 stays open |

**The first certification attempt (`e2e-out/b37-cert-full`, 19:28 → 20:31) is not usable, for environmental reasons (evidence kept):**
- the laptop's power source changed at 19:46 (unplugged) and Wi-Fi was down from 19:46:51 to 20:08:32 (WLAN AutoConfig events 8003 / 8002 / 8001). With no network adapter connected Chrome reports "offline" even on loopback, so the app correctly disabled writes ("You're offline — reconnect to do this.") and paused its queries — 8 failures in specs 42, 43, 44, 46, 50 in that window;
- at 20:28 a disk cleanup on the machine removed Playwright's browsers from `AppData\Local\ms-playwright` (WebKit gone; Chromium's `icudtl.dat` and most of its files gone) and the session's scratch folder — the browser crashed and the remaining 110 tests failed at launch (`Executable doesn't exist`, `Invalid file descriptor to ICU data`). The owner approved reinstalling them (`npx playwright install chromium-headless-shell webkit`);
- its offline-boot step failed before testing (the helper's in-memory MongoDB did not start); it passed in the second attempt;
- one earlier failure (spec 31 "load older", 19:41, client conversation code untouched by B3.7) passed 11 / 11 in the second attempt.

During development, spec 92's visual matrix once stalled when the dev server stopped answering its own module requests for 13.5 minutes under memory pressure (0.8 GB free, 86 % commit); it passed alone (2 / 2) and in both full runs. Machine conditions throughout: 0.6–2.9 GB free RAM, 80–93 % commit, 28–41 desktop Chrome processes, a VM running, partly on battery.

### 5. Backlog outcome (B3.7-mapped items)

| Outcome | Items |
|---|---|
| **Fixed** | CO-23 · CO-26-R · CO-39 · DT-08 · EX-23 · RM-27 · TB-04 · TS-04 |
| **Mitigated** — the B3 part is done; the rest is named | EX-08 (the catalog available by default is EX-07, B4) · EX-15 (synonyms / Arabic aliases, a virtualised list, the payload — B4) · TB-08 (Packages adopt it in B3.8; the admin `DataTable` is unchanged on purpose) · VS-14 (one admin page keeps the pill tabs — B5) |
| **Unchanged, noted** | PF-11 (B4): not worse — opening the Library downloads no exercise list until Exercises is opened · EX-19 (B4): the coach Library now credits the source · JR-06 / CO-24 / EX-14 (B4) · MD-01 / 02 / 03 (launch blockers, untouched) · O-9 / O-13 / EX-07 (deferred) · B36-R4 (P1, launch blocker) and B36-R9 / R10 / R2 / R5 / R7 as recorded |
| **New** | B37-R1 a time-dependent server test assertion (P3, B5) · B37-R2 a generated new-meal label stored in `label.en` (P3, B5) · B37-R3 template-sync notices are per device (P3, B5) · B37-R4 the login rate-limit e2e test depends on the clock (P3, B5) · B37-R5 the website TOC e2e test is timing-sensitive (P3, B5). **Final pass (§8):** B37-R4 fixed in the test; B37-R5 reclassified — a real website defect (stale contents highlight after a layout shift), deferred to B5 by the owner. **Before the commit (§9):** B37-R2 fixed |

### 6. Known limits and risks

1. **Template-sync failures in the browser test are simulated**: the e2e stack cannot make the server's propagation fail, so spec 92 rewrites the save's answer to `failed`; the server-side sync and its idempotence are the existing (unchanged) code. The notice is per device (B37-R3).
2. **Search quality is B4**: substring matching with loose Arabic spelling; no synonyms or Arabic aliases; exercise names are one language (EX-12); muscle / equipment values are the source's (EX-09).
3. **Media is shown honestly, not fixed**: most starter exercises have no demo; wger videos are mostly HEVC (the player says so); images are hotlinked originals (EX-17 / 18). No new media, upload path or third-party content was added (MD-01 / 02 / 03 unchanged).
4. **The exercise list is still one 835 KB download** when Exercises opens (PF-11, B4); Programs no longer triggers it.
5. **Bundle** (§4): the Library's largest chunk shrank (28.37 → 19.95 KB), but the code needed for a first visit to Exercises / Foods is 35.7 / 36.2 KB raw (B3.6: 34.6) and gzip grew from 8.9 to 13.4–13.5 KB — the new filters, Select mode, read-first details, the hand-off and the sync notice.
6. **"Use in a client plan" for a program** keeps the existing assign (it replaces the client's training plan, keeping the old one as a version) — not an unsaved edit like exercises and foods. It is confirmed before anything is written, now with direct tests (§8.1).
7. **A new meal's generated label** is stored in `label.en` whatever the UI language (the editor's existing behaviour, kept for parity — B37-R2). No data was lost; an Arabic-UI coach's new meal stored Arabic in the English slot. **Fixed before the commit (owner-approved): both languages, both entry points (§9).**
8. **Physical devices not run**; R-17 stays open.

### 7. Selector and route changes

`B3_COACH_ROUTE_MIGRATION.md` §12 (routes, semantic parents, every changed test id). Specs adapted: 22 (the Library opens on Programs; the starter result is a dialog everywhere; desktop tables for every segment; swap groups inside Foods), 40 (`?tab=exercises`), 85 (`lib-tab-programs` → `/coach/library?tab=programs`; `/coach/templates` redirects into a root, so no Back), 89 (Back after saving a template and "Start from a template" land on Library › Programs). The guarantees are unchanged.

### 8. Owner final pass (2026-10-21)

**Owner brief:** B3.7 provisionally accepted; one final certification pass before a local commit — (1) verify that "Use in a client plan" for a **program** confirms before replacing the client's workout plan and says the old plan is kept in version history (add the smallest correction and focused coverage only if missing; never turn it into an unsaved hand-off); (2) investigate B37-R2 and report before expanding scope; (3) make spec 10 deterministic across the limiter's window boundaries, confirm spec 90's cause, classify spec 51 — no longer timeouts, retries, weaker assertions or skips; (4) one complete e2e3 run on the final tree plus typecheck, unit / API, architecture, build, PWA and offline checks; (5) keep every B4 / B5 follow-up and launch blocker documented. No staging, commit or B3.8.

**8.1 Program → "Use in a client plan" — already protected; coverage added.** Choosing a client opens a confirmation before anything is written: *Assign "{program}" to {client}? This replaces their current workout plan — the existing one is saved as a version first.* (the same meaning in AR and AR-EG). Cancel writes nothing; Assign saves once with `replaceExisting: true` and the version reason `Assigned template "…"`, and the server keeps the previous plan as a restorable version (`api/_trpc/routers/planSafety.test.ts`, "template assignment (replaceExisting) replaces deliberately and keeps the previous plan restorable"). The behaviour is unchanged. The confirmation itself had no direct test, so two were added:
- `src/components/coach/AssignTemplate.test.tsx` (new, 4): the confirmation appears before any save, with the exact copy and an "Assign" button; Cancel saves nothing; Assign saves exactly once with `{ replaceExisting: true, versionReason: 'Assigned template "Upper Lower"' }` and the program's source metadata; EN / AR / AR-EG all name both the program and the client. A mutation check (assign on tap, no confirmation) fails 3 of the 4.
- spec 92 "RM-27 / CO-39": in the browser the confirmation shows the full English text; Cancel closes it; the client's stored plan is byte-identical and the version count unchanged.

**8.2 B37-R2 — generated meal labels (investigated; proposal approved by the owner and implemented in §9).**
- *When:* only when a **new** meal is created — the editor's "Add meal" (B3.5) and "New meal" in the Library hand-off prompt (B3.7, a copy of the same line for parity). Both store `{ en: "<"Meal" in the UI language> N", ar: "" }`. Typed labels, existing meals, foods (both languages kept) and every other field are unaffected.
- *Data loss:* **none** — nothing is overwritten; the Arabic slot is empty, not cleared, and `useLocalized` falls back, so nothing renders blank.
- *Language correctness:* an **English-UI** coach's new meal reads "Meal 3" to Arabic and Egyptian-Arabic readers (translation fallback). An **Arabic / Egyptian-Arabic-UI** coach's new meal stores Arabic ("وجبة 3") in the **English** slot: English readers see Arabic, and the editor's English label field holds Arabic with the Arabic field empty (wrong-language storage). Digits are Latin in both.
- *Proposed minimal fix (not implemented):* one shared helper for both entry points that fills both languages — "Meal N" from the English strings and "وجبة N" from the Arabic strings (loading the Arabic strings on demand for an English-UI coach) — with unit tests for both entry points under EN, AR and AR-EG; no migration (clean launch). B37-R2 stays Open (P3) until the owner decides.

**8.3 The three non-Library failures.**

*Spec 10 — login rate limit (B37-R4, fixed in the test).* The certification trace shows the cause exactly: attempts 1–7 reached the server before 18:30:00 UTC and 8–11 after it, so the limiter's fixed 15-minute window (`windowStart = floor(now / 15 min)`) counted 7 + 4 and never reached 11. The test now:
- starts only when the current window has at least 120 s left, otherwise waits for the next window — and its own time budget grows by exactly that wait (no other timeout changed);
- waits for each attempt's own answer and asserts HTTP 401 + "Invalid email or password." for attempts 1–10 and HTTP 429 + "Too many attempts — please wait a bit and try again." for the 11th (before, attempts 2–10 only re-checked an error that was already on screen);
- asserts the server's record: exactly one `rateLimits` document for this IP + email in that window, with `count` 11;
- keeps the "page still usable" checks. The limiter, its limits and its keys are unchanged.

*Spec 90 — unread divider (environmental, unchanged).* Every failed request in its trace is `net::ERR_NETWORK_IO_SUSPENDED` — Chromium's error while the system suspends, raised even for `127.0.0.1` — starting 22:20:47 local, the second the System log records the Modern Standby entry; Wi-Fi was off 22:21 → 23:16. Messages code and the test are unchanged; it passed in the isolated re-run and in every other run.

*Spec 51 — legal contents highlight (B37-R5, reclassified: a test-synchronization trigger exposing a real website defect).*
- The trace: the test clicked "05" 0.85 s **before** the Poppins regular face finished loading (500 / 600 arrived 50–125 ms after the click), i.e. during the web-font swap. The failure screenshot: "04" highlighted, §5's top at 268 px instead of 184 (100 px `scroll-margin` + 84 px `scroll-padding`) — 84 px short.
- The mechanism, reproduced deterministically (no timing; temporary probe, removed): §5 inside the observer band → "05" highlighted; 84 px of growth above §5 (what the font swap does) → §4's end re-enters the band → "04"; the scroll finishes at the stale target → §5 at 268 px, "04" still highlighted 3 s later. The page highlights the last section that *entered* the band and never re-checks, and a smooth scroll's target is fixed when it starts.
- Font measurement (probe, removed): the swap moves §5 down **85 px** at 1440 (2368 → 2453 px from the top of the document with the fallback font vs the web fonts). With the font stylesheet and the font files each delayed 1.5 s, the contents list is on screen while six faces are still loading; after `load` + `document.fonts.ready` none is (Poppins 400 / 600 / 700 loaded).
- Earlier probes (font files delayed 1.5 s; CPU throttled × 4 and × 8; 14 runs) never reproduced it — the swap has to land in a window of a few frames, which happens only under the full suite's load (it also failed once in B3.6's first full run).
- **Test change:** before the click the test waits for the page's `load` event and `document.fonts.ready` (the Google Fonts stylesheet and the faces the page uses have arrived or failed — no new network dependency; offline it proceeds with the fallback font). The click, the highlight assertion and the in-viewport assertion are unchanged; no timeout, retry or skip.
- **Website defect (B37-R5, open, P3, not changed — website code is outside B3.7):** proposed fix — on each observer callback compute the active section from geometry (the last section whose top is above the band's lower edge), plus the reproduction above as its regression test. Self-hosting the fonts (B36-R9) would remove this trigger, not the rule.

**8.4 Certification before the B37-R2 fix (2026-10-21, `e2e-out/b37-cert-final`, one complete run, 00:17 → 01:21; the final tree's run is §9.3).** Before the run: on AC power and online, 2.1 GB RAM free (82 % commit), C: 21.2 GB and D: 25.4 GB free, Playwright's browsers intact. The run held a keep-awake request, and its scripts and test temp files were on D: (Windows Storage Sense is on — "during low free disk space", temporary files — and was left as it is; no system setting was changed).

| Gate | Result |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 922 / 922 in 107 files** (+4: `AssignTemplate.test.tsx`) |
| Build | **PASS** — sizes identical to §4 (entry 480.43 / 155.20 kB gzip; `ClientApp` 39.02 / 12.28; `CoachApp` 23.78 / 8.01; Library shell 19.95 / 7.50); precache 197 entries |
| PWA / signed-in offline boot | **PASS** (0 installability or manifest errors; the known `_vercel/insights` page error) / **PASS** |
| **Full e2e3, all projects** | **342 passed, 0 failed, 0 flaky, 1 skipped of 343 — one complete run (59.4 min).** The skip is the approved Google sign-in case. Spec 10's rate-limit test 12.5 s (its window had room); spec 51 passed; spec 90 3 / 3 incl. the unread divider; spec 92 15 / 15 |
| Spec 10 at a window boundary | started 100 s before 00:15:00 → waited for the new window → **passed** (2.0 min; `e2e-out/b37-final-boundary`) |
| Visual QA | **85 matrix shots, 0 px overflow, `dir` ltr / rtl correct** (`e2e-out/b37-cert-final/b37-visual/`) |
| Machine during the run | no standby, power-source or Wi-Fi event in the System / WLAN logs; on AC and online at every sample; memory tight — free RAM down to 0.07 GB at 00:53 (96 % commit) with other applications open; no test failed |
| Physical devices | **Not run** — R-17 stays open |

### 9. Owner-approved fix before the commit — B37-R2 generated meal names (2026-10-21)

**Owner decision (2026-10-21):** B3.7 accepted functionally with the §8.4 results; one correctness fix approved before the local commit — B37-R2 via the proposed shared helper (both languages whatever the coach's language; English "Meal N", Arabic and Egyptian Arabic "وجبة N"; both entry points; custom names preserved; existing meals not overwritten; no migration or schema change; regression tests for both entry points and every locale; fixed only after verification). B37-R5 stays deferred to B5 (no website change; the deterministic spec 51 test kept). Program assignment behaviour and its new tests stay as they are. Stop before the commit.

**9.1 Change** (`src/lib/nutritionPlanModel.ts`, `src/pages/coach/CoachNutritionEditor.tsx`):
- `generatedMealLabel(n)` → `{ en: "Meal n", ar: "وجبة n" }` — the only source of a new meal's name, used by **Add meal** and by **New meal** in the Library hand-off prompt (both number it `meals + 1`, as before). The words are stored data, not UI copy, so they do not depend on the coach's language; a test pins them to the `coachEditor.meal` strings of all three bundles.
- `typeMealLabel(label, value)` for the meal's main name field: while a meal still has its untouched generated pair (`isGeneratedMealLabel`), the first typed name replaces it in **both** languages — exactly what happened before, when a new meal's Arabic slot was empty. Any other label follows the unchanged B1.8 rule (a real translation is kept). Without this, "Breakfast" typed over "Meal 2" would have left Arabic readers with "وجبة 2".
- Nothing else changed: existing meals, custom names, foods, the Arabic field, saving and conflict handling are untouched; no stored data is rewritten (a label already stored keeps its value until the coach edits it); no migration, schema or API change. A coach who types exactly "Meal 3" in English and "وجبة 3" in Arabic is indistinguishable from a generated name — typing a new English name then also replaces the Arabic, as a copy would.

**9.2 Tests**
- `src/lib/nutritionPlanModel.test.ts` (+3): both languages for a new meal and the words equal to the `coachEditor.meal` strings in `en.json`, `ar.json` and `ar-eg.json`; only an untouched pair with the same number counts as generated (the old `en`-only shape, a changed Arabic, a different number and custom names do not); typed names replace a generated pair in both languages and never a real translation.
- `src/pages/coach/CoachNutritionEditor.test.tsx` (+7): **Add meal** and **New meal from the Library** under **EN, AR and AR-EG** (each test first checks the app is in that language — "Add meal" / "إضافة وجبة" / "ضيف وجبة") save `{ en: "Meal 2", ar: "وجبة 2" }` with the existing meal byte-identical and the library food in both languages; a typed name replaces the generated one in both languages while the existing meal's own Arabic ("فطور") is kept.
- Mutation checks: the previous label code fails all 6 locale tests; the new names without the typing rule fail the typed-name test (Arabic stayed "وجبة 2").
- `e2e3/specs/20-coach-core.spec.ts` "workspace: nutrition plan saves and survives reload" (+1 assertion): the meal added in the browser is stored as `{ en: "Meal N", ar: "وجبة N" }` (spec 20: 12 / 12).

**9.3 Verification** — the exact final tree, `e2e-out/b37-cert-r2`, 01:45 → 02:48. Before the run: on AC power (100 %) and online, 4.6 GB RAM free (80 % commit), C: 30.5 GB and D: 24.2 GB free, the e2e ports free, Playwright's browsers intact; the run held a keep-awake request; Storage Sense left as it is — no system setting changed, nothing deleted.

| Gate | Result |
|---|---|
| Focused, before the full run | model rules 9 / 9; nutrition editor 13 / 13; spec 20 12 / 12; specs 89 (nutrition, Arabic, visual matrix) and 92 (Journey I food, CO-26-R, Arabic, visual matrix) 7 / 7 at 1440 |
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 932 / 932 in 107 files** (+10 over §8.4) |
| Build | **PASS** — entry 480.43 / 155.20 kB gzip, `ClientApp` 39.02 / 12.28 and `CoachApp` 23.78 / 8.02 (unchanged); Library shell 19.95 / 7.51; nutrition editor 24.42 / 7.15 (24.48 / 7.16 before); precache 197 entries |
| PWA / signed-in offline boot | **PASS** (0 installability or manifest errors; the known `_vercel/insights` page error) / **PASS** |
| **Full e2e3, all projects** | **342 passed, 0 failed, 0 flaky, 1 skipped of 343 — one complete run (58.6 min).** The skip is the approved Google sign-in case. Spec 20 12 / 12 (incl. the stored meal names); 89 16 / 16; 92 15 / 15; 22 4 / 4; 40 15 / 15; specs 10, 51 and 90 passed |
| Visual QA | **85 matrix shots, 0 px overflow, `dir` ltr / rtl correct** (`e2e-out/b37-cert-r2/b37-visual/`) |
| Machine during the run | no standby, power-source or Wi-Fi event in the System / WLAN logs; on AC and online at every sample; free RAM ≥ 1.86 GB |
| Physical devices | **Not run** — R-17 stays open |

**9.4 Backlog:** **B37-R2 → Fixed** (closed with the tests above). B37-R5 stays **Open for B5** by the owner's decision (no website change; spec 51 keeps its deterministic synchronization). Counts: Open 208 · Mitigated 60 · Needs Verification 31 · Deferred 8 · Fixed 171 (478 entries).

**Status: B3.7 implemented and certified locally on the final tree — full e2e3 342 / 343 in one complete run (0 failed, 0 flaky, the approved skip); unit / API 932 / 932; typecheck, boundaries, build, PWA and offline boot green (§9.3). Program assignment is confirmed before it replaces a plan (§8.1); B37-R2 fixed (§9); B37-R5 deferred to B5. Committed locally with the owner's authorization as `025445c` "feat(coach): complete B3.7 library experience" (2026-10-21, 65 files; not pushed).**

## B3.8 — Coach Me / Business (2026-10-21)

**Owner brief (2026-10-21, after the B3.7 commit `025445c`):** implement blueprint §6.7 — the Me hub, **Business** (`/coach/business`: this month, renewals, lapsed clients, packages, exports), **Forma subscription** (`/coach/plan`) and **Account & preferences** (`/coach/settings`) — following the read-only plan's steps B3.8.0–B3.8.7, reusing the B3.7 tab and table / list foundations, keeping every API and database contract unless a genuine blocker appears (ask first). Stop before any commit.

**Owner decisions (2026-10-21):**
1. **D1 — revenue correctness:** option (b). Current due, renewals and status counts come from **active** relationships only; booked and lost keep their historical meaning only where the definition supports it; currencies are never mixed; every formula and its inclusion / exclusion rules are documented and pinned by unit tests; no commercial or backend payment change.
2. **D2 — labels:** truthful labels such as **Booked · Due · Lost**, each with its meaning and window; never imply a verified payment where none is recorded.
3. **D3 — exports:** real row-level CSV for clients and for subscription terms / history, with a date range; correct relationships, currency and dates; CSV-safe; desktop-first without broken mobile behaviour.
4. **D4 — removals:** the duplicate Revenue / Reports UI, misleading metrics, the donut and retention tiles, the redundant Forma subscription cards, the account's capacity card and the packages "Order" field (→ accessible move up / down). Old routes redirect; no business record or history is deleted.
5. **D5 — capacity:** one authoritative count — the server's — on Clients, Today, Forma subscription and every capacity block; no change to server capacity rules, limits or entitlements; regression tests for disabled clients and other edge cases.
6. **D6 — legacy commercial code:** the coach UI stops reading `plan.plan` and uses the server's `state` / `phase`; server compatibility code stays until the clean-launch / release-hardening work.
7. **D7 — RM-66:** feature-flag governance leaves B3.8 (→ B5, rationale in the backlog); no Super Admin redesign.
8. **D8 — account:** the shared Account & preferences page is improved additively (admin-compatible): explicit saved / failed per field, unsaved input kept after a failure, a real time-zone picker, named currencies, no new fields.

### 0. Documentation corrections (B3.8.0)
- Stale status lines corrected: the blueprint and the B3.7 log section now record the B3.7 commit `025445c`; the backlog's REL-01 lists every local phase commit (none pushed), REL-03 the current distance from `origin` (11 commits), and its header the last update.
- `B3_COACH_ROUTE_MIGRATION.md`: `/coach/plan` and `/coach/settings` belong to B3.8 (they read "—").
- **IA-K06** (doc 05) is not a backlog entry — IA-K findings never were (they are covered by backlog IDs): here by **RM-38** (Revenue / Reports / Client Plans / My Plan out of the main navigation), **RM-25** and **CO-32** (capacity shown in several places). DT-06 and TB-02 were folded into **JR-03**.
- **RM-66** → B5 (D7). **RM-53** → Release hardening (D6: server compatibility stays until the clean launch; with the clean launch no production migration is needed — the removal doc's "migrate against production first" no longer applies).

### 1. What changed

**1.1 Me › Business** (`/coach/business?tab=overview|renewals|packages|exports`, `src/pages/coach/business/`) replaces the Revenue, Reports and Client Plans pages; their URLs redirect (`/coach/revenue` → Business, `/coach/reports` → `?tab=exports`, `/coach/subscription-plans` → `?tab=packages`). One screen with the B3.7 section tabs (`SectionTabs`, tab in the URL), each tab its own chunk. Data: `coachBusinessQuery` — the coach's relationships (all statuses, with archived terms) and the roster, two bounded reads, no polling; the old dashboard aggregate (which also downloaded both template lists and the unread count) is deleted with the pages.

**1.2 The month's figures — rules (`src/lib/coachBusiness.ts`, owner D1 / D2).** Forma records no payments, so every figure is a sum of package prices of terms, named for what it is, defined on screen, per currency:

| Figure | Counts | Never counts |
|---|---|---|
| **Booked** | the price of every term that **started** this calendar month — current and archived terms of **every** relationship this coach has had (also ended ones and earlier stints: the term was booked with this coach) | pending terms (not started), free terms (no price / 0), terms that started in another month |
| **Due** | the price of each **current** client's (active relationship) running trial / active term that ends after now and by the month's last day — what renewing at the same price would bring | former (released / transferred) clients — they used to show here, with no name (D1); paused / expired / cancelled terms; free terms |
| **Lost** | the price of a relationship's **current** term that ran out (`endAt`) or was cancelled (`cancelledAt`) this month without a renewal — current clients, and former clients whose term lapsed while still this coach's client | a released / transferred client's running term; terms stored as `ended`; archived terms (each was followed by a renewal) |

- Amounts are grouped by the term's own currency and never added across currencies (the old page summed them and labelled the total with the last relationship's currency); a term without a currency is its own group. The month is the calendar month in this device's time zone; the screen prints its dates.
- **Renewals** (current clients' running terms ending within 30 days — Today shows only the 7-day ones and five more, B3.2) and **Lapsed** (Today's rule: ran out by itself within 30 days; cancelled / ended terms were the coach's decision) use the same windows as Today and Clients (`coachToday` constants).
- **Current clients by package** counts active relationships with the Clients filter states (`clientStateOf`), each row opening Clients with that filter.
- Removed, not re-derived (D4 / O-14): the hero, retention (it was 100 − churn over every relationship ever), churn, "new clients", the subscription donut and its six duplicate tiles, the "collected" figure (no payment ledger), the Reports KPIs (adherence %, average workouts, assessments / check-ins to review — Today and Clients own them) and the Reports ranking (Clients › sort by workouts, RM-18).

**1.3 Renewals tab (JR-03 / CO-16):** every current client whose package ends in the next 30 days and every lapsed one, named, soonest / latest first, with **Renew** on the row (a real button beside the row on phones, an Action column on desktop; the row itself opens the client's Package & billing, the desktop row menu also Message). Renew opens the client's own term sheet — moved, unchanged, from the subscription panel into `components/coach/SubscriptionTermSheet` so both use one path: a renewal starts today at the current price, a back-dated one is confirmed (B3.0.1), the server archives the previous term to the history ledger (C9). A renewed client leaves the list at once (`invalidateSubscription` refreshes Business, Today and the workspace). Names are bidi-isolated (a Latin name inside Arabic keeps its order).

**1.4 Packages tab (CO-36 / TB-06 / TB-08 / D4)** — was "Client Plans": the B3.7 table (≥ 1024) / list, the row opening the package's sheet (edit, Delete inside, confirmed — clients already on it keep their term and history; the sheet is its own chunk), archived packages marked. The free-number "Order" field is gone: **Move up / Move down** buttons on every row (named "Move Monthly up"; the list is renumbered 10, 20, 30… and only packages whose position changed are saved; a new package goes after the last one, computed when saving). Every picker (invite, add existing, set term) follows the list order. Labels say "package" (CO-36); lengths have real plurals ("1 month", "3 months" — CO-22, also in both pickers).

**1.5 Exports tab (CO-35 / D3):** an optional date range (From / To, inclusive, this device's time zone; empty = every date; a reversed range is refused with the reason) and two row-level CSVs built in the browser: **Clients** (one row per current client who joined in the range: contact, package state, package, term dates, price, currency, client since, last workout, workouts in 7 days, assessment) and **Package terms** (one row per term — current and archived, current and former clients — that started in the range: client or "Former client", client ID, current / former with the date they left, current / past term, dates, status, package, months, price, currency). CSV-safe (`lib/csv`): a free-text cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'` unless it is only a phone number / plain number; numbers stay numbers; UTF-8 BOM; CRLF. On a touch device the file goes through the share sheet (an installed iPhone app can't download a blob); any other refusal falls back to a download. The builders load only on the first export.

**1.6 Forma subscription** (`/coach/plan`, was "My Plan" — CO-32 / RM-55): one status card (the phase as its title, the state, end date and days left, price, what happens next, the one action — subscribe / renew, or the request awaiting payment) instead of four metric cards and an explanation card; "Renew" is offered only for a running paid term (it said "Renew" with no subscription at all). Capacity: the server's count with base / add-ons / adjustment and a real progress bar (`role="progressbar"`, value and text — AX-10). Requests: open and recent ones (30 days) in view, older ones in a collapsed history. Every test id is kept.

**1.7 One capacity count (D5 / CO-32 / RM-25):** `useCoachCapacity()` (in `CoachPlanProvider`) exposes the server's maintained counter — the number `reserveClientSlot` gates a new client on — and Clients (usage strip, limit link), Today's trial banner, the add-client blocks (which now also say "over capacity by N") and Forma subscription all read it. The Clients strip used to count the roster without disabled clients, the trial banner and the account card counted it with them; a disabled client still holds an active relationship, so the server counts it — and so does every screen now. Server rules, limits and entitlements are unchanged. The count stays fresh: adding an existing client, a release, a transfer and a lost-access message refresh it, and `useCapacityFollowsRoster` reads it again whenever the roster a screen polls (Clients, Today) changes size — a claimed invite or a change from another device included (spec 20 caught the first version showing the previous count after an assign).

**1.8 Legacy commercial field (D6 / RM-52):** the coach UI no longer reads `plan.plan`: the plan provider uses the server's `state` (an end date that passed since the read folds into "expired"), the trial banner the server's `phase`. The shared formatting helpers keep a `plan.plan` fallback for admin rows (raw documents without `phase`); every coach caller passes the server's `phase`. Server compatibility code is untouched (release hardening, after the clean launch).

**1.9 Account & preferences** (`/coach/settings`, shared `RoleAccount`, admin-compatible — CO-31 / CD-09 / D8): name, phone, time zone and currency each show Saving… / Saved / Couldn't save **with Retry**, announced to screen readers; a failed save keeps what was typed (each field now follows the stored value only when *its* value changes — one field's save used to reset all of them); an empty name is refused with the reason, never sent; the time zone is a picker of the browser's IANA zones grouped by region, the stored zone kept and "Use this device's (…)" one tap away; currencies are named ("EGP — Egyptian Pound" / Arabic name), with a note on what they apply to. The coach's capacity hero card is gone (capacity lives on Forma subscription); admin keeps its card. The language buttons keep their names (test helpers depend on them). The save-status hook moved from the client's Settings page into `components/ui/SaveStatus` (client behaviour unchanged; a sticky failure is opt-in).

**1.10 Me hub and navigation:** a Business row ("Figures & renewals") and a direct Packages row (were Revenue & renewals, Client packages, Reports & exports); `/coach/business` lights Me and its Back goes up to Me; ⌘K: Business, Renewals to act on, Packages (Reports is gone); Today's "Coming up" links to all renewals (`today-coming-up-all`) — B3.2 promised "the full list is in Me › Business".

**1.11 A label that contradicted its save:** the term sheet showed the previous term's currency but has always saved the coach's default currency; it now shows the currency it saves (the stored rule is unchanged — which currency a renewal should use is listed for the owner, B38-R1).

### 2. API contract

No change — no router, schema, index or data change, no migration. Calls used: `coachClients.list` (all statuses, full view) and `listMyClientUsers` (Business), `coachClients.dashboardSummaries` (the clients export, on demand), `coachClients.updateSubscription` (setTerm, unchanged), `coachAssets.billingPlans.list / save / delete`, `coachCommercial.myOverview`, `coachPlanRequests.*`, `coachPlans.me`, `auth.updateProfile`. The server's capacity counter, commercial rules (C10), the ledger (C9) and the legacy `plan` field are untouched.

### 3. Tests

| File | What it pins |
|---|---|
| `src/lib/coachBusiness.test.ts` (new, 12) | every rule of §1.2: the month (device time zone); Booked across current / archived / earlier-stint terms and former clients, never pending / free / other months; Due only for current clients' running terms ending by month end (never a released client, a paused or a lapsed term); Lost for expired / cancelled current terms of current clients and of former clients who lapsed while still a client, never a release or an `ended` term, never a renewed client's archived term; one line per currency (none summed, no-currency last); counts by the Clients states for current clients only; renewals ≤ 30 days ("soon" ≤ 7, free ones too) and Today's lapsed rule; export rows (term rows with current / former, current / past, effective status; client rows by join date) and inclusive day ranges |
| `src/lib/csv.test.ts` (new, 3) | formula cells neutralised (`=`, `+`, `-`, `@`, tab, CR, DDE), phone numbers and plain numbers kept, numbers numeric, quoting, BOM, CRLF |
| `src/pages/coach/business/CoachBusiness.test.tsx` (new, 14) | Overview per currency with the definitions and the month's dates; to act on and counts linking into Clients; a failed load = alert with Retry (never 0); tabs in the URL; Renewals named (former client never), Renew through the client's term sheet with the coach and client, disabled offline with the reason, the desktop table's column names and row → Package & billing; Packages: sheet with Delete, no Order field, archived marker, Move down saves only the two changed positions, a new package needs a name and a valid price (Arabic digits accepted) and lands after the last; Exports: the clients CSV (headers, a row field by field, a formula name neutralised), the terms CSV in a range with the former client named as such, a reversed range refused |
| `src/components/coach/CoachPlanProvider.test.tsx` (new, 8) | D5: the server's counter (a disabled client still holds a slot), over capacity, a plan without the counter, a lapsed plan blocks new clients, nothing blocked while loading, the count read again when the roster changes size (not on the first load, not when unchanged); D6: the server's state wins over a contradicting legacy `plan`, an end date that passed folds into expired |
| `src/pages/coach/CoachClients.test.tsx` (+2) | the strip shows the server's count with a disabled client on the roster; over capacity says by how much; nothing shown as full before the plan loads |
| `src/pages/coach/CoachPlan.test.tsx` (+4) | one status card and the page title; no subscription → "Subscribe", never "Renew"; the capacity progress bar's accessible value; open and recent requests in view, older ones folded |
| `src/pages/RoleAccount.test.tsx` (new, 8) | Saved per field; a failed save keeps the input, says so (alert) and Retry saves it; one field saving never resets another that failed; an empty name is refused, never sent; named currencies; the stored time zone kept, the device's one tap away; the coach has no capacity card / hero; admin keeps its card, no currency field, the language buttons' names |
| `src/lib/navContract.test.tsx`, `src/config/coachNav.test.tsx` (changed) | `/coach/business` lights Me, shows the shell's Back, goes up to `/coach/me` |
| `e2e3/specs/93-b3-business.spec.ts` (new, 12) | Journey J on a coach the spec creates: exact Booked / Due / Lost per currency with a released client and a lapsed one, the counts into Clients; Renewals named on a phone, Renew on the row → the term saved with the old one in the history (DB), the former client never listed; Packages: Move down (DB orders), a new package after the last, Delete in the sheet, the term picker's order (archived never); Exports: real downloaded files (headers, rows, a formula name neutralised, a former client, the date range); capacity: Clients and Forma subscription both "4 / 4" with a disabled client, no account capacity card; Forma subscription: the status card, recent vs folded requests; Account: Saved, a forced failure keeps the input with Retry, named currency, time zone (DB); the old URLs and the Me rows; Arabic and Egyptian Arabic at 390 / 1440 (RTL, translated, Latin digits, no overflow); axe EN and AR (32 scans); the visual matrix |
| Specs changed (guarantees unchanged, route migration §13) | 85 (Me rows; `/coach/business` deep link), 42 (`coach-business` error state — same guarantee), 46 (+ axe target `/coach/business`), `_d-layout` (+ `/coach/business` and `/coach/settings` in the coach layout sweep) |

### 4. Verification

| Gate | Result (the exact final tree, `e2e-out/b38-cert`, 05:00 → 06:08) |
|---|---|
| Before the run | on AC power (100 %) and online, 4.1 GB RAM free (80 % commit), C: 29.6 GB and D: 22.3 GB free, the e2e ports free, Playwright's browsers intact; a keep-awake request held; Storage Sense left as it is — no system setting changed, nothing deleted |
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 983 / 983 in 112 files** (B3.7: 932 in 107; +51 — §3) |
| Build | **PASS.** Entry 484.77 / 156.46 kB gzip (B3.7: 480.43 / 155.20 — the new English strings ship in the entry, as in earlier phases). `ClientApp` 39.02 / 12.28 — identical. `CoachApp` 23.83 / 8.06 (23.78 / 8.02). Business: shell 3.31 · data + rules 3.54 · parts 1.29 · Overview 5.38 · Renewals 5.20 · Packages 6.11 · Exports 4.79; on demand: package sheet 2.37, export builders 2.80, term sheet 4.65 (moved out of the subscription tab: 17.44 → 13.52). Forma subscription 13.32 (11.92). Account 15.84 (16.23). Precache 205 entries |
| Budget (blueprint §9: each screen ≤ +20 %) | every tab ≤ 6.5 KB ✓ · Forma subscription ≤ 14.3 ✓ · Account ≤ 19.5 ✓ · **a first visit to Business = 13.52 KB, 0.21 KB (1.6 %) over the 13.3 KB proposed in the plan** (it grew with the phone layout of the figures, VQA #2); the Revenue page it replaces needed 12.67 KB with its charts chunk, so the blueprint's rule holds. No new polling; Business reads two lists (Revenue read five: roster, summaries, relationships, both template lists, the unread count) |
| PWA (production build) / signed-in offline boot | **PASS** (0 installability or manifest errors; the known `_vercel/insights` page error) / **PASS** |
| **Full e2e3, all projects** | **355 passed, 0 failed, 0 flaky, 1 skipped of 356 — one complete run (1.1 h).** The skip is the approved Google sign-in case. 93 **12 / 12**; 85 7 / 7; 42 10 / 10; 46 12 / 12; 20 12 / 12; 87 19 / 19; 11 1 / 1, 12 4 / 4, 50 5 / 5 (commercial model); 86 17 / 17; 13 (admin) 8 / 8; 40 15 / 15; 92 15 / 15; 89 16 / 16; layout 54 / 54 |
| Focused runs before it | spec 93 and the B3.8-touched specs (85, 42, 46, 44, 45, 11, 12, 50, 86, 87, 13, 20): six failures, all fixed — the Clients count lagging an assign / release (spec 20: a real bug of the first D5 version, §1.7), spec 87's seeded rosters bypassing the server's counter (fixture, §7), a `dl` structure in the phone figures (axe); then 43 / 43 |
| Accessibility (axe WCAG 2.1 A / AA) | spec 93: 32 scans — the four Business tabs, a package sheet, Forma subscription, Account and Me × EN / AR × 390 / 1440: **0 violations**; spec 46 + `/coach/business`: 0 critical |
| Visual QA | **82 matrix shots, 0 px overflow, correct `dir`** (`e2e-out/b38-cert/b38-visual/`); `B3_VISUAL_QA.md` §B3.8 |
| Machine during the run | no standby, power-source or Wi-Fi event in the System / WLAN logs; on AC and online at every sample; free RAM ≥ 1.15 GB |
| Physical devices | **Not run** — R-17 stays open |

### 5. Backlog outcome (B3.8-mapped items)

| Outcome | Items |
|---|---|
| **Fixed** | CO-16 · JR-03 (with DT-06, TB-02 folded in) · RM-38 · CO-22 · CO-31 · CO-32 · CO-35 · CO-36 · RM-18 · RM-25 · RM-42 · TB-06 · RM-55 · B3-S08 (owner D1: the formula documented and pinned, currencies never summed, browser-side by decision) |
| **Mitigated** — the B3.8 part is done; the rest is named | RM-52 (coach UI fixed → server / admin readers in Release hardening, D6) · AX-10 (the coach's capacity bar → the client's rings in B5) · CD-09 (the coach's account → client screens in B5) · TB-08 (Business adopts the foundation → the admin `DataTable` in B5) · TB-07, AX-05, DT-07, VS-07, VS-13, RM-33 (B3.8 screens done → the B3.9 polish pass) |
| **Moved (owner)** | RM-66 → B5 (D7) · RM-53 → Release hardening (D6) — §0 |
| **Not a backlog entry** | IA-K06 — covered by RM-38, RM-25 and CO-32 (§0) |
| **New** | B38-R1 the currency a renewal is saved in (owner decision, P3, B5) · B38-R2 a corrected start date booked twice in one month (P3, B5) · B38-R3 the month in the device's time zone (P3, B5) · B38-R4 former clients unnamed in the terms export (P3, B5) |

Unchanged: MD-01 / 02 / 03 and every release blocker; REL-04 and the Clean Launch Plan; B36-R4 (P1, launch blocker); O-9 nutrition templates (B5).

### 6. Known limits and risks
1. **Booked counts a corrected start date twice** in the same month: when the coach re-sets a term's start date, the server archives the earlier start as a term of its own (the existing ledger rule, unchanged) — B38-R2.
2. **The month is this device's calendar month**, not the coach's account time zone (the screen prints the dates) — B38-R3.
3. **Former clients in the terms export are "Former client" + client ID**: their profile is no longer this coach's to read (B3.0.1); a name would need a server field — B38-R4.
4. **Which currency a renewal is saved in** (the coach's default — unchanged — or the previous term's) is a product decision — B38-R1. The term sheet now says which one it uses.
5. **Business figures are computed in the browser** (owner D1: no backend change); the formula is documented here and pinned by unit tests (B3-S08).
6. **The admin `DataTable` is unchanged** (TB-08 admin part; no admin redesign in B3); the Packages and Renewals lists use the B3.7 foundation, which gained a row-action slot for phones.
7. **Physical devices not run**; R-17 stays open.

### 7. Selector and route changes

`B3_COACH_ROUTE_MIGRATION.md` §13 (routes, semantic parents, every changed test id). Specs adapted: 85 (Me rows; the `/coach/business` deep link), 42 (`coach-business` — the same "an error, never 0" guarantee), 46 (+ `/coach/business`), `_d-layout` (+ `/coach/business`, `/coach/settings`), 87 (its seeded rosters set the server's client counter the way assigning does — `syncCounter`; the counter is the count every screen shows since D5; restored afterwards). The guarantees are unchanged.

**Status: B3.8 implemented and certified locally on the final tree — full e2e3 355 / 356 in one complete run (0 failed, 0 flaky, the approved skip); unit / API 983 / 983; typecheck, boundaries, build, PWA and offline boot green (§4). Not committed — awaiting the owner's approval.**

_The owner did not approve this commit (2026-10-21) and asked for the B3.8 completion below, built on this tree; its certification supersedes §4._

## B3.8 completion — payments, subscription correctness, entitlements, analytics, desktop UX (2026-10-21 → 22)

**Owner brief (2026-10-21, after the Phase 0 audit of the certified B3.8 tree):** B3.8 is not approved for commit yet; build on it. Owner decisions: (1) manually recorded client payments — Cash, Mobile Wallet, InstaPay; (2) **Fix C** — renewals and corrections told apart explicitly; (3) fixed-day periods — one month is exactly 30 calendar days; (4) **P2** — an expired Forma coach is read-only, on the server and in the app; (5) a premium, truthful Business analytics dashboard; (6) desktop widths; (7) a grouped desktop sidebar; (8) EGP-only; (9) no manual time-zone selection. No data deleted, reset or migrated; no commit.

Every changed financial rule, entitlement, schema contract and known limitation: **`B3.8_COMPLETION_CONTRACTS.md`** (the reference for this section).

### 1. What changed (by slice)

**Phase 1 — subscription terms.** `api/_lib/civilDate.ts` + `src/lib/civilDate.ts` (identical; parity-tested in Cairo, UTC and Los Angeles): calendar-day arithmetic anchored to a named IANA zone — `startOfDay` handles DST gaps (Egypt springs forward at midnight) and the repeated hour. `api/coach-clients/_terms.ts`: `buildTerm` (every creator: assign, invite claim, transfer "new", first package), `renewalStart` (a running term renews from its end; any other start refused), `archiveForRenewal` (the real end — BE-3), `applyCorrection` (same `termId`, extension / freeze days kept, no-op detection), `extendDated`, `snapToCalendar`. `updateSubscription` takes `newTerm` / `renew` / `correct` (+ `reason`), `requestId` (idempotent replay, also for a lost race) and `expectedTermId`; `setTerm` / `setPrice` → `APP_UPDATE_REQUIRED`; a renewal during an unfinished pause → `RENEWAL_DURING_FREEZE`. Events record the economic fields; the sync gate's U3 / U5 rules know the new operations (a price-only correction never narrows a lapse). App: the term sheet has three explicit modes (first package / renew — the start shown, not editable, for a running term / edit current — "fix a mistake" or "switching package", nothing sent when nothing changed), a "Covers 1 Oct – 30 Oct · 30 days" preview, "1 month = 30 days"; every display shows the first and **last covered** day (package card, history, client card, renewals, Today, exports). Capacity add-on months: the UTC calendar, explicitly.

**Phase 2 — payments.** `api/payments/*` + router `clientPayments` (`list` / `record` / `reverse` / `correct`), collection `clientPayments` (+ `clientPaymentTermLocks`), indexes in the accessor and `scripts/mongo-init-indexes.mjs`. App: `ClientPaymentsCard` on the client's package screen — price / recorded / outstanding (or credit), every payment (reversed ones kept, marked, with the reason), Record (amount prefilled with what is left, Cash / Mobile Wallet / InstaPay, date ≤ today, package, reference, note, a confirmation, Retry with the same request id), Correct and Reverse (reason required, confirmed). `src/lib/payments.ts` mirrors the server arithmetic (parity-tested).

**Phase 3 — EGP only.** `assertSupportedCurrency` on every client-money procedure; terms and invites stored in EGP; the coach's currency picker and the price / transfer currency fields removed; `formatEgp` / `formatEgpMinor` / `formatMoney` / `formatEgpCompact` (Latin digits; "EGP 1,899" / "1,899 ج.م."). Admin and Forma commercial currencies unchanged.

**Phase 4 — P2.** `api/_lib/coachEntitlement.ts` + the default-deny middleware in `api/_trpc/trpc.ts` (allow-list of 20 recovery / marker / client-protecting mutations), `messages.send` gated after its replay, coach uploads gated at `/api/media` (avatar only). App: `planLapseSignal` (tRPC link + uploader), `CoachPlanProvider` re-reads the plan on a refusal and at `endsAt`, `useWriteGate` + `PlanReadOnlyNotice` on every coach write surface, MessageThread `readOnly`, MeasurementForm `readOnly`, ⌘K without "create" commands when lapsed; copy rewritten (read-only mode, how to renew).

**Phase 5 — analytics.** `src/lib/coachAnalytics.ts` (every figure, EGP-only, piastres); Business › Overview rebuilt (this month: booked / collected / due / lost, reversals; overall: outstanding with overdue / not yet due / credit, all-time booked and collected, active paying clients; coverage notes; booked vs collected × 12 months; collections by method; renewal pipeline; packages of current clients; clients by package state; definitions incl. "profit isn't shown"); charts in plain HTML (`business/charts.tsx`) with the validated pair `chartBooked` / `chartCollected` (`theme/colors.ts`); a Payments CSV export.

**Phase 6 — layout & sidebar.** Wide pages (Clients, Library, Today two-pane, Business) use the shell column; reading width (768) for Account, version history, notes, history; package + payments side by side; the header row aligned with the column. `coachRailGroups` (pure) + `SideRail` groups: Workspace / Planning & content / Business / Account, sub-pages of the open section, one `aria-current="page"`, sub-page `aria-current="true"`, dividers on the 72 px rail; ⌘K names every section and tab.

**Phase 7 — time zone.** Account shows the device's zone read-only (no picker); the stored field and API unchanged.

**Phase 8 — the visual pass on the final tree (2026-10-22).** Reviewing the matrix shots of the first certification found three more things, all fixed before the final run: the Collections-by-method scope switch squeezed into its heading row ("THIS MONTH" on two lines; in Egyptian Arabic "الشهر ده" overflowed its segment) and pushed that card 15 px below the chart's — the switch now sits inside the card as a neutral view switch (`seg-quiet`, the B2 rule the Library's foods switch follows); the package card's "days left" passed `n` instead of `count`, so Arabic could not choose a plural ("20 يوم متبقٍ") — it uses the plural-aware `coachClients.daysLeft` the workspace header already uses (English text unchanged; the admin pages keep their key); the "‹ Profile" back chip stacked its chevron above the word (pre-existing since B3.4: `.chip` is not a flex container) — `inline-flex`; and at 1024 px the Overview's three-column rows were too narrow ("Overdue (ran ou…" clipped, headings on two lines) — the chart and the methods card take the full width below 1280 px, the pipeline and packages sit two-up at 1024 and three-up from 1280, and a bar's label wraps instead of being cut.

### 2. API contract

Additive, no migration, no data rewritten (`B3.8_COMPLETION_CONTRACTS.md` §1–§6 has every field and code):
- **`coachClients.updateSubscription`** — new operations `newTerm` / `renew` / `correct` (`reason: 'correction' | 'changePackage'`), optional `requestId` and `expectedTermId`, a `zone` with every dated change; the result gains `changed`. `setTerm` / `setPrice` are refused (`PRECONDITION_FAILED`, `APP_UPDATE_REQUIRED`) — an older installed app cannot write the ambiguous operation. New refusals: `TERM_EXISTS`, `NO_TERM`, `RENEWAL_STARTS_AFTER_TERM`, `RENEWAL_DURING_FREEZE`, `SUBSCRIPTION_CHANGED`.
- **Term documents** gain `termId`, `startDate`, `endDate` (exclusive), `days`, `zone` (history entries also `planName`, `archivedBy`); invites `subZone`; audit snapshots the economic fields; events `reason`, `requestId`. Older documents are read as they are.
- **New router `clientPayments`** (`list`, `record`, `reverse`, `correct`) and collections `clientPayments`, `clientPaymentTermLocks` (indexes in the accessor and `scripts/mongo-init-indexes.mjs`). Refusals: `PAYMENT_EXCEEDS_BALANCE`, `PAYMENT_ALREADY_REVERSED`, `PAYMENT_NOT_FOUND`, `TERM_NOT_FOUND`.
- **EGP:** `coachClients.assign`, `updateSubscription`, `transfer`, `transfers.resolve`, `invites.create` and `clientPayments.*` refuse an explicit non-EGP currency (`UNSUPPORTED_CURRENCY`).
- **P2:** every mutation by an active coach account whose Forma plan is expired / suspended is refused `PRECONDITION_FAILED` with `SUBSCRIPTION_EXPIRED` / `SUBSCRIPTION_SUSPENDED`, except the 20 allow-listed paths (contracts §6); `/api/media` lets such a coach upload only an avatar.
- **Unchanged:** `auth.updateProfile` (still accepts `timezone` and `currency`), the Forma coach plan, trial, billing, capacity rules and admin commercial procedures (capacity add-on months now use the UTC calendar explicitly — the same result on Vercel).

### 3. Tests

| File | What it pins |
|---|---|
| `api/coach-clients/_terms.test.ts` (new, 20) | 30-day months, exclusive ends (1 Oct + 30 → 1–30 Oct, next 31 Oct), month ends / February / leap years, renewal from the day after a running term, the real end on archive (BE-3), corrections in place (same id, extension and freeze days kept, no-op detection), extension and freeze snapping |
| `api/_trpc/routers/b38Terms.test.ts` (new, 24, replica set) | every Phase 0 scenario through the router: a correction books once, renew vs correct, a running term renewed only from its end, refusals (`TERM_EXISTS`, `RENEWAL_DURING_FREEZE`, legacy ops), `requestId` replay and racing changes, `expectedTermId`, a no-op save writes nothing, EGP refusals on every creator, invite claim / transfer zones |
| `api/_trpc/routers/clientPayments.test.ts` (new, 16) | ownership (another coach, another relationship's term), piastres, no overpayment and two racing payments for the last balance, reverse once, correct = reversal + new payment atomically, idempotent retries, credit after a price correction, admin read, EGP only |
| `api/_trpc/routers/b38CoachP2.test.ts` (new, 13) | **every mutation in the API router called as an expired coach** — refused unless allow-listed; a suspended coach; a coach with no plan; admins and clients unaffected; `messages.send` replay acknowledged but a new message refused and not stored; the media gate |
| `src/lib/civilDateParity.test.ts` (new, 13) | server and app date code identical; Cairo DST (midnight spring-forward), UTC, Los Angeles; legacy instants |
| `src/lib/paymentsParity.test.ts` (new, 4) · `src/lib/coachAnalytics.test.ts` (new, 10) | the app's ledger = the server's; every analytics figure (booked by first day, collected by date received, reversals nowhere, outstanding / overdue / credit, active paying, pipeline, packages, coverage notes) |
| `src/components/coach/ClientPaymentsCard.test.tsx` (new, 8) · `SubscriptionTermSheet.test.tsx` (new, 8) | the payment form (prefill, methods, date ≤ today, confirmation, retry with the same id), reverse with a reason, read-only; the three term modes, the fixed renewal start, "Covers … · 30 days", nothing sent when nothing changed |
| Changed to the new contracts | `b301Subscription`, `b301Ownership`, `b34CompatPrivacy`, `subscriptionHistory` (operations, dates, EGP); `b34CheckInOwnership` and the `b301Subscription` freeze race (two pre-existing flaky tests made deterministic); `coachBusiness.test`, `CoachBusiness.test`, `RoleAccount.test`, `coachNav.test` (sidebar groups), `CoachPlanProvider.test` (P2), `MessageThread.coach.test`; four page tests' plan-provider mocks gained `useWriteGate` |
| `e2e3/specs/94-b38-completion.spec.ts` (new, 8) | payments (record InstaPay, what is left, reverse with a reason, nothing deleted — DB, Business counts live payments only); Fix C (edit = the same term once, Renew from the day after the running one ends — DB); P2 (an expired coach reads everything, every write control disabled with the reason, the server refuses a direct write); EGP (a USD write refused, never relabelled); the sidebar (four groups, sub-pages, one current page, RTL, tablet rail); widths at 1280 / 1440 / 1728 / 1920; axe EN and AR |
| `e2e3/specs/95-b38c-visual.spec.ts` (new, 1) | the visual matrix (`B3_VISUAL_QA.md` §B3.8 completion) |
| Specs changed (guarantees unchanged, route migration §14) | 20 (package card selectors, B3-C07), 81 / 88 / 93 (term sheet modes, the removed price sheet, EGP rows; 61 unchanged — `sub-set-term` kept its id), 85 (the sidebar lights Business / Forma / Account), 86–89 (each visual-matrix context closed after use — they kept up to 12 apps open at once) |

### 4. Verification

| Gate | Result (the exact final tree, 2026-10-22; full run `e2e-out/b38c-final-e2e2`, 02:59 → 04:15) |
|---|---|
| Typecheck / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 1113 / 1113 in 121 files** (B3.8: 983 in 112; +130 — §3) |
| Build | **PASS.** Entry 493.43 / 159.14 kB gzip (B3.8: 484.77 / 156.46 — the new strings ship in the entry, as in every phase, plus the calendar-date and plan-lapse code). `ClientApp` 38.92 / 12.26 (39.02 / 12.28 — unchanged). `CoachApp` 27.20 / 9.10 (23.83 / 8.06 — the sidebar groups, the read-only gate). Business Overview 19.01 / 6.03 (5.38 / 1.88 — the analytics and charts); **a first visit to Business 29.21 kB / 10.90 gzip** (13.52 / 5.72). The client's package screen 23.52 / 6.52 (13.52 / 3.70 — the payments card); the term sheet 7.28 / 2.83 (4.65) — _correction (final review §4): imported statically by the package panel and Renewals, so it loads with the package screen, not on demand_. Renewals 5.22, Packages 5.97, Exports 6.11 (payments CSV), export builders 4.06. Precache 205 entries |
| Budget (blueprint §9: each screen ≤ +20 %) | **Over on two screens, by the features themselves:** Business Overview (the analytics dashboard, owner decision 5) and the package screen (the payments ledger, decision 1). Every other screen within budget. No new polling — payments are read once per screen (`['coachPayments', coachId]`, fresh for 60 s) |
| PWA (production build) / signed-in offline boot | **PASS / PASS** (0 manifest or installability errors; offline reload from the precache; the update waits until the tab is hidden; the known `Unexpected token '<'` page error of the isolated stack). The first boot attempt never started its stack (an in-memory replica set left over from an interrupted run) and was retried under a fresh tag |
| **Full e2e3, all projects** | **364 passed, 0 failed, 0 flaky, 1 skipped of 365 — one complete run (1.3 h).** The skip is the approved Google sign-in case. 94 **8 / 8**; 95 **1 / 1**; 93 12 / 12; 20 12 / 12; 81 4 / 4; 85 7 / 7; 86 17 / 17; 87 19 / 19; 88 14 / 14; 89 16 / 16; 90 17 / 17; 92 15 / 15; 42 10 / 10; 46 12 / 12; layout 54 / 54 |
| Runs before it | the first certification ran on battery with 0.23 GB free RAM (16 environment failures, discarded); the second (`b38c-cert2`): 358 passed, 5 failed — all five re-run green (10-auth: environment; 86–89: the visual matrices kept every context open — fixed, §3); a run on the final tree was stopped at 10 / 365 for the 1024 px fix (§1, Phase 8), and its re-start reused the stopped run's database folder and could not start — a fresh run ID, nothing deleted |
| Accessibility (axe WCAG 2.1 A / AA) | spec 94: **16 scans** — the payments card, the payment sheet, the analytics overview and its table view, with the grouped sidebar, × 390 / 1440 × EN / AR: **0 violations**; spec 93: 32 scans, 0; spec 46: 0 critical |
| Visual QA | **47 matrix shots, 0 px overflow, correct `dir`** (`e2e-out/b38c-final-e2e2/b38c-visual/`); `B3_VISUAL_QA.md` §B3.8 completion |
| Physical devices | **Not run** — R-17 stays open |

### 5. Backlog outcome

| Outcome | Items |
|---|---|
| **Fixed** | B38-R1 (EGP only, decision 8) · B38-R2 (Fix C, decision 2) · B38-R3 (the device zone by decision 9; term days anchored to their zone) |
| **New** (known limitations / follow-ups — contracts §9) | B38C-R1 pre-B3.8 history entries counted as terms (P3, B5, clean launch) · B38C-R2 renewal refused during a pause (P3, B5, product decision) · B38C-R3 mid-term package change without pro-rating (P3, B5, owner decision) · B38C-R4 the anchor zone of a term (P3, B5) · B38C-R5 admin revenue aggregates still on their old formulas (P2, B5) · B38C-R6 `users.timezone` / `currency` and the refused legacy operations to remove once no older build runs (P3, Release hardening) |

Totals after this section: Open 201 · Fixed 188 · 488 entries (the backlog recomputes them from its rows). Unchanged: MD-01 / 02 / 03, every release blocker, REL-04, B36-R4, R-17.

### 6. Known limits and risks
1. The six limitations in contracts §9 (B38C-R1…R4, R-17) and B38C-R5 / R6 above.
2. **Payments are what the coach records.** Forma sees no bank, wallet or InstaPay transaction; every screen and the CSV say "recorded", never "verified".
3. **P2 is enforced by the server.** The app's gates are convenience; a coach with no Forma plan document at all is not locked by this rule (the app treats it the same way).
4. **The package screen grew with the payments card** (23.5 KB raw, 6.5 KB gzip — the payments feature itself); _correction (final review §4): the term sheet does not load on demand — it is a static import and loads with the screen (B38F-R4)_.
5. **A pre-existing look on the Arabic package card:** "days left" is in the mono face, whose wide space shows between Arabic words (the global RTL rule falls back per glyph) — unchanged, for the B3.9 polish pass.
6. Physical devices not run; R-17 stays open.

### 7. Selector and route changes

`B3_COACH_ROUTE_MIGRATION.md` §14 — no route added or removed; the sidebar's lit destinations; every changed test id (term sheet modes, the removed price sheet and currency fields, payments, analytics, P2, sidebar groups).

**Status: the B3.8 completion is implemented and certified locally on the final tree (full e2e3 364 / 365 in one complete run — 0 failed, 0 flaky, the approved skip; unit / API 1113 / 1113; typecheck, boundaries, build, PWA and offline boot green — §4). Not committed — awaiting the owner's approval. Nothing staged, pushed or deployed; no data deleted, reset or migrated; B3.9 not started.**

## B3.8 final review — financial boundary, transfer-in, unlinked payments, entitlements, bundle (2026-10-22)

**Owner brief (2026-10-22, after the certified B3.8 completion):** a strictly scoped final review before the owner approves the local commit. Forma has two financial domains that must never meet: **Forma ↔ coach** (platform subscriptions, trials, renewals, capacity add-ons — Forma's revenue, managed by the Super Admin) and **coach ↔ client** (the coach's own packages and the Cash / Mobile Wallet / InstaPay payments the coach records — the coach's business, not Forma's revenue). No Admin redesign, no change to a financial formula, no new accounting subsystem.

### 1. Findings and what changed

| # | Area | Finding (verified in code and by test) | Action |
|---|---|---|---|
| 1 | Expired / suspended coach receiving a client by transfer | **Already refused by the server, but no test proved it.** `transfers.resolve` stays callable while a coach is lapsed (it protects the client: reject, cancel, release), so the *receiving* coach's plan is checked inside the transfer's own transaction: `reserveClientSlot` matches only an `active` plan whose `endsAt` is in the future; otherwise `capError` → `PRECONDITION_FAILED` `SUBSCRIPTION_EXPIRED` / `SUBSCRIPTION_SUSPENDED`, the transaction aborts (no relationship, ownership, slot, term or archive written) and `transfers.resolve` puts the request back to `pending` | **9 regression tests** (§3). Mutation check: with the plan conditions removed from the slot gate, 8 of the 9 fail (the ninth is a positive path); the file was restored byte-identical |
| 2 | Payments not linked to a package | **Collected:** counted (money received — this month, all time, by method, in the trend). **Outstanding:** not reduced — only term-linked payments are taken off a package (`paidByTerm`). **Payments CSV:** the package cells were blank, the same as a package the file could not name. **Visibility:** the client's card listed the row as "Not linked to a package" but its Recorded / Outstanding and the Overview gave no hint, so Collected and Outstanding could both include the same money without a word; a client with **no** package recorded unlinked payments silently (the package field is hidden). **Later allocation:** supported — Correct on the payment, choose the package (a reversal + a payment for that package in one transaction, checked against its balance). **Correction / reversal:** as for any payment (void everywhere, kept, marked) | **Smallest label correction, no formula or server change:** `coachAnalytics` exposes `unlinkedMinor` / `unlinkedCount`; Overview › Overall says "N payments (EGP X) aren't linked to a package: they're in Collected but not taken off Outstanding. Link them with Correct…"; the client's card says how much was recorded without a package and how to link it; the payment form says when the client has no package to link to; the Payments CSV writes "Not linked to a package" in the package column (EN / AR / AR-EG) |
| 3 | Coaches with no `coachPlans` document | **Fail-open for P2, fail-closed for clients.** `writeStateOf(null)` is `ok`, so such a coach is not read-only; adding a client is refused (`NO_SUBSCRIPTION` — `reserveClientSlot` / `coachCapStatus`). Every coach-creation path creates a trial plan: `auth.signup` (one transaction with the user), `adminUsers.create` and `adminUsers.setRole` (`ensureTrialPlan` **after** the user write, not in one transaction). No API path deletes a plan document. The app never calls `coachPlans.createTrial` (the recovery procedure exists and is allow-listed). So the state is reachable only through legacy / manual data or a failed admin creation; such a coach cannot gain clients but keeps full write access to any clients it already has | **Not changed — owner decision required (B38F-R3).** Options in the report |
| 4 | Financial domain isolation | Verified: Forma revenue (`adminCoaches.list`: `trackedRevenue` from confirmed plan snapshots, `capacityRevenue` from capacity entitlements) reads no client term or payment; Business analytics read only the coach's relationships and `clientPayments`; Forma billing operations never write `clientPayments` / client terms; payment operations never write `coachPlans` / requests / entitlements; another coach is refused on every payment procedure. **Found (pre-existing, Admin, not changed):** Admin › Subscriptions shows "Total tracked MRR" = Forma coach revenue **+** `adminGrowth.clientMrr` (the monthly value of every coach's client packages) — the two ledgers added together (**B38F-R1**). Admin READ access to client payment records: `clientPayments.list` with `users.read` (admin and super admin by role; any account granted `users.read` as an extra permission); no admin screen calls it (**B38F-R2**, reported, pinned as it is) | **5 regression tests** (§3); B38F-R1 / R2 to the owner |
| 5 | Bundle budget | Attributed module by module against a B3.7 build of HEAD (§4). One documentation error found: the term sheet is **not** loaded on demand (§B3.8 completion §4 and §6.4 said it was) — `CoachSubscriptionPanel` and Renewals import it statically, so it loads with the package screen | Doc corrected here; lazy split proposed (B38F-R4); i18n split proposed (B38F-R5) |

### 2. API contract

Unchanged. No procedure, schema, index, rule or permission changed. `BusinessAnalytics` (app-only) gains `unlinkedMinor` and `unlinkedCount`.

### 3. Tests

| File | What it pins |
|---|---|
| `api/_trpc/routers/b38CoachP2.test.ts` (+9 → 22) | expired **and** suspended receiving coach × (the client's current coach accepts · an admin accepts, also with a new package · an admin moves the client directly): refused with the right reason; a snapshot of every collection except the request is identical; the client's coach, `assignedCoachId`, both slot counts, the term (and its id and price) unchanged; the request back to `pending`; the receiving coach gets no roster entry, no client data (`checkIns.get`), no relationship and no payments. Also: a lapsed coach cannot file a request or take a client through an invite made while live (no account, relationship or slot; invite still pending); still allowed — the lapsed requester withdraws, the current coach rejects, and after renewal the same request completes ("keep" hands over the term without the previous coach's price or term id; the payment stays the previous coach's); a lapsed **current** coach can still hand the client to a live coach, and release |
| `api/_trpc/routers/b38FinanceIsolation.test.ts` (new, 5) | client payments (record, unlinked, correct, reverse) and client package prices never change Forma revenue or any Forma billing document; Forma billing operations (suspend, reactivate, expire, extend, confirm, reject) leave `clientPayments` and client terms byte-for-byte unchanged; no cross-coach record / correct / reverse / read; admins read payment records through `users.read` and cannot write them; a suspended admin reads nothing; the grant is `users.read` itself (B38F-R2) |
| `src/lib/coachAnalytics.test.ts` (+1) | an unlinked payment is in Collected (month, all time, method, trend), never taken off Outstanding, counted as unlinked; a reversed one counts nowhere |
| `src/components/coach/ClientPaymentsCard.test.tsx` (+4) | the unlinked note (and none when all are linked); linking later through Correct sends a correction for the chosen package; a client with no package: the form says so and sends no package |
| `src/pages/coach/business/CoachBusiness.test.tsx` (+2) | the Overview coverage note with the amount; the Payments CSV names an unlinked payment in its package column |
| `e2e3/specs/95-b38c-visual.spec.ts` (seed + 2 assertions) | the matrix seeds one unlinked payment; both notes visible at every width and language |
| `api/_trpc/routers/subscriptionHistory.test.ts` (fixture fixed, assertion unchanged in strength) | **A test defect from the B3.8 completion, found by this verification:** the legacy term ended at "now + 25 days" and the test expected the renewal to start on `dateKeyIn(end + 12 h)`, while the server applies the pinned legacy rule (`dayAfterEndInstant`: an end within ±2 h of midnight is that boundary; a mid-day end keeps its day as the partial last day — `civilDateParity.test.ts` line 94). The two agree only when the suite runs between about 12:00 and 02:00 Cairo time; it failed at 04:47. The end is now 15:00 Cairo on a fixed day and the expected start is the next day — the server code is unchanged and correct |

### 4. Bundle review

Measured on production builds with source maps: the B3.8 tree against a build of HEAD (B3.7, `025445c`, same dependencies), bytes attributed to source modules.

| Chunk | B3.7 → now | Where the growth is |
|---|---|---|
| Entry | 480.48 / 155.24 → **494.10 / 159.34** kB (B3.8 certified: 493.43 / 159.14 — this review adds 0.67 kB of strings) | **+12.5 kB raw / +3.5 kB gzip of English strings** (`en.json` is inlined in the entry: 113.1 → 125.6 kB minified; `business` +8.3, `payments` +2.1, `forma` +1.2, `subscription` +1.1), `lib/format.ts` +1.2 (EGP formatting), `planLapseSignal` +0.2, `trpc.ts` +0.2. Arabic bundles load on demand (ar 185.8 kB, ar-eg 180.0 kB raw) |
| Business, first visit | 13.52 / 5.72 → **29.47 / 10.97** kB (certified 29.21 / 10.90) | Overview chunk = `business/charts.tsx` 7.8 + `OverviewTab` 7.1 + `coachAnalytics` 3.1; plus `coachBusinessApi` 4.0, `payments` 0.9, `clientPaymentsApi` 0.9 — the analytics dashboard itself (owner decision 5) |
| Client package screen | 13.52 / 3.70 → **23.86 / 6.61** kB, **+ the term sheet 7.28 / 2.83** = 31.14 / 9.44 actually downloaded (certified 23.52 / 6.52 + the same sheet) | `CoachSubscriptionPanel` 11.8 + `ClientPaymentsCard` 10.0 (owner decision 1); **plus the term sheet chunk 7.3 kB / 2.8 kB gzip, loaded statically** |

**Accepted budget exceptions (owner decisions 1 and 5):** Business first visit and the package screen exceed the blueprint's +20 % by the features themselves; lazy-loading the charts or the payments card would not reduce what a first visit downloads (both are on screen at once).

**Proposed (not done — B5 / owner):** B38F-R4 load `SubscriptionTermSheet` on first open (move `toMs` / `toDate` / `todayStr` / `invalidateSubscription` / `primaryTermMode` to a small module; `React.lazy` in the package panel and Renewals) — saves 7.3 kB raw / 2.8 kB gzip on every first visit to a package screen; B38F-R5 ship each role's strings with its app chunk (client / coach / admin namespaces) instead of the whole `en.json` in the entry — the largest item in the entry (≈ 25 %), under PF-17.

### 5. Verification (2026-10-22, the final tree)

| Gate | Result |
|---|---|
| Typecheck (incl. `api/**` tests) / boundaries | **PASS / PASS** |
| Unit + API `vitest run` | **PASS — 1134 / 1134 in 122 files** (certified: 1113 / 1113 in 121; +21 new tests, 1 file). The first full run on this tree: 1133 / 1134 — the one failure was the time-of-day test defect in §3, fixed |
| Build | **PASS.** Entry 494.10 / 159.34 kB gzip; `CoachApp` 27.20 / 9.11; `ClientApp` 38.92 / 12.26 (unchanged); Overview 19.27 / 6.10; package screen 23.86 / 6.61; term sheet 7.28 / 2.83; precache 205 entries |
| PWA (production build) | **PASS** — every result line identical to the certified run (`e2e-out/.tmp/b38f-pwa.txt`) |
| Signed-in offline boot | **PASS** — fresh stack `b38f-boot-stack`, client home renders offline, lazy runtime chunks from the SW, the known `Unexpected token '<'` page error of the isolated stack |
| e2e3, focused (`b38f-focus-1`, chromium-1440) | **59 / 59 passed** in 11.7 min — specs 20 (coach core: package card), 46 (accessibility), 88 (workspace / package screen), 93 (Business, exports, 32 axe scans), 94 (payments, Fix C, P2, sidebar, widths, 16 axe scans), 95 (visual matrix) |
| Visual matrix (spec 95) | **47 shots, 0 px overflow, right `dir` on every shot** (25 LTR, 22 RTL) with the unlinked payment seeded; both notes checked by eye in EN and AR (`e2e-out/b38f-focus-1/b38c-visual/`) |
| Full e2e3 | **Not re-run**: no shared financial, subscription or authorization behaviour changed (server code untouched; the app change is two notes, one CSV label and an additive analytics field). The certified full run (`b38c-final-e2e2`, 364 / 365) stands for everything else |
| Physical devices | Not run — R-17 stays open |

### 6. Backlog outcome

| Outcome | Items |
|---|---|
| **Fixed** | B38F-R6 payments not linked to a package said nowhere (P2) |
| **New — owner decisions** | B38F-R1 Admin "Total tracked MRR" adds coach-client value to Forma revenue (P2, Recommended before launch) · B38F-R2 `users.read` reads any coach's client payments (P2, with REL-02) · B38F-R3 a coach with no plan document is not read-only (P2) |
| **New — B5** | B38F-R4 the term sheet loads statically with the package screen (P3) · B38F-R5 the English strings ship in the entry (P3, see PF-17) |

Totals: Open 206 · Fixed 189 · 494 entries (recomputed from the rows). Unchanged: MD-01 / 02 / 03, PWA-06, R-17 and the physical-device matrix, REL-01…04, B36-R4, every release blocker.

### 7. Known limits and risks
1. The three owner decisions above (B38F-R1…R3) are open; nothing in Admin, permissions or the no-plan rule was changed.
2. Unlinked payments stay a valid choice (an advance before a package is set up); they are now visible everywhere, and linking is a correction (reversal + payment), so "Reversed this month" also counts a re-link.
3. The bundle exceptions above are accepted by the features; B38F-R4 / R5 are the measured follow-ups.

### 8. Found by the B3.9 read-only audit the same day (recorded, not changed)

Verified in code after the review; none was introduced by B3.8 and no code was changed for them:
- **B39A-S01 (P0, release blocker)** — `auth.requestPasswordReset` builds the reset link from the request's `Origin` header before `APP_BASE_URL` (unchanged since 2026-10-03); `invites.create` / resend do the same. Nothing in front of tRPC checks `Origin`, so a forged request mails a genuine reset link pointing at another host. Owner approval needed for the fix.
- **B38F-R7 (P3)** — `clientPayments.list` is capped at 5,000 records without paging; Business, the exports and the client's card compute from it.
- Further verified B3 / release items (two coaches assigning one client at once; `endRelationship` without compare-and-set; plan versions visible to the next coach after a fresh start; `subscriptionRequest.decide` without a status check; B3-S09) are in the B3.9 audit report for the owner's decision.

**Status: B3.8 final review complete and verified locally. Not committed — awaiting the owner's approval. Nothing staged, pushed or deployed; no data deleted, reset or migrated; B3.9 not started.**


## B3.8 finalization — owner decisions B38F-R1 / R2 / R3 (2026-10-22)

**Owner brief (2026-10-22, "B3.8 Finalization, Critical Security Hotfix & B3.9"):** the final review and the B3.9 audit are approved as the planning baseline. Three B3.8 findings are decided: Forma Admin manages the Forma ↔ coach financial relationship only (R1); a coach's client-payment records are private to that coach (R2); a coach with no valid Forma subscription or trial is read-only — default-deny (R3). No commit.

### 1. What changed

| Decision | Change | Files |
|---|---|---|
| **R1 — Forma revenue is Forma's** | `adminCoaches.list`: `trackedRevenue` counts only active paid terms with a **confirmed payment** (`subscription.confirmedAt`, written only by `coachPlanRequests.confirm`); `capacityRevenue` counts only active **monthly** add-ons bought through a **confirmed request** (`source: 'request'`). New counts `unconfirmedPaidCoaches`, `grantedAddons` (not revenue). `adminGrowth.get` no longer returns `clientMrr` (and its `currency`) — no coach-client money is aggregated in Admin; the dead `monthlyOf` helper is removed. Admin › Subscriptions: hero **"Forma recurring revenue / mo"** = subscriptions + add-ons, split by source; the "Client subscriptions (MRR)" and "Total tracked MRR" lines are gone; a line says what is not counted. The Overview dashboard tile uses the same figure and label. One-time add-ons stay out of the monthly figure | `api/_trpc/routers/adminCoaches.ts`, `adminAnalytics.ts`, `api/admin/_lib/subscription.ts`, `src/pages/admin/AdminSubscriptions.tsx`, `admin/dashboard/OverviewPanel.tsx`, `services/platform/adminCoachesApi.ts`, `adminGrowthApi.ts`, i18n ×3 |
| **R2 — payments private to their coach** | `clientPayments.list` → coach-only, the caller's own ledger (`coachId`, if sent, must be the caller); no permission (`users.read`, `clients.readAll`, an extra grant) reads another coach's ledger; record / reverse / correct were already coach-only and ownership-checked. Admin reads of a relationship (`coachClients.get`, `.list` by client or by coach) and of the member list (`adminMembers.get`) carry **no package economics** (price, currency, package name, billing cycle, the coach's term note — also in history, earlier stints and audit snapshots) — status, dates, length, freezes and the term id remain (no admin screen reads those fields). The coach and the client still see theirs. Forma's own billing administration is untouched | `api/_trpc/routers/clientPayments.ts`, `coachClients.ts`, `adminAnalytics.ts`, new `api/coach-clients/_economics.ts` |
| **R3 — no plan = read-only** | `writeStateOf(null)` → `none` → `PRECONDITION_FAILED` `NO_SUBSCRIPTION` for every gated coach mutation (default-deny, the same allow-list: account, Forma activation / recovery, read markers, client protection, support); `messages.send` and coach uploads (avatar only) too. `adminUsers.create` and `adminUsers.setRole` write the account and its trial in **one transaction** (as `auth.signup`); `setRole` never gives a second trial (idempotent `ensureTrialPlan`). `coachPlans.createTrial` (recovery) stays idempotent and is refused (`NO_SUBSCRIPTION`) for an account with Forma history (a request, an add-on or any relationship) but no plan document — no second trial, no silent extension. App: a coach the server answers "no plan" for is read-only (never mid-load or on a failed read) with its own sentences; `NO_SUBSCRIPTION` joins the plan-lapse signal (tRPC + uploads) | `api/_lib/coachEntitlement.ts`, `api/media/_lib/policy.ts`, `api/_trpc/routers/adminUsers.ts`, `coachPlans.ts`, `src/components/coach/CoachPlanProvider.tsx`, `ClientCapBlocked.tsx`, `MessageThread.tsx`, `services/platform/planLapseSignal.ts`, `mediaApi.ts`, `lib/errorKind.ts`, i18n ×3 |

### 2. Tests

| File | What it pins |
|---|---|
| `b38FinanceIsolation.test.ts` (5 → 8) | admins and super admins cannot read, record, correct or reverse payments (direct API calls, by coach / own / client); a coach granted `users.read` + `clients.readAll` still reads only its own ledger; admin relationship and member reads carry no economics while the coach and the client see theirs; `adminGrowth` has no client money; only payment-evidenced recurring income counts (confirmed subscription, a hand-written "paid" plan excluded, admin-granted and one-time add-ons excluded) and a coach's packages and collections never move it |
| `b38CoachP2.test.ts` (22 → 26) | every gated mutation of a no-plan coach → `NO_SUBSCRIPTION`; send and uploads refused, avatar allowed, reads / account / activation open; `createTrial` for a fresh account once (idempotent, nothing reset), refused with history (relationship; an old request), never extends an expired plan; admin-created and promoted coaches exist only with their plan and promotion again gives no second trial |
| `clientPayments.test.ts`, `b301Ownership.test.ts`, `certification.test.ts` | the old admin-read expectations replaced by the owner's rule; "no plan" error semantics now `NO_SUBSCRIPTION` for the coach, `CONFLICT` "no active Forma subscription" for an admin assigning to that coach |
| `CoachPlanProvider.test.tsx` (+2) · `AdminSubscriptions.test.tsx` (new, 3) | no-plan read-only (not while loading), `NO_SUBSCRIPTION` re-reads the plan; the Admin hero = Forma revenue only, split, exclusions stated, no client figure |
| Fixture: `api/_lib/testFixtures.ts` `ensureCoachPlan` | 23 API suites created coaches without a plan document (which no real coach can have since B38F-R3); they now give them one — the authorization assertions they make (`FORBIDDEN` for a stranger coach) are unchanged and still exercised. `admin.test.ts` runs on a replica set (production is one) for the transactional creation |

### 3. Verification (B3.8-final state, before the security hotfix)

- API 724/724 · UI unit 417/417 · typecheck (app + api) clean · build OK (entry 494.96 kB / 159.48 kB gzip).
- **Full e2e3** on a frozen copy of the tree (`D:\Gym-b38cert`, isolated stack, ports 5197/5297): **364 passed, 1 skipped** (the approved Google sign-in skip), exit 0, 1.2 h (run `b38fin-full-1`, 14:30–15:40).
- Commit boundary snapshot: `e2e-out/.tmp/commit-boundaries/01-b38-final.*` (135 tracked + 50 untracked; excludes `B3.9_AUDIT_AND_PLAN.md` and every later change).


## Security hotfix — B39A-S01 (P0) password-reset poisoning · B36-R4 (P1) rate limits (2026-10-22)

**Owner brief:** highest priority, before any B3.9 UI work; security fixes inside authentication backend logic are allowed (no auth-screen redesign); no secret, infrastructure, production or deploy change.

### 1. B39A-S01 — emailed links on a trusted origin only

**Before:** `auth.requestPasswordReset` built `${ctx.req.headers.origin || APP_BASE_URL || 'https://www.useforma.fit'}/reset/<token>`; `auth.signup`, `invites.create` and `invites.claim` built their links the same way. Nothing in front of tRPC checks `Origin`. A request with a forged `Origin` for a victim's email made Forma mail the victim a genuine reset link to the attacker's host → the token → account takeover (any role). Also: with no email key, the reset link (token) and invite links were written to the server log (`auth.ts` dev branch, `email.ts` fallbacks).

**After:** `api/_lib/appUrl.ts` `trustedAppOrigin()` — the ONE source of emailed links: `APP_BASE_URL`, validated as a bare origin (https; http only for localhost outside production; no credentials, path, query, fragment); production without it → the built-in `https://www.useforma.fit` (a constant), logged once; anything else (invalid value; missing outside production, a Vercel preview included) → `AppUrlError` → **fail safe**: no email, and for a reset **no token stored** — the reply stays `{ ok: true }` (no enumeration). Request headers (`Origin`, `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `Forwarded`, `Referer`) are never read for links. Every call site uses it (`auth.signup`, `auth.requestPasswordReset`, `invites.create`, `invites.claim`). Tokens and invite links never reach the logs; only the token's hash is stored (unchanged). The legitimate journeys are unchanged (spec 10 resets, invite / claim specs).

**Tests:** `api/_lib/appUrl.test.ts` (6) — the policy; `api/_trpc/routers/b39Security.test.ts` (9) — forged `Origin` / `Host` / `X-Forwarded-*` / `Forwarded` / `Referer` never reach the link; missing `Origin`; configured production origin; production with no configuration → the constant; six invalid / missing configurations → nothing sent, no token stored, same reply; unknown email; the emailed token resets once and is never logged (console captured); invite and welcome emails on the trusted origin; an invite with no trusted origin is created but not mailed. **Mutation check:** with the old `Origin`-first line restored, 3 tests fail (file restored byte-identical).

**Production exposure (not changed — owner action):** production runs RC2 `cf3a5d9`, deployed via CLI, with `APP_BASE_URL` **unset** (`FORMA_FINAL_PRODUCTION_RELEASE_REPORT.md`), so it builds reset and invite links from the request's `Origin` today. Proposed incident-response checklist (each step owner-run, after approval):
1. Deploy this fix (the only code change needed; no new secret). Optionally set `APP_BASE_URL=https://www.useforma.fit` in Vercel **Production** and the preview URL in **Preview** (otherwise previews send no emails, by design).
2. Invalidate outstanding reset tokens: delete or mark `used` every `passwordResets` row with `expiresAt` in the future, right after the deploy (tokens live 1 hour, so the window is short; clean launch replaces the database anyway).
3. Review the email provider's sent log (Resend) for password-reset and invite emails whose links point at a host other than `www.useforma.fit`; and the Vercel function logs for `requestPasswordReset` bursts. If `RESEND_API_KEY` was ever unset in production, the function logs contained reset links with tokens — restrict and purge those logs.
4. For any account with a reset confirmed shortly after a suspicious request: revoke its sessions (`revokeAllUserSessions`), force a new password, notify the owner of the account.
5. Record the outcome in REL-02 (security / privacy review).

### 2. B36-R4 — server-side rate limits

**Infrastructure:** `api/_lib/rateLimit.ts` (Mongo fixed window, shared by every instance) now increments with one atomic `findOneAndUpdate` and survives the race of two first hits on a new window (duplicate key → one retry as an update); a refusal is `TOO_MANY_REQUESTS` with `cause` `RATE_LIMITED` and `retryAfter` (seconds to the window's end), surfaced by the error formatter as `error.data.reason` / `error.data.retryAfter`.

| Procedure | Limit (proposed — owner to confirm) | Where |
|---|---|---|
| `messages.send` | **300 per sender** and **60 per conversation** per 10 minutes | after the idempotent replay (a retried delivered message never counts) and after authorization and the plan gate |
| `invites.create` | **30 per creating account per hour**; **5 per destination address per 24 h** across every coach | before anything is written or mailed |

Why these values: a broadcast to a whole roster (capacity ≤ ~100 today) fits the per-sender window three times over; 60 messages in 10 minutes in one conversation is beyond a fast human chat; 30 invites an hour covers onboarding a group; 5 invitations of one address a day stops one inbox being flooded from many throwaway trial coaches. The app already handles the refusal: the outbox keeps a rate-limited message and retries after ≥ 30 s (`outbox.ts`), a broadcast lists such recipients as not sent with retry. They do not change any existing user flow; they are named constants (`MESSAGE_SEND_LIMIT`, `INVITE_CREATE_LIMIT`) if the owner wants others.

**Tests (`b39Security.test.ts`, +6):** per conversation 60 then `RATE_LIMITED` + `retryAfter` (also on the wire: `data.reason`, `data.retryAfter`, HTTP 429) and nothing stored, other conversations unaffected; a delivered retry acknowledged in a full window; **70 concurrent sends → exactly 60 stored, 10 refused**; per sender across conversations (a client too) and recovery in the next window; authorization first (a stranger coach is `FORBIDDEN` and consumes no counter); invites per account and per address across coaches, refusals creating and mailing nothing.

### 3. Verification (security checkpoint)

API: `b39Security` + `appUrl` 15 / 15; messaging, invites, auth, ownership and P2 suites 176 / 176; typecheck, boundaries, build PASS (entry 494.96 / 159.48 kB gzip). Browser: specs 10 (auth / reset), 20 (invite → claim), 31 / 90 (messaging), 94 run after the B3.8 full certification (two isolated stacks at once would starve this machine) — results in §B3.9 certification.

## B3.9 — Coach blueprint completion (implementation, 2026-10-22)

Scope and order: `B3.9_AUDIT_AND_PLAN.md` §7 (owner-approved baseline). Local only — nothing staged, committed or deployed.

### B3.9.0 (C0) — test safety net

- **Clock / timezone independence (e2e3 specs).** A new `e2e3/specs/_dates.ts` holds the Cairo civil-date helpers (`cairoDay`, `addDays`, `daysBetween`, `cairoMidnight`, `cairoNoon`, `weekStartOf` (Saturday, as the app), `cairoMonth`, `anchorAt` / `dayRolled`).
  - Checked against `src/lib/civilDate.ts` over 1,200 consecutive days across both Egyptian DST changes: 0 differences.
  - Specs 86, 87, 88, 93, 61, 80, 81, 20, 94 and 95 now step calendar days on the date key, not 24 h.
  - Module-load "now" anchors were removed: fixtures are built at seed time and re-seeded if Cairo midnight passes during the run.
  - 81's freeze was one day short across the 25-hour DST-end day; fixed.
  - 94/95 had a private copy whose day started at 03:00 on DST-start days (the app starts it at 01:00); replaced.
- **Selectors.** 20 (custom price by label, not the 2nd input), 40 (avatar through the real file chooser), 92 (sort header by role; target by name), 89 (new section by `data-section-id`; cardio move button by its accessible name) and `_a-helpers` (`/coach/me` → `me-sign-out`). The admin sidebar is scoped by its admin link (13, `_d-layout`).
- **Language waits.** A shared `waitForLocaleSaved(page, locale)` replaces fixed sleeps: it waits for `<html lang>` and the account's IndexedDB settings to hold the new locale. That stored copy is what a reload reads; a coach's language never reaches the server.
- **Coach offline boot.** New script `e2e3/pwa/b39-coach-offline-boot.mjs`. It refuses to run unless the stack is loopback-only (`current-env-<port>.json`, loopback Mongo and Bunny stub, seeded coach).
  - Phone and desktop.
  - It goes offline, reloads, then navigates Today → Clients → Messages → Library → Today.
  - It fails on a login screen, the error boundary, a self-reload, a chunk fetched from the network, or a screen not rendering.
- **Bundle report.** New `scripts/bundle-report.mjs` and `scripts/bundle-budgets.json` report each coach screen's first-visit closure, minus what the entry has already loaded. Its parsed closures match Vite's own preload lists for all 78 dynamic imports. `--strict` fails a budget overrun or a missing chunk.
- Known remaining wall-clock / run-order ties are listed for B5 (fixed sleeps in 20/31/32/40/42/43/61/86/90; run-order seeds 20→80, 86, 87, 90).

### B3.9.1 (C1) — server integrity

- **One active relationship per client.**
  - `assignExistingClient` is now one transaction: CAS-claim the user (`assignedCoachId` missing/null), then `reserveClientSlot`, then `activateRelationship`.
  - Index script `uniq_active_client` (unique, partial `status:'active'`) with a duplicate preflight. It is not built against existing data without owner approval; on duplicates it is skipped with a warning.
- **`endRelationship` CAS.** One transaction on `status:'active'`.
  - Already ended as released/unassigned: idempotent.
  - Otherwise: CONFLICT.
  - It unsets `assignedCoachId` only where it still names this coach, and releases the slot in the same session.
- **Plan-history isolation (B3-S09).** A coach sees only the versions from their current stint (`createdAt >= relationship.createdAt`) in `list` and `restore`, capped at 200.
- **Check-in review / delete / decide CAS.**
  - `review` only on submitted/reviewed (`CHECKIN_NOT_SUBMITTED`). The first review is a CAS on `submitted`; edits are a CAS on `updatedAt`. Unchanged feedback means no write and no notify.
  - `delete` only while `requested` (`CHECKIN_ANSWERED`).
  - `subscriptionRequest.decide`: CAS on `pending` and this stint, no upsert (`REQUEST_ALREADY_RESOLVED`).
  - Assessment `review`: CAS on submitted/updated_after_review, idempotent (`ASSESSMENT_NOT_SUBMITTED`). `saveDraft` keeps a reviewed status. The UI offers "Mark reviewed" only for a submitted assessment.
- **Privacy.**
  - `banners.list` requires `flags.manage`.
  - `invites.list` redacts email/phone on non-pending invites for non-assigners.
  - `transfers.create` derives `fromCoachId` on the server.
  - Incoming transfers are limited to the coach's active clients.
  - Resolving as the from-coach needs `assertCurrentCoach`.
- Tests: `b39Integrity.test.ts` (15, real concurrency on a replica set; the assign race test fails without the CAS — mutation-checked). Updated: b34 (answered delete → CONFLICT), certification (the `fromCoachId` hijack is filed against the real coach), banners (admin lists; coach forbidden). Affected suites 81/81.

### B3.9.2 (C2) — honest states

- **Paused reads.** React Query pauses a fetch while it believes the device is offline. A paused read with nothing on the device is now **offline**, never an endless skeleton and never "nothing here".
  - `screenStatus` takes `paused`.
  - New `queryScreen(q)` / `useQueryScreen(q)` map a query result.
  - Coach sources carry `paused`.
- **Converted to offline / error / loading / stale:**
  - Today, Clients, Messages (list).
  - Workspace Plan lines and the Progress week.
  - Check-ins, Timeline, Assessment.
  - Add-client pending invites.
  - Transfer lists (error + Retry), assign-program roster.
  - Plan history versions.
  - The Summary plan card and check-in line: "Couldn't load" / "Offline — not on this device yet" plus "Some of this couldn't load · Retry" — no bare "—".
- **Write gates.** New invite (plan + connection); revoke, transfer approve/reject/cancel (connection); assign program (`useWriteGate`); history save-with-note and restore (connection; the editor is behind the plan gate).
- **TS-02 — one translated error line.** New `src/lib/errorMessage.ts`, `errorMessage(e, t, fallbackKey?)`, in this order:
  1. the server's stable reason (`forma.reason.*`);
  2. the failure kind (no connection; rate limited, with minutes from `retryAfter`; session; server);
  3. the refusal code (forbidden, gone, changed meanwhile, not valid, not now);
  4. the fallback.

  The server's English text (sometimes validation JSON or E11000) is never shown. 44 UI error paths in coach, admin, the password sheet and the assessment wizard were switched.
  - `commercialErrorMessage` now delegates to it.
  - A wrong current password (UNAUTHORIZED) reads as such, not as "session ended".
  - Auth screens (login, reset, accept-invite) were not touched: authentication-page scope.
  - New reasons translated: `CHECKIN_NOT_SUBMITTED`, `CHECKIN_ANSWERED`, `ASSESSMENT_NOT_SUBMITTED`.
  - Found by the full certification run (spec 21): a transfer refused by the RECEIVING coach's capacity read "Client capacity reached — add client capacity…" to the approving coach, as if it were their own. The server now sends `DESTINATION_CAPACITY_REACHED` / `DESTINATION_NOT_ACCEPTING` for the transfer path (`capError(…, DESTINATION_CAP_REASONS)`), translated "The receiving coach has no free client places…" in EN / AR / AR-EG. Pinned by `_capReservation.test.ts` and spec 21.
- **TS-06 — toast titles are outcomes:**
  - Client transferred.
  - Check-in requested / reviewed.
  - Subscription frozen until {date} / unfrozen / ended / cancelled / extended by N days.
  - Pause accepted / declined.
  - Coach plan renewed for 30 days.
  - Coach suspended / reactivated.
  - Account created.
  - {name} added to your clients (name isolated).

  The question toast ("Make this a custom override?") is now "Now a custom version for this client"; its orphan key was removed.
- Tests: `errorMessage.test.tsx` (8, EN + AR + AR-EG; asserts no English or raw server text in Arabic) and `ScreenState.test.tsx` (+4, paused). UI unit: 62 files / 434 tests green. Typecheck clean.

### B3.9.3 (C3) — shared design primitives

- **VS-01 — button sizes are real.** `.btn-sm` now sits after the variants: each variant `@apply btn` re-declared the base size, so the modifier was dead and every "small" button rendered 48 px.
  - Dense size: 32 px visual, 12 px text, 44 px hit area.
  - The per-site `h-8 px-3 text-[11px]` / `h-9 … text-[13px]` hacks (which lost to `min-height` anyway) are now `btn-sm`.
  - `.btn-lg` is left alone: it is used only by the frozen marketing page and onboarding.
- **AX-01 — 44 px hit area.** The shared invisible area under `.btn-sm`, `.chip`, `.seg` buttons, `.sec-link` and `.icon-btn` is a guaranteed 44 × 44 px, centred (as `.hit-44`). The old `inset: -4px` reached only 40–42 px.
- **AX-08 — selected chips.** A selected chip is also semibold and double-outlined — never colour alone. 23 toggle chips got `aria-pressed`; the rest already had `aria-pressed`, `role` or a radio role, or are static badges.
- **B33-R1.** `.pill-bad` uses the AA-safe `danger.text` token; the per-screen `toneText` workaround is gone.
- **VS-10 — one status vocabulary.** New `src/lib/statusTone.ts` holds one map per domain: subscription, account, client state, coach plan, check-in, assessment, transfer, plus `TONE_TEXT`. 11 screens' local maps were replaced. A trial is `info`, not brand (VS-05).
- **VS-04 — 12 px floor.**
  - `.pill`, `.ui-label`, `.sec-link`, `.btn-sm` and `.seg` are 12 px everywhere.
  - `.label`, `.eyebrow` and `.stat-label` are 12 px inside the signed-in app only. `useAppSurface` marks `<html data-surface="app">`, so portals are included; the marketing and auth pages are untouched.
  - 54 sub-12 px utilities on coach screens and the shared coach-facing components (DataTable, MetricCard, TabBar, CommandPalette, MessageThread) are now 12 px.
- **Mono in Arabic.** Inside the app, Arabic text styled `font-mono` uses the Arabic face with tabular figures. `.stat-unit` is translated text, so it uses the Arabic face too. Numbers meant to be compared keep `t-numeric` / `stat-num`.
- **VS-17 — charts.**
  - Chart colours are tokens (`--ui-chart-grid / track / guide / label`).
  - LineChart axis labels are HTML at a real 12 px; the old SVG text in a scaled viewBox rendered about 8 px on phones and 17 px on wide cards.
  - Every chart label and legend is at least 12 px.
- **VS-02 — focus.** The remaining hand-coloured focus rings now use the `ui-focus` token.
- **CD-02 / RM-31 — one KPI tile.** `Metric` (+ `MetricGroup`, one hairline surface) is the coach tile: promoted from Business and used by Business, Progress › Body and Progress › Day. Admin keeps `MetricCard`. The old shared `StatTile` is deleted (git grep: no importers; the marketing page has its own).
- **VS-13 / RM-33 / RM-49 — headers.**
  - Inside the workspace, Check-ins and Assessment are `h2` sections, not a second `h1`.
  - Messages on phones uses the coach page header (`t-title`) like Today, Clients, Library and Business.
  - No FORMA eyebrow on Account.

### B3.9.4 (C4) — coach screen polish

- **One weekly metric (owner).** New `weekTraining()`: distinct completed plan days ÷ plan days, with sessions shown beside it. Summary and Progress use it, so "4 of 3" can no longer happen. Tests: `coachWorkspace.test.ts` +1.
- **CO-19 (D6).** The "Flag custom swaps for review" switch and the "Needs review" badge are gone: coach editor, coach views and the client's Nutrition. The client no longer flags swaps. Stored legacy fields stay readable; there is no migration. Orphan strings were removed, as was `assessment.photosSoon`. Spec 89 was updated (the switch is gone; another policy is toggled).
- **D10.** The `…/versions/:kind` URL redirects to that editor with its History sheet open (`?history=1`, read once). The Plan section's History links there too. `PlanVersionHistory.tsx` and the unused `VersionActions.tsx` are deleted. Tests: `versionsTarget` unit, plus a spec 89 redirect test.
- **Today (≥ 1280).** A 5 : 7 split. The panel shows the client's context (package, last workout, 7-day workouts, this week's check-in) from Today's own directory rows, with no extra reads. Its actions are content-width; a phone sheet keeps full-width actions.
- **Hierarchy (CD-01 / CD-04).**
  - Summary: one hero box ("Needs you"); Training and Body are unboxed sections; Plan, Check-in and Note are one grouped surface.
  - Business Overview: the 8 equal tiles are two `MetricGroup` strips.
  - Subscription panel: Renew is content-width from `sm`.
  - History rows are a hairline group, not a card in a card (CD-03).
- **Progress sub-views rebuilt** (honest states: loading / offline / error / stale / empty):
  - Body: weights as one `MetricGroup` (latest, change since) + chart + list; the duplicate measurements snapshot was dropped.
  - Measurements (RTL-11):
    - A real table that follows the page direction, with Δ in cm and neutral deltas.
    - The entry form appears only once entries have loaded, so a failed read can never save over values it never saw.
  - Cardio: the plan and the day as grouped surfaces; units on every figure; "Not logged" instead of "—".
  - Photos: real buttons with translated names (pose · date); a responsive grid.
  - Nutrition: nothing is totalled until the plan and the log have loaded; kcal / g / ml units; tokens instead of slate / sky.
  - Day view: states and one `MetricGroup`.
- **CO-13.** Check-ins: the list to review leads; "Request this week's" is the section's secondary action.
- **VS-05.**
  - Library: while the starter panel is shown, "Add the starter library" is the one primary and the header's "New …" is secondary.
  - Editors: "Save plan" is orange only while there are unsaved changes.
- **Meal name at 1024.** Name and slot stack between 1024 and 1279 px (the name was about 120 px wide).
- **B2-R03.** MeasurementForm was rebuilt once for both roles:
  - no "0" placeholders that read as values;
  - cm on every field;
  - 12 px labels;
  - tokens.

### B3.9.5 (C5) — accessibility & RTL

- **Skip link and focus on navigation (AX-05).** `SkipLink` and `useRouteFocus` are in every shell. There is one `#main-content`. After a route change, focus moves to the new screen's `h1` (or its main region), unless the screen already focused something.
- **One focus trap (`useFocusTrap`)** for Sheet, the dialog host, the command palette, the media viewer and the phone task screens (plan editor, thread):
  - Tab cycles enabled, visible controls only.
  - Escape closes the top layer only — a confirm over a sheet never closes both — and respects a handler that already took the key.
  - Everything outside the top layer is `inert`. The toast region (now portaled to `<body>`, `data-trap-keep`) stays live.
  - Tests: `useFocusTrap.test.tsx` (6), plus spec 96.
- **Arrow keys (`rovingIndex`).** Tabs and the segmented control (roving tab stop), ActionMenu (Up / Down / Home / End over enabled items), and the cardio type and broadcast audience radio groups. Left and Right follow the reading direction.
- **AX-03.** The four freeze date fields are labelled; the check-in feedback and assessment notes textareas are named; the four nutrition-editor chip pickers are named groups. **AX-11:** template days are `h2`, sections `h3` (no skipped level).
- **RTL-07.** The `assessment.activities.moderate` key was added; unknown cardio types read "Other"; the activity level falls back to "—".
- **RTL-09.**
  - In Arabic, inside the app, every interpolated string (names, titles, dates) is isolated (FSI … PDI) by the i18next formatter (`alwaysFormat`). Counts are untouched; the website is excluded.
  - Language options carry `lang`.
  - The ErrorBoundary is translated (EN fallback) and sets its direction.
- **B32-R1.** Check-in notes and coach feedback render with `dir="auto"` on both sides.
- **Plural.** `coachLib.templatesUpdated` is a real `count` plural in EN / AR (six forms) / AR-EG; the owner's Egyptian wording is kept as the `few` form.

### B3.9.6 (C6) — performance

- **PF-07 / RM-84 — one cache entry per resource.**
  - Weigh-ins: header, Summary and Body share `clientWeightLogsQuery` (3 reads → 1).
  - Business reads the roster through the shared `['myClients']` entry (`ensureQueryData`) instead of downloading it again.
  - The workspace header starts from the roster's public user record (no second `user` read while the roster is fresh).
- **PF-12.** A check-in review writes the result into the client's check-in list (`writeReviewToCache`) instead of refetching it; the coach-wide summaries still refresh. Remaining (library CRUD, notes, term, payments cache writes) → B5.
- **PF-22.**
  - The Nutrition view polls only the nutrition log: one procedure every 15 s instead of five (20 → 4 calls / min).
  - The plan-request banner is read and polled on Today only, where it shows.
- **B38F-R7 (part).** The workspace Payments card reads that client's records only (server-filtered), not the coach's whole ledger.
- **Messages.** The roster e-mail lookup is a Map, not a scan per row (it was O(n²) at 200 clients).
- **PF-14 (server, owner D5: projections, indexes, bounded windows):**
  - Thread summary: `$sort` by (clientId, createdAt), the existing index order, instead of an in-memory sort of every message.
  - Roster ids: projections on relationship reads (`listMyClientUsers`, `listForCoachClients`).
  - Check-in overview: `$topN` (12 per client) in the database instead of every check-in ever.
  - Directory: the 7-day count reads 7 days, and the last workout is each client's newest date read in index order.
  - New additive indexes in `scripts/mongo-init-indexes.mjs` (not unique, not built here): `notifications {clientId, forRole, seenAt}`, `syncRecords {clientId, collection, data.finished, data.date}`.
  - Counters and paging → B5.
- Tests: `b39Integrity.test.ts` +2 (a bounded read keeps the latest and the previous answered check-in across 40 weeks and excludes another coach's; the last workout months ago is still its date, not "never").

### B3.9.7 (C7) — certification

**Full e2e3:** run `b39-full-1`, on a frozen copy of the tree (`D:\Gym-b38cert`, isolated stack, 17:22–18:34). **373 tests: 369 passed, 1 skipped** (the approved Google sign-in skip), **3 failed**, each diagnosed and fixed:
1. **Spec 21** (transfer to a full destination): the translated capacity line read as the approving coach's own capacity. Fixed with the destination reasons (§B3.9.2 note), and the spec expects "receiving coach".
2. **Spec 97 axe matrix:** the browser context closed after 128 s under the full run's memory pressure. This was not a violation: the same matrix passed 0 / 231 standalone (`b39-cert-1`). Re-run below.
3. **Spec 97 tap targets:** with the data earlier specs leave behind (a starter library, a nutrition plan for Aya), it found the Library sort headers (18 px), the goal filter (36 px), the editor switches (25 px) and the client-context toggle (40 px). Fixed:
   - real 44 px header cells with full-height sort buttons — a centred area would be clipped by the table;
   - a 44 px filter;
   - `hit-44` on `Switch`;
   - a 44 px toggle.

**Re-run on the final tree** (run `b39-final-rerun`: specs 21, 85, 86, 87, 89, 92, 96, 97 — everything the fixes and the trial-banner tone touch): **84 passed, 1 failed:** the tap audit found the Clients "Name" sort button 44 px tall but 37 px wide. Given a 44 px minimum width (both tables), then **re-run 1 / 1 passed** (`b39-tap-final`). The axe and visual matrices passed in this run: 0 violations, 0 px overflow.

**Production build:**
- Coach offline boot: **PASS**, phone + desktop. Today, Clients, Messages and Library render offline with their offline state; no endless skeleton; no chunk from the network.
- Client offline boot: **PASS**.
- PWA check: **PASS** (installable, offline reload, update deferred until hidden).
- Bundle: `--strict` PASS on the reviewed baseline (`scripts/bundle-budgets.json`): entry 161.88 kB gzip (+1.5 % vs B3.8); Today +18.8 %; other coach screens +2.9 – 7.4 %.
- All re-run on the production build of the final tree (`b39-boot-2`, `b39-pwa-2`).

**Unit / API:** **1,204 / 1,204** (API 763 · UI 441). `b38CoachP2.test.ts` (transfer-in to a lapsed coach) now expects `DESTINATION_NOT_ACCEPTING`: the refusal names the receiving coach, and nothing moves (unchanged). **Typecheck** (app + api), **boundaries**, **build:** PASS.

The security-focused specs (10 auth / reset, 20 invite → claim, 31 / 90 messaging, 94) all passed in the full run. The certification report is `B3_COACH_CERTIFICATION_REPORT.md`.
