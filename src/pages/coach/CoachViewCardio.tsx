import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CoachDayNav } from '@/components/coach/CoachDayNav';
import { EntityNotes } from '@/components/EntityNotes';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui/Pill';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListGroup, Section } from '@/components/ui/ListRow';
import { OfflineState, StaleNotice, useQueryScreen } from '@/components/ui/ScreenState';
import { fetchClientDay } from '@/services/platform/coachApi';
import { getClientCardioPlan } from '@/services/platform/planApi';
import { today } from '@/lib/utils';
import { formatNumber } from '@/lib/format';

/**
 * Workspace › Progress › Cardio (B3.9 rebuild): the prescribed sessions, then what the client logged
 * on the chosen day. Each half says when it couldn't load or is offline (CO-18) — never "no cardio".
 * One grouped surface per half (CD-01); every figure carries its unit.
 */
export function CoachViewCardio({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [date, setDate] = useState(today());
  const plan = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });
  const day = useQuery({ queryKey: ['clientDay', clientId, date], queryFn: () => fetchClientDay(clientId, date), enabled: !!clientId });
  const planScreen = useQueryScreen(plan);
  const dayScreen = useQueryScreen(day);

  const sessions = plan.data?.sessions ?? [];
  const logged = day.data?.cardio ?? [];
  const min = t('common.min');

  const states = (s: typeof planScreen, prefix: string) =>
    s.status === 'loading' ? (
      <div className="sk h-16 rounded-ui-surface" aria-busy="true" />
    ) : s.status === 'offline' ? (
      <OfflineState onRetry={s.retry} testId={`${prefix}-offline`} />
    ) : s.status === 'error' ? (
      <ErrorState onRetry={s.retry} testId={`${prefix}-error`} />
    ) : null;

  return (
    <div className="space-y-5" data-testid="coach-view-cardio">
      <CoachDayNav date={date} onChange={setDate} />

      <Section title={t('coachView.cardioPlan')} testId="cardio-plan">
        {states(planScreen, 'cardio-plan') ??
          (sessions.length === 0 ? (
            <p className="text-[14px] text-earth-muted">{t('workspace.plan.noCardio')}</p>
          ) : (
            <>
              {planScreen.stale ? <StaleNotice online={planScreen.online} className="mb-2" /> : null}
              <ListGroup>
                {sessions.map((s) => {
                  const done = dayScreen.status === 'ready' && logged.some((c) => c.type === s.type);
                  return (
                    <div key={s.id} className="px-4 py-3" data-testid="cardio-plan-session">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 font-medium">
                          {t(`cardio.types.${s.type}`, { defaultValue: t('cardio.types.other') })} · <bdi dir="ltr">{formatNumber(s.durationMin, lang)}</bdi> {min}
                        </span>
                        {dayScreen.status === 'ready' || dayScreen.status === 'empty' ? (
                          <Pill tone={done ? 'ok' : 'mute'} testId="cardio-session-state">{done ? t('activity.finished') : t('coachView.notLogged')}</Pill>
                        ) : null}
                      </div>
                      {s.frequency ? <p className="mt-0.5 text-[13px] text-brand-hover">{s.frequency}</p> : null}
                      {s.notes ? <p className="mt-0.5 text-[13px] text-earth-muted" dir="auto">{s.notes}</p> : null}
                      <EntityNotes screen="cardio" date={date} entityType="cardio_session" entityId={s.id} label={t(`cardio.types.${s.type}`, { defaultValue: t('cardio.types.other') })} />
                    </div>
                  );
                })}
              </ListGroup>
            </>
          ))}
      </Section>

      <Section title={t('coachView.cardioLogged')} testId="cardio-logged">
        {states(dayScreen, 'cardio-day') ??
          (logged.length === 0 ? (
            <p className="text-[14px] text-earth-muted">{t('activity.noCardio')}</p>
          ) : (
            <ListGroup>
              {logged.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[14px]" data-testid="cardio-logged-row">
                  <span className="flex items-center gap-2">
                    <Icon name="activity" size={14} className="text-brand" /> {t(`cardio.types.${c.type}`, { defaultValue: t('cardio.types.other') })}
                  </span>
                  <span className="flex items-center gap-3 tabular-nums text-earth-muted">
                    {c.durationSec > 0 ? (
                      <span>
                        <bdi dir="ltr">{formatNumber(Math.round(c.durationSec / 60), lang)}</bdi> {min}
                      </span>
                    ) : null}
                    {c.steps != null ? (
                      <span>
                        <bdi dir="ltr">{formatNumber(c.steps, lang, { maxFractionDigits: 0 })}</bdi> {t('cardio.steps')}
                      </span>
                    ) : null}
                    {c.distanceKm != null ? (
                      <span>
                        <bdi dir="ltr">{formatNumber(c.distanceKm, lang)}</bdi> {t('common.km')}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </ListGroup>
          ))}
      </Section>
    </div>
  );
}
