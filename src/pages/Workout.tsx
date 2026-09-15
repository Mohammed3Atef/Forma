import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkout } from '@/stores/workoutStore';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { TrainingGuideSheet } from '@/components/TrainingGuideSheet';
import { WaitingForCoach } from '@/components/WaitingForCoach';

export function Workout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen] = useState(false);
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const rawActive = useWorkout((s) => s.active);
  const active = rawActive && (rawActive.startedAt || rawActive.finished) ? rawActive : null;
  const finishedCount = useMemo(() => logs.filter((l) => l.finished).length, [logs]);
  // Same rotation math as Home's "up next" card — which day is suggested next.
  const upNextId = plan && plan.days.length ? plan.days[finishedCount % plan.days.length]?.id : null;

  if (!plan) {
    return (
      <div className="anim-rise">
        <TopBar title={t('gt.routines')} eyebrow={t('workout.weeklyPlan')} />
        <WaitingForCoach messageKey="clientCoach.waitingWorkout" />
      </div>
    );
  }

  const activeDay = active ? plan.days.find((d) => d.id === active.dayId) : null;

  return (
    <div className="anim-rise">
      <TopBar
        title={t('gt.routines')}
        eyebrow={t('workout.weeklyPlan')}
        right={
          <button type="button" onClick={() => setGuideOpen(true)} className="icon-btn h-[42px] w-[42px]" aria-label={t('guide.title')}>
            <Icon name="info" size={20} />
          </button>
        }
      />
      <TrainingGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />

      {active && (
        <button type="button" onClick={() => navigate('/workout/session')} className="btn-primary mb-4 w-full">
          <Icon name={active.finished ? 'edit' : 'play'} size={16} />
          {active.finished ? t('common.edit') : t('workout.resumeSession')} · {activeDay?.title ?? ''}
        </button>
      )}

      <ul className="space-y-3">
        {plan.days.map((day, i) => {
          const isUpNext = day.id === upNextId;
          return (
            <li key={day.id}>
              <button
                type="button"
                onClick={() => navigate(`/workout/routine/${day.id}`)}
                className={`card-tap w-full text-start ${isUpNext ? 'border-brand/35 bg-brand/[0.04]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isUpNext ? 'bg-brand/15 text-brand' : 'bg-surface-raised text-earth-muted'}`}>
                    <Icon name="dumbbell" size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {isUpNext && <span className="eyebrow mb-0.5 block">{t('gt.upNext')}</span>}
                    <h2 className="font-display text-base font-semibold tracking-[-0.01em]">{day.title}</h2>
                    <p className="truncate font-mono text-[11.5px] text-earth-muted">
                      {day.exerciseIds.length} {t('gt.exercises').toLowerCase()} · {day.focus}
                    </p>
                  </div>
                  <span className="pill pill-mute">{t('coachEditor.day')} {i + 1}</span>
                  <Icon name="chevron" size={18} className="text-earth-subtle rtl:rotate-180" />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {day.sections?.length
                    ? day.sections
                        .filter((s) => s.exerciseIds.length > 0)
                        .slice(0, 4)
                        .map((s) => (
                          <span key={s.id} className="chip pointer-events-none">
                            {s.title || t(`coachEditor.sectionKinds.${s.kind}`)}
                          </span>
                        ))
                    : day.exerciseIds.slice(0, 4).map((id) => (
                        <span key={id} className="chip pointer-events-none">
                          {plan.exercises[id]?.name}
                        </span>
                      ))}
                  {!day.sections?.length && day.exerciseIds.length > 4 && (
                    <span className="chip pointer-events-none text-brand">+{day.exerciseIds.length - 4}</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
