import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StatTile } from '@/components/StatTile';
import { fetchClientMeasurements, fetchClientWeightLogs } from '@/services/platform/coachApi';
import { shortDate } from '@/lib/utils';

/** Coach view of a client's body progress: bodyweight history + latest measurements. */
export function CoachViewProgress({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const weightsQ = useQuery({ queryKey: ['clientWeightLogs', clientId], queryFn: () => fetchClientWeightLogs(clientId), enabled: !!clientId });
  const measuresQ = useQuery({ queryKey: ['clientMeasurements', clientId], queryFn: () => fetchClientMeasurements(clientId), enabled: !!clientId });

  // fetchClientWeightLogs returns newest-first (orderBy updatedAt desc).
  const weights = weightsQ.data ?? [];
  const latest = weights[0]?.weightKg;
  const measures = measuresQ.data ?? [];
  const lastMeasure = measures[measures.length - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon="scale" value={latest ?? '—'} unit={latest != null ? t('common.kg') : undefined} label={t('coach.lastWeight')} />
        <StatTile icon="ruler" value={measures.length} label={t('measure.title')} />
      </div>

      {/* Bodyweight history */}
      {weights.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t('progress.bodyweight')}</h2>
          <ul className="space-y-1 text-sm">
            {weights.slice(0, 20).map((w) => (
              <li key={w.id} className="flex items-center justify-between">
                <span className="text-earth-muted">{shortDate(w.date, i18n.language)}</span>
                <span className="font-mono">{w.weightKg} {t('common.kg')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Latest measurements snapshot */}
      {lastMeasure && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t('measure.title')}</h2>
          <p className="mb-2 text-xs text-earth-subtle">{shortDate(lastMeasure.date, i18n.language)} · cm</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" dir="ltr">
            {Object.entries(lastMeasure.values).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-earth-muted">{t(`measure.parts.${k}`, { defaultValue: k })}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {weights.length === 0 && measures.length === 0 && <p className="py-8 text-center text-sm text-earth-muted">{t('coachView.noProgress')}</p>}
    </div>
  );
}
