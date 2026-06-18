import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CoachDayNav } from '@/components/coach/CoachDayNav';
import { EntityNotes } from '@/components/EntityNotes';
import { Icon } from '@/components/Icon';
import { fetchClientDay } from '@/services/platform/coachApi';
import { getClientCardioPlan } from '@/services/platform/planApi';
import { today } from '@/lib/utils';

/** Coach view of a client's cardio: prescribed sessions + what was logged that day. */
export function CoachViewCardio({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(today());
  const plan = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });
  const day = useQuery({ queryKey: ['clientDay', clientId, date], queryFn: () => fetchClientDay(clientId, date), enabled: !!clientId });

  const sessions = plan.data?.sessions ?? [];
  const logged = day.data?.cardio ?? [];

  return (
    <div className="space-y-4">
      <CoachDayNav date={date} onChange={setDate} />

      {/* Prescribed plan */}
      <section>
        <h2 className="h2 mb-2">{t('clientCoach.cardioPlan')}</h2>
        {sessions.length === 0 ? (
          <p className="card py-6 text-center text-sm text-earth-muted">{t('activity.noCardio')}</p>
        ) : (
          <div className="card divide-y divide-line-soft">
            {sessions.map((s) => {
              const done = logged.some((c) => c.type === s.type);
              return (
                <div key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t(`cardio.types.${s.type}`)} · {s.durationMin} {t('common.min')}</span>
                    <span className={`chip text-[11px] ${done ? 'border-success/50 text-success' : 'text-earth-subtle'}`}>
                      {done ? t('activity.finished') : '—'}
                    </span>
                  </div>
                  {s.frequency && <p className="font-mono text-[11px] text-brand">{s.frequency}</p>}
                  {s.notes && <p className="mt-0.5 text-[13px] text-earth-muted">{s.notes}</p>}
                  <EntityNotes screen="cardio" date={date} entityType="cardio_session" entityId={s.id} label={t(`cardio.types.${s.type}`)} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Logged that day */}
      <section>
        <h2 className="h2 mb-2">{t('cardio.history')}</h2>
        {logged.length === 0 ? (
          <p className="card py-6 text-center text-sm text-earth-muted">{t('activity.noCardio')}</p>
        ) : (
          <div className="card divide-y divide-line-soft">
            {logged.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                <span className="flex items-center gap-2"><Icon name="activity" size={14} className="text-brand" /> {t(`cardio.types.${c.type}`)}</span>
                <span className="flex items-center gap-3 text-earth-muted">
                  {c.durationSec > 0 && <span>{Math.round(c.durationSec / 60)}{t('common.min')}</span>}
                  {c.steps != null && <span>{c.steps.toLocaleString()} {t('cardio.steps')}</span>}
                  {c.distanceKm != null && <span>{c.distanceKm} km</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
