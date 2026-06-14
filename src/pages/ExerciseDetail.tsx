import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { VideoAsset } from '@/types';
import { useWorkout } from '@/stores/workoutStore';
import { useVideos } from '@/stores/videoStore';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { BarChart } from '@/components/charts';
import { VideoPlayerSheet } from '@/components/VideoPlayerSheet';
import { useLocalized } from '@/hooks/useLocalized';
import { muscleColor, muscleLabel } from '@/lib/muscle';
import { prByExercise, exerciseTrend } from '@/lib/calc';
import { shortDate } from '@/lib/utils';

export function ExerciseDetail() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocalized();
  const { exId } = useParams();
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const byExercise = useVideos((s) => s.byExercise);
  const [video, setVideo] = useState<VideoAsset | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);

  const ex = exId ? plan?.exercises[exId] : undefined;
  const pr = useMemo(() => (exId ? prByExercise(logs).get(exId) : undefined), [logs, exId]);
  const trend = useMemo(() => (exId ? exerciseTrend(logs, exId) : []), [logs, exId]);

  // Most recent finished session that logged this exercise — shown as a "last
  // time" reference so the user sees previous weight×reps without opening the
  // day. (`logs` is pre-sorted newest-first by the store.)
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
    return <p className="pt-10 text-center text-earth-muted">{t('progress.noData')}</p>;
  }

  const cues = loc(ex.notes)
    .split(/[.;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const openVideo = () => {
    // Coach-assigned direct video URL takes priority over the local library.
    if (ex.videoUrl) {
      window.open(ex.videoUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setVideo(byExercise(exId));
    setVideoOpen(true);
  };

  return (
    <div className="anim-rise pb-6">
      <TopBar
        title={ex.name}
        eyebrow={muscleLabel(ex.targetMuscle, t)}
        onBack={() => navigate(-1)}
        right={
          <button type="button" onClick={openVideo} className="icon-btn h-[42px] w-[42px]" aria-label={t('workout.watchVideo')}>
            <Icon name="video" size={18} />
          </button>
        }
      />

      {/* Info chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-card px-3 py-1.5 font-mono text-[11.5px] text-earth-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: muscleColor(ex.targetMuscle) }} />
          {muscleLabel(ex.targetMuscle, t)}
        </span>
        {ex.repRange && ex.repRange !== '-' && (
          <span className="rounded-full border border-line bg-surface-card px-3 py-1.5 font-mono text-[11.5px] text-earth-muted">
            {ex.workingSets > 0 ? `${ex.workingSets} × ` : ''}{ex.repRange}
          </span>
        )}
        {ex.rir && ex.rir !== '-' && (
          <span className="rounded-full border border-line bg-surface-card px-3 py-1.5 font-mono text-[11.5px] text-earth-muted">
            RIR {ex.rir}
          </span>
        )}
      </div>

      {/* Last time — previous session's weight × reps for this exercise */}
      {lastPerf && (
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <span className="ui-label">{t('gt.lastTime')}</span>
            <span className="font-mono text-[11px] text-earth-subtle">{shortDate(lastPerf.date, i18n.language)}</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {lastPerf.sets.map((s, i) => {
              const isWarm = s.type === 'warmup';
              const label = isWarm
                ? 'W'
                : String(lastPerf.sets.slice(0, i + 1).filter((x) => x.type !== 'warmup').length);
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className={`w-6 font-mono text-[12px] font-medium ${isWarm ? 'text-warn' : 'text-earth-muted'}`}>
                    {label}
                  </span>
                  <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] border border-line bg-surface-raised font-mono text-[15px] font-medium text-white">
                    {s.weightKg ?? '–'} <span className="ml-1 text-[11px] text-earth-subtle">{t('common.kg')}</span>
                  </span>
                  <span className="text-earth-subtle">×</span>
                  <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] border border-line bg-surface-raised font-mono text-[15px] font-medium text-white">
                    {s.actualReps ?? '–'} <span className="ml-1 text-[11px] text-earth-subtle">{t('gt.repsCol').toLowerCase()}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* PR card */}
      {pr && (
        <div
          className="mb-4 rounded-hero border border-brand/25 p-5 shadow-featured"
          style={{ background: 'linear-gradient(135deg, rgba(174,126,86,0.28), rgba(174,126,86,0.06))' }}
        >
          <div className="flex items-center gap-2">
            <Icon name="trophy" size={16} className="text-brand" />
            <span className="eyebrow">{t('gt.personalRecord')}</span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="font-display text-2xl font-bold tracking-[-0.02em]">
                {pr.kg}{t('common.kg')} × {pr.reps}
              </p>
              <p className="mt-1 font-mono text-[11.5px] text-earth-muted">{shortDate(pr.date, i18n.language)}</p>
            </div>
            <div className="text-end">
              <p className="font-mono text-[34px] font-medium leading-none text-brand">{pr.e1rm}</p>
              <p className="stat-label mt-1">{t('gt.est1rm')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 1RM trend */}
      {trend.length >= 2 && (
        <div className="card mb-4">
          <span className="ui-label">{t('gt.trend1rm')}</span>
          <div className="mt-2">
            <BarChart
              data={trend.map((v, i) => ({ label: i === trend.length - 1 ? t('gt.now') : String(i + 1), value: v }))}
              format={(v) => String(v)}
            />
          </div>
        </div>
      )}

      {/* How to perform */}
      {cues.length > 0 && (
        <div className="card">
          <span className="ui-label">{t('gt.howToPerform')}</span>
          <ol className="mt-3 space-y-3">
            {cues.map((cue, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-[13px] font-medium text-brand">{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1 text-sm text-earth">{cue}</span>
              </li>
            ))}
          </ol>
          {ex.tempo && ex.tempo !== '-' && (
            <p className="mt-3 font-mono text-[11.5px] text-earth-subtle">{t('workout.tempo')} {ex.tempo}</p>
          )}
        </div>
      )}

      <VideoPlayerSheet asset={videoOpen ? video : null} title={ex.name} onClose={() => setVideoOpen(false)} />
    </div>
  );
}
