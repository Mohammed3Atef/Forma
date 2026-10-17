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

**Status: B3.2 closed with the owner's two follow-ups — committed locally as one B3.2 commit (not pushed). B3.3 follows.**
