import { useTranslation } from 'react-i18next';
import { muscleLabel } from '@/lib/muscle';
import { VideoSourcePlayer } from '@/components/video/VideoPlayer';
import { classifyVideoUrl, safeExternalUrl } from '@/lib/videoSource';
import type { Exercise } from '@/types';
import { useLocalized } from '@/hooks/useLocalized';

/**
 * Read-only presentation of a library exercise — shown when a coach taps an
 * exercise to *view* it (vs. editing). Pair with an Edit button in the sheet.
 */
export function ExerciseView({ ex }: { ex: Exercise }) {
  const { t } = useTranslation();
  const loc = useLocalized(); // Arabic clients see the coach's Arabic notes (B1.8)
  const meta = [ex.category, ex.equipment].filter(Boolean).join(' · ');
  const img = ex.imageUrl || ex.images?.[0];
  const source = classifyVideoUrl(ex.videoUrl);
  const sourceLink = source?.kind === 'youtube' ? source.openUrl : safeExternalUrl(ex.videoUrl);
  const row = (label: string, value: string | number | undefined | null) =>
    value === undefined || value === null || value === '' ? null : (
      <div className="flex items-center justify-between gap-3 border-b border-line-soft py-2 last:border-0">
        <span className="text-sm text-earth-subtle">{label}</span>
        <span className="text-end text-sm font-medium">{value}</span>
      </div>
    );

  return (
    <div className="space-y-4" data-testid="exercise-view">
      {ex.videoUrl ? (
        // Loading / unsupported link / failed playback are explicit (B0 / CL-20).
        <VideoSourcePlayer url={ex.videoUrl} title={ex.name} />
      ) : img ? (
        <img src={img} alt={ex.name} loading="lazy" className="h-44 w-full rounded-xl border border-line-soft object-cover" />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="chip chip-on">{muscleLabel(ex.targetMuscle, t) || ex.targetMuscle}</span>
        {meta ? <span className="chip">{meta}</span> : null}
      </div>

      <div className="card">
        {row(t('coachEditor.workingSets'), ex.workingSets)}
        {row(t('coachEditor.reps'), ex.repRange)}
        {row(t('coachEditor.warmupSets'), ex.warmupSetCount ?? ex.warmupSets)}
        {row(t('coachEditor.restSec'), ex.restSec ? `${ex.restSec}s` : null)}
        {row(t('workout.tempo'), ex.tempo)}
      </div>

      {ex.notes && loc(ex.notes) ? (
        <div>
          <div className="label mb-1">{t('coachEditor.instructions')}</div>
          <p className="whitespace-pre-line text-sm text-earth-muted">{loc(ex.notes)}</p>
        </div>
      ) : null}

      {ex.progressionNotes ? (
        <div>
          <div className="label mb-1">{t('coachEditor.progression')}</div>
          <p className="whitespace-pre-line text-sm text-earth-muted">{ex.progressionNotes}</p>
        </div>
      ) : null}

      {ex.tags?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {ex.tags.map((tg) => (
            <span key={tg} className="chip text-[11px]">{tg}</span>
          ))}
        </div>
      ) : null}

      {sourceLink && source?.kind !== 'unsupported' ? (
        <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full">
          {t('workout.watchVideo')}
        </a>
      ) : null}
    </div>
  );
}
