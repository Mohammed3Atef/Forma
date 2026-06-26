# Coach / Admin UI-UX & Responsive Audit

_Baseline audit for the Coach/Admin responsive-consistency pass. Client app is mobile-first
and out of scope. Viewports of record: 390 (mobile) · 768 (tablet) · 1024 (laptop) · 1440 (desktop)._

## Summary of root causes

| # | Problem | Where | Severity |
|---|---------|-------|----------|
| 1 | **Every overlay is a mobile bottom sheet** — `Sheet` is hard-wired `items-end` + `max-w-md` + `rounded-t-sheet`, no breakpoint logic. All Coach/Admin modals/wizards use it, so on desktop they render as a 448px strip pinned to the bottom. | `src/components/Sheet.tsx:46-51` | **High** |
| 2 | **Duplicate back buttons** in the Add-Existing flow: Sheet `X` + `add-mode-back` + `existing-back`. Back chevrons use `rotate-180` unconditionally (wrong arrow in RTL). | `CoachClients.tsx:231`, `AddExistingClient.tsx:249-250` | **High** |
| 3 | **No form-field primitives** — ~30+ Coach/Admin inputs are placeholder-only, so the label disappears once the user types. | many forms (see table) | **High** |
| 4 | **No content width ceiling** on desktop + inconsistent ad-hoc caps; single-column pages stretch and "look mobile" on ≥1440. | `ResponsiveShell.tsx:38` + 4 pages | **Medium** |
| 5 | RTL plumbing is otherwise solid (`dir` on `<html>`, logical `ms/me/ps/pe/start/end`); residual issues are localized (back arrow direction, one physical margin). | `index.css` `.stat-unit`, back chevrons | **Low** |

## Primitive inventory

| Primitive | File | State |
|-----------|------|-------|
| Overlay base | `src/components/Sheet.tsx` | Bottom-sheet only; **no** size/desktop variants, no footer slot, no single-back affordance → **upgrade in place**. |
| Confirm/alert dialog | `src/components/DialogHost.tsx` | Already centered (`max-w-sm`). OK. |
| Command palette | `src/components/ui/CommandPalette.tsx` | Already centered (`max-w-xl`). OK. |
| Form fields | — | **None exist.** Only `.input` / `.label` CSS utilities (`index.css:128-134`). → **create `ui/Field.tsx`**. |
| Page shell | `src/components/shell/ResponsiveShell.tsx` | Wraps both portals; sidebar+topbar on `md:`, bottom-nav on mobile. Full-bleed on desktop, **no max cap** → add `max-w-screen-2xl` center. |
| Tables / detail / grids | `ui/DataTable`, `ui/DetailPanel`, `ui/MobileCardList`, `ui/ResponsiveGrid`, `ui/PageHeader`, `ui/DashboardSection` | Exist and are reused. `DetailPanel` = brief's "ResponsivePanel". |

## Route-by-route findings

Legend — ✅ ok · ⚠️ needs work · `mob` = currently mobile-style on desktop.

### Coach (`/coach/*`)

