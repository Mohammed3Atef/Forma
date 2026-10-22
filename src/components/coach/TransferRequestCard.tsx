import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { fetchUser } from '@/services/platform/accountsApi';
import { resolveTransferRequest } from '@/services/platform/transferApi';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { ClientTransferRequest } from '@/types';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { errorMessage } from '@/lib/errorMessage';

/**
 * One incoming transfer request with its decision (B3.2: shared by Clients'
 * incoming strip and Today). Approve hands the client to the requesting
 * coach (`transfers.resolve('accept')` does the whole move server-side);
 * both outcomes are confirmed first, and Approve is deliberately not the
 * primary style (blueprint §6.1).
 */
export function TransferRequestCard({ req, coachId, clientName, onResolved }: { req: ClientTransferRequest; coachId: string; clientName: string; onResolved?: () => void }) {
  const { t } = useTranslation();
  // Resolving stays allowed on a lapsed plan (it protects the client); it needs the connection.
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const requester = useQuery({ queryKey: ['user', req.toCoachId], queryFn: () => fetchUser(req.toCoachId), enabled: !!req.toCoachId });
  const requesterName = requester.data?.displayName || requester.data?.email || t('timeline.unknownCoach');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['incomingTransferRequests', coachId] });
    void qc.invalidateQueries({ queryKey: ['myClients', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachPlan', coachId] }); // the server's client count (B3.8, D5)
    void qc.invalidateQueries({ queryKey: ['coachRelationships', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachBusiness', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachDashboardSummaries', coachId] });
  };
  const decide = useMutation({
    mutationFn: (outcome: 'accepted' | 'rejected') => resolveTransferRequest(req.toCoachId, req.clientId, coachId, outcome),
    onSuccess: (_d, outcome) => {
      refresh();
      showToast({ title: t(outcome === 'accepted' ? 'transferReq.approveDone' : 'transferReq.rejectDone'), variant: 'success' });
      onResolved?.();
    },
    onError: (e, outcome) => void alertDialog({ title: t(outcome === 'accepted' ? 'transferReq.approve' : 'transferReq.reject'), message: errorMessage(e, t) }),
  });

  const ask = async (outcome: 'accepted' | 'rejected') => {
    const ok = await confirmDialog({
      title: t(outcome === 'accepted' ? 'transferReq.approve' : 'transferReq.reject'),
      message: outcome === 'accepted' ? t('transferReq.confirmApprove', { client: clientName, coach: requesterName }) : t('transferReq.confirmReject', { coach: requesterName }),
      confirmLabel: t(outcome === 'accepted' ? 'transferReq.approve' : 'transferReq.reject'),
      danger: true,
    });
    if (ok) decide.mutate(outcome);
  };

  return (
    <div className="px-3 py-3" data-testid="incoming-transfer-row" data-client-id={req.clientId}>
      <div className="flex items-center gap-2.5">
        <Avatar name={clientName} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{clientName}</span>
          <span className="block truncate text-[12px] text-earth-subtle">{t('transferReq.requestedBy', { name: requesterName })}</span>
        </span>
      </div>
      {req.reason && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-earth-muted">{req.reason}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" data-testid="incoming-transfer-approve" className="btn-ghost btn-sm flex-1 disabled:opacity-40" disabled={decide.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void ask('accepted')}>
          {t('transferReq.approve')}
        </button>
        <button type="button" data-testid="incoming-transfer-reject" className="btn-ghost btn-sm flex-1 text-danger disabled:opacity-40" disabled={decide.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void ask('rejected')}>
          {t('transferReq.reject')}
        </button>
      </div>
    </div>
  );
}
