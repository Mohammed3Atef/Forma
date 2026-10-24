import { useEffect, useRef, type RefObject } from 'react';

/** What Tab can land on — disabled and hidden controls never (the old per-component lists included them). */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)';

interface Trap {
  el: () => HTMLElement | null;
  onEscape: () => void;
}

/** Open layers, bottom → top. Only the TOP one answers keys, and only it is outside `inert`. */
const stack: Trap[] = [];
let inerted: Element[] = [];

/** The direct child of <body> that holds `el` (a portal container, or #root). */
function hostOf(el: HTMLElement | null): Element | null {
  let n: HTMLElement | null = el;
  while (n && n.parentElement && n.parentElement !== document.body) n = n.parentElement;
  return n && n.parentElement === document.body ? n : null;
}

/**
 * Everything but the top layer's host is `inert` — unreachable by Tab and hidden from assistive tech.
 * Hosts marked `data-trap-keep` (the toast region) stay live.
 */
function applyInert() {
  for (const n of inerted) n.removeAttribute('inert');
  inerted = [];
  const host = hostOf(stack[stack.length - 1]?.el() ?? null);
  if (!host) return;
  for (const child of Array.from(document.body.children)) {
    if (child === host || child.tagName === 'SCRIPT' || child.hasAttribute('inert') || (child as HTMLElement).dataset.trapKeep !== undefined) continue;
    child.setAttribute('inert', '');
    inerted.push(child);
  }
}

function onKeyDown(e: KeyboardEvent) {
  const top = stack[stack.length - 1];
  const el = top?.el();
  if (!top || !el) return;
  if (e.key === 'Escape') {
    // Something inside the layer took it (an open menu, a field) — the layer stays.
    if (e.defaultPrevented) return;
    // Stacked layers: Escape closes only the top one (a confirm over a sheet never closes both).
    e.preventDefault();
    top.onEscape();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.getClientRects().length > 0);
  const active = document.activeElement;
  if (items.length === 0) {
    e.preventDefault();
    el.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !el.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * One focus trap for every modal layer (B3.9, AX-05): Sheet, the dialog host, the command palette and
 * the phone task screens. While `active`: Tab / Shift+Tab cycle through the layer's ENABLED, visible
 * controls; Escape calls `onEscape` for the top layer only; the rest of the page is `inert`. Declare
 * it before an effect that restores focus to the opener, so the page is live again when that runs.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, { active, onEscape }: { active: boolean; onEscape: () => void }) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const trap: Trap = { el: () => ref.current, onEscape: () => escapeRef.current() };
    stack.push(trap);
    if (stack.length === 1) document.addEventListener('keydown', onKeyDown);
    applyInert();
    return () => {
      const i = stack.indexOf(trap);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.removeEventListener('keydown', onKeyDown);
      applyInert();
    };
  }, [active, ref]);
}
