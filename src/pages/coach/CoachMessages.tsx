import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useIsTabletUp } from '@/hooks/useMediaQuery';
import { useFillToBottomNav } from '@/hooks/useFillToBottomNav';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { useBack } from '@/hooks/useBack';
import { useCoachInbox } from '@/hooks/useCoachInbox';
import { useSession } from '@/services/auth/sessionStore';
import { buildInbox, type InboxFilter } from '@/lib/coachInbox';
import { InboxFilters, InboxList, threadPath } from '@/pages/coach/messages/InboxList';
import { CoachThreadPane } from '@/pages/coach/messages/CoachThreadPane';
import { BroadcastSheet } from '@/pages/coach/messages/BroadcastSheet';

/**
 * Coach Messages (B3.6 / blueprint §6.5) — `/coach/messages` and
 * `/coach/messages/:clientId` are this one screen:
 *  - ≥ 768 px: the inbox and the open conversation side by side; the
 *    selection IS the URL (DT-01), so a reload, a notification or a shared
 *    link opens the same conversation, and the shell's toast suppression
 *    sees it.
 *  - phones: the inbox, or the conversation full-screen (its own header and
 *    Back, no tab bar, the composer above the keyboard — MS-03 / C12).
 * The engine is unchanged (C11): `MessageThread`, the durable outbox, the
 * 5 s thread poll and the shared 20 s summary poll (no new poller).
 */
