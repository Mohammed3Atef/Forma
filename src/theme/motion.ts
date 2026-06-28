/**
 * Motion tokens — durations (ms) + easings. Mirrors the `--ease-card` curve in
 * src/index.css and the existing transition timings. Keep motion subtle and
 * always honour `prefers-reduced-motion` (components use `motion-reduce:` utils).
 */
export const motion = {
  fast: 150, // hover / colour changes
  normal: 200, // button press, tabs
  slow: 350, // modal / sheet open-close, drawers
  easingStandard: 'cubic-bezier(0.4, 0, 0.2, 1)', // general transitions
  easingEmphasized: 'cubic-bezier(0.16, 1, 0.3, 1)', // --ease-card (entrances)
} as const;

/** Durations as CSS strings, for inline style/animation use. */
export const motionMs = {
  fast: `${motion.fast}ms`,
  normal: `${motion.normal}ms`,
  slow: `${motion.slow}ms`,
} as const;

export type MotionToken = keyof typeof motion;
