import { useEffect, useRef, useState } from 'react';

/**
 * Reveal-on-scroll: attach the returned `ref` to an element and read `visible`,
 * which flips to true the first time the element enters the viewport (then the
 * observer disconnects — reveals are one-shot). Falls back to immediately
 * visible when `IntersectionObserver` is unavailable, so content is never
 * trapped hidden. Pairs with the `.reveal` / `.reveal-in` CSS in index.css,
 * which is itself disabled under `prefers-reduced-motion`.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: options?.threshold ?? 0.15, rootMargin: options?.rootMargin ?? '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, options?.threshold, options?.rootMargin]);

  return { ref, visible };
}
