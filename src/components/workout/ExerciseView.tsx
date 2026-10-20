import { useTranslation } from 'react-i18next';
import { muscleLabel } from '@/lib/muscle';
import { attributionOf, exerciseDemo } from '@/lib/libraryMedia';
import { AttributionLine, DemoBlock } from '@/components/library/ExerciseDemo';
import type { Exercise } from '@/types';
import { useLocalized } from '@/hooks/useLocalized';

/**
 * Read-only presentation of a library exercise (the Library opens items read-first; Edit is a
 * separate, explicit action). B3.7: the demo is honest (a playable video, an image, or "No demo
 * yet" — `lib/libraryMedia`), metadata leads, the defaults a plan starts from follow, and the
 * source is credited when the exercise says where it came from.
 */
export function ExerciseView({ ex }: { ex: Exercise }) {
  const { t } = useTranslation();
  const loc = useLocalized(); // Arabic readers see the Arabic instructions when there are some (B1.8)
  const muscle = muscleLabel(ex.targetMuscle, t) || ex.targetMuscle;
  const category = ex.category && ex.category.trim() !== ex.targetMuscle?.trim() ? ex.category : null;
  const row = (label: string, value: string | number | undefined | null) =>
    value === undefined || value === null || value === '' ? null : (
      <div className="flex items-center justify-between gap-3 border-b border-line-soft py-2 last:border-0">
        <span className="text-sm text-earth-subtle">{label}</span>
        <span className="text-end text-sm font-medium">
          <bdi>{value}</bdi>
        </span>
      </div>
    );

  return (
    <div className="space-y-4" data-testid="exercise-view">
      <DemoBlock demo={exerciseDemo(ex)} title={ex.name} videoUrl={ex.videoUrl} />

      <div className="card">
        {row(t('field.muscle'), muscle || null)}
        {row(t('field.equipment'), ex.equipment)}
        {row(t('field.category'), category)}
      </div>

      <section>
        <h3 className="label mb-1.5">{t('library.defaults')}</h3>
        <div className="card">
          {row(t('coachEditor.workingSets'), ex.workingSets)}
          {row(t('coachEditor.reps'), ex.repRange)}
          {row(t('coachEditor.warmupSets'), ex.warmupSetCount ?? ex.warmupSets)}
          {row(t('coachEditor.restSec'), ex.restSec ? `${ex.restSec}s` : null)}
          {row(t('workout.tempo'), ex.tempo)}
        </div>
      </section>

      {ex.notes && loc(ex.notes) ? (
        <div>
          <div className="label mb-1">{t('coachEditor.instructions')}</div>
          <p className="whitespace-pre-line text-sm text-earth-muted" dir="auto">
            {loc(ex.notes)}
          </p>
        </div>
      ) : null}

      {ex.progressionNotes ? (
        <div>
          <div className="label mb-1">{t('coachEditor.progression')}</div>
          <p className="whitespace-pre-line text-sm text-earth-muted" dir="auto">
            {ex.progressionNotes}
          </p>
        </div>
      ) : null}

      {ex.tags?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {ex.tags.map((tg) => (
            <span key={tg} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-earth-muted">
              <bdi>{tg}</bdi>
            </span>
          ))}
        </div>
      ) : null}

      <AttributionLine attribution={attributionOf(ex)} />
    </div>
  );
}
