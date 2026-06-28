import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import { fetchClientLogs, listMyClients } from '@/services/platform/coachApi';
import type { UserRecord, WorkoutLog } from '@/types';

interface AdherenceRow { client: UserRecord; count: number }

/** YYYY-MM-DD cutoff for "within the last N days". */
function cutoff(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function CoachAdherence() {
  useFullBleed();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const coachId = useSession((s) => s.account?.id);
  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId!), enabled: !!coachId });
  const list: UserRecord[] = clients.data ?? [];

  const logs = useQueries({
    queries: list.map((c) => ({
      queryKey: ['clientLogs', c.id, 'workoutLogs'],
      queryFn: () => fetchClientLogs<WorkoutLog>(c.id, 'workoutLogs', 30),
      enabled: !!coachId,
    })),
  });

  const since = cutoff(7);
  const rows: AdherenceRow[] = useMemo(
    () =>
      list
        .map((c, i) => {
          const data = logs[i]?.data ?? [];
          const count = data.filter((w) => w.finished && w.date >= since).length;
          return { client: c, count };
        })
        .sort((a, b) => b.count - a.count),
    [list, logs, since],
  );
  const max = Math.max(1, ...rows.map((r) => r.count));
  const pg = usePagination(rows, 25);

  const columns: Column<AdherenceRow>[] = [
    {
      key: 'client',
      header: t('coach.clients'),
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={r.client.displayName || r.client.email} photoUrl={r.client.photoUrl} size="sm" />
          <span className="truncate font-medium">{r.client.displayName || r.client.email}</span>
        </span>
      ),
    },
    {
      key: 'bar',
      header: t('coach.last7Days'),
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="font-mono text-xs">{r.count} {t('coach.workoutsShort')}</span>
        </span>
      ),
    },
  ];

  return (
    <>
      <TopBar title={t('coach.adherence')} eyebrow={t('platform.coachPortal')} sub={t('coach.last7Days')} />
      {clients.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : rows.length === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('coach.noClients')}</div>
      ) : isDesktop ? (
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(r) => r.client.id}
          onRowClick={(r) => navigate(`/coach/client/${r.client.id}`)}
          empty={t('coach.noClients')}
        />
      ) : (
        <div className="card divide-y divide-line-soft">
          {pg.pageItems.map(({ client, count }) => (
            <div key={client.id} className="row">
              <span className="row-av font-serif">{(client.displayName || client.email || '?').charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{client.displayName || client.email}</span>
              <span className="font-mono text-sm">
                <span className={count > 0 ? 'text-brand' : 'text-earth-subtle'}>{count}</span>
                <span className="text-earth-subtle"> {t('coach.workoutsShort')}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
    </>
  );
}
