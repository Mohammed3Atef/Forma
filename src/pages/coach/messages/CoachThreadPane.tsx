import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { MessageThread } from '@/components/MessageThread';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { IconButton } from '@/components/ui/Button';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { messageDraftKey } from '@/data/messageDrafts';
import { requestCheckIn } from '@/services/platform/checkInApi';
import { alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { confirmLeave } from '@/stores/navGuardStore';
import { bulkCheckInEligible, type DirectoryRow } from '@/lib/coachDirectory';
import { addDays, today as todayKey, weekRange } from '@/lib/utils';
import { AccountPill, StatePill, useActivityText } from '@/pages/coach/clients/parts';

/** Navigation state the thread and the client workspace leave for each other (NAV-K07). */
export interface ThreadNavState {
  fromWorkspace?: string;
  fromThread?: string;
}

/**
 * The open conversation (B3.6 / blueprint §6.5): the recipient always named in
 * the header, the client's context in one line (package, account, last
 * workout, this week's check-in — the Clients directory's own values, never a
 * presence or "typing" signal), Open client and Request check-in, then the
 * shared engine in its coach presentation. `screen` = the phone's full-screen
 * thread (own Back, no tab bar); otherwise a pane of the split view.
 */
export function CoachThreadPane({
  coachId,
  clientId,
  row,
  rosterReady,
  screen,
  onBack,
  onAccessChanged,
  onMarkedRead,
}: {
  coachId: string;
  clientId: string;
  /** This client's directory row; null = not on the roster (or the roster hasn't loaded — see `rosterReady`). */
  row: DirectoryRow | null;
  rosterReady: boolean;
  screen: boolean;
  onBack?: () => void;
  /** The server refused the thread: the relationship ended. */
  onAccessChanged?: () => void;
  onMarkedRead?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const activity = useActivityText();
  const [accessLost, setAccessLost] = useState(false);
  const notAssigned = (rosterReady && !row) || accessLost;
  // Once the relationship ends mid-visit the row leaves the roster; keep naming whom this was (never another client).
  const known = useRef<{ name: string; photoUrl?: string } | null>(null);
  if (row) known.current = { name: row.name, photoUrl: row.photoUrl };
  const name = row?.name || known.current?.name || t('coach.client');
  const photoUrl = row?.photoUrl ?? known.current?.photoUrl;

  const day = todayKey();
  const week = weekRange(day);
  const request = useMutation({
    mutationFn: () => requestCheckIn(coachId, clientId, week.weekStart, addDays(week.weekStart, 6)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coachCheckInSummaries', coachId] });
      void qc.invalidateQueries({ queryKey: ['checkIns', clientId] });
      showToast({ title: t('workspace.summary.checkinRequested'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('checkin.request'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });

  // NAV-K07: thread ↔ client never ping-pongs — going back to the workspace we came from pops history.
  const navState = (location.state ?? {}) as ThreadNavState;
  const openClient = () => {
    void confirmLeave().then((ok) => {
      if (!ok) return;
      if (navState.fromWorkspace === clientId && (window.history.state?.idx ?? 0) > 0) navigate(-1);
      else navigate(`/coach/client/${encodeURIComponent(clientId)}`, { state: { fromThread: clientId } satisfies ThreadNavState });
    });
  };

  const menu: ActionMenuItem[] = [
    ...(row && !notAssigned && bulkCheckInEligible(row)
      ? [{ key: 'checkin', label: t('workspace.summary.requestCheckin'), icon: 'calendar' as const, disabled: !online || request.isPending, testId: 'thread-request-checkin', onSelect: () => request.mutate() }]
      : []),
    ...(!notAssigned ? [{ key: 'client', label: t('messages.openClient'), icon: 'user' as const, testId: 'thread-menu-open-client', onSelect: openClient }] : []),
  ];

  const context = row && !notAssigned
    ? [activity(row), row.checkIn ? t('messages.context.checkin', { state: t(`coachClients.checkin.${row.checkIn}`) }) : null].filter((x): x is string => !!x && x !== '—')
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="thread-pane" data-client-id={clientId}>
      <header
        className={`flex shrink-0 items-center gap-2 border-b border-line bg-surface-raised ${screen ? 'px-2 pb-2' : 'px-3 py-2.5'}`}
        style={screen ? { paddingTop: 'max(0.5rem, env(safe-area-inset-top))' } : undefined}
        data-testid="thread-header"
      >
        {screen && onBack ? <IconButton icon="chevronLeft" label={t('common.back')} onClick={onBack} className="border-transparent" data-testid="thread-back" /> : null}
        <button
          type="button"
          onClick={openClient}
          disabled={notAssigned}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-ui-control p-1 text-start transition-colors enabled:hover:bg-white/[0.04] disabled:cursor-default"
          aria-label={notAssigned ? undefined : t('messages.openClientFor', { name })}
          data-testid="thread-header-identity"
        >
          <Avatar name={name} photoUrl={photoUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-snug text-earth" data-testid="thread-recipient">
              <bdi>{name}</bdi>
            </span>
            {notAssigned ? (
              <span className="block truncate text-[12px] text-earth-muted">{t('messages.notAssignedShort')}</span>
            ) : row ? (
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5" data-testid="thread-context">
                <StatePill row={row} />
                <AccountPill row={row} />
                {context.length > 0 ? <span className="min-w-0 truncate text-[12px] text-earth-muted">{context.join(' · ')}</span> : null}
              </span>
            ) : (
              <span className="sk mt-1 block h-3 w-40 rounded" aria-hidden="true" />
            )}
          </span>
        </button>
        {!notAssigned ? (
          <IconButton icon="user" label={t('messages.openClient')} onClick={openClient} className="hidden border-transparent sm:inline-flex" data-testid="thread-open-client" />
        ) : null}
        {menu.length > 0 ? <ActionMenu label={t('messages.threadActions', { name })} items={menu} testId="thread-more" /> : null}
      </header>

      <div className="min-h-0 flex-1">
        {rosterReady && !row && !accessLost ? (
          // Not (or no longer) this coach's client: nothing of the thread is fetched or shown (B3-S14).
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center" role="status" data-testid="thread-not-assigned">
            <Icon name="lock" size={22} className="text-earth-subtle" />
            <p className="text-[15px] font-semibold text-earth">{t('messages.accessEndedTitle')}</p>
            <p className="max-w-sm text-[13px] text-earth-muted">{t('messages.notAssignedBody')}</p>
          </div>
        ) : (
          <MessageThread
            key={clientId}
            clientId={clientId}
            meId={coachId}
            meRole="coach"
            peer={{ name, photoUrl: row?.photoUrl }}
            variant="coach"
            draftKey={coachId ? messageDraftKey(coachId, clientId) : undefined}
            onAccessLost={() => {
              setAccessLost(true);
              onAccessChanged?.();
            }}
            onMarkedRead={onMarkedRead}
          />
        )}
      </div>
    </div>
  );
}
