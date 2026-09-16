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

const DISMISSED_KEY = 'forma:dismissedBanners';

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable (private mode, quota) — dismissal just won't survive a reload */
  }
}

/**
 * Renders active, in-window, audience-matched banners at the top of the client
 * home / coach dashboard. Admins never see marketing banners (placement null).
 * Mounted at the app root (outside the role QueryClientProviders), so it fetches
 * directly rather than via react-query. Dismissals persist in `sessionStorage`
 * (survive a refresh within the same tab, clear on a fresh session) — a plain
 * in-memory Set previously reset on every reload, so a dismissed banner kept
 * coming back.
 */
export function BannerHost() {
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid);
  const createdAt = useSession((s) => s.account?.createdAt ?? 0);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  const placement: BannerPlacement | null = role === 'client' ? 'client_home' : role === 'coach' ? 'coach_dashboard' : null;
  // The client app is a fixed mobile-width shell at every viewport size (see
  // AppShell's `max-w-md`) — only the coach/admin dashboards actually widen on
  // desktop, so only they get the wider banner treatment.
  const wide = role === 'coach';

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

  const dismiss = (id: string) => {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  return (
    <div className={`mx-auto w-full max-w-md space-y-2 px-5 pt-3 ${wide ? 'md:max-w-none md:px-6' : ''}`} data-testid="banner-host">
      {shown.map((b) => (
        <div key={b.id} className={`relative rounded-xl border px-4 py-3 ${STYLE[b.style]}`} data-testid="app-banner">
          <button
            type="button"
            aria-label="Dismiss"
            className="icon-btn absolute end-1.5 top-1.5 h-8 w-8 text-earth-subtle"
            onClick={() => dismiss(b.id)}
          >
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
