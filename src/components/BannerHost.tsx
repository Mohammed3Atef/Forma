import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Banner as BannerView } from '@/components/ui/Banner';
import { BANNER_PRIORITY, useBannerSlot } from '@/stores/bannerRegionStore';
import { useSession } from '@/services/auth/sessionStore';
import { fetchBannersForViewer, type Banner, type BannerPlacement, type BannerStyle } from '@/services/platform/bannersApi';
import { announcementVersion, loadDismissals, rememberDismissal } from '@/lib/bannerDismissals';

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

/**
 * Renders active, in-window, audience-matched announcements on the client home /
 * coach dashboard, as the lowest-priority slot of the shell's banner region
 * (B1.4). Admins never see marketing banners (placement null). Fetches
 * directly rather than via react-query.
 *
 * Dismissals (NT-10, `lib/bannerDismissals`): per signed-in user and per
 * announcement version — a dismissed informational announcement stays away
 * across launches until its content changes; a `warning` one is dismissed
 * for this session only. Same look as before.
 */
export function BannerHost() {
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid);
  const createdAt = useSession((s) => s.account?.createdAt ?? 0);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissals(uid));
  // Account switch on this device: the other user's dismissals, never the previous one's.
  useEffect(() => setDismissed(loadDismissals(uid)), [uid]);

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

  const shown = useMemo(() => banners.filter((b) => !dismissed.has(announcementVersion(b))), [banners, dismissed]);
  const show = useBannerSlot('announcement', BANNER_PRIORITY.announcement, onPlacementRoute && shown.length > 0);
  if (!show || !placement || shown.length === 0) return null;

  const dismiss = (b: Banner) => {
    rememberDismissal(uid, b);
    setDismissed(new Set(dismissed).add(announcementVersion(b)));
  };

  return (
    <div className="space-y-2" data-testid="banner-host">
      {shown.map((b) => (
        <BannerView
          key={b.id}
          tone={TONE[b.style]}
          testId="app-banner"
          title={b.title}
          onDismiss={() => dismiss(b)}
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
