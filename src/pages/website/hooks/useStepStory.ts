import { useCallback, useEffect, useRef, useState } from 'react';

const DESKTOP = '(min-width: 900px)';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/**
 * Scroll-linked step story (design site.js stepsSetup). Desktop: the copy
 * scrolls past a sticky stage and the step crossing the viewport's middle
 * band becomes active. Phones: the steps are a swipe row and the step that's
 * 60% visible is active. `goTo` (tabs, dots) activates a step and scrolls to it.
 */
export function useStepStory<K extends string>(keys: readonly K[]) {
  const [active, setActive] = useState<K>(keys[0]);
  const desktop = useMedia(DESKTOP);
  const rowRef = useRef<HTMLDivElement>(null);
  const stepEls = useRef(new Map<K, HTMLElement>());

  const stepRef = useCallback(
    (key: K) => (el: HTMLElement | null) => {
      if (el) stepEls.current.set(key, el);
      else stepEls.current.delete(key);
    },
    [],
  );

  useEffect(() => {
    const row = rowRef.current;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive((e.target as HTMLElement).dataset.step as K)),
      desktop ? { rootMargin: '-46% 0px -46% 0px' } : { root: row, threshold: 0.6 },
    );
    stepEls.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [desktop]);

  const goTo = useCallback(
    (key: K) => {
      setActive(key);
      const step = stepEls.current.get(key);
      if (!step) return;
      const behavior: ScrollBehavior = reduced() ? 'auto' : 'smooth';
      if (desktop) {
        window.scrollTo({ top: step.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3, behavior });
      } else {
        const row = rowRef.current;
        row?.scrollTo({ left: step.offsetLeft - row.offsetLeft, behavior });
      }
    },
    [desktop],
  );

  return { active, goTo, rowRef, stepRef };
}
