import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { SearchField } from '@/components/ui/Field';
import { assignWorkoutTemplate } from '@/services/platform/coachAssetsApi';
import type { UserRecord, WorkoutTemplate } from '@/types';

/**
 * Assign-to-client picker (shared by the templates list/preview). Snapshots the
 * template into the chosen client's plan; shows a per-row done check.
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
  const [done, setDone] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const mut = useMutation({
    mutationFn: (clientId: string) => assignWorkoutTemplate(template, clientId, assignedBy),
    onSuccess: (_v, clientId) => setDone(clientId),
  });
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
            <button key={c.id} type="button" disabled={mut.isPending} onClick={() => mut.mutate(c.id)} className="row w-full text-start" data-testid="assign-client">
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
