# Forma — Path to #1

**Goal:** make Forma the best, easiest, most modern and professional coaching platform for coaches *and* clients — especially in the Arabic/MENA market.
**This doc:** benchmarks Forma against the market leaders (UM Fitness / um-platform.com, Bolder, Kalybr), then lays out exactly **what's missing, what needs fixing, and what needs to be clearer/easier**, in priority order, with a sequenced roadmap.
**Date:** July 6, 2026.

> **Method note:** Forma is assessed from its source + live app. Bolder and Kalybr were evaluated first-hand (logged-in coach accounts). **UM Fitness could not be loaded live at time of writing** (their host returned 503 and the browser was disconnected — both transient); its feature set here is from web research and should be **verified live** (I can walk your logged-in UM account next session to confirm/deepen). Sources are listed at the end.

---

## 1. The bar the market has set

Across the three benchmarks, the "winning" feature set for a modern coaching platform is now:

| Capability | UM Fitness | Bolder | Kalybr | **Forma today** |
|---|---|---|---|---|
| AI plan generation (workouts **and** nutrition) | ✅ headline | ✅ AI agent | — | ❌ none |
| White-label / custom-branded client app (logo, colors, store) | ✅ headline | — | — | ❌ none |
| Native mobile apps (App Store / Play) | ✅ premium client app | ✅ coach+client | ✅ coach+client | ⚠️ PWA (Android scaffolded) |
| Real payments + store (sell programs/packages, billing) | ✅ store, 0% commission | ✅ wallet/payouts | ✅ payments+packages | ⚠️ tracking only |
| Automated lifecycle (renewals, reminders, billing) | ✅ | ✅ | ⚠️ renew dates | ⚠️ manual + states |
| Multi-coach team / agency (roles, assignment) | ✅ team | — | ✅ team+roles+org | ⚠️ platform RBAC, no staff-coach teams |
| Calendar-based periodized programming | — | — | ✅ calendar + Programs | ❌ day-indexed |
| Content engine (blog, recipes) / community | ✅ blog+recipes | ✅ community feed | — | ❌ none |
| **Nutrition depth (meal plans, macros, substitutions)** | ✅ AI nutrition | ✅ | ❌ training-only | ✅✅ deep + coach-approved swaps |
| **Arabic / RTL, first-class** | ✅ (AR site) | ✅ bilingual | ❌ EN only | ✅✅ full AR/RTL |
| Coaching depth (versioning, check-ins, assessments, cardio, offline) | partial | partial | partial | ✅✅ strongest |

**Read:** the leaders win on **AI, white-label branding, native apps, real monetization, teams, and content/community**. Forma wins on **nutrition depth, Arabic/RTL, and coaching-workflow depth** (substitutions, versioning, check-ins, assessments, cardio, offline, governance). To be #1, Forma must **keep its depth lead** while **closing the AI + branding + native + monetization gaps** — and, critically, **feel easier and more modern** than all of them.

---

## 2. Where Forma already leads — lead with these

Do not dilute these; they are the wedge:

- **Training *and* nutrition, in Arabic.** UM has nutrition but Arabic is secondary; Kalybr has no nutrition and no Arabic; Bolder is bilingual but shallower on nutrition control. Forma's meal plans + macros + **coach-approved food substitutions** + Arabic/RTL is a combination none of them match.
- **Coach-controlled depth:** plan versioning + restore, entity-anchored inline coach notes, view-as-client, structured onboarding assessment, rich weekly check-ins (weight/adherence/sleep/energy/hunger/photos), first-class cardio + water/steps.
- **Offline-first client logging** (log every set with no signal) and **platform RBAC + audit/feature-flags**.
- **Snapshot template architecture** (editing a template never mutates live client plans).

---

## 3. Gap analysis — three buckets (prioritized)

### A. What's MISSING (net-new capability)

