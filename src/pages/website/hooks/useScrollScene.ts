import { useEffect, useRef, useState } from 'react';

/**
 * Scroll scene driver (design site.js sceneSetup/sceneTick). Desktop without
 * reduced motion: `scrub` — the section is tall, its stage pins, and --p
 * follows scroll from 0 (pin) to 1 (release). Otherwise the scene `resolved`
 * once 30% of it is visible (--p transitions to 1).
 */
export function useScrollScene<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [scrub, setScrub] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const desk = window.matchMedia('(min-width: 900px)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setScrub(desk.matches && !rm.matches);
    update();
    desk.addEventListener('change', update);
    rm.addEventListener('change', update);
    return () => {
      desk.removeEventListener('change', update);
      rm.removeEventListener('change', update);
    };
  }, []);

  // Scrub: write --p (and a coarse phase) on scroll, once per frame.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!scrub) {
      el.style.removeProperty('--p');
      return;
    }
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) return;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
      el.style.setProperty('--p', p.toFixed(4));
      el.dataset.phase = p < 0.34 ? 'a' : p < 0.68 ? 'b' : 'c';
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [scrub]);

  // Resolve once on entry (phones / reduced motion).
  useEffect(() => {
    const el = ref.current;
    if (!el || scrub || resolved) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setResolved(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrub, resolved]);

  return { ref, scrub, resolved };
}
