# B1 — P1 triage

> Phase B1 (Product foundation & P1 hardening) · 2026-10-08 · baseline `f1151c0` (B0 committed).
> Source: every P1 in `18_PRIORITIZED_FINDINGS.md` §6 (92 findings), with each finding's own direction from docs 02–15, re-checked against the B0 code.
> **B1 implements only the B1 FOUNDATION rows (plus small prerequisites).** Everything else has a named target phase.

## Counts

| Target | Meaning | P1s |
|---|---|---:|
| A | B1 FOUNDATION | 25 |
| B | B2 CLIENT | 13 |
| C | B3 COACH | 16 |
| D | B4 CONTENT / MEDIA | 15 |
| E | B5 PERF / REALTIME / POLISH | 2 |
| F | DEFER / PRODUCT DECISION | 1 |
| G | ALREADY FIXED BY B0 | 20 |
| H | NO LONGER APPLICABLE | 0 |
| | **Total** | **92** |

Notes on the rules used:
- **ALREADY FIXED BY B0** means the P1 harm is gone. Where a non-P1 polish remainder exists, it is named and assigned (e.g. the check-in slider redesign → B2).
- **B1 FOUNDATION** is used for cross-cutting problems: (1) fixable once in shared infrastructure, or (2) a prerequisite that B2/B3 would otherwise duplicate or build on unsafely. Visual P1s whose cure is a token or primitive are B1 *foundations*. Their screens are only fully fixed when they migrate in B2/B3; the status says so.
- Screen and IA redesign stays in B2/B3 even when it touches a foundation (the brief forbids starting them in B1).

## Triage

