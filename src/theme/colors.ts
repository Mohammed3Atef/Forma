/**
 * Colour tokens — the single source of truth, mirroring tailwind.config.ts
 * (`theme.extend.colors`) and src/index.css. Use the Tailwind classes in markup;
 * import these only where a raw value is needed (charts, canvas, inline styles).
 * Do NOT add new hex values in components — add them here first.
 */
export const colors = {
  background: '#0B0C0F', // app bg (surface.DEFAULT)
  surface: '#15171C', // cards (surface.card)
  surfaceSunken: '#111318', // nav rails / recessed panels
  surfaceElevated: '#1B1F26', // raised inputs/tiles (surface.raised)
  surfaceHover: '#222832',
  border: '#2E3642', // line.DEFAULT
  borderSoft: '#20262E', // line.soft
  textPrimary: '#F5F5F5', // earth.DEFAULT
  textSecondary: '#9CA3AF', // earth.muted
  textMuted: '#6B7280', // earth.subtle
  brandOrange: '#E5520F', // brand.DEFAULT (primary action / accent / focus)
  brandOrangeHover: '#F2611C',
  brandOrangeDark: '#C8440A', // AA-safe white-on-fill
  brandGold: '#FFB627', // gold — sparing premium/revenue accent
  success: '#4CAF50', // success.light
  warning: '#F5A623', // warn
  danger: '#F0483E',
  info: '#6E7BF2', // system (admin accent)
} as const;

export type ColorToken = keyof typeof colors;
