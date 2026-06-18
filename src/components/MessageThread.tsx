import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Role } from '@/types';
import { listMessages, markThreadSeen, sendMessage } from '@/services/platform/messagesApi';
import { Icon } from '@/components/Icon';

/**
 * 1:1 chat thread for a client, shared by the client and coach screens. `meRole`
 * aligns bubbles (mine right) and drives the seen-receipt. Polls every 20s and
 * marks the other party's messages seen on open.
 */
export function MessageThread({ clientId, meId, meRole }: { clientId: string; meId: string; meRole: Role }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const q = useQuery({ queryKey: ['messages', clientId], queryFn: () => listMessages(clientId), enabled: !!clientId, refetchInterval: 20_000 });
  const messages = q.data ?? [];

  // Mark the other party's messages seen whenever new ones arrive.
  useEffect(() => {
    if (!clientId) return;
    if (messages.some((m) => m.fromRole !== meRole && !m.seenAt)) {
      void markThreadSeen(clientId, meRole).then(() => qc.invalidateQueries({ queryKey: ['messages', clientId] }));
    }
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [clientId, meRole, messages, qc]);

  const send = useMutation({
    mutationFn: () => sendMessage(clientId, { id: meId, role: meRole }, body),
    onSuccess: () => { setBody(''); void qc.invalidateQueries({ queryKey: ['messages', clientId] }); },
  });

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-2 py-2">
        {q.isLoading ? (
          <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-earth-muted">{t('messages.noMessages')}</p>
        ) : (
          messages.map((m) => {
            const mine = m.fromRole === meRole;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid="message-bubble">
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand text-slate-950' : 'bg-surface-raised text-white'}`}>
                  {m.broadcast && m.category && <span className="mb-0.5 block text-[10px] font-semibold uppercase opacity-70">{t(`messages.category.${m.category}`)}</span>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <span className={`mt-0.5 block text-[10px] ${mine ? 'text-slate-950/60' : 'text-earth-subtle'}`} dir="ltr">
                    {new Date(m.createdAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                    {mine && <span className="ms-1">{m.seenAt ? t('messages.seen') : t('messages.sent')}</span>}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 flex items-end gap-2 bg-surface/90 py-2 backdrop-blur">
        <textarea
          className="input max-h-32 min-h-11 flex-1 resize-none py-2.5"
          data-testid="message-input"
          rows={1}
          placeholder={t('messages.placeholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button type="button" data-testid="message-send" disabled={!body.trim() || send.isPending} onClick={() => send.mutate()} className="btn-primary h-11 w-11 shrink-0 px-0 disabled:opacity-40" aria-label={t('messages.send')}>
          <Icon name="chevron" size={20} />
        </button>
      </div>
    </div>
  );
}
