import { useEffect, useRef, useState } from 'react';
import { useStoryProgress, type StoryTimeline } from '../hooks/useStoryProgress';
import { useDeviceTier, usePreferStatic } from '../hooks/useReducedMotionPref';
import { GymRigCanvas } from '../scene/GymRigCanvas';
import { HeroCopy } from './HeroCopy';
import { ProblemCopy, PROBLEM_FRAGMENTS } from './ProblemCopy';
import { StaticFallbackStory } from './StaticFallbackStory';

const FRAGMENT_START = 0.4;
const FRAGMENT_STEP = 0.06; // each fragment's full in+hold+out window, so consecutive lines never overlap

/**
 * Sections 1 (Hero) + 2 (Problem) from `docs/EXPERIENCE_STORYBOARD.md`, as one
 * pinned scroll container so the `GymRig` object and the copy can be scrubbed
 * by the same scroll range. See that doc's §5 for the exact timing table this
 * timeline implements.
 */
export function HeroProblemStory() {
  const preferStatic = usePreferStatic();
  const tier = useDeviceTier();

  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLParagraphElement>(null);
  const resolutionRef = useRef<HTMLParagraphElement>(null);
  const fragmentEls = useRef<Array<HTMLParagraphElement | null>>([]);
  const registerFragmentRef = (index: number, el: HTMLParagraphElement | null) => {
    fragmentEls.current[index] = el;
  };

  const [canvasVisible, setCanvasVisible] = useState(false);
  // Total pinned scroll distance is 340vh desktop/tablet, 220vh mobile; the
  // container itself is one 100vh viewport, so the *extra* distance the pin
  // holds for is that total minus 100.
  const endDistancePercent = tier === 'mobile' ? 120 : 240;

  // Only pay for the WebGL context while the story is near the viewport —
  // toggles both ways (not one-shot) so it's also torn down once scrolled
  // well past, not just skipped before it's reached.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || preferStatic) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setCanvasVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setCanvasVisible(entry.isIntersecting);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [preferStatic]);

  const buildTimeline = (tl: StoryTimeline) => {
    // Hero holds 0 -> 0.20, then lifts out as the camera begins to move.
    if (heroRef.current) {
      tl.to(heroRef.current, { opacity: 0, y: -24, duration: 0.08 }, 0.2);
    }

    // Intro line: in, a short hold, then fully out *before* any fragment
    // starts (0.37 < FRAGMENT_START 0.40) — the earlier version faded this
    // out at 0.58, long after every fragment had already appeared underneath
    // it, which is why they were overlapping/illegible.
    if (introRef.current) {
      tl.fromTo(introRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.03 }, 0.28);
      tl.to(introRef.current, { opacity: 0, y: -16, duration: 0.03 }, 0.34);
    }

    // Fragments: each one's whole in+hold+out cycle is exactly one
    // `FRAGMENT_STEP` wide, so the next line only starts as the previous one
    // finishes — never two visible at once.
    fragmentEls.current.forEach((el, i) => {
      if (!el) return;
      const start = FRAGMENT_START + i * FRAGMENT_STEP;
      tl.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.02 }, start);
      tl.to(el, { opacity: 0, y: -16, duration: 0.02 }, start + FRAGMENT_STEP - 0.02);
    });

    if (resolutionRef.current) {
      tl.fromTo(resolutionRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.06 }, 0.82);
    }

    // A GSAP timeline's total duration is the max (position + duration) across
    // its children — here that's ~0.88, not 1. Since ScrollTrigger's scrub maps
    // scroll fraction directly to *timeline progress* (currentTime / duration),
    // every position number above would silently get rescaled (0.4 would land
    // at 0.4 * 0.88 = 0.35) unless the timeline's duration is exactly 1. This
    // zero-duration placeholder at t=1 pads it out so position numbers really
    // do mean "fraction of the scroll range", matching the storyboard doc.
    tl.set({}, {}, 1);
  };

  const { progressRef } = useStoryProgress(containerRef, endDistancePercent, buildTimeline, [tier]);

  if (preferStatic) {
    return <StaticFallbackStory />;
  }

  return (
    <div ref={containerRef} className="relative h-screen w-full overflow-hidden bg-surface">
      {canvasVisible && (
        <div className="absolute inset-0">
          <GymRigCanvas progressRef={progressRef} tier={tier} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0">
        <HeroCopy ref={heroRef} />
        <ProblemCopy introRef={introRef} resolutionRef={resolutionRef} registerFragmentRef={registerFragmentRef} />
      </div>
    </div>
  );
}

// Re-exported so a later section (§3, not built yet) can start its own
// fragment list numbering from where this one leaves off if needed.
export const PROBLEM_FRAGMENT_COUNT = PROBLEM_FRAGMENTS.length;
