import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { IconButton, Button } from '@/components/ui/Button';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { TextInput } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/Sheet';
import { ExercisePickerSheet } from '@/components/workout/ExercisePickerSheet';
import { ExerciseProgrammingSheet } from './ExerciseProgrammingSheet';
import { SECTION_KINDS, SYNCED_EXERCISE_FIELDS } from '@/lib/workoutPresets';
import {
  addDay,
  addExercises,
  addSection,
  daySets,
  duplicateDay,
  duplicateExercise,
  exercisePosition,
  isImplicitSection,
  isPlainDay,
  knownKind,
  moveDay,
  moveExercise,
  moveExerciseToSection,
  moveSection,
  patchDay,
  patchSection,
  removeDay,
  removeExercise,
  removeSection,
  updateExercise,
  type PlanBody,
} from '@/lib/workoutPlanModel';
import { warmupCountOf } from '@/stores/workoutStore';
import { alertDialog, confirmDelete, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { getExercise } from '@/services/platform/coachAssetsApi';
import type { Exercise, SectionKind, WorkoutDay, WorkoutSection } from '@/types';

/**
 * The training editor (B3.5, blueprint §6.4 — CO-10, CO-25, DT-04, JR-07, B3-C03):
 *  - phones: two levels — the plan (details + days) and one day (its exercises, named sections as
 *    groups); the editor header's Back steps up a level;
 *  - desktop: the day list as a tree on the left, the selected day's exercise table on the right;
 *  - every row: name, sets × reps · rest, RIR / tempo, video; tap to program it; move up / down
 *    buttons (never drag-only); the rest behind one row menu.
 * Data rules live in `lib/workoutPlanModel` (sections stay in the data model, ids are stable,
 * `exerciseIds` follows the sections). Controlled: the editor owns the body and the selection.
 */
export function TrainingBuilder({
  body,
  onChange,
  coachId,
  details,
  selectedDayId,
  onSelectDay,
}: {
  /** Working shape (`normalizeWorkoutBody`). */
  body: PlanBody;
  onChange: (next: PlanBody) => void;
  coachId: string;
  /** Plan-level details (name, template line, client context). */
  details: ReactNode;
  selectedDayId: string | null;
  onSelectDay: (dayId: string | null) => void;
}) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const [picker, setPicker] = useState<{ dayId: string; sectionId: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ dayId: string; exId: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { days, exercises } = body;
  const day = days.find((d) => d.id === selectedDayId) ?? null;

  // Desktop always shows a day on the right; a removed day's selection falls back.
  useEffect(() => {
    if (selectedDayId && !days.some((d) => d.id === selectedDayId)) onSelectDay(isDesktop ? days[0]?.id ?? null : null);
    else if (isDesktop && !selectedDayId && days.length) onSelectDay(days[0].id);
  }, [days, selectedDayId, isDesktop, onSelectDay]);

  const kindLabel = (kind: string) => t(`coachEditor.sectionKinds.${knownKind(kind)}`);
  const sectionName = (s: WorkoutSection) => s.title || kindLabel(s.kind);

  // ---- day / section / exercise actions ------------------------------------------------------
  const onAddDay = () => {
    const { body: next, dayId } = addDay(body, `${t('coachEditor.day')} ${days.length + 1}`);
    onChange(next);
    onSelectDay(dayId);
  };
  const onRemoveDay = async (d: WorkoutDay) => {
    if (!(await confirmDialog({ title: t('coachEditor.removeDay'), message: t('coachEditor.removeDayBody', { name: d.title || t('coachEditor.day') }), danger: true, confirmLabel: t('common.delete') }))) return;
    onChange(removeDay(body, d.id));
  };
  const onDuplicateDay = (d: WorkoutDay) => {
    const { body: next, dayId } = duplicateDay(body, d.id, t('coachEditor.copyOf', { name: d.title }));
    onChange(next);
    onSelectDay(dayId);
  };
  const onRemoveSection = async (d: WorkoutDay, s: WorkoutSection) => {
    if (!(await confirmDelete(sectionName(s)))) return;
    onChange(removeSection(body, d.id, s.id));
  };
  const onRemoveExercise = async (d: WorkoutDay, exId: string) => {
    if (!(await confirmDelete(exercises[exId]?.name))) return;
    onChange(removeExercise(body, d.id, exId));
  };

  /**
   * A programming change to a library-linked exercise that touches a synced field (e.g. its name or
   * video) turns automatic library updates off for it — say so (the link stays reconnectable).
   */
  const applyExercise = (ex: Exercise) => {
    const prev = exercises[ex.id];
    const linked = !!prev?.libraryExerciseId && prev.librarySyncEnabled !== false;
    const touched = linked && SYNCED_EXERCISE_FIELDS.some((f) => JSON.stringify(prev[f]) !== JSON.stringify(ex[f]));
    onChange(updateExercise(body, touched ? { ...ex, librarySyncEnabled: false } : ex));
    if (touched) showToast({ title: t('coachLib.customOverrideTitle'), body: t('coachLib.customOverride'), variant: 'warning' });
    setEditing(null);
  };
  const refreshFromLibrary = async (exId: string) => {
    const ex = exercises[exId];
    if (!ex?.libraryExerciseId) return;
    setRefreshing(true);
    try {
      const libEx = await getExercise(coachId, ex.libraryExerciseId);
      const patch: Partial<Exercise> = {};
      for (const f of SYNCED_EXERCISE_FIELDS) (patch as Record<string, unknown>)[f] = libEx[f];
      onChange(updateExercise(body, { ...ex, ...patch, librarySyncEnabled: true }));
      setEditing(null);
    } catch (e) {
      const notFound = (e as { data?: { code?: string } } | null)?.data?.code === 'NOT_FOUND';
      await alertDialog({ title: t('coachLib.updateFromLibrary'), message: notFound ? t('coachLib.sourceMissing') : t('common.errorGeneric') });
    } finally {
      setRefreshing(false);
    }
  };

  // ---- pieces ------------------------------------------------------------------------------------
  /** Warm-up count, then the working `sets × reps` as one left-to-right run (reads right in Arabic too). */
  const setsReps = (ex: Exercise) => {
    const w = warmupCountOf(ex);
    return (
      <>
        {w > 0 && <span className="text-earth-subtle">{t('coachEditor.warmupCount', { n: w })} + </span>}
        <bdi dir="ltr">
          {ex.workingSets} × {ex.repRange || '—'}
        </bdi>
      </>
    );
  };
  const meta = (ex: Exercise) => {
    const parts: ReactNode[] = [<span key="s">{setsReps(ex)}</span>, <span key="r">{t('coachEditor.restSeconds', { n: ex.restSec })}</span>];
    if (ex.rir) parts.push(<span key="rir">{t('coachEditor.rirValue', { v: ex.rir })}</span>);
    if (ex.tempo) parts.push(<bdi key="t" dir="ltr">{ex.tempo}</bdi>);
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px] text-earth-subtle">
        {parts.flatMap((part, i) => (i ? [<span key={`d${i}`} aria-hidden="true">·</span>, part] : [part]))}
      </span>
    );
  };
  const videoMark = (ex: Exercise) =>
    ex.videoUrl ? (
      <span className="shrink-0 text-earth-subtle" title={t('coachEditor.hasVideo')} data-testid="ex-row-video">
        <Icon name="video" size={15} />
        <span className="sr-only">{t('coachEditor.hasVideo')}</span>
      </span>
    ) : null;

  const rowActions = (d: WorkoutDay, exId: string, name: string) => {
    const pos = exercisePosition(d, exId);
    const others = (d.sections ?? []).length > 1;
    return (
      <div className="flex shrink-0 items-center">
        <IconButton icon="arrowUp" size="sm" label={t('coachEditor.moveExerciseUp', { name })} disabled={pos.first} onClick={() => onChange(moveExercise(body, d.id, exId, -1))} className="border-transparent" />
        <IconButton icon="arrowDown" size="sm" label={t('coachEditor.moveExerciseDown', { name })} disabled={pos.last} onClick={() => onChange(moveExercise(body, d.id, exId, 1))} className="border-transparent" />
        <ActionMenu
          label={t('coachEditor.exerciseActions', { name })}
          size="sm"
          testId="exercise-menu"
          items={[
            ...(others ? [{ key: 'move', label: t('coachEditor.moveToSection'), icon: 'list' as const, onSelect: () => setMoving({ dayId: d.id, exId }) }] : []),
            { key: 'dup', label: t('common.duplicate'), icon: 'copy' as const, onSelect: () => onChange(duplicateExercise(body, d.id, exId)) },
            { key: 'del', label: t('common.delete'), icon: 'trash' as const, danger: true, onSelect: () => void onRemoveExercise(d, exId) },
          ]}
        />
      </div>
    );
  };

  const exerciseRow = (d: WorkoutDay, exId: string) => {
    const ex = exercises[exId];
    if (!ex) return null;
    const name = ex.name || t('coachEditor.untitledExercise');
    return (
      <li key={exId} className="flex items-center gap-1 py-1.5" data-testid="builder-exercise-row">
        <button type="button" data-testid="builder-exercise-open" className="flex min-h-ui-hit min-w-0 flex-1 items-center gap-2 rounded-ui-control px-1 text-start hover:bg-surface-hover" onClick={() => setEditing(exId)}>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              <bdi>{name}</bdi>
            </span>
            {meta(ex)}
          </span>
          {videoMark(ex)}
        </button>
        {rowActions(d, exId, name)}
      </li>
    );
  };

  /** Desktop: a dense table per section. */
  const exerciseTable = (d: WorkoutDay, s: WorkoutSection) => (
    <table className="w-full table-fixed text-[13.5px]">
      <thead>
        <tr className="border-b border-line-soft text-start text-[12px] font-medium uppercase tracking-wide text-earth-subtle">
          <th className="w-[32%] py-2 text-start font-medium">{t('coachEditor.exercise')}</th>
          <th className="w-[22%] py-2 text-start font-medium">{t('coachEditor.setsReps')}</th>
          <th className="w-[11%] py-2 text-start font-medium">{t('coachEditor.rest')}</th>
          <th className="w-[8%] py-2 text-start font-medium">{t('coachEditor.rir')}</th>
          <th className="w-[11%] py-2 text-start font-medium">{t('coachEditor.tempo')}</th>
          <th className="w-[132px] py-2" aria-label={t('common.actions')} />
        </tr>
      </thead>
      <tbody className="divide-y divide-line-soft">
        {s.exerciseIds.map((exId) => {
          const ex = exercises[exId];
          if (!ex) return null;
          const name = ex.name || t('coachEditor.untitledExercise');
          return (
            <tr key={exId} data-testid="builder-exercise-row" className="hover:bg-surface-hover/50">
              <td className="py-1.5 pe-2">
                <button type="button" data-testid="builder-exercise-open" className="flex min-h-ui-hit w-full items-center gap-2 text-start" onClick={() => setEditing(exId)}>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    <bdi>{name}</bdi>
                  </span>
                  {videoMark(ex)}
                </button>
              </td>
              <td className="py-1.5">{setsReps(ex)}</td>
              <td className="py-1.5 text-earth-muted">{t('coachEditor.secondsShort', { n: ex.restSec })}</td>
              <td className="py-1.5 text-earth-muted">{ex.rir || '—'}</td>
              <td className="py-1.5 text-earth-muted">
                <bdi dir="ltr">{ex.tempo || '—'}</bdi>
              </td>
              <td className="py-1.5">{rowActions(d, exId, name)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const sectionBlock = (d: WorkoutDay, s: WorkoutSection, i: number, count: number) => {
    const plain = isPlainDay(d);
    const name = sectionName(s);
    return (
      <section key={s.id} className="rounded-ui-surface border border-line-soft bg-surface-card p-3" data-testid="builder-section" data-section-id={s.id} data-plain={plain || undefined}>
        {!plain && (
          <div className="mb-2 flex items-center gap-2">
            <input
              className="input h-11 min-w-0 flex-1 font-semibold"
              data-testid="section-title"
              aria-label={t('coachEditor.sectionTitleLabel')}
              placeholder={isImplicitSection(d, s) ? t('coachEditor.untitledSection') : kindLabel(s.kind)}
              value={s.title}
              onChange={(e) => onChange(patchSection(body, d.id, s.id, { title: e.target.value }))}
              dir="auto"
            />
            <select
              className="input h-11 w-auto min-w-[8.5rem] shrink-0 py-0 leading-normal"
              data-testid="section-kind"
              aria-label={t('coachEditor.sectionKind')}
              value={knownKind(s.kind) === s.kind ? s.kind : ''}
              onChange={(e) => onChange(patchSection(body, d.id, s.id, { kind: e.target.value as SectionKind }))}
            >
              {knownKind(s.kind) !== s.kind && <option value="">{kindLabel(s.kind)}</option>}
              {SECTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`coachEditor.sectionKinds.${k}`)}
                </option>
              ))}
            </select>
            <ActionMenu
              label={t('coachEditor.sectionActions', { name })}
              size="sm"
              testId="section-menu"
              items={[
                { key: 'up', label: t('coachEditor.moveSectionUp'), icon: 'arrowUp', disabled: i === 0, onSelect: () => onChange(moveSection(body, d.id, s.id, -1)) },
                { key: 'down', label: t('coachEditor.moveSectionDown'), icon: 'arrowDown', disabled: i === count - 1, onSelect: () => onChange(moveSection(body, d.id, s.id, 1)) },
                { key: 'del', label: t('coachEditor.deleteSection'), icon: 'trash', danger: true, onSelect: () => void onRemoveSection(d, s) },
              ]}
            />
          </div>
        )}
        {s.exerciseIds.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-earth-muted">{t('coachEditor.noExercisesYet')}</p>
        ) : isDesktop ? (
          exerciseTable(d, s)
        ) : (
          <ul className="divide-y divide-line-soft">{s.exerciseIds.map((id) => exerciseRow(d, id))}</ul>
        )}
        <Button variant="ghost" size="sm" icon="plus" data-testid="builder-add-exercise" className="mt-2 w-full" onClick={() => setPicker({ dayId: d.id, sectionId: s.id })}>
          {plain ? t('coachEditor.addExercise') : t('coachEditor.addExerciseTo', { name })}
        </Button>
      </section>
    );
  };

  const dayIdx = day ? days.findIndex((d) => d.id === day.id) : -1;
  const dayPanel = day && (
    <div className="space-y-3" data-testid="builder-day" data-day-id={day.id}>
      <div className="flex items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <TextInput label={t('coachEditor.dayTitle')} data-testid="day-title" value={day.title} onChange={(e) => onChange(patchDay(body, day.id, { title: e.target.value }))} dir="auto" />
          <TextInput label={t('coachEditor.dayFocus')} data-testid="day-focus" value={day.focus} onChange={(e) => onChange(patchDay(body, day.id, { focus: e.target.value }))} dir="auto" />
        </div>
        <ActionMenu
          label={t('coachEditor.dayActions', { name: day.title || t('coachEditor.day') })}
          testId="day-menu"
          items={[
            { key: 'dup', label: t('coachEditor.duplicateDay'), icon: 'copy', onSelect: () => onDuplicateDay(day) },
            { key: 'up', label: t('coachEditor.moveDayUp'), icon: 'arrowUp', disabled: dayIdx === 0, onSelect: () => onChange(moveDay(body, day.id, -1)) },
            { key: 'down', label: t('coachEditor.moveDayDown'), icon: 'arrowDown', disabled: dayIdx === days.length - 1, onSelect: () => onChange(moveDay(body, day.id, 1)) },
            { key: 'del', label: t('coachEditor.removeDay'), icon: 'trash', danger: true, onSelect: () => void onRemoveDay(day) },
          ]}
        />
      </div>
      {(day.sections ?? []).map((s, i, all) => sectionBlock(day, s, i, all.length))}
      <Button variant="secondary" size="sm" icon="plus" data-testid="builder-add-section" fullWidth onClick={() => onChange(addSection(body, day.id).body)}>
        {t('coachEditor.addSection')}
      </Button>
    </div>
  );

  const dayCard = (d: WorkoutDay) => {
    const ids = (d.sections ?? []).flatMap((sec) => sec.exerciseIds);
    const n = ids.length;
    const selected = d.id === day?.id;
    return (
      <li key={d.id}>
        <button
          type="button"
          data-testid="builder-day-card"
          aria-current={isDesktop && selected ? 'true' : undefined}
          className={`flex min-h-ui-hit w-full items-center gap-3 rounded-ui-control px-3 py-2.5 text-start ${isDesktop && selected ? 'bg-brand/10 ring-1 ring-brand/40' : 'hover:bg-surface-hover'}`}
          onClick={() => onSelectDay(d.id)}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              <bdi>{d.title || t('coachEditor.day')}</bdi>
            </span>
            <span className="block truncate text-[12.5px] text-earth-subtle">
              {d.focus ? (
                <>
                  <bdi>{d.focus}</bdi> ·{' '}
                </>
              ) : null}
              {t('coachEditor.exercisesCount', { count: n })} · {t('coachEditor.setsCount', { count: daySets(d, exercises) })}
            </span>
          </span>
          {!isDesktop && <Icon name="chevron" size={18} className="text-earth-subtle" />}
        </button>
        {isDesktop && selected && n > 0 && (
          <ol className="mb-1 ms-6 mt-1 space-y-0.5 border-s border-line-soft ps-3" data-testid="builder-day-tree">
            {ids.map((id) => (
              <li key={id}>
                <button type="button" className="block w-full truncate rounded px-1 py-0.5 text-start text-[12.5px] text-earth-muted hover:text-earth" onClick={() => setEditing(id)}>
                  <bdi>{exercises[id]?.name || t('coachEditor.untitledExercise')}</bdi>
                </button>
              </li>
            ))}
          </ol>
        )}
      </li>
    );
  };
  const dayList =
    days.length === 0 ? (
      <EmptyState icon="calendar" title={t('coachEditor.emptyDays')} message={t('coachEditor.emptyDaysBody')} testId="builder-empty" />
    ) : (
      <ul className="space-y-1">{days.map(dayCard)}</ul>
    );
  const addDayButton = (
    <Button variant="secondary" icon="plus" data-testid="builder-add-day" fullWidth onClick={onAddDay}>
      {t('coachEditor.addDay')}
    </Button>
  );

  const sheets = (
    <>
      {picker && <ExercisePickerSheet open onClose={() => setPicker(null)} coachId={coachId} onPickMany={(exs) => onChange(addExercises(body, picker.dayId, picker.sectionId, exs))} />}
      <ExerciseProgrammingSheet
        open={!!editing}
        exercise={editing ? exercises[editing] ?? null : null}
        onClose={() => setEditing(null)}
        onApply={applyExercise}
        coachId={coachId}
        libraryStatus={
          editing && exercises[editing]?.libraryExerciseId ? (
            <div className="flex items-center justify-between gap-3 rounded-ui-control border border-line-soft p-3">
              <span className="min-w-0 flex-1 text-[13px] text-earth-subtle">{exercises[editing].librarySyncEnabled !== false ? t('coachLib.linkedToLibrary') : t('coachLib.customOverride')}</span>
              <button type="button" className="chip shrink-0" disabled={refreshing} onClick={() => void refreshFromLibrary(editing)}>
                {refreshing ? t('auth.working') : exercises[editing].librarySyncEnabled === false ? t('coachLib.reconnectToLibrary') : t('coachLib.updateFromLibrary')}
              </button>
            </div>
          ) : undefined
        }
      />
      <Sheet open={!!moving} onClose={() => setMoving(null)} size="md" title={t('coachEditor.moveToSection')}>
        {moving && (
          <ul className="divide-y divide-line-soft">
            {(days.find((d) => d.id === moving.dayId)?.sections ?? [])
              .filter((s) => !s.exerciseIds.includes(moving.exId))
              .map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="row min-h-ui-hit w-full text-start"
                    onClick={() => {
                      onChange(moveExerciseToSection(body, moving.dayId, moving.exId, s.id));
                      setMoving(null);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <bdi>{s.title || (isImplicitSection({ id: moving.dayId }, s) ? t('coachEditor.untitledSection') : kindLabel(s.kind))}</bdi>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Sheet>
    </>
  );

  if (isDesktop) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]" data-testid="builder-plan">
        <div className="space-y-4">
          {details}
          <div>
            <h2 className="label mb-2">{t('coachEditor.days')}</h2>
            {dayList}
          </div>
          {addDayButton}
        </div>
        <div className="min-w-0">
          {dayPanel || (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-ui-surface border border-dashed border-line py-10 text-center text-earth-subtle">
              <Icon name="dumbbell" size={28} />
              <p className="text-sm">{t('coachEditor.emptyDays')}</p>
            </div>
          )}
        </div>
        {sheets}
      </div>
    );
  }
  return (
    <>
      {day ? (
        dayPanel
      ) : (
        <div className="space-y-4" data-testid="builder-plan">
          {details}
          <div>
            <h2 className="label mb-2">{t('coachEditor.days')}</h2>
            {dayList}
          </div>
          {addDayButton}
        </div>
      )}
      {sheets}
    </>
  );
}
