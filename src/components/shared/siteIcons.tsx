import type { ReactNode } from 'react';
import { ICON_PATHS } from '@/pages/website/icons';
import { IconGlyphContext, type IconGlyphRenderer, type IconName } from '@/components/Icon';

/**
 * The approved website glyphs for the app (B2, doc 17 — client; B3.1 / VS-07,
 * VS-20 — coach too): app icon names map onto the website set; names the
 * website lacks keep the app glyph. Shared, so both role apps wear one icon
 * language.
 */
type SiteName = keyof typeof ICON_PATHS;
const ALIAS: Partial<Record<IconName, SiteName>> = {
  home: 'home',
  dumbbell: 'dumbbell',
  meal: 'meal',
  activity: 'activity',
  chart: 'chart',
  settings: 'settings',
  play: 'play',
  pause: 'pause',
  plus: 'plus',
  minus: 'minus',
  check: 'check',
  timer: 'timer',
  camera: 'camera',
  image: 'image',
  download: 'download',
  flame: 'flame',
  video: 'video',
  close: 'x',
  edit: 'edit',
  chevron: 'chevR',
  chevronLeft: 'chevL',
  chevronDown: 'chevD',
  chevU: 'chevU',
  scale: 'scale',
  info: 'info',
  calendar: 'calendar',
  user: 'user',
  users: 'users',
  trophy: 'trophy',
  bolt: 'bolt',
  arrowUp: 'up',
  search: 'search',
  ruler: 'ruler',
  list: 'list',
  target: 'target',
  rotate: 'refresh',
  bell: 'bell',
  chat: 'msg',
  mic: 'mic',
  globe: 'globe',
  shield: 'shield',
  trash: 'trash',
  send: 'send',
  dots: 'dots',
  alert: 'alert',
  logout: 'logout',
  lock: 'lock',
  mail: 'mail',
  phone: 'phone',
  clock: 'clock',
  arrowR: 'arrowR',
  heart: 'heart',
  star: 'star',
  note: 'note',
  file: 'file',
  copy: 'copy',
  clip: 'clip',
};

const render: IconGlyphRenderer = (name) => {
  const site = ALIAS[name];
  return site ? (ICON_PATHS[site] as ReactNode) : null;
};

export function SiteIconSet({ children }: { children: ReactNode }) {
  return <IconGlyphContext.Provider value={render}>{children}</IconGlyphContext.Provider>;
}
