import { useEffect, useState } from 'react';

const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Animated number (design data-count): shows the final value until `active`,
 * then counts up from 0 over 1.3s (ease-out quart). Reduced motion: final value.
 * (The design dropped the thousands separator under reduced motion — kept here.)
 */
export function useCountUp(to: number, active: boolean, decimals = 0): string {
  const [text, setText] = useState(() => group(to.toFixed(decimals)));
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1300);
      const eased = 1 - Math.pow(1 - k, 4);
      setText(group((to * eased).toFixed(decimals)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, to, decimals]);
  return text;
}
