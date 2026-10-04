import { useEffect, useState, type ReactNode } from 'react';
import '../i18n';
import { cx } from '../cx';
import { useLocation } from 'react-router-dom';
import { scrollToHash, SiteProvider, type SitePage } from '../nav';
import { SiteFooter } from './SiteFooter';
import { SiteNav } from './SiteNav';
import s from './site.module.css';

function setMeta(name: string, content: string | null): string | null {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const prev = el?.content ?? null;
  if (content === null) {
    el?.remove();
    return prev;
  }
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
  return prev;
}

interface Props {
  page: SitePage;
  /** Route prefix the site is mounted under ('' in production). */
  base?: string;
  title: string;
  description: string;
  testId: string;
  /** Website nav + footer (off for the installed-PWA sign-in). */
  chrome?: boolean;
  children?: ReactNode;
}

/**
 * Public website frame: nav, <main>, footer. Owns the page-level settings the
 * design put on <html>/<body> — smooth scrolling with an 84px offset for the
 * fixed nav, the document title and the description meta — and restores them
 * when the visitor moves on to the app.
 */
export function SiteShell({ page, base = '', title, description, testId, chrome = true, children }: Props) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setLoaded(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const prev = { behavior: html.style.scrollBehavior, padding: html.style.scrollPaddingTop };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) html.style.scrollBehavior = 'smooth';
    html.style.scrollPaddingTop = '84px';
    return () => {
      html.style.scrollBehavior = prev.behavior;
      html.style.scrollPaddingTop = prev.padding;
    };
  }, []);

  // Arriving with a #section (e.g. a footer link from another page): scroll to it once laid out.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash.length < 2) return;
    const timer = window.setTimeout(() => scrollToHash(hash), 60);
    return () => window.clearTimeout(timer);
  }, [hash]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const prevDesc = setMeta('description', description);
    return () => {
      document.title = prevTitle;
      setMeta('description', prevDesc);
    };
  }, [title, description]);

  return (
    <SiteProvider value={{ base, page, loaded }}>
      <div
        id={page === 'home' ? 'top' : undefined}
        data-testid={testId}
        className={cx(s.root, 'min-h-dvh overflow-x-clip bg-surface font-sans text-[16px] leading-[1.55] text-earth rtl:font-site-ar')}
      >
        {chrome && <SiteNav />}
        <main className="relative isolate">{children}</main>
        {chrome && <SiteFooter />}
      </div>
    </SiteProvider>
  );
}
