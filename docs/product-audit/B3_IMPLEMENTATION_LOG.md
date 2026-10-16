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
