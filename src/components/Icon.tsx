/** Minimal inline icon set (stroke-based, inherits currentColor). */
import type { SVGProps } from 'react';

type IconName =
  | 'home'
  | 'dumbbell'
  | 'meal'
  | 'activity'
  | 'chart'
  | 'settings'
  | 'play'
  | 'pause'
  | 'plus'
  | 'minus'
  | 'check'
  | 'timer'
  | 'water'
  | 'camera'
  | 'image'
  | 'download'
  | 'flame'
  | 'steps'
  | 'video'
  | 'close'
  | 'edit'
  | 'chevron'
  | 'chevronLeft'
  | 'chevronDown'
  | 'pill'
  | 'scale'
  | 'info'
  | 'calendar'
  | 'user'
  | 'trophy'
  | 'bolt'
  | 'arrowUp'
  | 'search'
  | 'ruler'
  | 'list'
  | 'target'
  | 'rotate'
  | 'bell';

const PATHS: Record<IconName, string> = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10',
  dumbbell: 'M6.5 6.5 17.5 17.5M3 9l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM9 6l9 9',
  meal: 'M4 3v7a3 3 0 0 0 3 3v8M7 3v6M10 3v6M19 3c-1.5 0-3 2-3 5s1.5 4 3 4v9',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  chart: 'M4 20V10M10 20V4M16 20v-6M21 20H3',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6H9.4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4.2l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z',
  play: 'M7 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 13l4 4L19 7',
  timer: 'M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 3h6',
  water: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  camera: 'M3 8h3l2-2h8l2 2h3v12H3zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  image: 'M3 5h18v14H3zM3 16l5-5 3 3 4-4 6 6M8.5 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  flame: 'M12 3c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1.5-1-2.5-1-4 2 1 4 3 4 6a6 6 0 1 1-12 0c0-5 5-7 6-11z',
  steps: 'M7 4c1.5 0 2.5 1.5 2.5 4S8 16 6 16s-2-2-1.5-5S5.5 4 7 4zM16 8c1.5 0 2.5 1.5 2.5 4s-1 6-3 6-2-2-1.5-5S14.5 8 16 8z',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3z',
  close: 'M6 6l12 12M18 6 6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  chevron: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  pill: 'M10.5 3.5a4 4 0 0 1 6 6l-7 7a4 4 0 0 1-6-6zM8 8l8 8',
  scale: 'M12 3a3 3 0 0 0-3 3h6a3 3 0 0 0-3-3zM5 6h14l2 14H3z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v5M12 7.5h.01',
  calendar: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 19h6M10 14.5V19M14 14.5V19',
  bolt: 'M13 3 4 14h7l-1 7 9-11h-7z',
  arrowUp: 'M12 20V5M6 11l6-6 6 6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  ruler: 'M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  // Counter-clockwise "undo / restore" arrow.
  rotate: 'M3 4v6h6M3.5 10a9 9 0 1 1-1 5',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type { IconName };
