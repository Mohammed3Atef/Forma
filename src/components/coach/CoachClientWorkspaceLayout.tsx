import { useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Pill } from '@/components/ui/Pill';
import { useCoachClientHeader, SUB_TONE } from '@/hooks/useCoachClientHeader';
import { useBack } from '@/hooks/useBack';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { ClientSwitcherSheet } from '@/components/coach/ClientSwitcherSheet';

interface WorkspaceTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

const TABS: WorkspaceTab[] = [
  { key: 'overview', labelKey: 'workspace.tabs.overview', icon: 'home' },
  { key: 'workout', labelKey: 'workspace.tabs.workout', icon: 'dumbbell' },
  { key: 'nutrition', labelKey: 'workspace.tabs.nutrition', icon: 'meal' },
  { key: 'cardio', labelKey: 'workspace.tabs.cardio', icon: 'activity' },
  { key: 'progress', labelKey: 'workspace.tabs.progress', icon: 'chart' },
  { key: 'assessments', labelKey: 'workspace.tabs.assessments', icon: 'list' },
  { key: 'checkins', labelKey: 'workspace.tabs.checkins', icon: 'check' },
  { key: 'messages', labelKey: 'workspace.tabs.messages', icon: 'chat' },
  { key: 'notes', labelKey: 'workspace.tabs.notes', icon: 'edit' },
  { key: 'subscription', labelKey: 'workspace.tabs.subscription', icon: 'shield' },
  { key: 'history', labelKey: 'workspace.tabs.history', icon: 'rotate' },
];

// Mobile keeps only the 4 highest-traffic tabs visible; everything else moves
// into the "More" sheet instead of an unusable 11-item horizontal-scroll rail.
const MOBILE_PRIMARY = ['overview', 'workout', 'nutrition', 'progress'];
const MOBILE_MORE = TABS.filter((tb) => !MOBILE_PRIMARY.includes(tb.key));

/**
 * Two of the 11 tabs are intentional escape hatches to already-complete,
 * separately-owned screens rather than embedded content — Progress reuses the
 * existing "view as client" progress tab, Messages reuses the real coach
 * inbox thread view. Navigating to either unmounts this layout; the other 9
 * render inside the persistent shell below via `<Outlet/>`.
 */
function tabPath(clientId: string, key: string): string {
  switch (key) {
    case 'overview':
      return `/coach/client/${clientId}`;
    case 'assessments':
      return `/coach/client/${clientId}/assessment`;
    case 'progress':
      return `/coach/client/${clientId}/view/progress`;
    case 'messages':
      return `/coach/messages/${clientId}`;
    default:
      return `/coach/client/${clientId}/${key}`;
  }
}

/** Which tab key the current pathname corresponds to, for this client — used both to highlight the active tab and to preserve it when switching clients. */
function activeTabKey(pathname: string, clientId: string): string {
  const hit = TABS.find((tb) => {
    const to = tabPath(clientId, tb.key);
    return tb.key === 'overview' ? pathname === to : pathname.startsWith(to);
  });
  return hit?.key ?? 'overview';
}

/**
 * The coach's persistent client workspace: a pinned header (back, avatar,
 * name, subscription-status pill, goal/renewal line, Message/Edit-plan
 * actions) + an 11-tab rail, matching the design's `workspace()`/`wsBody()`
 * exactly. A layout route — the 8+ existing per-client pages keep their own
 * data-fetching/mutations untouched and render via `<Outlet/>` below; only
 * their own duplicate headers were trimmed (see each page for details).
 */
