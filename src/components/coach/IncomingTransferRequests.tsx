import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { fetchUser } from '@/services/platform/accountsApi';
import { releaseClient } from '@/services/platform/coachClientsApi';
import { listIncomingTransferRequests, resolveTransferRequest } from '@/services/platform/transferApi';
import type { ClientTransferRequest } from '@/types';

interface Enriched {
  req: ClientTransferRequest;
  clientName: string;
  requesterName: string;
}

/**
 * Pending requests from OTHER coaches to take over MY clients (pull-based — the
 * rules don't permit cross-coach push notifications). The current coach can
 * Approve (which records the decision AND releases the client so the requester
 * can pick them up) or Reject. Renders nothing when there are no requests.
 */
export function IncomingTransferRequests({ coachId }: { coachId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['incomingTransfers', coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<Enriched[]> => {
      const reqs = await listIncomingTransferRequests(coachId);
      return Promise.all(
        reqs.map(async (req) => {
          const [client, requester] = await Promise.all([
            fetchUser(req.clientId).catch(() => null),
            fetchUser(req.toCoachId).catch(() => null),
          ]);
          return {
            req,
            clientName: client?.displayName || client?.email || t('coach.client'),
            requesterName: requester?.displayName || requester?.email || t('timeline.unknownCoach'),
          };
        }),
      );
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['incomingTransfers', coachId] });
    void qc.invalidateQueries({ queryKey: ['myClients', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachDashboard', coachId] });
  };

  const approve = useMutation({
    mutationFn: async (r: ClientTransferRequest) => {
      await resolveTransferRequest(r.toCoachId, r.clientId, coachId, 'accepted');
      await releaseClient(coachId, r.clientId, coachId); // free the client so the requester can assign
    },
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: (r: ClientTransferRequest) => resolveTransferRequest(r.toCoachId, r.clientId, coachId, 'rejected'),
    onSuccess: refresh,
  });

  const items = q.data ?? [];
  if (items.length === 0) return null;

  return (
    <div className="mb-4 space-y-2" data-testid="incoming-transfers">
      <p className="label">{t('transferReq.incomingTitle')}</p>
      <div className="card divide-y divide-line-soft p-0">
        {items.map(({ req, clientName, requesterName }) => (
          <div key={req.id} className="px-3 py-3" data-testid="incoming-transfer-row" data-client-id={req.clientId}>
            <div className="flex items-center gap-2.5">
              <Avatar name={clientName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{clientName}</span>
                <span className="block truncate text-[12px] text-earth-subtle">{t('transferReq.requestedBy', { name: requesterName })}</span>
              </span>
            </div>
            {req.reason && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-earth-muted">{req.reason}</p>}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="incoming-transfer-approve"
                className="btn-primary h-9 flex-1 text-[13px] disabled:opacity-40"
                disabled={approve.isPending || reject.isPending}
                onClick={() => approve.mutate(req)}
              >
                {t('transferReq.approve')}
              </button>
              <button
                type="button"
                data-testid="incoming-transfer-reject"
                className="btn-ghost h-9 flex-1 text-[13px] text-danger disabled:opacity-40"
                disabled={approve.isPending || reject.isPending}
                onClick={() => reject.mutate(req)}
              >
                {t('transferReq.reject')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