| Route | Full-width desktop | Layout | Overlays | Labels | RTL | Notes |
|-------|--------------------|--------|----------|--------|-----|-------|
| `/coach` → dashboard/clients | ✅ (shell) | ✅ table+preview | — | — | ✅ | redirect by viewport |
| `/coach/dashboard` | ⚠️ no 2xl cap | ✅ grid | — | — | ✅ | stretches on 1440+ |
| `/coach/clients` | ✅ | ✅ DataTable + ClientPreview | ⚠️ Add-Client sheet narrow + **dup back** | ⚠️ invite form placeholder-only | ⚠️ chevron | core flow |
| `/coach/assessments` | ⚠️ `lg:max-w-5xl` ad-hoc | table | — | — | ✅ | normalize cap |
| `/coach/reports` | ✅ | ✅ table/cards | — | — | ✅ | |
| `/coach/plan` | ✅ | grid | — | — | ✅ | |
| `/coach/client/:id` (detail) | ⚠️ `lg:max-w-5xl` ad-hoc | single column `mob` | sub sheets narrow | — | ✅ | could be master/detail |
| `/coach/client/:id/workout` (editor) | ⚠️ single column `mob` | stacked | "save as template" sheet narrow | ⚠️ name placeholder-only | ✅ | 2-col on desktop |
| `/coach/client/:id/nutrition` (editor) | ⚠️ `mob` | stacked | food/supp sheets narrow | ⚠️ many placeholder-only | ✅ | |
| `/coach/client/:id/cardio` (editor) | ⚠️ `mob` | stacked | sheet narrow | ⚠️ name/notes placeholder-only | ✅ | |
| `/coach/library` (exercise/food/supp) | ✅ | DataTable/cards | ⚠️ exercise/food/group forms narrow | ⚠️ many placeholder-only | ✅ | |
| `/coach/templates` | ✅ | grid | — | ⚠️ | ✅ | |
| `/coach/templates/:id` (builder) | ⚠️ unconditional `max-w-5xl` | PlanBuilder | ⚠️ exercise picker/form narrow | ⚠️ | ✅ | normalize cap |
| `/coach/adherence` | ✅ | table/cards | — | — | ✅ | |
| `/coach/messages` | ✅ | split | composer sheet narrow | — | ✅ | |
| `/coach/settings` (account) | ✅ | — | ChangePassword sheet narrow | ⚠️ | ✅ | |
| Subscription panels | n/a | inline + sheets | ⚠️ term/freeze/price sheets narrow | partial | ✅ | `CoachSubscriptionPanel.tsx` |
| Transfer / release | n/a | wizard | ⚠️ TransferWizard sheet narrow; close X + footer Back/Cancel | ⚠️ months/price/currency placeholder-only | ⚠️ | |

### Admin (`/admin/*`)

| Route | Full-width desktop | Layout | Overlays | Labels | RTL | Notes |
|-------|--------------------|--------|----------|--------|-----|-------|
| `/admin` (overview/tabs) | ⚠️ no 2xl cap | tabs+panels | — | — | ✅ | |
| `/admin/accounts` | ⚠️ unconditional `max-w-6xl` | card list | edit sheets narrow | ⚠️ | ✅ | normalize cap |
| `/admin/coaches` | ✅ | DataTable | — | ⚠️ | ✅ | |
| `/admin/coaches/:id` | ✅ | cards | — | ⚠️ | ✅ | |
| `/admin/clients/:id` | ✅ | cards `mob` | — | — | ✅ | |
| `/admin/assignments` (transfer wizard) | ✅ | list + wizard | ⚠️ wizard sheet narrow + X/footer overlap | ⚠️ | ⚠️ | |
| `/admin/analytics` | ⚠️ no cap | grid + chart | — | — | ✅ | |
| `/admin/governance` (flags/audit) | ✅ | card divide | — | — | ✅ | |
| `/admin/media` | ✅ | grid | viewer | — | ✅ | |
| `/admin/settings` (account) | ✅ | — | sheets narrow | ⚠️ | ✅ | |

## Placeholder-only inputs (label rollout targets)

`AddExistingClient.tsx` (search L119, price L296, transfer reason L320) ·
`CoachClients.tsx` invite (name/email/phone L345-347, price L356) ·
`TransferWizard.tsx` (months L145, price/currency L148-149) ·
`CoachWorkoutEditor.tsx` (plan name) · `CoachNutritionEditor.tsx` (name, macros, supplement, food search) ·
`CoachCardioEditor.tsx` (plan name L92, notes L139) ·
`CoachExerciseLibrary.tsx` (foods name/qty/category, groups name/notes, supplements name/dose/timing) ·
`ExerciseForm.tsx` (name, muscle/category/equipment, video url, notes) ·
`CoachSubscriptionPanel.tsx` (partial) · `CoachTemplates.tsx` · Admin forms.

Good existing pattern to mirror: `MeasurementForm.tsx` (each field wrapped with `<label class="label">`).

## Fix order

Phase 1 primitives (Sheet upgrade, `ui/Field.tsx`, shell cap) → Phase 2 overlay rollout + single-back →
Phase 3 labels → Phase 4 width/desktop layouts → Phase 5 RTL → Phase 6 tests + gates.
