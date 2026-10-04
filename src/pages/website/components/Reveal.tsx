import { createContext, createElement, useContext, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../cx';
import { useInView } from '../hooks/useInView';

const InView = createContext(false);
/** The nearest Reveal's in-view state — for JS-driven effects (count-ups, charts) that start on reveal. */
export const useRevealed = () => useContext(InView);

interface Props {
  as?: 'div' | 'p' | 'h2' | 'section' | 'ul';
  /** 'up' rises 22px; 'scale' rises 18px from 97%; 'none' only exposes the in-view state. */
  variant?: 'up' | 'scale' | 'none';
  /** Stagger step (design --d): delay = d × 90ms. */
  d?: number;
  id?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  'aria-labelledby'?: string;
}

/**
 * Scroll reveal (design [data-reveal] / [data-io]). Sets data-in once in view,
 * and is a Tailwind group named `rv`, so descendants can animate off it with
 * `group-data-[in=true]/rv:…` (the design's `.in …` selectors).
 */
export function Reveal({ as = 'div', variant = 'up', d = 0, className, style, children, ...rest }: Props) {
  const [ref, inView] = useInView<HTMLElement>();
  return createElement(
    as,
    {
      ref,
      'data-in': inView,
      className: cx(
        'group/rv',
        variant !== 'none' &&
          'transition-[opacity,transform] ease-card [transition-delay:calc(var(--d,0)*90ms)] [transition-duration:800ms,900ms] motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:transition-none',
        variant !== 'none' && (inView ? 'transform-none opacity-100' : variant === 'scale' ? 'translate-y-[18px] scale-[.97] opacity-0' : 'translate-y-[22px] opacity-0'),
        className,
      ),
      style: d ? ({ '--d': d, ...style } as CSSProperties) : style,
      ...rest,
    },
    <InView.Provider value={inView}>{children}</InView.Provider>,
  );
}
