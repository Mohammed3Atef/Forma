# Forma Architecture

Final structure after the role-separation / code-splitting / offline / design-system pass. See also
[ARCHITECTURE_REFACTOR_AUDIT.md](./ARCHITECTURE_REFACTOR_AUDIT.md), [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md),
and [features/](./features).

## Layers & allowed import directions

```
                         ┌───────────────────────────────────────────────┐
   non-UI, role-agnostic │  services · hooks · stores · lib · types ·     │
   (importable by all)   │  i18n · config · data                         │
                         └───────────────────────────────────────────────┘
                                    ▲          ▲          ▲          ▲
                                    │          │          │          │
            ┌───────────────┐   ┌───┴────┐ ┌───┴───┐ ┌────┴───┐  (apps wire roles;
            │   shared      │◀──│ client │ │ coach │ │ admin  │   App.tsx mounts one)
            │  (+ ui,shell) │   └────────┘ └───┬───┘ └────────┘
            └───────────────┘                  │  ▲
                  ▲  ▲  ▲                       │  │ admin → coach (cross-role
                  │  │  └───────────────────────┘  │ views only: TransferWizard,
                  client / coach / admin ──────────┘ CoachTimeline, ClientActivityView)

  ALLOWED:   any bucket → shared / non-UI ;  admin → coach (sanctioned cross-role views)
  FORBIDDEN: coach → client ;  admin → client ;  client → coach|admin ;  shared → any role
```

Enforced by [`scripts/check-boundaries.mjs`](../scripts/check-boundaries.mjs) (runs in the gate; exits non-zero
on any forbidden edge). Role apps are lazy-loaded in [`App.tsx`](../src/App.tsx) so a signed-in user downloads
only their own role bundle.

```
src/
├── App.tsx              role/phase switch → lazy ClientApp | CoachApp | AdminApp | AnonymousApp
├── apps/                ClientApp (AppShell) · CoachApp/AdminApp (ResponsiveShell)
├── pages/               <root> = client · coach/ · admin/ · auth/ · marketing/
├── components/
│   ├── shared/  ui/  shell/    shared primitives (Sheet, Field, DataTable, MetricCard, states, OfflineBanner…)
│   ├── coach/                  coach UI (+ cross-role views Admin reuses)
│   └── <root, client-only>     mobile-only (manifest-classified; relocation to client/ = debt)
├── theme/               design tokens (mirror tailwind.config.ts)
├── services/ hooks/ stores/ lib/ types/ i18n/ config/ data/   role-agnostic, no UI
```

## Performance — bundle before → after

Raw chunk sizes (`npm run build`, KB). The role apps were split so each role loads only its own code.

| Chunk | Before | After | Δ |
|---|---:|---:|---|
| `index` (entry) | 452 | **241** | **−47%** (no role app in the shared entry) |
| `ClientApp` | (in index, eager) | **164** (lazy, client-only) | client-isolated |
| `CoachApp` | 209 | **43** | **−80%** (heavy pages → per-route chunks) |
| `AdminApp` | 71 | ~14 + per-page chunks | split |
| per-page coach/admin chunks | — | 8–24 each (e.g. CoachExerciseLibrary 24, CoachDashboard 23, AdminDashboard 18) | load on open |
| `firebase` / `react-vendor` / `i18n` / `query` | 574 / 154 / 48 / 46 | unchanged | vendor splits |

**Initial JS now:** Client = `index 241 + ClientApp 164 + react-vendor 154 + query 46 + i18n 48` (firebase loads on
auth) and **no coach/admin code**. Coach/Admin = `index 241 + CoachApp 43 (or AdminApp) + the opened page chunk`
and **no client app**. No regressions; firebase remains the largest single chunk (loads only after sign-in).

## Component complexity — 20 largest (lines)

| Lines | File | This pass |
|---:|---|---|
| 777 | pages/Nutrition.tsx (client) | left as-is — client app, untouched (out of scope) ⚠️ >400 |
| 574 | pages/onboarding/AssessmentWizard.tsx | left — client wizard, untouched ⚠️ >400 |
| 540 | pages/coach/CoachExerciseLibrary.tsx | left — touched only for labels (already on Field); split = future ⚠️ >400 |
| 472 | pages/admin/AdminAccounts.tsx | left — added offline gating + fullBleed; split = future ⚠️ >400 |
| 457 | pages/WorkoutSession.tsx (client) | left — client, untouched ⚠️ >400 |
| 442 | pages/coach/CoachClients.tsx | left — added fullBleed + offline gating; split = future ⚠️ >400 |
| 371 | pages/coach/AddExistingClient.tsx | left — prior pass already split out ClientResultDetail |
| 365 | pages/coach/CoachNutritionEditor.tsx | left — within range |
| 364 | components/MessageThread.tsx (shared) | left — within range |
| 360 | pages/coach/CoachSubscriptionPanel.tsx | left — added offline gating; within range |
| 339 | pages/Home.tsx (client) | left — untouched |
| 322 | pages/coach/CoachViewNutrition.tsx | left |
| 317 | pages/Cardio.tsx (client) | left — untouched |
| 312 | components/workout/PlanBuilder.tsx | left — within range |
| 291 | pages/coach/CoachClientDetail.tsx | left |
| 290 | pages/Progress.tsx (client) | left — untouched |
| 271 | pages/admin/AdminAssignments.tsx | left |
| 259 | components/ExerciseCard.tsx (client) | left |
| 249 | pages/ClientSettings.tsx (client) | left |
| 229 | pages/coach/ClientActivityView.tsx | left |

**Over ~400 lines (recommended future splits):** Nutrition, AssessmentWizard (client, out of scope this pass);
CoachExerciseLibrary, AdminAccounts, CoachClients (Coach/Admin — split when next substantially edited; this pass
made surgical edits only, so a full split would be unjustified churn against the "no big-bang" guardrail).

## Design / architecture debt

Honest list of what remains (foundation laid; adoption is incremental):

- **Physical component relocation.** Client-only components still live in `src/components/` root; they're
  classified `client` via the boundary script's manifest and enforced, but not yet moved to `components/client/`
  (several use relative imports — a careful move is deferred to avoid churn this pass).
- **Search inputs → `SearchField`.** A handful of list/search bars use placeholder + icon without a visible
  label/`aria-label`; convert to `SearchField` when touched (all other Coach/Admin forms are on `Field`).
- **Token adoption.** `src/theme/*` tokens mirror Tailwind and are the source of truth; existing components keep
  using Tailwind classes — adopt tokens/`Icon` tone-size variants in new/changed code (no mass migration).
- **Standard-state adoption.** `PermissionState` / `OfflineState` exist; wire them into the remaining
  permission-denied / connection-required surfaces as those screens are touched.
- **Large components.** See the table — CoachExerciseLibrary/AdminAccounts/CoachClients (Coach/Admin) and the big
  client screens (Nutrition/AssessmentWizard/WorkoutSession) exceed ~400 lines; split opportunistically.
- **Known pre-existing failing test (not from this pass):** `e2e/offline.spec.ts` "log offline → reload …" (client
  cardio offline log) fails on the clean baseline too — a flaky SW/IndexedDB timing test to fix separately.
