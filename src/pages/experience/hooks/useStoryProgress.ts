import { useEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Re-exported so callers can type a `buildTimeline` callback without importing `gsap` directly. */
export type StoryTimeline = gsap.core.Timeline;

/**
 * Pins `containerRef` (via ScrollTrigger's own `pin: true`, not CSS
 * `position: sticky` — see note below) for `endDistancePercent` of extra
 * scroll distance beyond its own height, and scrubs one GSAP timeline across
 * that whole pinned range. `buildTimeline` is called once, synchronously,
 * with the fresh timeline — add DOM copy tweens to it at absolute positions
 * 0..1 (the timeline's own duration is normalized to 1, so a tween added at
 * position `0.36` fires when the pin is 36% scrolled through). Building the
 * tweens inside the same `gsap.context` as the ScrollTrigger means they're all
 * torn down together on unmount/re-run.
 *
 * Returns `progressRef`: a plain mutable ref (not React state) holding the
 * same 0..1 value every scrub tick, read by the R3F scene's `useFrame` loop
 * so the 3D object updates without going through React's render cycle.
 *
 * Why `pin: true` instead of CSS sticky: this page's root wrapper (and
 * several ancestors) use `overflow-x: hidden`, and per the CSS overflow spec
 * a container with only one axis hidden silently forces its other axis to
 * `auto` — which can make an ancestor its own scroll container and break
 * `position: sticky` in ways that are easy to miss (content just scrolls
 * away instead of holding). ScrollTrigger's `pin` toggles `position: fixed`
 * directly via JS and manages its own spacer element, so it isn't affected by
 * that at all — the standard, robust choice for this exact pinned-scrollytelling
 * pattern.
 *
 * `deps` re-creates the whole timeline (e.g. when the device tier changes,
 * which changes `endDistancePercent`).
 */
export function useStoryProgress(
  containerRef: RefObject<HTMLElement>,
  endDistancePercent: number,
  buildTimeline: (tl: StoryTimeline) => void,
  deps: unknown[],
) {
  const progressRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: `+=${endDistancePercent}%`,
          pin: true,
          anticipatePin: 1,
          scrub: 0.6,
          onUpdate: (self) => {
            progressRef.current = self.progress;
          },
        },
        defaults: { ease: 'power2.out' },
      });
      buildTimeline(timeline);
    }, el);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { progressRef };
}
