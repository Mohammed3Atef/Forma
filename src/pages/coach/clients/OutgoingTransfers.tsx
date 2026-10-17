import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { ListGroup, Section } from '@/components/ui/ListRow';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { fetchUser } from '@/services/platform/accountsApi';
import { cancelTransferRequest, listOutgoingTransferRequests } from '@/services/platform/transferApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { formatDate } from '@/lib/format';
import type { ClientTransferRequest } from '@/types';
import { toneText } from './parts';

const TONE: Record<ClientTransferRequest['status'], PillTone> = { pending: 'warn', accepted: 'ok', rejected: 'bad', cancelled: 'mute' };
/** Decided requests stay listed for this long (then they are history, not news). */
const RECENT_MS = 30 * 86_400_000;

/**
 * Your transfer requests (B3.3 / B3-C06): the clients you asked to take over
 * from another coach, with the status and — while pending — Cancel. The
 * other coach is never named (CO-03): the server no longer sends who it is.
 * The client's name is the public name card (no contact details).
 */
export function OutgoingTransfers({ coachId }: { coachId: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['outgoingTransferRequests', coachId], queryFn: () => listOutgoingTransferRequests(coachId), enabled: !!coachId });
  const now = Date.now();
  const items = (q.data ?? []).filter((r) => r.status === 'pending' || now - (r.reviewedAt ?? r.updatedAt) <= RECENT_MS);
  if (items.length === 0) return null;
  return (
    <Section testId="outgoing-transfers" title={t('coachClients.outgoing.title')}>
      <ListGroup>
        {items.map((r) => (
          <OutgoingRow key={r.id} req={r} coachId={coachId} lang={i18n.language} onChanged={() => void qc.invalidateQueries({ queryKey: ['outgoingTransferRequests', coachId] })} />
        ))}
      </ListGroup>
    </Section>
  );
}

function OutgoingRow({ req, coachId, lang, onChanged }: { req: ClientTransferRequest; coachId: string; lang: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const user = useQuery({ queryKey: ['user', req.clientId], queryFn: () => fetchUser(req.clientId) });
  const name = user.data?.displayName || t('coach.client');
  const cancel = useMutation({
    mutationFn: () => cancelTransferRequest(coachId, req.clientId),
    onSuccess: () => {
      onChanged();
      showToast({ title: t('coachClients.outgoing.cancelled'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('coachClients.outgoing.cancel'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const ask = async () => {
    if (await confirmDialog({ title: t('coachClients.outgoing.cancel'), message: t('coachClients.outgoing.cancelConfirm', { name }), confirmLabel: t('coachClients.outgoing.cancel'), danger: true })) cancel.mutate();
  };
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2.5" data-testid="outgoing-transfer-row" data-client-id={req.clientId}>
      <Avatar name={name} photoUrl={user.data?.photoUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{name}</span>
        <span className="block truncate text-[13px] text-earth-muted">{t('coachClients.outgoing.requested', { date: formatDate(req.requestedAt, lang, 'dayMonth') })}</span>
      </span>
      <Pill tone={TONE[req.status]} className={toneText(TONE[req.status])} testId="outgoing-transfer-status">{t(`coachClients.outgoing.status.${req.status}`)}</Pill>
      {req.status === 'pending' ? (
        <button type="button" className="btn-ghost h-9 px-3 text-[13px] text-danger disabled:opacity-40" disabled={cancel.isPending} data-testid="outgoing-transfer-cancel" onClick={() => void ask()}>
          {t('coachClients.outgoing.cancel')}
        </button>
      ) : null}
    </div>
  );
}
