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
├── theme/colors.ts      colour tokens for charts/inline styles (Tailwind config is the source of truth)
├── services/ hooks/ stores/ lib/ types/ i18n/ config/ data/   role-agnostic, no UI
```

## Performance — bundle

> The historical before/after table (with a `firebase` chunk) was removed in B0 / RM-15 — Firebase is gone.
> Current numbers: see `docs/product-audit/B0_SAFETY_TRUST_REPORT.md` §23 and `npm run build`.

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
- **Tokens.** Tailwind (`tailwind.config.ts`) is the source of truth; `src/theme/colors.ts` mirrors the colours for
  charts/inline styles. (The unused `src/theme/*` token modules were removed in B0 / RM-01.)
- **Standard states.** The never-used `PermissionState` / `OfflineState` primitives were removed (B0 / RM-01); a
  shared offline/permission state belongs to the B1 design-system work.
- **Large components.** See the table — CoachExerciseLibrary/AdminAccounts/CoachClients (Coach/Admin) and the big
  client screens (Nutrition/AssessmentWizard/WorkoutSession) exceed ~400 lines; split opportunistically.
- **Known pre-existing failing test (not from this pass):** `e2e/offline.spec.ts` "log offline → reload …" (client
  cardio offline log) fails on the clean baseline too — a flaky SW/IndexedDB timing test to fix separately.
