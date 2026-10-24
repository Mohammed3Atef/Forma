import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { SearchField } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { listMyClients } from '@/services/platform/coachApi';
import { normalizeSearch } from '@/lib/libraryModel';
import type { UserRecord } from '@/types';

/**
 * Choose one of the coach's clients (B3.7 "Use in a client plan"). The same light roster query
 * Today, Clients and ⌘K share (`['myClients', coachId]`); a roster that fails to load says so with
 * Retry — never "no clients".
 */
export function ClientPickList({ coachId, onPick, testId = 'client-pick' }: { coachId: string; onPick: (client: UserRecord) => void; testId?: string }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const roster = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: !!coachId });
  const clients = useMemo(() => {
    const q = normalizeSearch(search);
    const all = [...(roster.data ?? [])].sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
    return q ? all.filter((c) => normalizeSearch(`${c.displayName ?? ''} ${c.email ?? ''}`).includes(q)) : all;
  }, [roster.data, search]);

  if (roster.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-ui-control" />
        ))}
      </div>
    );
  }
  if (roster.isError) return <ErrorState message={t('coach.clientsLoadFailed')} onRetry={() => void roster.refetch()} testId={`${testId}-error`} />;
  if (!roster.data?.length) return <p className="py-4 text-center text-sm text-earth-muted">{t('coach.noClients')}</p>;
  return (
    <div className="space-y-3" data-testid={testId}>
      <SearchField aria-label={t('coach.searchClients')} placeholder={t('coach.searchClients')} value={search} onChange={(e) => setSearch(e.target.value)} data-testid={`${testId}-search`} />
      {clients.length === 0 ? (
        <p className="py-4 text-center text-sm text-earth-muted">{t('coachClients.noMatchTitle')}</p>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-ui-surface border border-white/[0.07]">
          {clients.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex min-h-ui-hit w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-white/[0.03]" data-testid={`${testId}-client`} onClick={() => onPick(c)}>
                <Avatar name={c.displayName || c.email} photoUrl={c.photoUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  <bdi>{c.displayName || c.email}</bdi>
                </span>
                <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
