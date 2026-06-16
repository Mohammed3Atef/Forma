import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { useSession } from '@/services/auth/sessionStore';
import { useCan } from '@/services/auth/permissions';
import { fetchByRole } from '@/services/platform/accountsApi';
import { assignClientToCoach, transferClient, unassignClient } from '@/services/platform/coachClientsApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { UserRecord } from '@/types';

export function AdminAssignments() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const actorId = useSession((s) => s.account?.id ?? 'self');
  const canAssign = useCan('coaches.assign');

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserRecord | null>(null);

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

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['usersByRole', 'client'] });
    void qc.invalidateQueries({ queryKey: ['users'] });
  };

  const assignMut = useMutation({
    mutationFn: ({ client, coachId }: { client: UserRecord; coachId: string }) =>
      client.assignedCoachId
        ? transferClient(client.id, client.assignedCoachId, coachId, actorId)
        : assignClientToCoach(coachId, client.id, actorId),
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

  if (!canAssign) {
    return (
      <>
        <TopBar title={t('admin.assignments')} />
        <p className="py-8 text-center text-sm text-earth-muted">{t('admin.cannotEditSuper')}</p>
      </>
    );
  }

  const pickCoach = async (coachId: string) => {
    if (!selected) return;
    if (coachId === selected.assignedCoachId) return;
    const transferring = !!selected.assignedCoachId;
    const ok = await confirmDialog({
      title: t(transferring ? 'admin.transferClient' : 'admin.assignClient'),
      message: t(transferring ? 'admin.confirmTransfer' : 'admin.confirmAssign', {
        name: selected.displayName || selected.email,
        coach: coachName.get(coachId) ?? '',
      }),
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
        <div className="card divide-y divide-line-soft">
          {filtered.map((c) => (
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
      )}

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.displayName || selected?.email}>
        {selected && (
          <div className="space-y-4">
            <div className="label">{t('admin.selectCoach')}</div>
            {coaches.data?.length ? (
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
                    {selected.assignedCoachId === co.id && (
                      <span className="text-brand">
                        <Icon name="check" size={18} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-earth-muted">{t('admin.noCoaches')}</p>
            )}
            {selected.assignedCoachId && (
              <button type="button" data-testid="assign-unassign" disabled={unassignMut.isPending} onClick={() => void doUnassign()} className="btn-danger w-full">
                {t('admin.unassign')}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