| ID | FINDING | AREA | CURRENT SEVERITY | TARGET PHASE | WHY | DEPENDENCIES | B0 INTERACTION | STATUS |
|---|---|---|---|---|---|---|---|---|
| RTL-04 | Arabic-Indic digits rejected or dropped in number entry | Arabic | P2 (residual) | B1 FOUNDATION | B0 routed inputs through one normaliser; the audit's direction is ONE NumericField used by every number entry. B1.8 builds it and migrates the B0-touched entries. | B1.3 Field | Builds on B0 `normalizeNumericText` — must keep the arabicNumbers tests green | FIXED in B1 (coach-editor inputs move with their screens, B3) |
| RTL-03 | Mixed numeral systems and device-locale (US) dates | Arabic | P1 | B1 FOUNDATION | Needs one formatting service with a digit policy, used everywhere. Cross-cutting; every B2/B3 screen depends on it. | — | Extends B0's dateLocale resolver | FIXED in B1 |
| RTL-01 | Arabic labels break apart: mono tracking and a font without Arabic glyphs | Arabic | P1 | B1 FOUNDATION | A global type-role problem: fixable once in the foundation (Arabic face + no tracking/caps on every mono/label role). | B1.2 type roles | — | FIXED in B1 (foundation) |
| EX-06 | Exercise form overwrites Arabic notes and silently unlinks from the library | Arabic data | P1 | B1 FOUNDATION | Data loss of Arabic content; explicitly in the B1 brief (B1.8). | — | CO-01 guarded save path must stay | FIXED in B1 |
| FD-01 | Picking or editing a food erases its Arabic name | Arabic data | P1 | B1 FOUNDATION | Data loss of Arabic content; explicitly in the B1 brief (B1.8). | — | CO-01 guarded save path must stay | FIXED in B1 |
| PWA-12 | No durable outbox: messages, voice notes, photos, check-ins lost on navigation or reload | Sync/offline | P1 | B1 FOUNDATION | Highest-priority B1 item (B1.6). Both B2 and B3 messaging and check-in work would otherwise build on memory-only state. | Server idempotency keys | Must respect per-user DBs (PWA-02/03) and the client-only sync runtime (PWA-04) | FIXED in B1 |
| CL-34 | Progress photos can silently never reach the coach | Sync/offline | P2 (residual) | B1 FOUNDATION | B0 made it honest ("Not uploaded" + retry on next launch). The audit's direction is one upload outbox — part of B1.6. | PWA-12 | B0 upload-honesty rule must hold | FIXED in B1 (outbox) |
| MS-02 | Attachments and voice notes offered but fail in production | Messaging | P1 | B1 FOUNDATION | Provider part is MD-01 (deferred by owner). The B1 part: a failed attachment survives in the outbox and the composer reflects upload health. | PWA-12; MD-01 (owner) | Truthful upload states (B0) must hold | MITIGATED in B1 (outbox keeps failed attachments; provider MD-01 is the owner's) |
| PWA-11 | The sync status misleads ("Synced" with changes pending; wrong-engine indicator) | Sync/offline | P1 | B1 FOUNDATION | B1.7: one truthful sync-state derivation and one SyncStatus component. | PWA-12 (outbox counts) | Builds on B0 conflicts + pending count | FIXED in B1 |
| PWA-13 | Sync contract unvalidated; one failure blocks the whole pass | Sync/offline | P1 | B1 FOUNDATION | B1.7: per-collection allow-list and schema, per-record rejection, malformed pulls skipped. | — | Must keep B0 revision/conflict semantics (PWA-06) | FIXED in B1 |
| AR-01 | Three data paths with three freshness/offline models | Architecture | P1 | B1 FOUNDATION | B1.12 ownership rules + B1.6 outbox + B1.7 one status model. The full persisted-query-cache rebuild is not needed for B2. | PWA-11, PWA-12 | Keeps per-user IndexedDB (PWA-02) | MITIGATED in B1 (ownership rules + outbox + one status model; push/persisted cache B5) |
| AR-02 | The root boots client-only systems for every role | Architecture | P2 (residual) | B1 FOUNDATION | B0 made the runtime client-only. Still open: the client stores are in the entry chunk for every role and anonymous visitors (B1.13 "huge shared shell dependencies"). | — | Must keep B0 client-only runtime and offline boot | FIXED in B1 |
| PF-01 | Client boot waits on dependent API calls before showing data | Performance | P1 | B1 FOUNDATION | Still open: online boot waits for refresh then auth.me although refresh already returns the user. Dropping the extra call is cheap and safe. Optimistic cached-identity render stays B5 (touches B0 session semantics). | — | Must not weaken B0 session rules (401 only) | FIXED in B1 |
| PF-02 | No timeouts on the request path | Performance | P2 (residual) | B1 FOUNDATION | B0 added client deadlines (10 s refresh, 30 s per request). Server side still has none (Mongo connect/select, cached rejected connection). | — | — | FIXED in B1 |
| PWA-10 | Update activation unsafe across tabs; mixed versions | PWA | P2 (residual) | B1 FOUNDATION | B0 fixed the single-tab path. Open: a second tab under a newly activated worker keeps old JS; it must reload at its own safe point. | — | Builds on B0 updateStore safe point | FIXED in B1 |
| JR-04 | Deploys arrive a session late; tabs run mixed versions | Journey | P2 (residual) | B1 FOUNDATION | Duplicate of PWA-09/10; closes with PWA-10. | PWA-10 | B0 update UX — protected | FIXED in B1 (via PWA-10) |
| NAV-K01 | Thread/Progress replace history; Back leaves the client | Navigation | P1 | B1 FOUNDATION | B1.10 navigation contract: semantic parents and validated return context — the brief's own example. | — | Unsaved guard (B0 V-11) must still run on every exit | FIXED in B1 |
| NAV-K03 | Freeze-request notification lands where the request isn't shown | Notifications | P1 | B1 FOUNDATION | B1.9 deep-link map per notification type. | B1.10 | B0 notification routing (side-effect free) — protected | FIXED in B1 |
| AX-02 | Icon-only header actions lose their accessible name on phones | Accessibility | P1 | B1 FOUNDATION | IconButton with a required label (B1.3); the offending header buttons are fixed in place. | B1.3 | — | FIXED in B1 |
| AX-01 | ~40% of phone controls under 44px | Accessibility | P1 | B1 FOUNDATION | Size/hit-area tokens owned by the primitives (B1.3/B1.14). Screens inherit them when they migrate in B2/B3. | B1.3 | — | MITIGATED in B1 (hit-44 + primitives; screens B2/B3) |
| AX-03 | ~70 form fields without a programmatic label | Accessibility | P1 | B1 FOUNDATION | Field becomes mandatory (B1.3). B1 labels the critical unlabeled inputs (composer, searches, invite form) without visual change; the rest migrate with their screens. | B1.3 | — | MITIGATED in B1 (composer, searches, invite, check-in fixed; 50 fields B2/B3) |
| VS-04 | Typography has no scale; meaningful text at 8–11px | Visual system | P1 | B1 FOUNDATION | Type roles with a 12px floor are a foundation deliverable (B1.2). Screens adopt them in B2/B3. | — | — | MITIGATED in B1 (type roles, 12px floor; screens B2/B3) |
| VS-11 | Fifteen banner treatments stacking above content | Visual system | P1 | B1 FOUNDATION | One Banner + one region per shell (B1.4); a priority rule lets at most one show. | B1.4 | B0 update pill / conflict notice / offline must stay reachable | FIXED in B1 (one banner region per shell) |
| VS-19 | No coherent Forma identity | Visual system | P1 | B1 FOUNDATION | Tokens, type and icon rules from the approved website are the B1 foundation (B1.2). Full resolution needs screen migration. | — | — | MITIGATED in B1 (tokens; screens B2/B3) |
| VS-20 | Client and coach are two products | Visual system | P1 | B1 FOUNDATION | One kit with comfortable/compact densities and one shell contract (B1.3/B1.4). | — | — | MITIGATED in B1 (one kit + shell contract; screens B2/B3) |
| CL-17 | Ticking a set that shows last time's numbers saves an empty set | Client logging | Resolved | ALREADY FIXED BY B0 | B0.3 commits the shown values; an empty row is refused. | — | B0 fix (loggingCorrectness tests) — protected | FIXED in B0 |
| JR-01 | Empty-set "Logged" session | Journey | Resolved | ALREADY FIXED BY B0 | Same root cause as CL-17. | — | B0 fix — protected | FIXED in B0 |
| CL-42 | Weekly check-in hides its Continue button and loses answers | Client check-in | P2 (residual UX) | ALREADY FIXED BY B0 | B0.5 full-screen task, drafts, single submit. Slider/prefill content redesign is B2 polish, not a P1. | B2 for the content redesign | B0 fix (CheckIn tests, 61 spec) — protected | FIXED in B0 (content redesign → B2) |
| JR-05 | Check-in wizard does not own the screen | Journey | Resolved | ALREADY FIXED BY B0 | Same as CL-42. | — | B0 fix — protected | FIXED in B0 |
| CO-07 | Client list shows and filters the admin account state | Coach | Resolved | ALREADY FIXED BY B0 | B0.8 coaching-state pills and filters. | — | B0 fix — protected | FIXED in B0 |
| CO-11 | Plain Save keeps no version | Coach editors | Resolved | ALREADY FIXED BY B0 | CO-01 guarded save writes a version on every save. | — | B0 fix (planSafety tests) — protected | FIXED in B0 |
| CO-14 | Subscription tab: 7 competing actions, "free" renewal prefill | Coach business | P2 (residual UX) | ALREADY FIXED BY B0 | B0.8 fixed prefill, stale sheet, error state, dates. The 7-action panel layout is a B3 redesign item. | B3 panel redesign | B0 fix — protected | FIXED in B0 (layout → B3) |
| CO-15 | Renewing overwrites the previous term; no history | Coach business | Resolved | ALREADY FIXED BY B0 | B0.8 archives terms atomically. | — | B0 fix (subscriptionHistory tests) — protected | FIXED in B0 |
| CO-21 | Workspace notes published to the client without saying so | Coach privacy | Resolved | ALREADY FIXED BY B0 | CO-02 private-by-default notes. | — | B0 fix (notePrivacy tests) — protected | FIXED in B0 |
| EX-01 | "Watch video" is a dead tap for 95% of exercises | Library/media | Resolved | ALREADY FIXED BY B0 | B0.6 button only when playable. | — | B0 fix (VideoHonesty tests) — protected | FIXED in B0 |
| EX-03 | The client video player fails silently | Library/media | Resolved | ALREADY FIXED BY B0 | B0.6 loading/failed/stall/HEVC states. | — | B0 fix — protected | FIXED in B0 |
| EX-04 | Coaches can save video links that can never play | Library/media | Resolved | ALREADY FIXED BY B0 | B0.6 classifier + server scheme rule. | — | B0 fix — protected | FIXED in B0 |
| NT-01 | Old notifications replay as stacked toasts | Notifications | Resolved | ALREADY FIXED BY B0 | B0.4 per-user watermark. | B1.9 keeps it | B0 fix (NotificationBell tests) — protected | FIXED in B0 |
| NT-02 | A notification toast moves the selected day | Notifications | Resolved | ALREADY FIXED BY B0 | B0.3/B0.4 side-effect-free routes. | B1.9 keeps it | B0 fix — protected | FIXED in B0 |
| NT-03 | Unread never clears | Notifications | Resolved | ALREADY FIXED BY B0 | B0.4 read vs resolved, mark-all. | B1.9 keeps it | B0 fix (notificationLifecycle tests) — protected | FIXED in B0 |
| PF-03 | Login screen in the non-precached website chunk | Performance | Resolved | ALREADY FIXED BY B0 | B0 PWA-01 precaches the login chunk. | — | B0 fix (prod-sim) — protected | FIXED in B0 |
| PF-04 | Coach and admin sessions run the client sync engine | Performance | Resolved | ALREADY FIXED BY B0 | B0 PWA-04 client-only runtime; server sync is client-only. | — | B0 fix (certification test) — protected | FIXED in B0 |
| PF-10 | Token refresh can race itself | Performance | Resolved | ALREADY FIXED BY B0 | B0 single-flight refresh. | — | B0 fix (sessionStore tests) — protected | FIXED in B0 |
| PWA-09 | Old build stays visible all session; no update UI | PWA | Resolved | ALREADY FIXED BY B0 | B0.7 update pill + safe-point activation. | PWA-10 (multi-tab) in B1 | B0 fix (UpdateAvailable tests, prod-sim) — protected | FIXED in B0 |
| RTL-02 | Egyptian-Arabic users get English dates and weekdays | Arabic | Resolved | ALREADY FIXED BY B0 | B0.9 one locale resolver for the cited surfaces. | RTL-03 extends it to every formatter | B0 fix (arabicNumbers tests) — protected | FIXED in B0 |
| CL-01 | Three overlapping client navigation systems | Client IA | P1 | B2 CLIENT | The final 5-tab IA is B2 (brief: do not change client navigation in B1). | B1.4 shell, B1.10 nav contract | — | MOVED TO B2 |
| CL-09 | Today is a 2.8-screen report | Client | P1 | B2 CLIENT | Today redesign is B2. | B1 kit | — | MOVED TO B2 |
| CL-04 | Hidden app-wide selected day dates new logs | Client logging | P2 (residual) | B2 CLIENT | B0 stopped the silent moves; the per-screen date model is part of the B2 Today/Nutrition rebuild. | B1.8 formatter | B0 fix — protected | MOVED TO B2 |
| CL-10 | After you train, Today still says "Start workout" | Client | P1 | B2 CLIENT | Today hero states (B2). | — | — | MOVED TO B2 |
| CL-13 | Plan exercises lead nowhere; day view is an orphan route | Client IA | P1 | B2 CLIENT | Train structure (B2). | B1.10 | — | MOVED TO B2 |
| CL-14 | Coach guidance never reaches the workout | Client | P1 | B2 CLIENT | Train/session content (B2). | — | — | MOVED TO B2 |
| CL-38 | Coach relationship spread over seven surfaces | Client IA | P1 | B2 CLIENT | Coach tab (B2). | B1.9 | — | MOVED TO B2 |
| CL-41 | First run is four gates then zeros | Client | P1 | B2 CLIENT | First-run journey (B2). | — | — | MOVED TO B2 |
| CL-45 | Legacy tools and sync internals in Settings | Client | P2 (residual) | B2 CLIENT | B0 deleted the tools; B1.7 makes sync status silent when healthy; the You/Settings layout (sign-out row) is B2. | B1.7 | B0 removals — protected | MOVED TO B2 |
| CD-01 | Everything is a box (10–19 surfaces per screen) | Cards | P1 | B2 CLIENT | Resolved screen by screen; B1.2 defines the Surface rules. Coach screens follow in B3. | B1.2/B1.3 | — | MOVED TO B2 (+B3) |
| CD-04 | Equal visual weight for unequal importance | Cards | P1 | B2 CLIENT | Screen hierarchy (B2 Today; B3 coach). | B1.2 | — | MOVED TO B2 (+B3) |
| VS-08 | Seven destructive styles; red × on every planned food row | Visual system | P1 | B2 CLIENT | B1 ships one destructive Button variant + ActionMenu; the nutrition rows are rebuilt in B2. | B1.3 | — | MOVED TO B2 |
| PWA-14 | Previous user's data visible after sign-out (shared device) | PWA | P2 (residual) | B2 CLIENT | B0 fixed memory and isolation; the remaining "remove this account's data from this device" action is a You-screen feature. | — | B0 fix (accountRuntime test) — protected | MOVED TO B2 |
| CO-05 | No coach triage surface | Coach | P1 | B3 COACH | Coach Today (B3). | B1.9 taxonomy | — | MOVED TO B3 |
| JR-02 | Coach morning has no triage surface | Journey | P1 | B3 COACH | Same as CO-05. | — | — | MOVED TO B3 |
| CO-08 | Client spread over an 11-tab rail and two layouts | Coach IA | P1 | B3 COACH | Client workspace rebuild (B3). | B1.10 | — | MOVED TO B3 |
| CO-06 | "Needs attention" / "At risk" too noisy | Coach | P1 | B3 COACH | Triage rules (B3). | — | — | MOVED TO B3 |
| CO-09 | Overview headline metric wrong | Coach | P1 | B3 COACH | Summary segment (B3). | — | — | MOVED TO B3 |
| CO-10 | Editing a program on a phone takes 10 taps | Coach editors | P1 | B3 COACH | Mobile day editor (B3). | B1 kit | CO-01 guarded saves — protected | MOVED TO B3 |
| CO-12 | Nutrition editor is a 4.3-screen form | Coach editors | P1 | B3 COACH | Editor rebuild (B3). | B1 kit | CO-01 guarded saves — protected | MOVED TO B3 |
| CO-13 | Check-ins: Request first, review queue hidden | Coach | P1 | B3 COACH | Review flow (B3). | — | — | MOVED TO B3 |
| CO-16 | Revenue is a 17-card tab | Coach business | P1 | B3 COACH | Business under Me (B3). | — | — | MOVED TO B3 |
| CO-17 | Dashboard is 2.8 screens of stale content | Coach | P1 | B3 COACH | Replaced by Today (B3). | — | — | MOVED TO B3 |
| CO-18 | States lie on ~20 coach screens | Coach | P1 | B3 COACH | B1.5 delivers the state contract; applying it to the coach screens is B3 work. | B1.5 | B0 fixed the touched editors/notes/subscription | MOVED TO B3 (B1.5 foundation) |
| CO-19 | Features that promise something and lead nowhere | Coach | P1 | B3 COACH | Per-feature product decisions inside the B3 rebuild. | — | — | MOVED TO B3 |
| CO-20 | "View as client" shows one empty day at a time | Coach | P1 | B3 COACH | Progress segment (B3). | — | — | MOVED TO B3 |
| JR-03 | Renewal workflow blind spots | Journey | P1 | B3 COACH | Today renewals (B3). | — | — | MOVED TO B3 |
| TB-01 | Client table overflows at 1440 with the wrong columns | Tables | P1 | B3 COACH | Clients table (B3); B1 evolves DataTable. | B1.3 | — | MOVED TO B3 |
| NAV-K02 | Three back controls in editors | Navigation | P2 (residual) | B3 COACH | B0 V-11 fixed the draft resurrection; one layout-owned back belongs to the B3 editor rebuild (uses the B1.10 contract). | B1.10 | B0 fix (useUnsavedGuard test) — protected | MOVED TO B3 |
| EX-07 | Starter library copied into every coach account | Library | P1 | B4 CONTENT / MEDIA | Global catalog (B4). | — | — | MOVED TO B4 |
| EX-02 | 35/46 starter videos are HEVC | Library/media | P1 | B4 CONTENT / MEDIA | Re-encode (B4). | MD-05 | B0 player states — protected | MOVED TO B4 |
| EX-05 | Library edits never reach assigned plans | Library | P1 | B4 CONTENT / MEDIA | Catalog references (B4). | EX-07 | CO-01 guarded saves | MOVED TO B4 |
| EX-09 | Exercise metadata unreliable | Library | P1 | B4 CONTENT / MEDIA | Data curation (B4). | — | — | MOVED TO B4 |
| EX-10 | No quality gate | Library | P1 | B4 CONTENT / MEDIA | Quality tiers (B4). | — | — | MOVED TO B4 |
| EX-12 | Library has almost no Arabic | Library | P1 | B4 CONTENT / MEDIA | Catalog i18n (B4); B1 only guarantees edits don't destroy Arabic (EX-06). | EX-06 (B1) | — | MOVED TO B4 |
| EX-13 | Clients never see exercise images | Library/media | P1 | B4 CONTENT / MEDIA | Media in exercise surfaces (B4). | B1.11 MediaViewer | — | MOVED TO B4 |
| EX-14 | Coaches can't preview media while picking | Library/media | P1 | B4 CONTENT / MEDIA | Picker rebuild (B4). | B1.11 | — | MOVED TO B4 |
| EX-19 | Licences and attribution not honoured | Library | P1 | B4 CONTENT / MEDIA | Data/legal (B4). | — | — | MOVED TO B4 |
| EX-20 | Starter templates filled alphabetically | Library | P1 | B4 CONTENT / MEDIA | Curated templates (B4). | EX-07 | — | MOVED TO B4 |
| FD-02 | External food search ambiguous | Food | P1 | B4 CONTENT / MEDIA | Curated food base (B4). | — | — | MOVED TO B4 |
| FD-04 | No portion model | Food | P1 | B4 CONTENT / MEDIA | Serving model (B4). | — | — | MOVED TO B4 |
| JR-06 | Text-only exercise and food discovery | Journey | P1 | B4 CONTENT / MEDIA | Media-first pickers (B4). | B1.11 | — | MOVED TO B4 |
| MD-05 | No video transcoding | Media | P1 | B4 CONTENT / MEDIA | Provider pipeline (B4; MD-01/02/03 owner-deferred). | MD-01 (owner) | — | MOVED TO B4 |
| PF-11 | Exercise library is an 835 KB payload | Performance | P1 | B4 CONTENT / MEDIA | Brief: library payload is B4. | EX-07 | — | MOVED TO B4 |
| NT-04 | Nothing reaches users outside the app (no push/email) | Notifications | P1 | B5 PERF / REALTIME / POLISH | Brief: no Web Push in B1. B1.9 prepares the delivery-channel seam. | B1.9 | — | MOVED TO B5 |
| PF-05 | Polling is the only realtime channel | Performance | P1 | B5 PERF / REALTIME / POLISH | Brief: don't replace the realtime layer in B1. B0/B1 remove duplicate pollers only. | — | B0 shared pollers — protected | MOVED TO B5 |
| MD-04 | Super-admin gallery shows every client's body photos | Media privacy | P1 | DEFER / PRODUCT DECISION | Owner decision: remove the gallery or limit it to logged, blurred moderation. Tied to the owner-deferred media privacy work (MD-02). | MD-02 (owner) | — | DEFERRED — owner decision |
