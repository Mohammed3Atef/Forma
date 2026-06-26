import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Pagination } from '@/components/ui/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useSession } from '@/services/auth/sessionStore';
import { useCan } from '@/services/auth/permissions';
import { fetchByRole, fetchUser } from '@/services/platform/accountsApi';
import { assignClientToCoach, unassignClient } from '@/services/platform/coachClientsApi';
import { listPendingTransferRequests, resolveTransferRequest } from '@/services/platform/transferApi';
import { TransferWizard } from '@/components/coach/TransferWizard';
import { confirmDialog } from '@/stores/dialogStore';
import type { ClientTransferRequest, UserRecord } from '@/types';

const DAY_MS = 86_400_000;
const REQ_FLAG_DAYS = 3; // surface requests waiting longer than this

export function AdminAssignments() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const actorId = useSession((s) => s.account?.id ?? 'self');
  const canAssign = useCan('coaches.assign');
  const canFreshStart = useCan('clients.writeAll');

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [wizard, setWizard] = useState<{ client: UserRecord; presetCoachId?: string } | null>(null);

  const clients = useQuery({ queryKey: ['usersByRole', 'client'], queryFn: () => fetchByRole('client') });
  const coaches = useQuery({ queryKey: ['usersByRole', 'coach'], queryFn: () => fetchByRole('coach') });

  const coachName = useMemo(() => {
    const m = new Map<string, string>();
    coaches.data?.forEach((c) => m.set(c.id, c.displayName || c.email));
    return m;
  }, [coaches.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = clients.data ?? [];
    if (!q) return list;
    return list.filter((c) => (c.displayName || c.email).toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [clients.data, search]);
  const pg = usePagination(filtered, 25, search);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['usersByRole', 'client'] });
    void qc.invalidateQueries({ queryKey: ['users'] });
    void qc.invalidateQueries({ queryKey: ['pendingTransfers'] });
  };

  // Pending takeover requests across all coaches (admin oversight).
  const pendingReqs = useQuery({
    queryKey: ['pendingTransfers'],
    queryFn: async () => {
      const reqs = await listPendingTransferRequests();
      return Promise.all(
        reqs.map(async (req) => {
          const [client, requester, current] = await Promise.all([
            fetchUser(req.clientId).catch(() => null),
            fetchUser(req.toCoachId).catch(() => null),
            fetchUser(req.fromCoachId).catch(() => null),
          ]);
          return {
            req,
            clientName: client?.displayName || client?.email || req.clientId,
            requesterName: requester?.displayName || requester?.email || req.toCoachId,
            currentName: current?.displayName || current?.email || req.fromCoachId,
            client,
          };
        }),
      );
    },
    enabled: canAssign,
  });

  const assignMut = useMutation({
    mutationFn: ({ client, coachId }: { client: UserRecord; coachId: string }) => assignClientToCoach(coachId, client.id, actorId),
    onSuccess: () => {
      refresh();
      setSelected(null);
    },
  });
  const unassignMut = useMutation({
    mutationFn: (client: UserRecord) => unassignClient(client.id, client.assignedCoachId!, actorId),
    onSuccess: () => {
      refresh();
      setSelected(null);
    },
  });
  const rejectReqMut = useMutation({
    mutationFn: (r: ClientTransferRequest) => resolveTransferRequest(r.toCoachId, r.clientId, actorId, 'rejected'),
    onSuccess: refresh,
  });

  if (!canAssign) {
    return (
      <>
        <TopBar title={t('admin.assignments')} />
        <p className="py-8 text-center text-sm text-earth-muted">{t('admin.cannotEditSuper')}</p>
      </>
    );
  }

  // Assigning an UNASSIGNED client stays a one-tap action; moving a client who
  // already has a coach always goes through the 4-step transfer wizard.
  const pickCoach = async (coachId: string) => {
    if (!selected) return;
    if (coachId === selected.assignedCoachId) return;
    if (selected.assignedCoachId) {
      const c = selected;
      setSelected(null);
      setWizard({ client: c, presetCoachId: coachId });
      return;
    }
    const ok = await confirmDialog({
      title: t('admin.assignClient'),
      message: t('admin.confirmAssign', { name: selected.displayName || selected.email, coach: coachName.get(coachId) ?? '' }),
    });
    if (ok) assignMut.mutate({ client: selected, coachId });
  };

  const doUnassign = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: t('admin.unassign'),
      message: t('admin.confirmUnassign', { name: selected.displayName || selected.email }),
      danger: true,
    });
    if (ok) unassignMut.mutate(selected);
  };

  return (
    <>
      <TopBar testId="admin-assignments" title={t('admin.assignments')} eyebrow={t('platform.superAdmin')} />

      {/* Pending takeover requests (coach → admin/current-coach) */}
      {(pendingReqs.data ?? []).length > 0 && (
        <div className="mb-4 space-y-2" data-testid="admin-pending-transfers">
          <p className="label">{t('transferReq.pendingTitle')}</p>
          <div className="card divide-y divide-line-soft p-0">
            {(pendingReqs.data ?? []).map(({ req, clientName, requesterName, currentName, client }) => {
              const days = Math.floor((Date.now() - req.requestedAt) / DAY_MS);
              return (
                <div key={req.id} className="px-3 py-3" data-testid="admin-transfer-request" data-client-id={req.clientId}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{clientName}</span>
                      <span className="block truncate text-[12px] text-earth-subtle">{t('transferReq.wantsClient', { coach: requesterName, client: currentName })}</span>
                    </span>
                    {days >= REQ_FLAG_DAYS && <span className="chip border-warn/50 text-[10.5px] text-warn">{t('transferReq.flagged', { days })}</span>}
                  </div>
                  {req.reason && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-earth-muted">{req.reason}</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-testid="admin-transfer-review"
                      className="btn-primary h-9 flex-1 text-[13px] disabled:opacity-40"
                      disabled={!client}
                      onClick={() => client && setWizard({ client, presetCoachId: req.toCoachId })}
                    >
                      {t('transfer.action')}
                    </button>
                    <button type="button" data-testid="admin-transfer-reject" className="btn-ghost h-9 flex-1 text-[13px] text-danger" disabled={rejectReqMut.isPending} onClick={() => rejectReqMut.mutate(req)}>
                      {t('transferReq.reject')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
          <Icon name="search" size={18} />
        </span>
        <input className="input ps-10" placeholder={t('admin.searchClients')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {clients.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('admin.noClients')}</p>
      ) : (
        <>
          <div className="card divide-y divide-line-soft">
            {pg.pageItems.map((c) => (
              <button key={c.id} type="button" data-testid="assign-client-row" data-client-id={c.id} data-assigned-coach={c.assignedCoachId ?? ''} onClick={() => setSelected(c)} className="row w-full text-start">
                <span className="row-av font-serif">{(c.displayName || c.email || '?').charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.displayName || c.email}</span>
                  <span className="block truncate text-[13px] text-earth-muted">
                    {c.assignedCoachId ? `${t('admin.assignedTo')} ${coachName.get(c.assignedCoachId) ?? c.assignedCoachId}` : t('admin.unassigned')}
                  </span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
          <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
        </>
      )}

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.displayName || selected?.email}>
        {selected && (
          <div className="space-y-4">
            {selected.assignedCoachId ? (
              <>
                <p className="text-sm text-earth-muted">
                  {t('admin.assignedTo')} {coachName.get(selected.assignedCoachId) ?? selected.assignedCoachId}
                </p>
                <button
                  type="button"
                  data-testid="admin-open-transfer"
                  onClick={() => { const c = selected; setSelected(null); setWizard({ client: c }); }}
                  className="btn-primary w-full"
                >
                  {t('transfer.action')}
                </button>
                <button type="button" data-testid="assign-unassign" disabled={unassignMut.isPending} onClick={() => void doUnassign()} className="btn-danger w-full">
                  {t('admin.unassign')}
                </button>
              </>
            ) : coaches.data?.length ? (
              <>
                <div className="label">{t('admin.selectCoach')}</div>
                <div className="card divide-y divide-line-soft">
                  {coaches.data.map((co) => (
                    <button
                      key={co.id}
                      type="button"
                      data-testid="assign-coach-row"
                      data-coach-id={co.id}
                      disabled={assignMut.isPending}
                      onClick={() => void pickCoach(co.id)}
                      className="row w-full text-start"
                    >
                      <span className="min-w-0 flex-1 truncate">{co.displayName || co.email}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-earth-muted">{t('admin.noCoaches')}</p>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={!!wizard} onClose={() => setWizard(null)} title={t('transfer.title')}>
        {wizard && (
          <TransferWizard
            client={wizard.client}
            fromCoachId={wizard.client.assignedCoachId}
            coaches={coaches.data ?? []}
            canFreshStart={canFreshStart}
            actorId={actorId}
            presetCoachId={wizard.presetCoachId}
            onCancel={() => setWizard(null)}
            onDone={() => { setWizard(null); refresh(); }}
          />
        )}
      </Sheet>
    </>
  );
}
