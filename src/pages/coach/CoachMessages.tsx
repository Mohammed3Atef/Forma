import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MessageAttachment, MessageCategory, UserRecord } from '@/types';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { SearchField, TextAreaField } from '@/components/ui/Field';
import { MessageThread } from '@/components/MessageThread';
import { Pagination } from '@/components/ui/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import { broadcast, subscribeThreadMeta, type ThreadMeta } from '@/services/platform/messagesApi';
import { alertDialog } from '@/stores/dialogStore';

const CATEGORIES: MessageCategory[] = ['announcement', 'offer', 'reminder', 'update'];

/** Inbox preview label key for an attachment-only message, by kind. */
const ATTACH_PREVIEW: Record<MessageAttachment['kind'], string> = {
  image: 'photoMsg',
  video: 'videoMsg',
  audio: 'audioMsg',
  file: 'fileMsg',
};

/** Coach messaging inbox: a thread per client + a broadcast composer. */
export function CoachMessages() {
  useFullBleed();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const coachId = account?.id;
  const isDesktop = useIsDesktop();
  const [broadcasting, setBroadcasting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId!), enabled: !!coachId });
  const clientList = clients.data ?? [];
  const clientIds = clientList.map((c) => c.id).join(',');

  // Live last-message + unread per client (one Firestore listener per thread),
  // powering both the inbox sort (newest activity first) and each row's preview.
  const [metaMap, setMetaMap] = useState<Record<string, ThreadMeta>>({});
  useEffect(() => {
    const ids = clientIds ? clientIds.split(',') : [];
    if (!ids.length) return;
    const unsubs = ids.map((id) => subscribeThreadMeta(id, (meta) => setMetaMap((prev) => ({ ...prev, [id]: meta }))));
    return () => unsubs.forEach((u) => u());
  }, [clientIds]);

  const list = useMemo(
    () => [...clientList].sort((a, b) => (metaMap[b.id]?.last?.createdAt ?? 0) - (metaMap[a.id]?.last?.createdAt ?? 0)),
    [clientList, metaMap],
  );
  const selectedClient = list.find((c) => c.id === selectedId) ?? null;
  const pg = usePagination(list, 30);

  return (
    <>
      <TopBar
        title={t('coach.messages')}
        eyebrow={t('platform.coachPortal')}
        right={
          <button type="button" data-testid="broadcast-open" className="icon-btn h-[42px] w-[42px]" aria-label={t('messages.broadcast')} onClick={() => setBroadcasting(true)}>
            <Icon name="bolt" size={20} />
          </button>
        }
      />

      {clients.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : isDesktop ? (
        /* Desktop split: inbox list + selected conversation */
        <div data-testid="coach-desktop-messages" className="flex gap-5">
          <div className="card max-h-[calc(100dvh-12rem)] w-80 shrink-0 divide-y divide-line-soft overflow-y-auto p-0">
            {list.length === 0 ? (
              <p className="p-4 text-center text-sm text-earth-muted">{t('coach.noClients')}</p>
            ) : (
              list.map((c) => (
                <ThreadRow key={c.id} client={c} meta={metaMap[c.id]} active={c.id === selectedId} onOpen={() => setSelectedId(c.id)} />
              ))
            )}
          </div>
          <div className="min-w-0 flex-1">
            {selectedClient && coachId ? (
              <div className="card flex h-[calc(100dvh-12rem)] flex-col p-3">
                <h2 className="h2 mb-1 px-1">{selectedClient.displayName || selectedClient.email}</h2>
                <div className="min-h-0 flex-1">
                  <MessageThread key={selectedClient.id} clientId={selectedClient.id} meId={coachId} meRole="coach" peer={{ name: selectedClient.displayName || selectedClient.email, photoUrl: selectedClient.photoUrl }} />
                </div>
              </div>
            ) : (
              <div className="card flex h-64 items-center justify-center text-sm text-earth-subtle">
                {t('coachDash.selectConversation')}
              </div>
            )}
          </div>
        </div>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('coach.noClients')}</p>
      ) : (
        <>
          <div className="card divide-y divide-line-soft">
            {pg.pageItems.map((c) => (
              <ThreadRow key={c.id} client={c} meta={metaMap[c.id]} onOpen={() => navigate(`/coach/messages/${c.id}`)} />
            ))}
          </div>
          <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
        </>
      )}

      <Sheet open={broadcasting} onClose={() => setBroadcasting(false)} size="md" title={t('messages.broadcast')}>
        {coachId && <BroadcastForm coachId={coachId} role={account?.role ?? 'coach'} clients={list} onDone={() => setBroadcasting(false)} />}
      </Sheet>
    </>
  );
}

function ThreadRow({ client, meta, onOpen, active = false }: { client: UserRecord; meta?: ThreadMeta; onOpen: () => void; active?: boolean }) {
  const { t } = useTranslation();
  const last = meta?.last;
  const unread = meta?.unreadForCoach ?? 0;
  // An attachment-only message has an empty body — show a media label instead
  // of a blank preview (e.g. "📷 Photo").
  const preview = !last
    ? t('messages.noMessages')
    : last.body?.trim()
      ? last.body
      : last.attachment
        ? t(`messages.${ATTACH_PREVIEW[last.attachment.kind] ?? 'fileMsg'}`)
        : t('messages.noMessages');
  return (
    <button type="button" data-testid="thread-row" onClick={onOpen} className={`row w-full px-3 text-start ${active ? 'bg-brand/10' : ''}`}>
      <Avatar name={client.displayName || client.email} photoUrl={client.photoUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{client.displayName || client.email}</span>
        <span className="block truncate text-[13px] text-earth-muted">{preview}</span>
      </span>
      {unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{unread}</span>}
      <Icon name="chevron" size={18} className="text-earth-subtle" />
    </button>
  );
}

function BroadcastForm({ coachId, role, clients, onDone }: { coachId: string; role: UserRecord['role']; clients: UserRecord[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<MessageCategory>('announcement');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const all = selected.size === 0;
  const recipients = all ? clients.map((c) => c.id) : [...selected];
  const shownClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => `${c.displayName ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q));
  }, [clients, search]);

  const send = useMutation({
    mutationFn: () => broadcast(recipients, { id: coachId, role }, body.trim(), category),
    onSuccess: async () => {
      onDone();
      await alertDialog({ title: t('coach.sent'), message: t('coach.sentTo', { n: recipients.length }) });
    },
  });

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)} className={`chip ${category === c ? 'chip-on' : ''}`}>{t(`messages.category.${c}`)}</button>
        ))}
      </div>
      <p className="label">{t('messages.recipients')} · {all ? t('admin.allRoles') : recipients.length}</p>
      <SearchField
        aria-label={t('coach.searchClients')}
        data-testid="broadcast-search"
        placeholder={t('coach.searchClients')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {shownClients.map((c) => (
          <button key={c.id} type="button" onClick={() => toggle(c.id)} className={`chip ${selected.has(c.id) ? 'chip-on' : ''}`}>{c.displayName || c.email}</button>
        ))}
      </div>
      <TextAreaField label={t('field.notes')} className="min-h-28" data-testid="broadcast-body" placeholder={t('coach.announcementPlaceholder')} value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="button" data-testid="broadcast-send" disabled={!body.trim() || recipients.length === 0 || send.isPending} onClick={() => send.mutate()} className="btn-primary w-full disabled:opacity-40">
        {send.isPending ? t('auth.working') : t('messages.send')}
      </button>
    </div>
  );
}
