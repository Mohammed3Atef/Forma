import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextInput } from '@/components/ui/Field';
import { EmptyState as SharedEmptyState } from '@/components/ui/EmptyState';
import { ExerciseForm } from './ExerciseForm';
import { ExercisePickerSheet } from './ExercisePickerSheet';
import { SECTION_KINDS, SYNCED_EXERCISE_FIELDS, copyExercise } from '@/lib/workoutPresets';
import { uid } from '@/lib/utils';
import { warmupCountOf } from '@/stores/workoutStore';
import { alertDialog, confirmDelete, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { getExercise } from '@/services/platform/coachAssetsApi';
import { updatePlanExerciseFromLibrary } from '@/services/platform/planApi';
import type { Exercise, SectionKind, WorkoutDay, WorkoutSection } from '@/types';

type View = { level: 'plan' } | { level: 'day'; dayId: string } | { level: 'section'; dayId: string; sectionId: string };
type RowAction = { icon: 'plus' | 'close' | 'list'; label: string; onClick: () => void; danger?: boolean };

function move<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

const syncDay = (d: WorkoutDay): WorkoutDay => ({ ...d, exerciseIds: (d.sections ?? []).flatMap((s) => s.exerciseIds) });

/**
 * Mobile drill-down workout builder (plan → day → section → exercise sheet).
 * Controlled: parent owns `days`/`exercises` and the save actions (passed as
 * `header`, shown on the plan level). Keeps `day.exerciseIds` = sections
 * flattened so the tracker engine stays correct.
 */
export function PlanBuilder({
  days,
  exercises,
  onChange,
  coachId,
  clientId,
  header,
}: {
  days: WorkoutDay[];
  exercises: Record<string, Exercise>;
  onChange: (days: WorkoutDay[], exercises: Record<string, Exercise>) => void;
  coachId: string;
  /** Only set by `CoachWorkoutEditor.tsx` (a client's assigned plan) — never by the template editor. Switches "update from library" to the immediate-persist backend mutation instead of the local-state client-side refresh templates use. */
  clientId?: string;
  header?: ReactNode;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>({ level: 'plan' });
  const [picker, setPicker] = useState<{ dayId: string; sectionId: string } | null>(null);
  const [editing, setEditing] = useState<{ exId: string } | null>(null);
  const [moving, setMoving] = useState<{ dayId: string; sectionId: string; exId: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // A single overflow sheet for secondary row actions (duplicate/delete/move) —
  // keeps each row down to reorder arrows + one "more" trigger instead of a
  // 4-5-icon cluster.
  const [rowMenu, setRowMenu] = useState<{ title: string; actions: RowAction[] } | null>(null);

  // One-time migration: wrap legacy flat exerciseIds into a default section.
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;
    let changed = false;
    const next = days.map((d) => {
      if (d.sections) return d;
      changed = true;
      const ids = d.exerciseIds ?? [];
      return {
        ...d,
        exerciseIds: ids,
        sections: ids.length ? [{ id: uid('sec'), title: t('coachEditor.defaultSection'), kind: 'normal' as SectionKind, exerciseIds: [...ids] }] : [],
      };
    });
    if (changed) onChange(next, exercises);
  }, [days, exercises, onChange, t]);

  const setDays = (next: WorkoutDay[], nextEx: Record<string, Exercise> = exercises) =>
    onChange(next.map((d, i) => ({ ...d, dayIndex: i })), nextEx);
  const mapDay = (dayId: string, fn: (d: WorkoutDay) => WorkoutDay) => setDays(days.map((d) => (d.id === dayId ? syncDay(fn(d)) : d)));
  const mapSection = (dayId: string, sectionId: string, fn: (s: WorkoutSection) => WorkoutSection) =>
    mapDay(dayId, (d) => ({ ...d, sections: (d.sections ?? []).map((s) => (s.id === sectionId ? fn(s) : s)) }));

  // ---- day ops ----
  const addDay = () => {
    const d: WorkoutDay = { id: uid('day'), dayIndex: days.length, title: `${t('coachEditor.day')} ${days.length + 1}`, focus: '', exerciseIds: [], sections: [] };
    setDays([...days, d]);
    setView({ level: 'day', dayId: d.id });
  };
  const removeDay = async (d: WorkoutDay) => {
    if (!(await confirmDialog({ title: t('coachEditor.removeDay'), message: d.title, danger: true }))) return;
    const ex = { ...exercises };
    (d.sections ?? []).forEach((s) => s.exerciseIds.forEach((id) => delete ex[id]));
    setDays(days.filter((x) => x.id !== d.id), ex);
    setView({ level: 'plan' });
  };
  const duplicateDay = (dayId: string) => {
    const d = days.find((x) => x.id === dayId);
    if (!d) return;
    const idMap: Record<string, string> = {};
    const ex = { ...exercises };
    (d.sections ?? []).forEach((s) => s.exerciseIds.forEach((id) => { const c = copyExercise(exercises[id]); idMap[id] = c.id; ex[c.id] = c; }));
    const sections = (d.sections ?? []).map((s) => ({ ...s, id: uid('sec'), exerciseIds: s.exerciseIds.map((x) => idMap[x]).filter(Boolean) }));
    const copy = syncDay({ ...d, id: uid('day'), title: `${d.title} (copy)`, sections });
    const idx = days.findIndex((x) => x.id === dayId);
    setDays([...days.slice(0, idx + 1), copy, ...days.slice(idx + 1)], ex);
  };

  // ---- section ops ----
  const addSection = (dayId: string) => {
    const id = uid('sec');
    mapDay(dayId, (d) => ({ ...d, sections: [...(d.sections ?? []), { id, title: '', kind: 'normal', exerciseIds: [] }] }));
    setView({ level: 'section', dayId, sectionId: id });
  };
  const removeSection = async (dayId: string, sectionId: string) => {
    const d = days.find((x) => x.id === dayId);
    const sec = d?.sections?.find((s) => s.id === sectionId);
    if (!(await confirmDelete(sec?.title || t(`coachEditor.sectionKinds.${sec?.kind ?? 'normal'}`)))) return;
    const ex = { ...exercises };
    sec?.exerciseIds.forEach((id) => delete ex[id]);
    setDays(days.map((dd) => (dd.id === dayId ? syncDay({ ...dd, sections: (dd.sections ?? []).filter((s) => s.id !== sectionId) }) : dd)), ex);
    setView({ level: 'day', dayId });
  };
  const duplicateSection = (dayId: string, sectionId: string) => {
    const d = days.find((x) => x.id === dayId);
    const sec = d?.sections?.find((s) => s.id === sectionId);
    if (!d || !sec) return;
    const ex = { ...exercises };
    const newIds = sec.exerciseIds.map((id) => { const c = copyExercise(exercises[id]); ex[c.id] = c; return c.id; });
    const copy: WorkoutSection = { ...sec, id: uid('sec'), title: sec.title ? `${sec.title} (copy)` : '', exerciseIds: newIds };
    const idx = (d.sections ?? []).findIndex((s) => s.id === sectionId);
    const sections = [...(d.sections ?? [])];
    sections.splice(idx + 1, 0, copy);
    setDays(days.map((dd) => (dd.id === dayId ? syncDay({ ...dd, sections }) : dd)), ex);
  };

  // ---- exercise ops ----
  // Inserts N exercises into one section in a single onChange call (used by the
  // multi-select picker) instead of N separate state updates.
  const addExercises = (dayId: string, sectionId: string, exs: Exercise[]) => {
    if (!exs.length) return;
    const nextEx = { ...exercises };
    exs.forEach((ex) => { nextEx[ex.id] = ex; });
    setDays(
      days.map((d) => (d.id === dayId ? syncDay({ ...d, sections: (d.sections ?? []).map((s) => (s.id === sectionId ? { ...s, exerciseIds: [...s.exerciseIds, ...exs.map((ex) => ex.id)] } : s)) }) : d)),
      nextEx,
    );
  };
  const updateExercise = (ex: Exercise) => onChange(days, { ...exercises, [ex.id]: ex });

  /**
   * Applies a manual `ExerciseForm` edit to an embedded exercise. If it's
   * still linked to a library exercise and the edit touched one of
   * `SYNCED_EXERCISE_FIELDS`, flip `librarySyncEnabled` off (never clear
   * `libraryExerciseId` — that's the whole point of keeping it reconnectable)
   * so a later library edit can't silently clobber this intentional
   * override, and say so (non-blocking — the edit still saves either way).
   * Editing only programming fields (sets/reps/rest/etc) never detaches.
   */
  const applyExerciseEdit = (ex: Exercise) => {
    const prev = exercises[ex.id];
    const wasLinked = !!prev?.libraryExerciseId && prev.librarySyncEnabled !== false;
    const touchedSynced = wasLinked && SYNCED_EXERCISE_FIELDS.some((f) => JSON.stringify(prev[f]) !== JSON.stringify(ex[f]));
    updateExercise(touchedSynced ? { ...ex, librarySyncEnabled: false } : ex);
    if (touchedSynced) showToast({ title: t('coachLib.detachConfirmTitle'), body: t('coachLib.customOverride'), variant: 'warning' });
  };

  /**
   * "Update from library" / "Reconnect" for one embedded exercise. Template
   * context (no `clientId`): purely local — re-fetch the current library
   * exercise and merge its synced fields into this builder's own in-memory
   * state, same as any other template edit (persists on the template's own
   * Save). Client-plan context (`clientId` set): the plan is already
   * persisted per-exercise server-side, so this calls the dedicated backend
   * mutation instead, which persists immediately and never triggers the
   * detach logic above.
   */
  const refreshFromLibrary = async (exId: string) => {
    const ex = exercises[exId];
    if (!ex?.libraryExerciseId) return;
    setRefreshing(true);
    try {
      if (clientId) {
        const updated = await updatePlanExerciseFromLibrary(clientId, exId);
        updateExercise(updated);
      } else {
        const libEx = await getExercise(coachId, ex.libraryExerciseId);
        const patch: Partial<Exercise> = {};
        for (const f of SYNCED_EXERCISE_FIELDS) (patch as Record<string, unknown>)[f] = libEx[f];
        updateExercise({ ...ex, ...patch, librarySyncEnabled: true });
      }
      setEditing(null);
    } catch (e) {
      await alertDialog({ title: t('coachLib.updateFromLibrary'), message: e instanceof Error ? e.message : t('coachLib.sourceMissing') });
    } finally {
      setRefreshing(false);
    }
  };
  const removeExercise = async (dayId: string, sectionId: string, exId: string) => {
    if (!(await confirmDelete(exercises[exId]?.name))) return;
    const ex = { ...exercises };
    delete ex[exId];
    mapSectionEx(dayId, sectionId, (ids) => ids.filter((x) => x !== exId), ex);
  };
  const duplicateExercise = (dayId: string, sectionId: string, exId: string) => {
    const c = copyExercise(exercises[exId]);
    const ex = { ...exercises, [c.id]: c };
    mapSectionEx(dayId, sectionId, (ids) => { const i = ids.indexOf(exId); const n = [...ids]; n.splice(i + 1, 0, c.id); return n; }, ex);
  };
  const moveExerciseToSection = (dayId: string, fromSec: string, exId: string, toSec: string) => {
    mapDay(dayId, (d) => ({
      ...d,
      sections: (d.sections ?? []).map((s) => {
        if (s.id === fromSec) return { ...s, exerciseIds: s.exerciseIds.filter((x) => x !== exId) };
        if (s.id === toSec) return { ...s, exerciseIds: [...s.exerciseIds, exId] };
        return s;
      }),
    }));
    setMoving(null);
  };
  // helper: replace a section's exerciseIds + optionally swap the exercise map
  function mapSectionEx(dayId: string, sectionId: string, fn: (ids: string[]) => string[], nextEx?: Record<string, Exercise>) {
    setDays(days.map((d) => (d.id === dayId ? syncDay({ ...d, sections: (d.sections ?? []).map((s) => (s.id === sectionId ? { ...s, exerciseIds: fn(s.exerciseIds) } : s)) }) : d)), nextEx ?? exercises);
  }

  // ===================== RENDER =====================
  const isDesktop = useIsDesktop();
  const day = view.level !== 'plan' ? days.find((d) => d.id === view.dayId) : undefined;
  const section = view.level === 'section' && day ? day.sections?.find((s) => s.id === view.sectionId) : undefined;
  // On desktop the day list stays visible as a permanent left pane, so "back"
  // from a day just clears the right-pane selection instead of leaving the list.
  const backFromDay = () => setView({ level: 'plan' });

  // ---- Level 3: section ----
  const sectionView = view.level === 'section' && day && section && (
      <div className="space-y-4" data-testid="builder-section">
        <button type="button" className="btn-ghost" onClick={() => setView({ level: 'day', dayId: day.id })}>
          <Icon name="chevronLeft" size={16} /> {day.title}
        </button>
        <TextInput label={t('coachEditor.sectionTitle')} data-testid="section-title" value={section.title} onChange={(e) => mapSection(day.id, section.id, (s) => ({ ...s, title: e.target.value }))} />
        <div className="flex flex-wrap gap-2">
          {SECTION_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => mapSection(day.id, section.id, (s) => ({ ...s, kind: k }))} className={`chip ${section.kind === k ? 'chip-on' : ''}`}>
              {t(`coachEditor.sectionKinds.${k}`)}
            </button>
          ))}
        </div>

        {section.exerciseIds.length === 0 ? (
          <EmptyState icon="dumbbell" text={t('coachEditor.emptyExercises')} />
        ) : (
          <div className="space-y-2">
            {section.exerciseIds.map((exId, i) => {
              const ex = exercises[exId];
              if (!ex) return null;
              return (
                <div key={exId} className="card flex items-center gap-2">
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing({ exId })}>
                    <span className="block truncate font-medium">{ex.name || t('coachEditor.untitledExercise')}</span>
                    <span className="block truncate text-[12px] text-earth-subtle">
                      {warmupCountOf(ex) > 0 && `${warmupCountOf(ex)} ${t('coachEditor.warmupShort')} + `}{ex.workingSets} × {ex.repRange} · {ex.restSec}s{ex.videoUrl ? ' · 🎬' : ''}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <IconBtn name="arrowUp" label={t('common.moveUp')} disabled={i === 0} onClick={() => mapSectionEx(day.id, section.id, (ids) => move(ids, i, -1))} />
                    <IconBtn name="arrowUp" rotate label={t('common.moveDown')} onClick={() => mapSectionEx(day.id, section.id, (ids) => move(ids, i, 1))} disabled={i === section.exerciseIds.length - 1} />
                    <IconBtn
                      name="list"
                      label={t('common.moreActions')}
                      onClick={() => setRowMenu({
                        title: ex.name || t('coachEditor.untitledExercise'),
                        actions: [
                          { icon: 'list', label: t('common.moveTo'), onClick: () => setMoving({ dayId: day.id, sectionId: section.id, exId }) },
                          { icon: 'plus', label: t('common.duplicate'), onClick: () => duplicateExercise(day.id, section.id, exId) },
                          { icon: 'close', label: t('common.delete'), danger: true, onClick: () => void removeExercise(day.id, section.id, exId) },
                        ],
                      })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" data-testid="builder-add-exercise" className="btn-primary w-full" onClick={() => setPicker({ dayId: day.id, sectionId: section.id })}>
          <Icon name="plus" size={16} /> {t('coachEditor.addExercise')}
        </button>

        {picker && <ExercisePickerSheet open onClose={() => setPicker(null)} coachId={coachId} onPickMany={(exs) => addExercises(picker.dayId, picker.sectionId, exs)} />}
        <Sheet open={!!editing} onClose={() => setEditing(null)} size="lg" title={t('coachEditor.exercise')}>
          {editing && exercises[editing.exId] && (
            <ExerciseForm
              initial={exercises[editing.exId]}
              onSave={(ex) => { applyExerciseEdit(ex); setEditing(null); }}
              coachId={coachId}
              extra={exercises[editing.exId].libraryExerciseId ? (
                <div className="flex items-center justify-between rounded-xl border border-line-soft p-3">
                  <span className="min-w-0 flex-1 text-[13px] text-earth-subtle">
                    {exercises[editing.exId].librarySyncEnabled !== false ? t('coachLib.linkedToLibrary') : t('coachLib.customOverride')}
                  </span>
                  <button
                    type="button"
                    className="chip shrink-0"
                    disabled={refreshing}
                    onClick={() => void refreshFromLibrary(editing.exId)}
                  >
                    {refreshing ? t('auth.working') : exercises[editing.exId].librarySyncEnabled === false ? t('coachLib.reconnectToLibrary') : t('coachLib.updateFromLibrary')}
                  </button>
                </div>
              ) : undefined}
            />
          )}
        </Sheet>
        <Sheet open={!!moving} onClose={() => setMoving(null)} size="md" title={t('coachEditor.moveToSection')}>
          {moving && (
            <div className="card divide-y divide-line-soft">
              {(day.sections ?? []).filter((s) => s.id !== moving.sectionId).map((s) => (
                <button key={s.id} type="button" className="row w-full text-start" onClick={() => moveExerciseToSection(moving.dayId, moving.sectionId, moving.exId, s.id)}>
                  <span className="min-w-0 flex-1 truncate">{s.title || t(`coachEditor.sectionKinds.${s.kind}`)}</span>
                </button>
              ))}
              {(day.sections ?? []).filter((s) => s.id !== moving.sectionId).length === 0 && <p className="py-2 text-sm text-earth-muted">{t('coachEditor.noOtherSections')}</p>}
            </div>
          )}
        </Sheet>
      </div>
    );

  // ---- Level 2: day ----
  const dayIdx = day ? days.findIndex((d) => d.id === day.id) : -1;
  const dayView = view.level === 'day' && day && (
      <div className="space-y-4" data-testid="builder-day">
        <button type="button" className="btn-ghost" onClick={backFromDay}>
          <Icon name="chevronLeft" size={16} /> {t('coachEditor.workoutTitle')}
        </button>
        <TextInput label={t('coachEditor.dayTitle')} data-testid="day-title" value={day.title} onChange={(e) => mapDay(day.id, (d) => ({ ...d, title: e.target.value }))} />
        <TextInput label={t('coachEditor.dayFocus')} data-testid="day-focus" value={day.focus} onChange={(e) => mapDay(day.id, (d) => ({ ...d, focus: e.target.value }))} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="chip" onClick={() => duplicateDay(day.id)}>{t('coachEditor.duplicateDay')}</button>
          <button type="button" className="chip" disabled={dayIdx === 0} onClick={() => setDays(move(days, dayIdx, -1))}>↑ {t('coachEditor.moveUp')}</button>
          <button type="button" className="chip" disabled={dayIdx === days.length - 1} onClick={() => setDays(move(days, dayIdx, 1))}>↓ {t('coachEditor.moveDown')}</button>
          <button type="button" className="chip text-danger" onClick={() => void removeDay(day)}>{t('coachEditor.removeDay')}</button>
        </div>

        {(day.sections ?? []).length === 0 ? (
          <EmptyState icon="list" text={t('coachEditor.emptySections')} />
        ) : (
          <div className="space-y-2">
            {(day.sections ?? []).map((s, i) => (
              <div key={s.id} className="card flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setView({ level: 'section', dayId: day.id, sectionId: s.id })}>
                  <span className="block truncate font-medium">{s.title || t(`coachEditor.sectionKinds.${s.kind}`)}</span>
                  <span className="block text-[12px] text-earth-subtle">{t('coachEditor.exerciseCount', { n: s.exerciseIds.length })}</span>
                </button>
                <IconBtn name="arrowUp" label={t('common.moveUp')} disabled={i === 0} onClick={() => mapDay(day.id, (d) => ({ ...d, sections: move(d.sections ?? [], i, -1) }))} />
                <IconBtn name="arrowUp" rotate label={t('common.moveDown')} disabled={i === (day.sections ?? []).length - 1} onClick={() => mapDay(day.id, (d) => ({ ...d, sections: move(d.sections ?? [], i, 1) }))} />
                <IconBtn
                  name="list"
                  label={t('common.moreActions')}
                  onClick={() => setRowMenu({
                    title: s.title || t(`coachEditor.sectionKinds.${s.kind}`),
                    actions: [
                      { icon: 'plus', label: t('common.duplicate'), onClick: () => duplicateSection(day.id, s.id) },
                      { icon: 'close', label: t('common.delete'), danger: true, onClick: () => void removeSection(day.id, s.id) },
                    ],
                  })}
                />
                <Icon name="chevron" size={16} className="text-earth-subtle" />
              </div>
            ))}
          </div>
        )}
        <button type="button" data-testid="builder-add-section" className="btn-primary w-full" onClick={() => addSection(day.id)}>
          <Icon name="plus" size={16} /> {t('coachEditor.addSection')}
        </button>
      </div>
    );

  // ---- Level 1: plan overview (day list) ----
  const dayList = days.length === 0 ? (
    <EmptyState icon="calendar" text={t('coachEditor.emptyDays')} />
  ) : (
    <div className="space-y-2">
      {days.map((d) => (
        <button
          key={d.id}
          type="button"
          data-testid="builder-day-card"
          className={`card-tap flex w-full items-center gap-3 text-start ${isDesktop && view.level !== 'plan' && day?.id === d.id ? 'border-brand/50 bg-brand/[0.06]' : ''}`}
          onClick={() => setView({ level: 'day', dayId: d.id })}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{d.title}</span>
            <span className="block truncate text-[12px] text-earth-subtle">
              {d.focus ? `${d.focus} · ` : ''}{t('coachEditor.sectionCount', { n: (d.sections ?? []).length })} · {t('coachEditor.exerciseCount', { n: d.exerciseIds.length })}
            </span>
          </span>
          <Icon name="chevron" size={18} className="text-earth-subtle" />
        </button>
      ))}
    </div>
  );
  const planView = (
    <div className="space-y-4" data-testid="builder-plan">
      {header}
      {dayList}
      <button type="button" data-testid="builder-add-day" className="btn-ghost w-full" onClick={addDay}>
        <Icon name="plus" size={16} /> {t('coachEditor.addDay')}
      </button>
    </div>
  );

  // Shared overflow-actions sheet — triggered from both the day-level section
  // list and the section-level exercise list, so it's rendered once here
  // rather than duplicated inside each view.
  const rowMenuSheet = (
    <Sheet open={!!rowMenu} onClose={() => setRowMenu(null)} size="sm" title={rowMenu?.title}>
      {rowMenu && (
        <div className="space-y-1">
          {rowMenu.actions.map((a, i) => (
            <button key={i} type="button" className={`row w-full text-start ${a.danger ? 'text-danger' : ''}`} onClick={() => { a.onClick(); setRowMenu(null); }}>
              <Icon name={a.icon} size={18} />
              <span className="min-w-0 flex-1">{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );

  // Mobile/tablet: exactly one level on screen at a time (unchanged drill-down).
  if (!isDesktop) return <>{sectionView || dayView || planView}{rowMenuSheet}</>;

  // Desktop: the day list stays visible as a permanent left pane (matches the
  // design's builder split-view) while the right pane shows whichever day/
  // section is selected — editing a plan no longer means losing the day list.
  return (
    <div className="flex flex-col gap-5 lg:flex-row" data-testid="builder-plan">
      {rowMenuSheet}
      <div className="w-full shrink-0 space-y-4 lg:w-72">
        {header}
        {dayList}
        <button type="button" data-testid="builder-add-day" className="btn-ghost w-full" onClick={addDay}>
          <Icon name="plus" size={16} /> {t('coachEditor.addDay')}
        </button>
      </div>
      <div className="min-w-0 flex-1">
        {sectionView || dayView || (
          <div className="card flex min-h-48 flex-col items-center justify-center gap-3 py-10 text-center text-earth-subtle">
            <Icon name="dumbbell" size={28} />
            <p className="text-sm">{t('coachEditor.selectDayPrompt')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ name, label, onClick, disabled, danger, rotate }: { name: 'arrowUp' | 'plus' | 'minus' | 'list'; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; rotate?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover disabled:opacity-25 ${danger ? 'text-danger' : 'text-earth-muted'}`}>
      <Icon name={name} size={17} className={rotate ? 'rotate-180' : ''} />
    </button>
  );
}

function EmptyState({ text, icon }: { text: string; icon: 'dumbbell' | 'list' | 'calendar' }) {
  return <SharedEmptyState icon={icon} title={text} />;
}
