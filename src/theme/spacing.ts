/**
 * Spacing scale (rem) — mirrors Tailwind's spacing steps. Prefer Tailwind
 * classes (`p-4`, `gap-3`, `space-y-6`); these tokens document the intended
 * rhythm and feed any JS-computed layout.
 */
export const spacing = {
  xs: '0.25rem', // 1  (gap-1)
  sm: '0.5rem', // 2  (gap-2)
  md: '0.75rem', // 3  (card inner gaps)
  lg: '1rem', // 4  (card padding)
  xl: '1.5rem', // 6  (section gap — PageContent space-y-6)
  '2xl': '2rem', // 8
  section: '1.5rem', // vertical gap between page sections
  page: '1.25rem', // page gutter on mobile (px-5); md+ uses px-6/px-8
} as const;

export type SpacingToken = keyof typeof spacing;
