import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { exerciseDemo } from '@/lib/libraryMedia';
import { isPlainDay, knownKind, normalizeWorkoutBody, type PlanBody } from '@/lib/workoutPlanModel';
import { warmupCountOf } from '@/stores/workoutStore';
import type { Exercise } from '@/types';

/**
 * A workout template read-first (B3.7, RM-27 / CO-39): the whole program — every day, its named
 * sections and each exercise with its programming — instead of a preview page with counts only.
 * Read-only by construction (no inputs); the editor's explicit Edit switches to the builder.
 */
export function TemplateReadView({ body: stored, details }: { body: PlanBody; details?: ReactNode }) {
  const { t } = useTranslation();
  // Older / seeded templates store flat days (no `sections`): read them the way the builder does.
  const body = normalizeWorkoutBody(stored);
  const kindLabel = (kind: string) => t(`coachEditor.sectionKinds.${knownKind(kind)}`);
  const line = (ex: Exercise) => {
    const w = warmupCountOf(ex);
    const parts: ReactNode[] = [
      <bdi key="s" dir="ltr">
        {w > 0 ? `${t('coachEditor.warmupCount', { n: w })} + ` : ''}
        {ex.workingSets} × {ex.repRange || '—'}
      </bdi>,
      <span key="r">{t('coachEditor.restSeconds', { n: ex.restSec })}</span>,
    ];
    if (ex.rir) parts.push(<span key="rir">{t('coachEditor.rirValue', { v: ex.rir })}</span>);
    if (ex.tempo) parts.push(<bdi key="tp" dir="ltr">{ex.tempo}</bdi>);
    return parts.flatMap((p, i) => (i ? [<span key={`d${i}`} aria-hidden="true"> · </span>, p] : [p]));
  };
  const row = (id: string) => {
    const ex = body.exercises[id];
    if (!ex) return null;
    const video = exerciseDemo(ex).kind === 'video';
    return (
      <li key={id} className="flex items-center gap-3 py-2" data-testid="template-read-exercise">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            <bdi>{ex.name || t('coachEditor.untitledExercise')}</bdi>
          </span>
          <span className="block truncate text-[12.5px] text-earth-subtle">{line(ex)}</span>
        </span>
        {video ? (
          <span className="shrink-0 text-earth-subtle" title={t('coachEditor.hasVideo')}>
            <Icon name="video" size={15} />
            <span className="sr-only">{t('coachEditor.hasVideo')}</span>
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-4" data-testid="template-preview">
      {details}
      {body.days.length === 0 ? (
        <p className="rounded-ui-surface border border-dashed border-line px-4 py-8 text-center text-sm text-earth-muted" data-testid="template-read-empty">
          {t('library.program.noDays')}
        </p>
      ) : (
        <ol className="grid gap-3 lg:grid-cols-2" data-testid="template-preview-days">
          {body.days.map((d, i) => {
            const plain = isPlainDay(d);
            const n = (d.sections ?? []).reduce((sum, s) => sum + s.exerciseIds.length, 0);
            return (
              <li key={d.id} className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4" data-testid="template-read-day">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 truncate font-semibold">
                    <bdi>{d.title || `${t('coachEditor.day')} ${i + 1}`}</bdi>
                  </h3>
                  <span className="shrink-0 text-[12px] text-earth-subtle">{t('coachEditor.exercisesCount', { count: n })}</span>
                </div>
                {d.focus ? (
                  <p className="mb-1 text-[12.5px] text-earth-muted">
                    <bdi>{d.focus}</bdi>
                  </p>
                ) : null}
                {n === 0 ? (
                  <p className="py-2 text-[13px] text-earth-subtle">{t('coachEditor.noExercisesYet')}</p>
                ) : plain ? (
                  <ul className="divide-y divide-line-soft">{(d.sections ?? [])[0].exerciseIds.map(row)}</ul>
                ) : (
                  (d.sections ?? []).map((s) => (
                    <section key={s.id} className="mt-2">
                      <h4 className="text-[11.5px] font-medium uppercase tracking-wide text-earth-subtle">
                        <bdi>{s.title || kindLabel(s.kind)}</bdi>
                      </h4>
                      {s.exerciseIds.length ? <ul className="divide-y divide-line-soft">{s.exerciseIds.map(row)}</ul> : <p className="py-1.5 text-[12.5px] text-earth-subtle">{t('coachEditor.noExercisesYet')}</p>}
                    </section>
                  ))
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
