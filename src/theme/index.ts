/**
 * Forma design tokens — central source of truth, mirroring tailwind.config.ts +
 * src/index.css. New/changed shared primitives import from here; markup keeps
 * using Tailwind classes. See docs/DESIGN_SYSTEM.md for conventions.
 */
export { colors, type ColorToken } from './colors';
export { spacing, type SpacingToken } from './spacing';
export { radius, type RadiusToken } from './radius';
export { typography, type TypographyToken } from './typography';
export { elevation, type ElevationToken } from './elevation';
export { motion, motionMs, type MotionToken } from './motion';
export { breakpoints, type BreakpointToken } from './breakpoints';
