# Feature: Role Boundaries

**Purpose.** Keep Client (mobile-only), Coach (web-first) and Admin (web-first) cleanly separated so one role
never loads or renders another's code/shell, and Client mobile patterns never dictate Coach/Admin layout.

**Routing.** [`src/App.tsx`](../../src/App.tsx) switches on session `phase` + `role` and mounts exactly one
role app — `ClientApp` / `CoachApp` / `AdminApp` / `AnonymousApp` — each **lazy-loaded** (`React.lazy`), so a
signed-in user only downloads their own role bundle.

**Shells.** Client → `AppShell` (mobile bottom nav). Coach/Admin → `ResponsiveShell` (desktop sidebar +
`DesktopTopBar`, mobile fallback). `fullBleed` opt-in for data-dense pages.

**Component buckets & import rules** (enforced by [`scripts/check-boundaries.mjs`](../../scripts/check-boundaries.mjs)):
- `shared` (incl. `ui`, `shell`) usable by all; `client`, `coach`, `admin` are role-scoped.
- `coach/admin ∌ client` · `client ∌ coach/admin` · `shared ∌ any role`. Admin may reuse explicitly cross-role
  coach views (`TransferWizard`, `CoachTimeline`, `ClientActivityView`).

**Permissions.** [`roles.ts`](../../src/services/auth/roles.ts) + `useCan()` gate admin-only actions inside
screens; super-admin-only routes (coaches/plans/media/governance) are role-checked. `PermissionState` renders a
clear denial instead of a blank screen.

**Edge cases.** Client-only mobile components still physically in `src/components/` root are classified `client`
via the boundary script's manifest (relocation to `components/client/` is tracked debt). Cross-role coach views
are the only sanctioned `admin → coach` edges.

**Testing.** `e2e/architecture.spec.ts` (client renders mobile shell not the sidebar; coach/admin render the
sidebar) + `node scripts/check-boundaries.mjs` in the gate.
