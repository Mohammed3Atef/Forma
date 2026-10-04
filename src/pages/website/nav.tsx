import { createContext, useContext, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type SitePage = 'home' | 'contact' | 'legal' | 'auth';

/** Where the website is mounted (`base` = route prefix, '' at the site root) and which page is showing. */
interface SiteCtx {
  base: string;
  page: SitePage;
  /** True from the first painted frame — drives the hero entrance (design body.loaded). */
  loaded: boolean;
}
const Ctx = createContext<SiteCtx>({ base: '', page: 'home', loaded: false });
export const SiteProvider = Ctx.Provider;
export const useSite = () => useContext(Ctx);

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scroll to an in-page anchor (#id / #top). The 84px fixed-nav offset comes from html scroll-padding-top (SiteShell). */
export function scrollToHash(hash: string) {
  const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth';
  if (hash === '#top' || hash === '#') return window.scrollTo({ top: 0, behavior });
  const el = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!el) return;
  el.scrollIntoView({ behavior, block: 'start' });
  history.replaceState(history.state, '', hash);
}

type Target = 'signup' | 'login';
export const AUTH_PATH: Record<Target, string> = { signup: '/login?signup=1', login: '/login' };

type SiteLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** '#id' (same page), '/path' or '/#id' (site route), 'mailto:'/'https:' (external), or an auth target. */
  to: string;
  auth?: Target;
  /** Optional so <Trans> can fill it from the copy. */
  children?: ReactNode;
};

/**
 * Every website link. Site routes are prefixed with the mount base and go
 * through react-router; '#id' scrolls in place; the auth CTAs open the real
 * auth form; anything else is a plain anchor.
 */
export function SiteLink({ to, auth, onClick, children, ...rest }: SiteLinkProps) {
  const { base } = useSite();
  if (auth) {
    return (
      <Link to={AUTH_PATH[auth]} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }
  if (to.startsWith('#')) {
    const handle = (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      scrollToHash(to);
    };
    return (
      <a href={to} onClick={handle} {...rest}>
        {children}
      </a>
    );
  }
  if (to.startsWith('/') && !to.startsWith('//')) {
    const [path, hash] = to.split('#');
    const pathname = `${base}${path === '/' ? '' : path}` || '/';
    return (
      <Link to={{ pathname, hash: hash ? `#${hash}` : '' }} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
