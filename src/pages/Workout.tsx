import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkout } from '@/stores/workoutStore';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { TrainingGuideSheet } from '@/components/TrainingGuideSheet';
import { WaitingForCoach } from '@/components/WaitingForCoach';

const COLORS = ['#AE7E56', '#BF6E4E', '#D4A46A', '#2E5D3C', '#C69975'];

export function Workout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen] = useState(false);
  const plan = useWorkout((s) => s.plan);
  const rawActive = useWorkout((s) => s.active);
  const active = rawActive && (rawActive.startedAt || rawActive.finished) ? rawActive : null;

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
        {plan.days.map((day, i) => (
          <li key={day.id}>
            <button
              type="button"
              onClick={() => navigate(`/workout/routine/${day.id}`)}
              className="card-tap w-full text-start"
            >
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-base font-semibold tracking-[-0.01em]">{day.title}</h2>
                  <p className="truncate font-mono text-[11.5px] text-earth-muted">{day.focus}</p>
                </div>
                <Icon name="chevron" size={18} className="text-earth-subtle" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {day.exerciseIds.slice(0, 4).map((id) => (
                  <span key={id} className="rounded-full border border-line bg-surface-raised px-2.5 py-1 font-mono text-[10.5px] text-earth-muted">
                    {plan.exercises[id]?.name}
                  </span>
                ))}
                {day.exerciseIds.length > 4 && (
                  <span className="rounded-full border border-line bg-surface-raised px-2.5 py-1 font-mono text-[10.5px] text-brand">
                    +{day.exerciseIds.length - 4}
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
