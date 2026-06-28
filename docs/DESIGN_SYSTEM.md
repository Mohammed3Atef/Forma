# Forma Design System

The conventions every new/changed screen follows so the UI stays consistent. **This is a foundation, not a
redesign** — tokens mirror the existing Tailwind theme; adopt them in new/touched code, don't mass-migrate.

Tokens live in [`src/theme/`](../src/theme) (colors, spacing, radius, typography, elevation, motion, breakpoints)
and mirror [`tailwind.config.ts`](../tailwind.config.ts) + [`src/index.css`](../src/index.css). Use Tailwind
classes in markup; import tokens only where a raw value is needed (charts, inline styles).

## Buttons (CSS utilities in index.css)
- **primary** `.btn-primary` — one per view, the main action. **secondary/ghost** `.btn-ghost`. **danger**
  `.btn-danger` or `.btn-ghost text-danger` (destructive, visually separated). **icon** `.icon-btn` (square,
  always needs an `aria-label`).

## Cards
`.card` (resting) · `.card-elevated` (popovers/raised) · dashboard panels via `DashboardSection` + `DashboardCard`
· KPI tiles via `MetricCard` · tappable action cards via `.card-tap` / `.card-hover`.

## Forms — use the `Field` primitives ([ui/Field.tsx](../src/components/ui/Field.tsx))
`FormField`, `TextInput`, `SelectField`, `TextAreaField`, `SearchField`. Every Coach/Admin input has a **visible
persistent label**, optional helper, error text below, a required marker, and `aria-describedby` wiring. **No
placeholder-only fields.** Placeholder is optional helper text only. Search inputs use `SearchField` (carries an
`aria-label`).

## Dialogs / overlays — `Sheet` / `ResponsiveDialog` ([Sheet.tsx](../src/components/Sheet.tsx))
- Mobile (`<md`): bottom sheet. Desktop (`≥md`): centered modal, sized by `size` (`sm`→md, `md`→2xl, `lg`→4xl,
  `xl`/`wizard`→5xl), capped at 85vh with the body scrolling, header/footer fixed.
- **Exactly one** close (`X`) per overlay; **one** back control per step flow (`onBack` chevron OR a wizard footer
  Back — never both). Back chevron is direction-aware (`rotate-180 rtl:rotate-0`).

## Tables
Desktop: `DataTable`. Mobile: `MobileCardList`. Horizontal scroll lives **inside** the table container, never the
page. Wide/data-dense pages opt into full width with `useFullBleed()`.

## Standard states ([ui/](../src/components/ui))
`EmptyState` · `LoadingState` / `Skeleton` · `ErrorState` · `PermissionState` · `OfflineState`, plus
`SyncStatusIndicator` + the global `OfflineBanner`. Rules: no blank cards; no raw "Loading…" or unstyled errors
in Coach/Admin; permission denials always explained; offline screens show `OfflineState`, not an endless spinner.

## Navigation
- **Client**: mobile-first bottom nav (`BottomNav`) + brand bar; full menu in `NavMenuSheet`.
- **Coach/Admin**: `ResponsiveShell` — desktop sidebar (`SidebarNav`) + `DesktopTopBar`; mobile fallback reuses
  the bottom nav. Coach/Admin must never look like a stretched mobile screen.

## Icons — one wrapper ([Icon.tsx](../src/components/Icon.tsx))
Single stroke-based set. `size` accepts `xs|sm|md|lg` (14/16/20/24) or a number; `tone` = `muted|brand|success|
warning|danger|info`. Icons are decorative (`aria-hidden`) — the **action button** carries the `aria-label`.

## Motion ([theme/motion.ts](../src/theme/motion.ts))
fast 150ms (hover) · normal 200ms (press/tabs) · slow 350ms (modal/sheet/drawer). Easing `--ease-card`
(emphasized) for entrances. Keep it subtle; always honour `prefers-reduced-motion` (`motion-reduce:` utilities).

## RTL
Logical spacing only (`ms/me/ps/pe/start/end`, `text-start/end`) — no raw `left/right`/`ml/mr` unless unavoidable.
Arrows/chevrons are direction-aware. Verify dialogs, sidebar border side, table alignment, wizard steps in Arabic.

## Responsive role targets ([theme/breakpoints.ts](../src/theme/breakpoints.ts))
- **Client**: mobile-first 390–430; usable but mobile-width on desktop; native later.
- **Coach**: web/PWA-first — 768 tablet → 1024 → 1280 → 1440+; mobile fallback usable.
- **Admin**: web/PWA-first — 1024 → 1280 → 1440+ → 1600 wide; mobile usable, not the primary target.
- Use `fullBleed` only for data-dense pages (dashboards, analytics, reports, tables, plan builder, messages split).

## Architecture & maintainability
- Component buckets + one-way imports are enforced by [`scripts/check-boundaries.mjs`](../scripts/check-boundaries.mjs):
  `coach/admin ∌ client`, `client ∌ coach/admin`, `shared ∌ any role`. See [ARCHITECTURE.md](./ARCHITECTURE.md).
- Business logic lives in `services/` or `hooks/`; pages stay thin (compose hooks + presentational pieces).
- No duplicated form / date / currency / subscription-revenue logic — extract to a hook/service.
- Prefer components ≤ ~300–400 lines; split when you touch a larger one. Outstanding splits are listed in the
  debt report ([ARCHITECTURE.md](./ARCHITECTURE.md#design--architecture-debt)).
