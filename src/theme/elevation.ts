/**
 * Elevation tokens → the Tailwind shadow utility for each surface level
 * (tailwind.config.ts `boxShadow`). Keep elevation meaningful: flat content,
 * raised cards, floating modals/popovers, and the focus ring.
 */
export const elevation = {
  flat: 'shadow-none',
  card: 'shadow-card', // resting cards
  modal: 'shadow-deep', // dialogs / bottom sheets
  popover: 'shadow-elevated', // command palette / raised panels
  focus: 'focus:border-brand/60 focus:outline-none', // input focus treatment
} as const;

export type ElevationToken = keyof typeof elevation;
