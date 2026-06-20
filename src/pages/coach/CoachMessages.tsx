import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MessageCategory, UserRecord } from '@/types';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import { broadcast, threadMeta, type ThreadMeta } from '@/services/platform/messagesApi';
import { alertDialog } from '@/stores/dialogStore';

const CATEGORIES: MessageCategory[] = ['announcement', 'offer', 'reminder', 'update'];

/** Coach messaging inbox: a thread per client + a broadcast composer. */
export function CoachMessages() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const coachId = account?.id;
  const [broadcasting, setBroadcasting] = useState(false);

  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId!), enabled: !!coachId });
  const clientList = clients.data ?? [];
  const clientIds = clientList.map((c) => c.id).join(',');

  // Last message + unread per client, in one query, so the inbox can sort
  // conversations newest-activity first.
  const metas = useQuery({
    queryKey: ['threadMetas', coachId, clientIds],
    queryFn: async () => {
      const entries = await Promise.all(clientList.map(async (c) => [c.id, await threadMeta(c.id)] as const));
      return Object.fromEntries(entries) as Record<string, ThreadMeta>;
    },
    enabled: clientList.length > 0,
    refetchInterval: 30_000,
  });

  const list = useMemo(() => {
    const m = metas.data ?? {};
    return [...clientList].sort((a, b) => (m[b.id]?.last?.createdAt ?? 0) - (m[a.id]?.last?.createdAt ?? 0));
  }, [clientList, metas.data]);

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
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('coach.noClients')}</p>
      ) : (
        <div className="card divide-y divide-line-soft">
          {list.map((c) => (
            <ThreadRow key={c.id} client={c} onOpen={() => navigate(`/coach/messages/${c.id}`)} />
          ))}
        </div>
      )}

      <Sheet open={broadcasting} onClose={() => setBroadcasting(false)} title={t('messages.broadcast')}>
        {coachId && <BroadcastForm coachId={coachId} role={account?.role ?? 'coach'} clients={list} onDone={() => setBroadcasting(false)} />}
      </Sheet>
    </>
  );
}

function ThreadRow({ client, onOpen }: { client: UserRecord; onOpen: () => void }) {
  const { t } = useTranslation();
  const meta = useQuery({ queryKey: ['threadMeta', client.id], queryFn: () => threadMeta(client.id), refetchInterval: 30_000 });
  const last = meta.data?.last;
  const unread = meta.data?.unreadForCoach ?? 0;
  // An attachment-only message has an empty body — show a media label instead
  // of a blank preview (e.g. "📷 Photo").
  const preview = !last
    ? t('messages.noMessages')
    : last.body?.trim()
      ? last.body
      : last.attachment
        ? t(`messages.${last.attachment.kind === 'image' ? 'photoMsg' : last.attachment.kind === 'video' ? 'videoMsg' : 'fileMsg'}`)
        : t('messages.noMessages');
  return (
    <button type="button" data-testid="thread-row" onClick={onOpen} className="row w-full text-start">
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
  const all = selected.size === 0;
  const recipients = all ? clients.map((c) => c.id) : [...selected];

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
      <div className="flex flex-wrap gap-1.5">
        {clients.map((c) => (
          <button key={c.id} type="button" onClick={() => toggle(c.id)} className={`chip ${selected.has(c.id) ? 'chip-on' : ''}`}>{c.displayName || c.email}</button>
        ))}
      </div>
      <textarea className="input min-h-28" data-testid="broadcast-body" placeholder={t('coach.announcementPlaceholder')} value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="button" data-testid="broadcast-send" disabled={!body.trim() || recipients.length === 0 || send.isPending} onClick={() => send.mutate()} className="btn-primary w-full disabled:opacity-40">
        {send.isPending ? t('auth.working') : t('messages.send')}
      </button>
    </div>
  );
}
