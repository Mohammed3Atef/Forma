import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Banner as BannerView } from '@/components/ui/Banner';
import { BANNER_PRIORITY, useBannerSlot } from '@/stores/bannerRegionStore';
import { useSession } from '@/services/auth/sessionStore';
import { fetchBannersForViewer, type Banner, type BannerPlacement, type BannerStyle } from '@/services/platform/bannersApi';

const TONE: Record<BannerStyle, 'info' | 'success' | 'warning' | 'brand'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  promo: 'brand',
};

/** Where each placement shows (B1.4): the home screen it is named after, not every route. */
const PLACEMENT_ROUTES: Partial<Record<BannerPlacement, string[]>> = {
  client_home: ['/'],
  coach_dashboard: ['/coach', '/coach/dashboard'],
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
 * Renders active, in-window, audience-matched announcements on the client home /
 * coach dashboard, as the lowest-priority slot of the shell's banner region
 * (B1.4). Admins never see marketing banners (placement null). Fetches
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
  const { pathname } = useLocation();
  const onPlacementRoute = !!placement && (PLACEMENT_ROUTES[placement] ?? []).includes(pathname.replace(/\/$/, '') || '/');

  useEffect(() => {
    if (!role || !placement || !uid) {
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
  const show = useBannerSlot('announcement', BANNER_PRIORITY.announcement, onPlacementRoute && shown.length > 0);
  if (!show || !placement || shown.length === 0) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  return (
    <div className="space-y-2" data-testid="banner-host">
      {shown.map((b) => (
        <BannerView
          key={b.id}
          tone={TONE[b.style]}
          testId="app-banner"
          title={b.title}
          onDismiss={() => dismiss(b.id)}
          action={
            // http(s) only at render too — covers banners stored before the server-side check.
            b.ctaLabel && b.ctaHref && /^https?:\/\//i.test(b.ctaHref) ? (
              <a href={b.ctaHref} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand">
                {b.ctaLabel}
              </a>
            ) : undefined
          }
        >
          {b.body ? b.body : null}
        </BannerView>
      ))}
    </div>
  );
}
