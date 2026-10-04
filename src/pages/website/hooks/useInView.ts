import { useEffect, useRef, useState } from 'react';

/**
 * True once the element has entered the viewport (never resets) — the
 * design's reveal trigger (site.js reveal(): rootMargin bottom −12%, 12%
 * visible). Also fires under reduced motion; the CSS decides whether to animate.
 */
export function useInView<T extends Element>(options: IntersectionObserverInit = { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const { root, rootMargin, threshold } = options;
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { root, rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, root, rootMargin, threshold]);
  return [ref, inView] as const;
}