export function CoachMessages() {
  useFullBleed();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId: rawId } = useParams();
  const selectedId = rawId ?? null;
  const account = useSession((s) => s.account);
  const coachId = account?.id ?? '';
  const tabletUp = useIsTabletUp();
  const goBack = useBack('/coach/messages');
  const data = useCoachInbox(coachId);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [broadcasting, setBroadcasting] = useState(false);

  const clients = useMemo(() => data.directory.rows.map((r) => ({ id: r.id, displayName: r.name, photoUrl: r.photoUrl, email: (data.roster.data ?? []).find((c) => c.id === r.id)?.email })), [data.directory.rows, data.roster.data]);
  const inbox = useMemo(() => buildInbox(clients, data.threads, { coachId, q, filter, selectedId }), [clients, data.threads, coachId, q, filter, selectedId]);
  const rosterReady = data.roster.data !== undefined;
  const row = data.rowOf(selectedId);

  // Selecting in the split view replaces the entry (switching conversations is not a history trail);
  // the first selection from the bare inbox, and every phone open, pushes.
  const open = useCallback(
    (id: string, e?: MouseEvent) => {
      e?.preventDefault();
      navigate(threadPath(id), { replace: tabletUp && !!selectedId });
    },
    [navigate, tabletUp, selectedId],
  );
  const refreshAfterRead = useCallback(() => void data.refreshThreads(), [data]);
  const onAccessChanged = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['myClients', coachId] });
    void data.refreshThreads();
  }, [qc, coachId, data]);
  const clear = () => {
    setQ('');
    setFilter('all');
  };

  const more = (
    <ActionMenu
      label={t('messages.inboxActions')}
      testId="messages-more"
      items={[{ key: 'broadcast', label: t('messages.broadcast'), icon: 'bolt', testId: 'broadcast-open', disabled: !rosterReady || clients.length === 0, onSelect: () => setBroadcasting(true) }]}
    />
  );
  const broadcastSheet = coachId ? (
    <BroadcastSheet open={broadcasting} onClose={() => setBroadcasting(false)} coachId={coachId} clients={data.directory.rows.map((r) => ({ id: r.id, name: r.name, photoUrl: r.photoUrl }))} onSent={() => void data.refreshThreads()} />
  ) : null;

  const listBody = () =>
    data.roster.isError && !rosterReady ? (
      <ErrorState message={t('coach.clientsLoadFailed')} onRetry={() => void data.roster.refetch()} testId="coach-messages-error" />
    ) : !rosterReady ? (
      <LoadingState variant="list" count={5} />
    ) : clients.length === 0 ? (
      <EmptyState
        icon="chat"
        title={t('coach.noClientsTitle')}
        message={t('messages.noClientsBody')}
        action={<button type="button" className="btn-primary btn-sm" onClick={() => navigate('/coach/clients')}>{t('coach.addClient')}</button>}
      />
    ) : (
      <InboxList
        rows={inbox.rows}
        selectedId={selectedId}
        onOpen={open}
        threadsLoaded={data.threads !== undefined}
        threadsFailed={data.threadsFailed}
        onRetryThreads={() => void data.refreshThreads()}
        filter={filter}
        q={q}
        onClear={clear}
      />
    );
  const unreadLine = inbox.unreadThreads > 0 ? t('messages.unreadThreads', { count: inbox.unreadThreads }) : data.threads ? t('messages.allRead') : '';

  // ---- phones ---------------------------------------------------------------
  if (!tabletUp) {
    if (selectedId) {
      return (
        <PhoneThreadScreen label={t('messages.conversationWith', { name: row?.name || t('coach.client') })}>
          <CoachThreadPane key={selectedId} coachId={coachId} clientId={selectedId} row={row} rosterReady={rosterReady} screen onBack={goBack} onAccessChanged={onAccessChanged} onMarkedRead={refreshAfterRead} />
        </PhoneThreadScreen>
      );
    }
    return (
      <div data-testid="coach-messages">
        <TopBar title={t('coach.messages')} sub={unreadLine || undefined} right={more} />
        {rosterReady && clients.length > 0 && (
          <div className="mb-3">
            <InboxFilters q={q} onQ={setQ} filter={filter} onFilter={setFilter} unreadThreads={inbox.unreadThreads} />
          </div>
        )}
        <div className="card overflow-hidden p-0">{listBody()}</div>
        {broadcastSheet}
      </div>
    );
  }

  // ---- ≥ 768: split view -------------------------------------------------------
  return (
    <SplitMessages
      list={
        <>
          <div className="shrink-0 space-y-3 border-b border-line-soft px-3 pb-3 pt-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-[20px] font-semibold leading-tight">{t('coach.messages')}</h1>
                {unreadLine ? <p className="truncate text-[12.5px] text-earth-muted" data-testid="inbox-unread-line">{unreadLine}</p> : null}
              </div>
              {more}
            </div>
            {rosterReady && clients.length > 0 && <InboxFilters q={q} onQ={setQ} filter={filter} onFilter={setFilter} unreadThreads={inbox.unreadThreads} />}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{listBody()}</div>
        </>
      }
      thread={
        selectedId ? (
          <CoachThreadPane key={selectedId} coachId={coachId} clientId={selectedId} row={row} rosterReady={rosterReady} screen={false} onAccessChanged={onAccessChanged} onMarkedRead={refreshAfterRead} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center" data-testid="thread-empty">
            <Icon name="chat" size={28} className="text-earth-subtle" />
            <p className="text-[15px] font-semibold text-earth">{t('coachDash.selectConversation')}</p>
            <p className="max-w-xs text-[13px] text-earth-muted">{t('messages.selectHint')}</p>
          </div>
        )
      }
      extra={broadcastSheet}
    />
  );
}

/** ≥ 768: inbox + conversation, sized from their real top edge to the viewport bottom (C12 with any banner above). */
function SplitMessages({ list, thread, extra }: { list: ReactNode; thread: ReactNode; extra: ReactNode }) {
  const { t } = useTranslation();
  const fill = useFillToBottomNav('2rem');
  return (
    <div ref={fill.ref} className="flex min-h-[26rem] gap-4" style={{ height: fill.height }} data-testid="coach-desktop-messages">
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-ui-surface border border-line bg-surface-card lg:w-80 xl:w-96" aria-label={t('messages.conversations')} data-testid="inbox-pane">
        {list}
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-ui-surface border border-line bg-surface-card" aria-label={t('messages.conversation')} data-testid="coach-thread">
        {thread}
      </section>
      {extra}
    </div>
  );
}

/** Phones: the conversation is a full-screen task above the shell (no tab bar), ending at the top of the on-screen keyboard. */
function PhoneThreadScreen({ label, children }: { label: string; children: ReactNode }) {
  const keyboard = useKeyboardInset(true);
  return (
    <div
      className="fixed inset-x-0 top-0 z-ui-task flex flex-col bg-surface"
      style={{ bottom: keyboard }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="coach-thread"
      data-keyboard={keyboard > 0 || undefined}
    >
      {children}
    </div>
  );
}
