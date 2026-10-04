import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../cx';
import { useSite } from '../nav';

/**
 * Page-load entrance for above-the-fold content (design [data-enter]): fades
 * up once the page has painted, staggered by `d` × 110ms. `rise` travels
 * further and scales in slightly (the hero visuals).
 */
export function Enter({ d = 0, rise, className, style, children }: { d?: number; rise?: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  const { loaded } = useSite();
  return (
    <div
      className={cx(
        loaded
          ? 'transform-none opacity-100 transition-[opacity,transform] ease-card [transition-delay:calc(var(--d,0)*110ms+80ms)] [transition-duration:1s,1.1s] motion-reduce:transition-none'
          : rise
            ? 'translate-y-[46px] scale-[.985] opacity-0'
            : 'translate-y-[18px] opacity-0',
        className,
      )}
      style={{ '--d': d, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
