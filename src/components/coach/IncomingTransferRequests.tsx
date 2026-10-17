import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listMyClients } from '@/services/platform/coachApi';
import { incomingTransfersQuery } from '@/services/platform/transferApi';
import { TransferRequestCard } from './TransferRequestCard';

/**
 * Pending requests from OTHER coaches to take over MY clients (pull-based — the
 * rules don't permit cross-coach push notifications). The current coach can
 * Approve (which records the decision AND releases the client so the requester
 * can pick them up) or Reject. Renders nothing when there are no requests.
 * B3.2: the row is the shared `TransferRequestCard` (also on Today); the
 * client's name comes from the coach's own roster, not one lookup per request.
 */
export function IncomingTransferRequests({ coachId }: { coachId: string }) {
  const { t } = useTranslation();
  const q = useQuery(incomingTransfersQuery(coachId));
  const roster = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: !!coachId });
  const names = new Map((roster.data ?? []).map((u) => [u.id, u.displayName || u.email]));

  const items = (q.data ?? []).filter((r) => r.status === 'pending');
  if (items.length === 0) return null;

  return (
    <div className="mb-4 space-y-2" data-testid="incoming-transfers">
      <p className="label">{t('transferReq.incomingTitle')}</p>
      <div className="card divide-y divide-line-soft p-0">
        {items.map((req) => (
          <TransferRequestCard key={req.id} req={req} coachId={coachId} clientName={names.get(req.clientId) || t('coach.client')} />
        ))}
      </div>
    </div>
  );
}
