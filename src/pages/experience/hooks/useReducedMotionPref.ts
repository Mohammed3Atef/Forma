import { useEffect, useState } from 'react';

/**
 * Gate for the whole cinematic 3D story. Returns `true` when the story should
 * render its static (no-WebGL, no-scroll-scrub) fallback instead of the
 * `<Canvas>` scene — either because the visitor asked for less motion
 * (`prefers-reduced-motion`), their browser/GPU can't do WebGL, or a coarse
 * low-power heuristic suggests the full scene would be a bad experience.
 *
 * Checked once on mount (SSR-safe: defaults to `true`/static until the effect
 * runs in the browser, so there's never a hydration flash of the 3D scene).
 */
export function usePreferStatic(): boolean {
  const [preferStatic, setPreferStatic] = useState(true);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (reducedMotion) {
      setPreferStatic(true);
      return;
    }

    let hasWebGL = false;
    try {
      const canvas = document.createElement('canvas');
      hasWebGL = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      hasWebGL = false;
    }

    // Coarse low-power signal — a handful of cores usually means an old/entry
    // device where a real-time lit 3D scene will drop frames badly. Not a
    // precise benchmark, just a guard against the worst experience.
    const lowPower = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2;

    setPreferStatic(!hasWebGL || lowPower);
  }, []);

  return preferStatic;
}

/** Coarse viewport tier used to scale scroll distance / DPR / fragment count. */
export type DeviceTier = 'mobile' | 'tablet' | 'desktop';

export function useDeviceTier(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>('desktop');

  useEffect(() => {
    const compute = (): DeviceTier => {
      const w = window.innerWidth;
      if (w < 768) return 'mobile';
      if (w < 1200) return 'tablet';
      return 'desktop';
    };
    setTier(compute());
    const onResize = () => setTier(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return tier;
}
