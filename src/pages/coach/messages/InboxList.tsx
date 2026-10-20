import { memo, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { SearchField } from '@/components/ui/Field';
import { INBOX_FILTERS, timeLabelOf, unreadBadge, type InboxFilter, type InboxPreview, type InboxRow } from '@/lib/coachInbox';
import { formatDate, formatTime } from '@/lib/format';

const ATTACH_LABEL = { image: 'messages.photoMsg', video: 'messages.videoMsg', audio: 'messages.audioMsg', file: 'messages.fileMsg' } as const;

export const threadPath = (clientId: string) => `/coach/messages/${encodeURIComponent(clientId)}`;

/** Search + All · Unread (blueprint §6.5: the Broadcasts filter is gone). */
export function InboxFilters({ q, onQ, filter, onFilter, unreadThreads }: { q: string; onQ: (v: string) => void; filter: InboxFilter; onFilter: (f: InboxFilter) => void; unreadThreads: number }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-2.5">
      <SearchField aria-label={t('messages.searchClients')} placeholder={t('messages.searchClients')} value={q} onChange={(e) => onQ(e.target.value)} data-testid="inbox-search" />
      <div className="flex gap-2" role="group" aria-label={t('messages.filterLabel')}>
        {INBOX_FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} data-testid={`inbox-filter-${f}`} onClick={() => onFilter(f)} className={`chip ${filter === f ? 'chip-on' : ''}`}>
            {t(`messages.filters.${f}`)}
            {f === 'unread' && unreadThreads > 0 ? <span className="ms-1 tabular-nums opacity-80">{unreadThreads.toLocaleString(i18n.language)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewText({ p }: { p: InboxPreview }) {
  const { t } = useTranslation();
  if (p.kind === 'loading') return <span className="sk inline-block h-3 w-32 rounded align-middle" aria-hidden="true" />;
  if (p.kind === 'none') return <span className="text-earth-subtle">{t('messages.noMessages')}</span>;
  const you = p.mine ? <span className="text-earth-muted">{t('messages.youPrefix')} </span> : null;
  if (p.kind === 'deleted') return <>{you}<span className="italic">{t('messages.deletedTombstone')}</span></>;
  if (p.kind === 'attachment') return <>{you}{t(ATTACH_LABEL[p.attachment])}</>;
  return (
    <>
      {you}
      {p.category ? <span className="font-medium">{t(`messages.category.${p.category}`)} · </span> : null}
      <bdi>{p.text}</bdi>
    </>
  );
}

function TimeLabel({ ms }: { ms: number }) {
  const { t, i18n } = useTranslation();
  const kind = timeLabelOf(ms, Date.now()).kind;
  const text =
    kind === 'time' ? formatTime(ms, i18n.language)
    : kind === 'yesterday' ? t('common.yesterday')
    : kind === 'weekday' ? formatDate(ms, i18n.language, 'weekdayAbbrev')
    : formatDate(ms, i18n.language, kind === 'date' ? 'short' : 'medium');
  return <time dateTime={new Date(ms).toISOString()} className="shrink-0 text-[12px] tabular-nums text-earth-subtle">{text}</time>;
}

/**
 * One conversation: who, the newest message (who wrote it, or "Message
 * deleted"), when, and how many are unread. A link, so it opens like any
 * other navigation; `onOpen` decides push vs replace.
 */
export const InboxRowView = memo(function InboxRowView({ row, selected, onOpen }: { row: InboxRow; selected: boolean; onOpen: (id: string, e: MouseEvent) => void }) {
  const { t } = useTranslation();
  const unread = row.unread > 0;
  return (
    <li>
      <Link
        to={threadPath(row.id)}
        onClick={(e) => onOpen(row.id, e)}
        aria-current={selected ? 'true' : undefined}
        data-testid="thread-row"
        data-client-id={row.id}
        className={`flex min-h-[4.25rem] w-full items-center gap-3 px-3 py-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/70 ${
          selected ? 'bg-brand/[0.12]' : 'hover:bg-white/[0.04]'
        }`}
      >
        <Avatar name={row.name} photoUrl={row.photoUrl} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`block min-w-0 flex-1 truncate text-[15px] ${unread ? 'font-semibold text-earth' : 'font-medium text-earth'}`}>
              <bdi>{row.name}</bdi>
            </span>
            {row.lastAt > 0 ? <TimeLabel ms={row.lastAt} /> : null}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={`block min-w-0 flex-1 truncate text-[13px] ${unread ? 'text-earth' : 'text-earth-muted'}`} data-testid="thread-preview">
              <PreviewText p={row.preview} />
            </span>
            {unread ? (
              <span data-testid="thread-unread-badge" className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-brand px-1.5 font-mono text-[10.5px] font-bold text-brand-ink">
                <span aria-hidden="true">{unreadBadge(row.unread)}</span>
                <span className="sr-only">{t('messages.unreadCount', { count: row.unread })}</span>
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
});

/** The list itself, with its honest states (loading, failed summary, no results, unread caught up). */
export function InboxList({
  rows,
  selectedId,
  onOpen,
  threadsLoaded,
  threadsFailed,
  onRetryThreads,
  filter,
  q,
  onClear,
  className = '',
}: {
  rows: InboxRow[];
  selectedId: string | null;
  onOpen: (id: string, e: MouseEvent) => void;
  threadsLoaded: boolean;
  threadsFailed: boolean;
  onRetryThreads: () => void;
  filter: InboxFilter;
  q: string;
  onClear: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={className}>
      {threadsFailed && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-3 py-2 text-[13px] text-earth-muted" role="alert" data-testid="inbox-threads-error">
          <Icon name="alert" size={15} className="text-warn" />
          <span className="min-w-0 flex-1">{t(threadsLoaded ? 'messages.inboxStale' : 'messages.inboxFailed')}</span>
          <button type="button" className="hit-44 font-semibold text-brand-hover" onClick={onRetryThreads}>{t('common.retry')}</button>
        </p>
      )}
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center" role="status" data-testid="inbox-no-results">
          <p className="text-[14px] font-medium text-earth">{t(filter === 'unread' && !q.trim() ? 'messages.noUnreadTitle' : 'search.noResults')}</p>
          <p className="mt-1 text-[13px] text-earth-muted">{t(filter === 'unread' && !q.trim() ? 'messages.noUnreadBody' : 'messages.noResultsMessage')}</p>
          <button type="button" className="btn-tonal btn-sm mt-3" onClick={onClear}>{t('common.clearFilters')}</button>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft" aria-label={t('messages.conversations')} data-testid="inbox-list">
          {rows.map((r) => (
            <InboxRowView key={r.id} row={r} selected={r.id === selectedId} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}
