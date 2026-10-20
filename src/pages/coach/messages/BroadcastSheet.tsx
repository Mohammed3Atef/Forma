import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageCategory } from '@/types';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui/Button';
import { SearchField, TextAreaField } from '@/components/ui/Field';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { sendBroadcast, type BroadcastFailure, type BroadcastResult } from '@/services/platform/messagesApi';
import { MAX_MESSAGE_CHARS } from '@/components/MessageThread';
import { confirmDialog } from '@/stores/dialogStore';
import { uid } from '@/lib/utils';
import { formatNumber } from '@/lib/format';

const CATEGORIES: Exclude<MessageCategory, 'message'>[] = ['announcement', 'offer', 'reminder', 'update'];
type Audience = 'all' | 'chosen';

export interface BroadcastRecipient {
  id: string;
  name: string;
  photoUrl?: string;
}

/**
 * Broadcast (B3.6 / blueprint §6.5, MS-10, B3-C08, CO-27): the audience is
 * explicit — every active client, or the ones chosen here — and never the
 * inbox's current filter or search. Each recipient gets their own copy with
 * its own idempotency key, so the result can say "Sent to 9 of 10" and
 * Retry re-sends only to the ones not confirmed, never storing a second copy
 * for anyone in this broadcast. A send with no answer is reported as "not
 * confirmed" (it may have arrived), never as delivered or as not delivered.
 * Online only (a direct send, not the outbox; B36-R5): the button says so,
 * and leaving the page mid-send asks first.
 */
