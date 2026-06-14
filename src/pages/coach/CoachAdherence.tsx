import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { useSession } from '@/services/auth/sessionStore';
import { fetchClientLogs, listMyClients } from '@/services/platform/coachApi';
import type { UserRecord, WorkoutLog } from '@/types';

/** YYYY-MM-DD cutoff for "within the last N days". */
function cutoff(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function CoachAdherence() {
  const { t } = useTranslation();
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
  const rows = useMemo(
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

  return (
    <>
      <TopBar title={t('coach.adherence')} eyebrow={t('platform.coachPortal')} sub={t('coach.last7Days')} />
      {clients.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : rows.length === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('coach.noClients')}</div>
      ) : (
        <div className="card divide-y divide-line-soft">
          {rows.map(({ client, count }) => (
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
    </>
  );
}