| # | Missing | Why it matters for #1 | Priority | Effort |
|---|---|---|---|---|
| A1 | **AI plan-draft assistant** (workouts + nutrition), coach-reviewed | Every leader has AI; it's the #1 expected differentiator and speeds plan creation dramatically. Draft into Forma's existing editor as an unpublished version the coach edits/publishes. | **Critical** | L |
| A2 | **White-label / coach branding** (logo, accent color, branded client experience; later a branded app) | UM's headline; coaches want *their* brand. Start with in-app theming (logo/colors), grow to a branded PWA, then native. | **Critical** | M→L |
| A3 | **Native app store listings** (client first, then coach) | Trust, push notifications, discovery. Android is already scaffolded (Capacitor). | **High** | M |
| A4 | **Real payments + sellable packages/store** (Stripe/Paymob/Vodafone Cash for MENA) | Coaches want to get paid in-app and sell programs. Build on the subscription model already in place. | **High** | L (strategic) |
| A5 | **Multi-coach team / agency** (staff coaches, roles, client assignment, org profile) | Opens the gym/agency segment (Kalybr/UM serve it; Forma can't today). | **High** | L |
| A6 | **Calendar / periodized programming** (schedule sessions to dates; multi-week "Program" layer above templates) | Serious coaches periodize on a calendar; Forma is day-indexed. | **Medium** | M |
| A7 | **Automation** (auto renewal reminders, check-in requests, "needs programming" nudges, welcome flows) | UM automates the busywork; reduces coach churn. | **Medium** | M |
| A8 | **Content / community** (announcements feed, recipes/education; optional community) | UM's blog/recipes + Bolder's community drive engagement/retention. | **Low** | M |
| A9 | **Push notifications** (web + native) | Notifications are in-app only today; they must reach clients off-app. | **High** | M |

### B. What needs FIXING (half-built, inconsistent, or fragile)

| # | Fix | Detail | Priority |
|---|---|---|---|
| B1 | **maxClients counter is tamper-soft** | `activeClientCount` is client-writable; a technical coach could bypass the cap. Harden with a Cloud Function or a rules `getAfter()` batch check. | High |
| B2 | **Subscription gating not runtime-verified** | Phase-2 rules/states were type/build-verified but not exercised against the emulator/live project; run the e2e/security matrix and deploy rules. | High |
| B3 | **Coach/Admin responsive + overlay consistency** | Some pages still read mobile-width on desktop; some dialogs open as narrow mobile panels; duplicate back buttons; placeholder-only inputs. *(Already underway — shared `Field`, `useFullBleed`, plan-picker, existing-client flow exist.)* Finish it globally. | High |
| B4 | **Notifications don't reach off-app** | See A9 (push). Today a closed app misses everything. | High |
| B5 | **Empty/error/loading states** | Ad-hoc; need shared `EmptyState`/`LoadingState`/`ErrorState` across coach/admin. | Medium |
| B6 | **Counter/drift & data integrity** | Ship + schedule the reconcile scripts (client counts, subscriptions backfill) so live data stays correct. | Medium |
| B7 | **Exercise/food libraries start empty** | Seed the open-licensed starter library on coach signup (the loader + JSON exist — wire it into first-run), and load the **full** exercise dataset. | Medium |

### C. What needs to be CLEARER / EASIER (the "modern, professional, easy" goal)

| # | Improve | Detail | Priority |
|---|---|---|---|
| C1 | **Design-system unification** | One token set (radius, spacing, color, type), one component set (buttons, cards, chips, tabs, inputs, tables, modals, skeletons). No page should look like an older UI. | High |
| C2 | **Coach onboarding & first-run** | Guided checklist → profile, load starter library, add/invite first client, build first plan. Reduce time-to-first-plan to minutes. | High |
| C3 | **Persistent input labels everywhere** | Replace placeholder-only fields with visible labels + helper/error text (the `Field` primitives — apply globally in coach/admin). | High |
| C4 | **One clear primary action per screen/overlay** | Especially Add-Client, transfer, subscription, editors. Secondary actions de-emphasized. Single back/close control. | High |
| C5 | **RTL that feels *designed*** | Correct arrow direction, sidebar border side, label alignment, wizard steps, icon spacing — not accidentally mirrored. | High |
| C6 | **Plan builders faster & clearer** | Live volume/time math, drag-reorder, duplicate day, draft vs publish, inline exercise media — make building a plan feel effortless. | Medium |
| C7 | **Perceived speed** | Skeletons, optimistic writes, prefetch on hover, avoid layout shift; keep coach reads snappy as client counts grow (precomputed `coachStats`). | Medium |
| C8 | **Client experience delight** | Smooth workout logging (rest timer, big tap targets), progress visualizations, streaks, before/after compare — keep the mobile client best-in-class. | Medium |

---

## 4. The "modern · easy · professional" UX program

Being #1 is as much *feel* as features. Run this as a parallel track:

1. **Design system pass** (C1) — tokens + primitives; audit every coach/admin screen against them.
2. **Responsive + overlay + labels + RTL consistency pass** (B3, C3–C5) — the global audit/fix you scoped; finish it so desktop/tablet/mobile all feel intentional.
3. **Onboarding & empty states** (C2, B5) — nobody ever sees a blank, confusing screen.
4. **Performance & polish** (C7) — skeletons, optimistic UI, no jank.
5. **Client delight** (C8) — protect the mobile client as a standout.

---

## 5. Path-to-#1 roadmap (sequenced)

**Now — earn trust & finish what's started (0–4 weeks)**
Finish the Coach/Admin responsive+overlay+label+RTL pass (B3, C3–C5); ship design-system tokens (C1); wire starter-library into first-run + full dataset (B7); coach onboarding checklist (C2); run subscription/rules e2e + deploy rules (B2); harden the client counter (B1). *Outcome: Forma feels finished and professional.*

**Next — close the credibility gaps (1–2 months)**
Push notifications (A9/B4); native app store listings (A3); white-label theming v1 — coach logo/colors in the client app (A2); automation basics — renewal/check-in reminders (A7). *Outcome: parity on the things coaches judge first.*

**Then — open new segments & monetize (2–4 months)**
Multi-coach team/agency (A5); real payments + packages/store for MENA (A4); calendar + periodized Programs (A6). *Outcome: serve gyms/agencies and let coaches get paid.*

**Flagship bet — the differentiator (parallel, ship when solid)**
AI plan-draft assistant for workouts **and** nutrition, coach-reviewed, drafting into the existing editor (A1). *Outcome: match the leaders' headline while keeping Forma's coach-control advantage.*

**Later — engagement**
Content/announcements + recipes; optional community (A8).

---

## 6. How Forma becomes #1 (positioning)

Win the niche first, then widen:

- **Own "Arabic-first, training + nutrition, coach-controlled."** That exact trio beats UM (Arabic secondary), Kalybr (no nutrition/Arabic), and Bolder (shallower nutrition control). Lead every MENA touchpoint with it.
- **Sell depth as ease, not complexity.** Versioning, substitutions, check-ins and offline are powerful — surface them so they feel effortless (great defaults, guided flows), which is where "easiest + most professional" is won.
- **Add AI as an *assistant inside* the coach's controlled workflow** — not as a black box. "AI drafts, you approve" is a trust story UM/Bolder don't emphasize.
- **Then expand** to gyms/agencies (teams) and creators (white-label + store), which is where the revenue and market-leadership scale come from.

---

## 7. Build next vs. ignore for now

**Build next (highest leverage):** finish the UX/responsive/consistency pass + design system; onboarding + starter library; push + native listings; white-label v1; then AI plan-draft assistant. These make Forma *feel* #1 and close the most-judged gaps.

**Defer / ignore for now:** full community/social feed, heavy content CMS, and a broad payments gateway build — until core retention + the flagship AI/branding bets land. Don't chase feature-parity breadth at the expense of Forma's depth + Arabic + ease advantages.

**One-line strategy:** *Be the easiest, most polished, Arabic-first platform that does training **and** nutrition with coach-grade control — then layer AI-assist, your-own-brand apps, teams, and payments on top.*

---

## Sources
- [UM Fitness — All-in-one platform for online coaching](https://www.um-platform.com/en)
- [Top 10 Fitness Coaching Platforms — comparison](https://www.scmgalaxy.com/tutorials/top-10-fitness-coaching-platforms-features-pros-cons-comparison/)
- [Best White Label Coaching Apps 2026 (Trainerize blog)](https://www.trainerize.com/blog/best-white-label-coaching-apps-2026/)
- Bolder and Kalybr: evaluated first-hand (see `competitor-analysis/` deliverables).
