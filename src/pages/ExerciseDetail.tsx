import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkout, warmupCountOf } from '@/stores/workoutStore';
import { Icon } from '@/components/Icon';
import { LineChart } from '@/components/charts';
import { EntityNotes } from '@/components/EntityNotes';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ListGroup, Section } from '@/components/ui/ListRow';
import { playVideo } from '@/stores/mediaViewerStore';
import { useLocalized } from '@/hooks/useLocalized';
import { muscleColor, muscleLabel } from '@/lib/muscle';
import { prByExercise, exerciseTrend } from '@/lib/calc';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';
import { useBack } from '@/hooks/useBack';
import { isPlayableVideoUrl } from '@/lib/videoSource';

/*
 * TRAIN › EXERCISE (B2.3): what it is, how the coach wants it done, and how
 * it's going. Prescription as readable rows (not read-only input boxes,
 * CL-25), the coach's notes whole (no splitting "2.5 kg" into two cues),
 * video only when it can play, last time and best from real history.
 */
export function ExerciseDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const goBack = useBack('/workout');
  const loc = useLocalized();
  const { exId } = useParams();
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);

  const ex = exId ? plan?.exercises[exId] : undefined;
  const pr = useMemo(() => (exId ? prByExercise(logs).get(exId) : undefined), [logs, exId]);
  const trend = useMemo(() => (exId ? exerciseTrend(logs, exId) : []), [logs, exId]);
  const lastPerf = useMemo(() => {
    if (!exId) return null;
    for (const log of logs) {
      if (!log.finished) continue;
      const e = log.exercises.find((x) => x.exerciseId === exId);
      const sets = e?.sets.filter((s) => s.weightKg != null || s.actualReps != null);
      if (sets && sets.length) return { date: log.date, sets };
    }
    return null;
  }, [logs, exId]);

  if (!ex || !exId) {
    return (
      <EmptyState
        icon="info"
        title={t('exerciseDetail.notFoundTitle')}
        message={t('exerciseDetail.notFoundMessage')}
        action={
          <Button variant="secondary" onClick={goBack}>
            {t('common.back')}
          </Button>
        }
      />
    );
  }

  const canPlay = isPlayableVideoUrl(ex.videoUrl);
  const notes = loc(ex.notes);
  const warm = warmupCountOf(ex);
  const rows: [string, string][] = [
    [t('exerciseDetail.sets'), `${ex.workingSets > 0 ? `${ex.workingSets} × ` : ''}${ex.repRange && ex.repRange !== '-' ? ex.repRange : '—'}`],
    ...(warm > 0 ? ([[t('workout.warmup'), String(warm)]] as [string, string][]) : []),
    ...(ex.restSec ? ([[t('workout.rest'), formatDuration(ex.restSec)]] as [string, string][]) : []),
    ...(ex.rir && ex.rir !== '-' ? ([[t('exerciseDetail.rir'), ex.rir]] as [string, string][]) : []),
    ...(ex.tempo && ex.tempo !== '-' ? ([[t('workout.tempo'), ex.tempo]] as [string, string][]) : []),
  ];

  return (
    <div className="space-y-7 pb-4" data-testid="exercise-detail">
      {ex.imageUrl && (
        <img src={ex.imageUrl} alt="" className="aspect-[16/10] w-full rounded-ui-surface bg-white/[0.04] object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
      )}
      <header>
        <p className="flex items-center gap-2 text-[14px] text-earth-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: muscleColor(ex.targetMuscle) }} aria-hidden="true" />
          {muscleLabel(ex.targetMuscle, t)}
        </p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.02em]">{ex.name}</h1>
        {canPlay && (
          <Button variant="secondary" icon="play" className="mt-4 w-full" onClick={() => playVideo(ex.videoUrl!)} data-testid="exercise-video-button" aria-label={t('workout.watchVideo')}>
            {t('workout.watchVideo')}
          </Button>
        )}
      </header>

      <Section title={t('exerciseDetail.prescription')}>
        <ListGroup>
          {rows.map(([k, v]) => (
            <div key={k} className="flex min-h-12 items-center justify-between gap-3 px-4 text-[15px]">
              <span className="text-earth-muted">{k}</span>
              <span className="font-mono font-semibold" dir="ltr">
                {v}
              </span>
            </div>
          ))}
        </ListGroup>
        {ex.rir && ex.rir !== '-' && <p className="mt-2 text-[13px] leading-relaxed text-earth-muted">{t('exerciseDetail.rirExplain')}</p>}
      </Section>

      {notes && (
        <Section title={t('exerciseDetail.coachNotes')}>
          <p className="whitespace-pre-line border-s-2 border-brand/50 ps-3 text-[15px] leading-relaxed text-earth">{notes}</p>
        </Section>
      )}
      <EntityNotes screen="workout" entityType="exercise" entityId={exId} />

      {lastPerf && (
        <Section title={t('gt.lastTime')} action={<span className="text-[13px] text-earth-muted">{formatDate(lastPerf.date, lang, 'weekdayDayMonth')}</span>}>
          <ListGroup>
            {lastPerf.sets.map((s, i) => {
              const isWarm = s.type === 'warmup';
              const label = isWarm ? 'W' : String(lastPerf.sets.slice(0, i + 1).filter((x) => x.type !== 'warmup').length);
              return (
                <div key={i} className="flex min-h-12 items-center gap-3 px-4 text-[15px]">
                  <span className={`w-6 font-mono font-semibold ${isWarm ? 'text-warn' : 'text-earth-muted'}`}>{label}</span>
                  <span className="flex-1 font-mono" dir="ltr">
                    {s.weightKg ?? '–'} {t('common.kg')} × {s.actualReps ?? '–'}
                  </span>
                </div>
              );
            })}
          </ListGroup>
        </Section>
      )}

      {pr && (
        <Section title={t('gt.personalRecord')}>
          <div className="flex items-end justify-between rounded-ui-surface border border-white/[0.08] bg-surface-card p-4">
            <div>
              <p className="font-mono text-[22px] font-semibold" dir="ltr">
                {formatNumber(pr.kg, lang)} {t('common.kg')} × {pr.reps}
              </p>
              <p className="mt-1 text-[13px] text-earth-muted">{formatDate(pr.date, lang, 'medium')}</p>
            </div>
            <div className="text-end">
              <p className="flex items-center justify-end gap-1.5 font-mono text-[28px] font-semibold leading-none text-brand-hover">
                <Icon name="trophy" size={18} /> {formatNumber(pr.e1rm, lang)}
              </p>
              <p className="mt-1 text-[12px] text-earth-muted">{t('gt.est1rm')}</p>
            </div>
          </div>
        </Section>
      )}

      {trend.length >= 2 && (
        <Section title={t('gt.trend1rm')}>
          <div className="rounded-ui-surface border border-white/[0.08] bg-surface-card p-4">
            <LineChart data={trend} unit={t('common.kg')} emptyLabel={t('progress.noData')} locale={lang} />
          </div>
        </Section>
      )}
    </div>
  );
}
