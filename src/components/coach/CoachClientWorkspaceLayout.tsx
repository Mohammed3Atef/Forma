import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { Pill } from '@/components/ui/Pill';
import { ClientSwitcherSheet } from '@/components/coach/ClientSwitcherSheet';
import { useCoachClientHeader } from '@/hooks/useCoachClientHeader';
import { useBack } from '@/hooks/useBack';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSession } from '@/services/auth/sessionStore';
import { releaseClient } from '@/services/platform/coachClientsApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { confirmLeave } from '@/stores/navGuardStore';
import { showToast } from '@/stores/toastStore';
import { clientStateOf } from '@/lib/coachDirectory';
import { semanticParent } from '@/lib/navContract';
import { samePlaceFor, sectionOf, sectionPath, WORKSPACE_SECTIONS, type WorkspaceSection } from '@/lib/coachWorkspace';
import { CLIENT_STATE_TONE as STATE_TONE } from '@/lib/statusTone';
import type { ThreadNavState } from '@/pages/coach/messages/CoachThreadPane';
import { errorMessage } from '@/lib/errorMessage';

/**
 * How a section opens (B3.4): the four sections REPLACE the history entry, so Back always returns
 * to where the client was opened from — Today, Clients or Messages — never to another section
 * (NAV-K08). Editors and the thread push (they are tasks you come back from).
 */
export function workspaceSectionNav(clientId: string, section: WorkspaceSection): { to: string; replace: boolean } {
  return { to: sectionPath(clientId, section), replace: true };
}

const SECTION_ICON = { summary: 'home', plan: 'list', progress: 'chart', profile: 'user' } as const;

/**
 * The coach's client workspace (B3.4 / blueprint §6.3): one compact header — Back · the client
 * (opens the switcher) · package and account state · Message · More (Call, Switch client,
 * Release) — and four sections: Summary · Plan · Progress · Profile. The plan editors are
 * full-screen task flows with their own header (one Back — NAV-K02), so the workspace draws
 * nothing around them. A client who is not (or no longer) on this coach's roster gets a clear
 * state instead of a page of failed reads (NAV-K09).
 */
