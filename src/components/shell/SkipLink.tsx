import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** The one main region of every app shell — the skip link's target and where focus lands on navigation. */
export const MAIN_ID = 'main-content';

/**
 * "Skip to content" (B3.9, AX-05): the first focusable element of every app shell, visible only while
 * focused. Moves keyboard focus past the navigation rail / tab bar to the screen itself.
 */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[90] focus:rounded-ui-control focus:border focus:border-line-strong focus:bg-surface-raised focus:px-4 focus:py-3 focus:text-[14px] focus:font-semibold focus:text-earth"
      data-testid="skip-link"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(MAIN_ID)?.focus();
      }}
    >
      {t('a11y.skipToContent')}
    </a>
  );
}

/**
 * Focus follows navigation (B3.9, AX-05): after a route change (not the first load) focus moves to the
 * new screen's heading — or its main region — so a screen reader announces where the user is and the
 * keyboard continues from the top of the screen instead of the link that was pressed. A screen that
 * already focused something inside its main region (an autofocus field, a dialog) keeps it. A REPLACE
 * navigation (a redirect, a section switched in place such as the workspace tabs) keeps focus where it
 * is — only moving to a new screen (push) or Back / Forward (pop) moves it.
 */
export function useRouteFocus() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  // The pathname focus last followed — the first load is never a "move", and an effect run twice for the
  // same path (React StrictMode) is not one either.
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (navType === 'REPLACE') return;
    let observer: MutationObserver | null = null;
    let timer = 0;
    // True only when focus really landed (a screen still hidden behind a loading boundary can't take it).
    const focusHeading = (main: HTMLElement) => {
      const heading = main.querySelector<HTMLElement>('h1');
      if (!heading) return false;
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.classList.add('no-focus-ring');
      heading.focus({ preventScroll: true });
      return document.activeElement === heading;
    };
    // Focus nobody has claimed yet: the page itself (a hidden, just-clicked link drops it there) or main.
    const unclaimed = (main: HTMLElement) => {
      const a = document.activeElement;
      return !a || a === document.body || a === main;
    };
    const id = requestAnimationFrame(() => {
      const main = document.getElementById(MAIN_ID);
      if (!main) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== main && (main.contains(active) || active.closest('[role="dialog"]'))) return;
      if (focusHeading(main)) return;
      // A lazily loaded screen has no heading yet (or is still hidden while it loads): hold focus on the
      // main region and move it to the heading when it renders — unless the user has moved on meanwhile.
      main.focus({ preventScroll: true });
      observer = new MutationObserver(() => {
        if (!unclaimed(main) || focusHeading(main)) observer?.disconnect();
      });
      observer.observe(main, { childList: true, subtree: true });
      timer = window.setTimeout(() => observer?.disconnect(), 3000);
    });
    return () => {
      cancelAnimationFrame(id);
      observer?.disconnect();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per pathname change; the type is read with it
  }, [pathname]);
}
