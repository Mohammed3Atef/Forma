import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { useSession } from '@/services/auth/sessionStore';
import { broadcastAnnouncement, listMyClients, type Author } from '@/services/platform/coachApi';
import { alertDialog } from '@/stores/dialogStore';

export function CoachMessages() {
  const { t } = useTranslation();
  const account = useSession((s) => s.account);
  const coachId = account?.id;
  const author: Author = { id: coachId ?? 'self', role: account?.role ?? 'coach' };
  const [body, setBody] = useState('');

  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId!), enabled: !!coachId });
  const recipients = clients.data ?? [];

  const send = useMutation({
    mutationFn: () => broadcastAnnouncement(recipients.map((c) => c.id), body.trim(), author),
    onSuccess: async () => {
      setBody('');
      await alertDialog({ title: t('coach.sent'), message: t('coach.sentTo', { n: recipients.length }) });
    },
  });

  return (
    <>
      <TopBar title={t('coach.messages')} eyebrow={t('platform.coachPortal')} sub={t('coach.broadcastHint', { n: recipients.length })} />
      <div className="card space-y-3">
        <textarea className="input min-h-32" placeholder={t('coach.announcementPlaceholder')} value={body} onChange={(e) => setBody(e.target.value)} />
        <button
          type="button"
          disabled={!body.trim() || recipients.length === 0 || send.isPending}
          onClick={() => send.mutate()}
          className="btn-primary w-full disabled:opacity-40"
        >
          {send.isPending ? t('auth.working') : t('coach.sendAnnouncement')}
        </button>
      </div>
    </>
  );
}