export function CoachClientWorkspaceLayout() {
  const { t } = useTranslation();
  const navigate = useGuardedNav();
  const rawNavigate = useNavigate();
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const location = useLocation();
  const { pathname, search } = location;
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id) ?? '';
  const section = sectionOf(pathname, clientId);
  const goBack = useBack(semanticParent(pathname, 'coach'));
  const header = useCoachClientHeader(clientId);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const rel = header.relationship;
  const onRoster = header.relationshipState !== 'ready' || (rel?.status === 'active' && rel.coachId === coachId);
  const state = rel?.status === 'active' ? clientStateOf(rel, Date.now()) : null;
  const acct = header.user?.accountStatus;
  const blocked = acct && acct !== 'active' ? acct : null;
  const name = header.name || t('coach.client');

  const release = useMutation({
    mutationFn: () => releaseClient(coachId, clientId, coachId),
    onSuccess: () => {
      for (const key of ['myClients', 'coachRelationships', 'coachDashboardSummaries', 'coachCheckInSummaries', 'coachBusiness', 'coachPlan', 'coachFreezeRequests']) {
        void qc.invalidateQueries({ queryKey: [key, coachId] });
      }
      void qc.invalidateQueries({ queryKey: ['relationship', coachId, clientId] });
      showToast({ title: t('workspace.release.done', { name }), variant: 'success' });
      // The workspace is gone for this coach: replace it, so Back never lands on a dead page (NAV-K09).
      navigate('/coach/clients', { replace: true });
    },
    onError: (e) => void alertDialog({ title: t('workspace.release.failedTitle'), message: errorMessage(e, t) }),
  });
  // NAV-K07: Message from a workspace the thread opened returns to that thread (history pops) instead of
  // pushing thread → client → thread → … ; otherwise the thread is a task opened from here (push).
  const openThread = () => {
    const fromThread = ((location.state ?? {}) as ThreadNavState).fromThread === clientId;
    if (fromThread && (window.history.state?.idx ?? 0) > 0) {
      void confirmLeave().then((ok) => {
        if (ok) rawNavigate(-1);
      });
    } else {
      navigate(`/coach/messages/${encodeURIComponent(clientId)}`, { state: { fromWorkspace: clientId } satisfies ThreadNavState });
    }
  };

  const askRelease = async () => {
    const ok = await confirmDialog({
      title: t('workspace.release.title', { name }),
      message: t('workspace.release.body'),
      confirmLabel: t('workspace.release.confirm'),
      danger: true,
    });
    if (ok) release.mutate();
  };

  // Editors are task flows: no workspace chrome (one Back, the editor's — NAV-K02).
  if (section === 'editor') return <Outlet />;

  const menu: ActionMenuItem[] = [
    ...(header.user?.phone ? [{ key: 'call', label: t('workspace.call'), icon: 'phone' as const, testId: 'workspace-call', onSelect: () => window.open(`tel:${header.user!.phone}`, '_self') }] : []),
    { key: 'switch', label: t('workspace.switchClient'), icon: 'users', testId: 'workspace-switch', onSelect: () => setSwitcherOpen(true) },
    ...(onRoster && rel?.status === 'active'
      ? [{ key: 'release', label: t('workspace.release.action'), icon: 'logout' as const, danger: true, disabled: !online || release.isPending, testId: 'workspace-release', onSelect: () => void askRelease() }]
      : []),
  ];

  return (
    <div className="-mt-1" data-testid="coach-workspace" data-section={section}>
      <header className="border-b border-line">
        <div className="flex items-center gap-2 pb-3">
          <button type="button" onClick={goBack} className="icon-btn h-11 w-11 shrink-0" aria-label={t('common.back')} data-testid="workspace-back">
            <Icon name="chevronLeft" size={20} />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-ui-control py-1 text-start hover:bg-white/[0.03]"
            data-testid="workspace-switch-trigger"
            aria-label={t('workspace.switchClientFor', { name })}
            onClick={() => setSwitcherOpen(true)}
          >
            {/* Below 430 px the name needs the room (Back · name · Message · More). */}
            <span className="hidden shrink-0 min-[430px]:block">
              <Avatar name={name} photoUrl={header.photoUrl} size="md" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <h1 className="truncate font-display text-lg font-semibold" data-testid="workspace-client-name">{name}</h1>
                <Icon name="chevronDown" size={14} className="shrink-0 text-earth-subtle" />
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {state ? (
                  <Pill tone={STATE_TONE[state.state]} testId="workspace-package">
                    {state.state === 'expiring' && state.daysLeft != null ? t('coachClients.endsIn', { count: state.daysLeft }) : t(`coachClients.state.${state.state}`)}
                  </Pill>
                ) : null}
                {state && state.daysLeft != null && state.state !== 'expiring' ? <span className="text-[12px] text-earth-subtle">{t('coachClients.daysLeft', { count: state.daysLeft })}</span> : null}
                {blocked ? (
                  <Pill tone={blocked === 'pending' ? 'warn' : 'bad'} className={blocked === 'pending' ? '' : 'text-danger-text'} testId="workspace-account">
                    {t(`coachClients.account.${blocked}`, { defaultValue: t(`subscription.acct.${blocked}`) })}
                  </Pill>
                ) : null}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm h-11 w-11 shrink-0 !px-0 sm:w-auto sm:!px-4"
            data-testid="workspace-message"
            aria-label={t('coachDash.message')}
            onClick={openThread}
          >
            <Icon name="chat" size={16} /> <span className="hidden sm:inline">{t('coachDash.message')}</span>
          </button>
          <ActionMenu label={t('workspace.more', { name })} testId="workspace-more" items={menu} />
        </div>

        <nav className="-mb-px grid grid-cols-4 md:max-w-xl" aria-label={t('workspace.sections')}>
          {WORKSPACE_SECTIONS.map((s) => {
            const active = section === s;
            const nav = workspaceSectionNav(clientId, s);
            return (
              <Link
                key={s}
                to={nav.to}
                replace={nav.replace}
                data-testid={`workspace-tab-${s}`}
                aria-current={active ? 'page' : undefined}
                onClick={(e) => {
                  // Every exit goes through the unsaved-changes guard (C4).
                  e.preventDefault();
                  navigate(nav.to, { replace: nav.replace });
                }}
                className={`relative flex min-h-11 items-center justify-center gap-1.5 px-1 text-[13px] font-medium transition-colors ${active ? 'text-earth' : 'text-earth-subtle hover:text-earth'}`}
              >
                <Icon name={SECTION_ICON[s]} size={15} className="hidden sm:block" />
                {t(`workspace.section.${s}`)}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-brand" />}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="pt-4">
        {onRoster ? (
          <Outlet />
        ) : (
          <div className="card mx-auto mt-6 max-w-md space-y-3 text-center" role="status" data-testid="workspace-not-on-roster">
            <p className="font-semibold">{t('workspace.notOnRoster.title')}</p>
            <p className="text-[14px] text-earth-muted">{t('workspace.notOnRoster.body')}</p>
            <button type="button" className="btn-primary w-full" onClick={() => navigate('/coach/clients', { replace: true })}>
              {t('workspace.notOnRoster.cta')}
            </button>
          </div>
        )}
      </div>

      <ClientSwitcherSheet
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        currentClientId={clientId}
        onSelect={(next) => {
          setSwitcherOpen(false);
          // Same section for the other client (blueprint §6.3); guarded like every exit.
          navigate(samePlaceFor(pathname, clientId, next, search), { replace: true });
        }}
      />
    </div>
  );
}