export function BroadcastSheet({ open, onClose, coachId, clients, onSent }: { open: boolean; onClose: () => void; coachId: string; clients: BroadcastRecipient[]; onSent?: () => void }) {
  const { t, i18n } = useTranslation();
  const online = useOnlineStatus();
  const lang = i18n.language;
  const [category, setCategory] = useState<Exclude<MessageCategory, 'message'>>('announcement');
  const [audience, setAudience] = useState<Audience>('all');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<BroadcastResult[] | null>(null);
  // One batch per composed broadcast: its keys stay the same for every retry of it.
  const batchRef = useRef<{ id: string; body: string; category: MessageCategory; recipients: string[] } | null>(null);

  // A reload or closing the tab mid-send would abandon the rest of the batch (nothing is kept, B36-R5).
  useEffect(() => {
    if (!sending) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sending]);

  const recipients = audience === 'all' ? clients.map((c) => c.id) : clients.filter((c) => chosen.has(c.id)).map((c) => c.id);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, search]);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? id;
  const text = body.trim();
  const tooLong = text.length > MAX_MESSAGE_CHARS;

  const reset = () => {
    setBody('');
    setChosen(new Set());
    setAudience('all');
    setSearch('');
    setResults(null);
    setDone(0);
    batchRef.current = null;
  };
  const close = () => {
    if (sending) return; // sends are in flight — the result is shown when they finish
    if (results) reset();
    onClose();
  };

  const run = async (to: string[]) => {
    const batch = batchRef.current!;
    setSending(true);
    setDone(0);
    try {
      const out = await sendBroadcast({ batchId: batch.id, coachId, recipients: to, body: batch.body, category: batch.category }, () => setDone((n) => n + 1));
      // Merge: a retried recipient's new result replaces its old one.
      setResults((prev) => {
        const map = new Map((prev ?? []).map((r) => [r.clientId, r]));
        for (const r of out) map.set(r.clientId, r);
        return batch.recipients.map((id) => map.get(id)!).filter(Boolean);
      });
      onSent?.();
    } finally {
      setSending(false);
    }
  };

  const start = async () => {
    if (!text || tooLong || recipients.length === 0 || sending) return;
    const ok = await confirmDialog({
      title: t('broadcast.confirmTitle', { count: recipients.length }),
      message: t('broadcast.confirmBody', { category: t(`messages.category.${category}`) }),
      confirmLabel: t('broadcast.send', { count: recipients.length }),
    });
    if (!ok) return;
    batchRef.current = { id: uid('b').slice(0, 24), body: text, category, recipients };
    await run(recipients);
  };

  const failed = results?.filter((r) => !r.ok) ?? [];
  const sent = results?.filter((r) => r.ok).length ?? 0;
  const unconfirmed = failed.filter((r) => r.failure === 'unknown').length;
  const notSent = failed.length - unconfirmed;
  const failureText = (f: BroadcastFailure | undefined) => t(`broadcast.failure.${f ?? 'unknown'}`);

  return (
    <Sheet open={open} onClose={close} size="md" title={t('messages.broadcast')}>
      {results ? (
        <div className="space-y-4" data-testid="broadcast-result">
          <div className={`flex items-start gap-3 rounded-ui-control border px-3 py-3 ${failed.length ? 'border-warn/40 bg-warn/10' : 'border-success/40 bg-success/10'}`} role="status">
            <Icon name={failed.length ? 'alert' : 'check'} size={20} className={failed.length ? 'text-warn' : 'text-success-light'} />
            <div className="min-w-0">
              <p className="font-semibold text-earth" data-testid="broadcast-summary">
                {t('broadcast.sentOf', { sent: formatNumber(sent, lang), count: results.length, total: formatNumber(results.length, lang) })}
              </p>
              {notSent > 0 ? <p className="text-[13px] text-earth-muted" data-testid="broadcast-not-sent">{t('broadcast.notSentCount', { count: notSent })}</p> : null}
              {unconfirmed > 0 ? <p className="text-[13px] text-earth-muted" data-testid="broadcast-unconfirmed">{t('broadcast.unconfirmedCount', { count: unconfirmed })}</p> : null}
            </div>
          </div>
          {failed.length > 0 && (
            <ul className="divide-y divide-line-soft rounded-ui-control border border-line" data-testid="broadcast-failed-list">
              {failed.map((r) => (
                <li key={r.clientId} className="flex items-center gap-3 px-3 py-2.5" data-failure={r.failure}>
                  <span className="block min-w-0 flex-1 truncate text-[14px] font-medium"><bdi>{nameOf(r.clientId)}</bdi></span>
                  <span className="max-w-[60%] shrink-0 text-end text-[12.5px] text-earth-muted">{failureText(r.failure)}</span>
                </li>
              ))}
            </ul>
          )}
          {failed.length > 0 && <p className="text-[12.5px] text-earth-muted">{t('broadcast.retryNote')}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {failed.length > 0 && (
              <Button variant="secondary" data-testid="broadcast-retry" pending={sending} disabled={!online} offline={!online} onClick={() => void run(failed.map((r) => r.clientId))}>
                {t('broadcast.retryFailed', { count: failed.length })}
              </Button>
            )}
            <Button data-testid="broadcast-done" disabled={sending} onClick={close}>{t('common.done')}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="label">{t('broadcast.kind')}</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={`chip ${category === c ? 'chip-on' : ''}`} data-testid={`broadcast-category-${c}`}>
                  {t(`messages.category.${c}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="label">{t('messages.recipients')}</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('messages.recipients')}>
              {(['all', 'chosen'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={audience === a}
                  data-testid={`broadcast-audience-${a}`}
                  onClick={() => setAudience(a)}
                  className={`rounded-ui-control border px-3 py-2.5 text-start text-[14px] ${audience === a ? 'border-brand/70 bg-brand/10 font-semibold text-earth' : 'border-line text-earth-muted hover:bg-white/[0.04]'}`}
                >
                  {a === 'all' ? t('broadcast.allClients', { count: clients.length }) : t('broadcast.choose')}
                </button>
              ))}
            </div>
            {audience === 'chosen' && (
              <div className="space-y-2">
                <SearchField aria-label={t('coach.searchClients')} data-testid="broadcast-search" placeholder={t('coach.searchClients')} value={search} onChange={(e) => setSearch(e.target.value)} />
                <ul className="max-h-56 divide-y divide-line-soft overflow-y-auto rounded-ui-control border border-line" data-testid="broadcast-recipients">
                  {shown.map((c) => (
                    <li key={c.id}>
                      <label className="flex min-h-ui-hit cursor-pointer items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-brand"
                          checked={chosen.has(c.id)}
                          onChange={() => setChosen((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                          data-testid="broadcast-recipient"
                        />
                        <Avatar name={c.name} photoUrl={c.photoUrl} size="xs" />
                        <span className="block min-w-0 flex-1 truncate text-[14px]"><bdi>{c.name}</bdi></span>
                      </label>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-earth-muted">{t('search.noResults')}</li>}
                </ul>
                <p className="text-[12.5px] text-earth-muted" data-testid="broadcast-chosen-count">{t('broadcast.chosenCount', { count: recipients.length })}</p>
              </div>
            )}
          </fieldset>

          <TextAreaField
            label={t('broadcast.message')}
            className="min-h-28"
            data-testid="broadcast-body"
            placeholder={t('coach.announcementPlaceholder')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={tooLong ? t('messages.tooLong') : undefined}
          />

          {text && !tooLong ? (
            <div className="space-y-1.5" data-testid="broadcast-preview">
              <p className="label">{t('broadcast.preview')}</p>
              <div className="w-fit max-w-full rounded-2xl rounded-es-[5px] border border-brand/60 bg-brand/15 px-3 py-2 text-sm text-earth">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-80">{t(`messages.category.${category}`)}</span>
                <p className="whitespace-pre-wrap break-words"><bdi>{text}</bdi></p>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Button
              className="w-full"
              data-testid="broadcast-send"
              pending={sending}
              disabled={!text || tooLong || recipients.length === 0 || !online}
              offline={!online}
              onClick={() => void start()}
            >
              {sending ? t('broadcast.sending', { done: formatNumber(done, lang), total: formatNumber(recipients.length, lang) }) : t('broadcast.send', { count: recipients.length })}
            </Button>
            {!online ? <p className="text-center text-[12.5px] text-earth-muted">{t('broadcast.needsConnection')}</p> : null}
          </div>
        </div>
      )}
    </Sheet>
  );
}
