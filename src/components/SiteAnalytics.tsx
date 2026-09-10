import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';

/**
 * Site-traffic tracking. Primary path is Vercel Web Analytics (the app is
 * deployed on Vercel) — the <Analytics/> component auto-tracks page views and
 * SPA route changes, no-ops in dev, and needs no config beyond enabling Web
 * Analytics for the project in the Vercel dashboard.
 *
 * An optional env-based script injector remains for any additional/other
 * provider (Cloudflare / Plausible / Umami):
 *   VITE_ANALYTICS_SRC  — script URL
 *   VITE_ANALYTICS_DATA — optional JSON of data-* attributes (e.g. site token)
 */
export function SiteAnalytics() {
  useEffect(() => {
    const env = import.meta.env as unknown as Record<string, string | undefined>;
    const src = env.VITE_ANALYTICS_SRC;
    if (!src || import.meta.env.DEV) return;
    if (document.querySelector('script[data-forma-analytics]')) return;
    const el = document.createElement('script');
    el.src = src;
    el.defer = true;
    el.setAttribute('data-forma-analytics', '1');
    try {
      const data = env.VITE_ANALYTICS_DATA;
      if (data) for (const [k, v] of Object.entries(JSON.parse(data) as Record<string, string>)) el.setAttribute(k, v);
    } catch { /* ignore malformed env */ }
    document.head.appendChild(el);
  }, []);
  return <Analytics />;
}
