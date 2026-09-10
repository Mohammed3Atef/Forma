/** Hand-rolled easing curves — no dependency, used to make the `GymRig`
 * transformation read as mechanical/physical (snap, overshoot, settle)
 * instead of a linear slide. `t(progress, start, end)` maps a progress value
 * onto a clamped 0..1 local range, which is what you feed into these.
 */

export function t(progress: number, start: number, end: number): number {
  if (start === end) return progress >= end ? 1 : 0;
  const x = (progress - start) / (end - start);
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Overshoots past 1 then settles — a "snap into place" arrival. */
export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Bounces past 1 a couple of times before settling — a heavier "impact" arrival. */
export function easeOutElastic(x: number): number {
  const c4 = (2 * Math.PI) / 3;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** A 0->1->0 bell curve peaking at `center`, for a brief light-flash pulse. */
export function bell(progress: number, center: number, width: number): number {
  const d = Math.abs(progress - center) / width;
  return d >= 1 ? 0 : 1 - d * d * (3 - 2 * d);
}
