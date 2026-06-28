/**
 * Typographic roles → the CSS utility class that implements each (src/index.css).
 * Use the class in markup; this map documents the role each one plays so new
 * screens pick the right level instead of inventing font sizes.
 */
export const typography = {
  pageTitle: 'h1', // 30px bold — page hero
  sectionTitle: 'h2', // 18px semibold — section headings
  cardTitle: 'font-semibold', // card/list item titles
  body: 'text-sm', // default body copy
  small: 'text-[13px]', // dense secondary copy
  caption: 'text-[12px] text-earth-subtle', // hints / metadata
  metric: 'stat-num', // large mono numeric (dashboards)
  label: 'label', // mono uppercase field label
  eyebrow: 'eyebrow', // mono uppercase brand eyebrow
} as const;

export type TypographyToken = keyof typeof typography;
