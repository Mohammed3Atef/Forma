import type { CSSProperties } from 'react';
import { cx } from '../cx';

/**
 * The progress-photo cards (weeks 1 → 4 → 7 → 9) as one designed image —
 * photos, week badges, timeline and captions are part of the artwork, so it is
 * shown as-is (transparent background, sits on the card behind it).
 */
export function ProgressStrip({ alt = '', className, style }: { alt?: string; className?: string; style?: CSSProperties }) {
  return (
    <img
      src="/website/progress-strip.webp"
      alt={alt}
      width={1666}
      height={733}
      loading="lazy"
      className={cx('block h-auto w-full', className)}
      style={style}
    />
  );
}