export function CoachClientWorkspaceLayout() {
  const { t } = useTranslation();
  const navigate = useGuardedNav();
  const goBack = useBack('/coach/clients');
  const { pathname } = useLocation();
  const { clientId = '' } = useParams();
  const { name, photoUrl, goal, subStatus, daysLeft } = useCoachClientHeader(clientId);
  const isDesktop = useIsDesktop();
  const [moreOpen, setMoreOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const currentTab = activeTabKey(pathname, clientId);

  const switchTo = (nextClientId: string) => {
    setSwitcherOpen(false);
    // Stay on the equivalent tab — a coach switching from A's Workout tab
    // expects to land on B's Workout tab, not back at the overview.
    navigate(tabPath(nextClientId, currentTab), { replace: true });
  };

  const subLine = [
    goal ? t(`settings.goals.${goal}`) : null,
    daysLeft != null ? t('subscription.daysLeft', { n: daysLeft }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="-mt-1">
      <div className="border-b border-line pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={goBack} className="icon-btn h-9 w-9 shrink-0" aria-label={t('common.back')}>
              <Icon name="chevronLeft" size={18} className="rtl:rotate-180" />
            </button>
            <button type="button" className="flex min-w-0 items-center gap-3 text-start" data-testid="workspace-switch-trigger" onClick={() => setSwitcherOpen(true)} aria-label={t('workspace.switchClient')}>
              <Avatar name={name} photoUrl={photoUrl} size="md" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-lg font-semibold">{name || t('coach.client')}</h1>
                  <Pill tone={SUB_TONE[subStatus]}>{t(`subscription.status.${subStatus}`)}</Pill>
                  <Icon name="chevronDown" size={14} className="shrink-0 text-earth-subtle" />
                </div>
                {subLine && <p className="truncate text-[12.5px] text-earth-subtle">{subLine}</p>}
              </div>
            </button>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => navigate(`/coach/messages/${clientId}`)}>
              <Icon name="chat" size={14} /> <span className="hidden sm:inline">{t('coachDash.message')}</span>
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`/coach/client/${clientId}/workout`)}>
              <Icon name="edit" size={14} /> <span className="hidden sm:inline">{t('workspace.editPlan')}</span>
            </button>
          </div>
        </div>
        <div className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(isDesktop ? TABS : TABS.filter((tb) => MOBILE_PRIMARY.includes(tb.key))).map((tb) => {
            const to = tabPath(clientId, tb.key);
            const active = tb.key === 'overview' ? pathname === to : pathname.startsWith(to);
            return (
              <button
                key={tb.key}
                type="button"
                data-testid={`workspace-tab-${tb.key}`}
                onClick={() => navigate(to, { replace: true })}
                className={`relative shrink-0 whitespace-nowrap px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.05em] transition-colors ${
                  active ? 'text-white' : 'text-earth-subtle hover:text-earth'
                }`}
              >
                {t(tb.labelKey)}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-brand" />}
              </button>
            );
          })}
          {!isDesktop && (
            <button
              type="button"
              data-testid="workspace-tab-more"
              onClick={() => setMoreOpen(true)}
              className={`relative shrink-0 whitespace-nowrap px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.05em] transition-colors ${
                MOBILE_MORE.some((tb) => tb.key === currentTab) ? 'text-white' : 'text-earth-subtle hover:text-earth'
              }`}
            >
              {t('workspace.tabs.more')}
              {MOBILE_MORE.some((tb) => tb.key === currentTab) && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-brand" />}
            </button>
          )}
        </div>
      </div>
      <div className="pt-4">
        <Outlet />
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} size="sm" title={t('workspace.tabs.more')}>
        <div className="space-y-1" data-testid="workspace-more-sheet">
          {MOBILE_MORE.map((tb) => {
            const to = tabPath(clientId, tb.key);
            const active = tb.key === currentTab;
            return (
              <button
                key={tb.key}
                type="button"
                data-testid={`workspace-more-${tb.key}`}
                className={`row w-full text-start ${active ? 'bg-brand/10' : ''}`}
                onClick={() => { setMoreOpen(false); navigate(to, { replace: true }); }}
              >
                <Icon name={tb.icon} size={18} className="text-earth-muted" />
                <span className="min-w-0 flex-1">{t(tb.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
      <ClientSwitcherSheet open={switcherOpen} onClose={() => setSwitcherOpen(false)} currentClientId={clientId} onSelect={switchTo} />
    </div>
  );
}
