# Feature: Design System

**Purpose.** A token + convention foundation so future screens stay consistent (spacing, radius, colour, shadow,
motion, icons, states) without a visual redesign.

**Tokens.** [`src/theme/`](../../src/theme) — `colors`, `spacing`, `radius`, `typography`, `elevation`, `motion`,
`breakpoints` (+ `index.ts`). They mirror [`tailwind.config.ts`](../../tailwind.config.ts) and
[`src/index.css`](../../src/index.css); markup keeps using Tailwind classes, tokens are imported only for raw
values (charts/inline styles).

**Conventions.** Full reference in [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md): buttons, cards, forms (`Field`),
dialogs (`Sheet`), tables (`DataTable`/`MobileCardList`), standard states, navigation, icons, motion, RTL,
responsive role targets, maintainability.

**Key UI primitives.** `Field` suite, `Sheet`/`ResponsiveDialog`, `DataTable`, `MetricCard`, `EmptyState`,
`LoadingState`, `ErrorState`, `Skeleton`, `PermissionState`, `OfflineState`, `Icon` (size + tone variants),
`SyncStatusIndicator`, `OfflineBanner`.

**Rules.** No placeholder-only fields; one close/back per overlay; logical RTL spacing; decorative icons
`aria-hidden` (action buttons carry the label); honour `prefers-reduced-motion`.

**Adoption policy.** Adopt tokens/primitives in **new and touched** code only — no mass migration, no visual
churn. Remaining migration is listed in the debt report ([ARCHITECTURE.md](../ARCHITECTURE.md#design--architecture-debt)).

**Testing.** `e2e/coach-responsive.spec.ts`, `e2e/rtl.spec.ts` (overlay sizing, labels, single back, no overflow,
RTL) + presence checks for `DESIGN_SYSTEM.md` and `src/theme/*`.
