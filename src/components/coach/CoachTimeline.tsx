import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { listClientCoachHistory } from '@/services/platform/coachClientsApi';
import { fetchUser } from '@/services/platform/accountsApi';
import type { CoachClientRelationship } from '@/types';

const fmt = (ms: number | undefined, lang: string) =>
  ms ? new Date(ms).toLocaleDateString(lang.startsWith('ar') ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

interface Row {
  rel: CoachClientRelationship;
  coachName: string | null;
}

/**
 * A client's coaching history — current coach + previous coaches with date
 * ranges and the reason/mode each ended. Reuses the `coachClients` relationship
 * records (no separate collection). Never exposes technical ids; unresolved
 * coaches fall back to a generic label.
 */
export function CoachTimeline({ clientId, compact = false }: { clientId: string; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const q = useQuery({
    queryKey: ['coachHistory', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Row[]> => {
      const rels = await listClientCoachHistory(clientId);
      const coachIds = Array.from(new Set(rels.map((r) => r.coachId)));
      const map = new Map<string, string>();
      await Promise.all(
        coachIds.map(async (cid) => {
          const c = await fetchUser(cid).catch(() => null);
          if (c) map.set(cid, c.displayName || c.email);
        }),
      );
      return rels.map((rel) => ({ rel, coachName: map.get(rel.coachId) ?? null }));
    },
  });

  const rows = q.data ?? [];
  const current = rows.find((r) => r.rel.status === 'active') ?? null;
  const previous = rows.filter((r) => r.rel.status !== 'active');

  if (q.isLoading) return <p className="py-2 text-sm text-earth-muted">{t('auth.working')}</p>;
  if (rows.length === 0) return <p className="py-2 text-sm text-earth-muted" data-testid="timeline-empty">{t('timeline.none')}</p>;

  return (
    <div className="space-y-3" data-testid="coach-timeline">
      {current && (
        <div className="card flex items-center gap-3" data-testid="timeline-current">
          <span className="row-av h-9 w-9 shrink-0 bg-success/15 text-success"><Icon name="check" size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] uppercase tracking-wide text-earth-subtle">{t('timeline.current')}</span>
            <span className="block truncate font-medium">{current.coachName ?? t('timeline.unknownCoach')}</span>
            <span className="block text-[12px] text-earth-subtle">{t('timeline.since', { date: fmt(current.rel.createdAt, lang) })}</span>
          </span>
        </div>
      )}

      {!compact && previous.length > 0 && (
        <div className="space-y-2">
          <p className="label">{t('timeline.previous')}</p>
          <div className="card divide-y divide-line-soft p-0">
            {previous.map((r) => (
              <div key={r.rel.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="timeline-previous">
                <span className="row-av h-8 w-8 shrink-0 bg-line/40 text-earth-subtle"><Icon name="user" size={14} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.coachName ?? t('timeline.unknownCoach')}</span>
                  <span className="block text-[12px] text-earth-subtle">{t('timeline.range', { from: fmt(r.rel.createdAt, lang), to: fmt(r.rel.endedAt, lang) || '—' })}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  {r.rel.endReason && <span className="chip border-line text-[10.5px] text-earth-subtle">{t(`timeline.reason.${r.rel.endReason}`)}</span>}
                  {r.rel.mode && <span className="chip border-line text-[10.5px] text-earth-subtle">{t(`timeline.mode.${r.rel.mode}`)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
