import type { KeyboardEvent } from 'react';

/**
 * Arrow-key movement inside one composite widget — tabs, a radio group, a menu (B3.9, AX-05; the
 * WAI-ARIA patterns). Returns the index to move to, or -1 when the key isn't a movement key.
 * Left / Right follow the reading direction (reversed in Arabic); Up / Down move in list order;
 * Home / End jump to the ends; movement wraps.
 */
export function rovingIndex(e: KeyboardEvent<HTMLElement>, i: number, count: number, orientation: 'horizontal' | 'vertical' | 'both' = 'horizontal'): number {
  if (count <= 0) return -1;
  let step = 0;
  if (orientation !== 'vertical' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : rtl ? 1 : -1;
  }
  if (orientation !== 'horizontal' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) step = e.key === 'ArrowDown' ? 1 : -1;
  if (step) return (i + step + count) % count;
  if (e.key === 'Home') return 0;
  if (e.key === 'End') return count - 1;
  return -1;
}

/** Focus the item at `index` among the matching items of the widget the event came from. */
export function focusItem(e: KeyboardEvent<HTMLElement>, index: number, selector: string) {
  const group = e.currentTarget.closest('[role="tablist"],[role="radiogroup"],[role="menu"],[role="group"]');
  group?.querySelectorAll<HTMLElement>(selector)[index]?.focus();
}
