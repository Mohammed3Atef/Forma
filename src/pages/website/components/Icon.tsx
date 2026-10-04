import type { CSSProperties } from 'react';
import { ICON_PATHS, type IconName } from '../icons';
import { cx } from '../cx';

/**
 * The design's 24px line icon (forma/icons.js): 1.75 stroke, round caps.
 * `size` takes any CSS length (mocks size icons in em/cqw); default 18px.
 */
export function Icon({ name, size = 18, className, style }: { name: IconName; size?: number | string; className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={cx('flex-none', className)}
      style={{ width: size, height: size, ...style }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
