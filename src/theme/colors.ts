/**
 * Colour tokens — the single source of truth, mirroring tailwind.config.ts
 * (`theme.extend.colors`) and src/index.css. Use the Tailwind classes in markup;
 * import these only where a raw value is needed (charts, canvas, inline styles).
 * Do NOT add new hex values in components — add them here first.
 */
export const colors = {
  background: '#0C0A09', // app bg (surface.DEFAULT)
  surface: '#141110', // cards (surface.card)
  surfaceSunken: '#141110', // nav rails / recessed panels
  surfaceElevated: '#1B1714', // raised inputs/tiles (surface.raised)
  surfaceHover: '#241E1A',
  surfaceStrong: '#2E2621', // switch tracks / empty bar-chart fills (surface.strong)
  border: '#2E2A28', // line.DEFAULT
  borderSoft: '#221F1D', // line.soft
  textPrimary: '#F8F4F1', // earth.DEFAULT
  textSecondary: '#ABA19B', // earth.muted
  textMuted: '#948A83', // earth.subtle — meets WCAG AA (4.5:1) on every surface tier
  brandOrange: '#FF8B02', // brand.DEFAULT (primary action / accent / focus)
  brandOrangeHover: '#FFB208',
  brandOrangeDark: '#C8440A', // gradient base / AA-safe fill
  brandOrangePressed: '#FF4C01', // pressed/active fill — also the gradient's dark stop
  brandInk: '#1A0E05', // dark text on bright gradient-filled surfaces
  brandGold: '#FFB627', // gold — sparing premium/revenue accent
  success: '#3FB27F', // ok green — text/border/tint and solid fills alike
  warning: '#F5A623', // warn
  danger: '#F0483E',
  info: '#5B8DEF', // informational blue (brand orange no longer doubles as "info")
  violet: '#8B7CF0', // data-differentiation accent (e.g. nutrition/macro charts)
  teal: '#2FB8B0', // data-differentiation accent
  rose: '#EF5D8F', // data-differentiation accent
} as const;

export type ColorToken = keyof typeof colors;
