/**
 * Breakpoint tokens (px) — aligned to Tailwind's defaults. Role layout targets:
 *   Client  → mobile-first (390–430), usable but mobile-width on desktop.
 *   Coach   → web/PWA-first: tablet 768 → desktop 1440+ (mobile fallback usable).
 *   Admin   → web/PWA-first: laptop 1024 → wide 1600 (mobile usable, not primary).
 * Pure show/hide uses Tailwind `md:`/`lg:`; JS forks use useMediaQuery with these.
 */
export const breakpoints = {
  mobile: 390,
  tablet: 768, // Tailwind md — sidebar shell kicks in
  laptop: 1024, // Tailwind lg — tables, master-detail, split views
  desktop: 1280, // Tailwind xl
  wide: 1536, // Tailwind 2xl — default content cap (max-w-screen-2xl)
} as const;

export type BreakpointToken = keyof typeof breakpoints;
