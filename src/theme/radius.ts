/**
 * Border-radius tokens — mirrors tailwind.config.ts `borderRadius` + defaults.
 * Cards use `xl2` (18px); dialogs `2xl` on desktop; pills/avatars `full`.
 */
export const radius = {
  sm: '0.5rem', // rounded-lg
  md: '0.75rem', // rounded-xl (inputs)
  lg: '1rem', // rounded-2xl (desktop modals)
  xl: '18px', // rounded-xl2 (cards)
  '2xl': '26px', // rounded-sheet (mobile bottom sheet)
  full: '9999px', // pills, avatars, icon buttons
} as const;

export type RadiusToken = keyof typeof radius;
