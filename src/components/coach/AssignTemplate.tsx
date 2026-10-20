import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { SearchField } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { listMyClients } from '@/services/platform/coachApi';
import { assignWorkoutTemplate } from '@/services/platform/coachAssetsApi';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import type { UserRecord, WorkoutTemplate } from '@/types';

/**
 * "Use in a client plan" for a program — B3.7: from Library › Programs and the template's own page.
 * The roster loads here; while it loads (or if it fails) the sheet says so instead of "no clients".
 */
export function AssignTemplateSheet({ template, coachId, onClose }: { template: WorkoutTemplate | null; coachId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: !!coachId && !!template });
  return (
    <Sheet open={!!template} onClose={onClose} size="md" title={template ? t('library.use.title', { name: template.name || t('workoutTemplate.untitled') }) : ''}>
      {template ? (
        clients.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-ui-control" />
            ))}
          </div>
        ) : clients.isError ? (
          <ErrorState message={t('coach.clientsLoadFailed')} onRetry={() => void clients.refetch()} testId="assign-clients-error" />
        ) : (
          <AssignTemplate template={template} clients={clients.data ?? []} assignedBy={coachId} onDone={onClose} />
        )
      ) : null}
    </Sheet>
  );
}

/**
 * Assign-to-client picker. Snapshots the template into the chosen client's plan
 * (the client's current plan is kept as a version first); shows a per-row done check.
 */
export function AssignTemplate({
  template,
  clients,
  assignedBy,
  onDone,
}: {
  template: WorkoutTemplate;
  clients: UserRecord[];
  assignedBy: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [done, setDone] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const mut = useMutation({
    mutationFn: (clientId: string) => assignWorkoutTemplate(template, clientId, assignedBy),
    onSuccess: (_v, clientId) => {
      setDone(clientId);
      // The assigned plan replaces the client's plan and auto-versions the old one.
      void qc.invalidateQueries({ queryKey: ['clientWorkoutPlan', clientId] });
      void qc.invalidateQueries({ queryKey: ['planVersions', clientId] });
    },
    onError: (e) => void alertDialog({ title: t('workoutTemplate.assign'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const askAndAssign = async (c: UserRecord) => {
    const ok = await confirmDialog({
      title: t('workoutTemplate.assign'),
      message: t('workoutTemplate.confirmAssign', { name: c.displayName || c.email, template: template.name }),
      confirmLabel: t('workoutTemplate.assign'),
    });
    if (ok) mut.mutate(c.id);
  };
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => `${c.displayName ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q));
  }, [clients, search]);
  if (!clients.length) return <p className="py-4 text-sm text-earth-muted">{t('coach.noClients')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-earth-muted">{t('workoutTemplate.assignHint')}</p>
      <SearchField
        aria-label={t('coach.searchClients')}
        data-testid="assign-search"
        placeholder={t('coach.searchClients')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-earth-muted">{t('coach.noClients')}</p>
      ) : (
        <div className="card divide-y divide-line-soft">
          {filtered.map((c) => (
            <button key={c.id} type="button" disabled={mut.isPending} onClick={() => void askAndAssign(c)} className="row w-full text-start" data-testid="assign-client">
              <span className="row-av font-serif">{(c.displayName || c.email || '?').charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">{c.displayName || c.email}</span>
              {done === c.id && <Icon name="check" size={18} className="text-brand" />}
            </button>
          ))}
        </div>
      )}
      {done && (
        <button type="button" className="btn-primary w-full" onClick={onDone}>
          {t('common.done')}
        </button>
      )}
    </div>
  );
}
