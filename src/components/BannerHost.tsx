import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useSession } from '@/services/auth/sessionStore';
import { fetchBannersForViewer, type Banner, type BannerPlacement, type BannerStyle } from '@/services/platform/bannersApi';

const STYLE: Record<BannerStyle, string> = {
  info: 'border-brand/40 bg-brand/5',
  success: 'border-success/40 bg-success/5',
  warning: 'border-warn/40 bg-warn/5',
  promo: 'border-brand/50 bg-brand/10',
};

/**
 * Renders active, in-window, audience-matched banners at the top of the client
 * home / coach dashboard. Admins never see marketing banners (placement null).
 * Mounted at the app root (outside the role QueryClientProviders), so it fetches
 * directly rather than via react-query. Dismissals are per-session.
 */
export function BannerHost() {
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid);
  const createdAt = useSession((s) => s.account?.createdAt ?? 0);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const placement: BannerPlacement | null = role === 'client' ? 'client_home' : role === 'coach' ? 'coach_dashboard' : null;

  useEffect(() => {
    if (!role || !placement || !uid || uid === 'local-user') {
      setBanners([]);
      return;
    }
    let active = true;
    void fetchBannersForViewer({ role, createdAt, placement })
      .then((bs) => { if (active) setBanners(bs); })
      .catch(() => { if (active) setBanners([]); });
    return () => { active = false; };
  }, [role, placement, uid, createdAt]);

  const shown = useMemo(() => banners.filter((b) => !dismissed.has(b.id)), [banners, dismissed]);
  if (!placement || shown.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-md space-y-2 px-5 pt-3 md:max-w-none md:px-6" data-testid="banner-host">
      {shown.map((b) => (
        <div key={b.id} className={`relative rounded-xl border px-4 py-3 ${STYLE[b.style]}`} data-testid="app-banner">
          <button type="button" aria-label="Dismiss" className="absolute end-2 top-2 text-earth-subtle" onClick={() => setDismissed(new Set([...dismissed, b.id]))}>
            <Icon name="close" size={16} />
          </button>
          <p className="pe-6 font-semibold">{b.title}</p>
          {b.body ? <p className="pe-6 mt-0.5 text-sm text-earth-muted">{b.body}</p> : null}
          {b.ctaLabel && b.ctaHref ? <a href={b.ctaHref} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand">{b.ctaLabel}</a> : null}
        </div>
      ))}
    </div>
  );
}
