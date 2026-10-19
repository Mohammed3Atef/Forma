import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SelectField } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/ErrorState';
import { ExerciseForm } from './ExerciseForm';
import { blankExercise, pickFromLibrary } from '@/lib/workoutPresets';
import { listExercises, saveExercise } from '@/services/platform/coachAssetsApi';
import { parseDecimal } from '@/lib/utils';
import type { Exercise } from '@/types';

const RECENT_MAX = 12;
const recentKey = (coachId: string) => `forma.recentExercises.v1.${coachId}`;
function readRecent(coachId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(recentKey(coachId)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function writeRecent(coachId: string, ids: string[]): void {
  try {
    const next = [...new Set([...ids, ...readRecent(coachId)])].slice(0, RECENT_MAX);
    localStorage.setItem(recentKey(coachId), JSON.stringify(next));
  } catch {
    /* storage unavailable — recents just aren't remembered */
  }
}
const distinct = (values: (string | undefined)[]) => [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));

/**
 * Add exercises from the coach's library (B3.5, blueprint §6.4): search with muscle / equipment
 * filters, a media indicator, "Recently used" first, and "Create new" as the last row.
 * Multi-select with optional shared sets / reps / rest, inserted in one action. A library that
 * fails to load says so with Retry — never "your library is empty".
 */
export function ExercisePickerSheet({
  open,
  onClose,
  coachId,
  onPickMany,
}: {
  open: boolean;
  onClose: () => void;
  coachId: string;
  onPickMany: (exs: Exercise[]) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [selected, setSelected] = useState<Map<string, Exercise>>(new Map());
  const [useDefaults, setUseDefaults] = useState(false);
  const [defaults, setDefaults] = useState({ workingSets: '3', repRange: '8-12', restSec: '90' });

  const lib = useQuery({ queryKey: ['exerciseLibrary', coachId], queryFn: () => listExercises(coachId), enabled: open && !!coachId });
  const all = useMemo(() => lib.data ?? [], [lib.data]);
  const muscles = useMemo(() => distinct(all.map((e) => e.targetMuscle)), [all]);
  const equipments = useMemo(() => distinct(all.map((e) => e.equipment)), [all]);
  const recent = useMemo(() => {
    if (!open) return [];
    const byId = new Map(all.map((e) => [e.id, e]));
    return readRecent(coachId).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }, [all, coachId, open]);

  const filtering = !!search.trim() || !!muscle || !!equipment;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (e) =>
        (!muscle || e.targetMuscle?.trim() === muscle) &&
        (!equipment || e.equipment?.trim() === equipment) &&
        (!q || e.name.toLowerCase().includes(q) || e.targetMuscle.toLowerCase().includes(q) || (e.category ?? '').toLowerCase().includes(q) || (e.tags ?? []).some((tg) => tg.toLowerCase().includes(q))),
    );
  }, [all, search, muscle, equipment]);
  // A library can run to hundreds of rows: render a capped window and ask for a narrower search.
  const PICKER_RENDER_CAP = 50;
  const visible = filtered.slice(0, PICKER_RENDER_CAP);

  const toggle = (ex: Exercise) =>
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(ex.id)) next.delete(ex.id);
      else next.set(ex.id, ex);
      return next;
    });

  const reset = () => {
    setSelected(new Map());
    setUseDefaults(false);
    setSearch('');
    setMuscle('');
    setEquipment('');
    setMode('list');
  };

  const confirmAdd = () => {
    if (selected.size === 0) return;
    const override = useDefaults
      ? { workingSets: Math.max(0, Math.round(parseDecimal(defaults.workingSets))), repRange: defaults.repRange.trim(), restSec: Math.max(0, parseDecimal(defaults.restSec)) }
      : null;
    const exs = [...selected.values()].map((libEx) => {
      const copy = pickFromLibrary(libEx);
      if (override) {
        copy.workingSets = override.workingSets;
        copy.repRange = override.repRange || copy.repRange;
        copy.restSec = override.restSec;
      }
      return copy;
    });
    writeRecent(coachId, [...selected.keys()]);
    onPickMany(exs);
    reset();
    onClose();
  };

  const create = useMutation({
    mutationFn: (ex: Exercise) => saveExercise(coachId, ex),
    onSuccess: (_v, ex) => {
      void qc.invalidateQueries({ queryKey: ['exerciseLibrary', coachId] });
      writeRecent(coachId, [ex.id]);
      onPickMany([pickFromLibrary(ex)]); // add a library-linked copy to the plan
      setMode('list');
    },
  });

  const row = (ex: Exercise) => {
    const isSel = selected.has(ex.id);
    const hasMedia = !!ex.videoUrl || !!ex.imageUrl || (ex.images?.length ?? 0) > 0;
    return (
      <button key={ex.id} type="button" data-testid="picker-lib-item" aria-pressed={isSel} className={`row min-h-ui-hit w-full text-start ${isSel ? 'bg-brand/10' : ''}`} onClick={() => toggle(ex)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            <bdi>{ex.name}</bdi>
          </span>
          <span className="block truncate text-[12px] text-earth-subtle">{[ex.targetMuscle, ex.equipment].filter(Boolean).join(' · ') || t('coachLib.noMeta')}</span>
        </span>
        {hasMedia && (
          <span className="shrink-0 text-earth-subtle" title={t('coachEditor.hasMedia')} data-testid="picker-media">
            <Icon name="video" size={16} />
            <span className="sr-only">{t('coachEditor.hasMedia')}</span>
          </span>
        )}
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${isSel ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`}>{isSel && <Icon name="check" size={14} />}</span>
      </button>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      onBack={mode === 'create' ? () => setMode('list') : undefined}
      title={mode === 'create' ? t('coachEditor.quickCreate') : t('coachEditor.addExercise')}
      footer={
        mode === 'list' ? (
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[13px] text-earth-muted" data-testid="picker-selected-count">
              {t('coachEditor.nSelected', { n: selected.size })}
            </span>
            <SubmitButton type="button" data-testid="picker-add-selected" disabled={selected.size === 0} onClick={confirmAdd}>
              {t('coachEditor.addNExercises', { n: selected.size })}
            </SubmitButton>
          </div>
        ) : undefined
      }
    >
      {mode === 'list' ? (
        <div className="space-y-3" data-testid="exercise-picker">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
              <Icon name="search" size={18} />
            </span>
            <input className="input ps-10" data-testid="picker-search" aria-label={t('coachEditor.searchLibrary')} placeholder={t('coachEditor.searchLibrary')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {(muscles.length > 0 || equipments.length > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <SelectField label={t('field.muscle')} data-testid="picker-muscle" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
                <option value="">{t('coachEditor.anyMuscle')}</option>
                {muscles.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </SelectField>
              <SelectField label={t('field.equipment')} data-testid="picker-equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                <option value="">{t('coachEditor.anyEquipment')}</option>
                {equipments.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </SelectField>
            </div>
          )}

          {/* Shared defaults for the whole batch — each exercise keeps its own sets/reps/rest unless enabled. */}
          <div className="rounded-xl border border-line-soft p-3">
            <label className="flex min-h-ui-hit items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={useDefaults} onChange={(e) => setUseDefaults(e.target.checked)} data-testid="picker-use-defaults" />
              {t('coachEditor.applyDefaultsToAll')}
            </label>
            {useDefaults && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className="label" htmlFor="picker-def-sets">{t('coachEditor.workingSets')}</label>
                  <input id="picker-def-sets" className="input" inputMode="numeric" value={defaults.workingSets} onChange={(e) => setDefaults({ ...defaults, workingSets: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="picker-def-reps">{t('coachEditor.reps')}</label>
                  <input id="picker-def-reps" className="input" value={defaults.repRange} onChange={(e) => setDefaults({ ...defaults, repRange: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="picker-def-rest">{t('coachEditor.restSec')}</label>
                  <input id="picker-def-rest" className="input" inputMode="decimal" value={defaults.restSec} onChange={(e) => setDefaults({ ...defaults, restSec: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          {lib.isLoading ? (
            <p className="py-6 text-center text-sm text-earth-muted">{t('auth.working')}</p>
          ) : lib.isError ? (
            <ErrorState message={t('coachEditor.libraryLoadFailed')} onRetry={() => void lib.refetch()} testId="picker-error" />
          ) : (
            <>
              {!filtering && recent.length > 0 && (
                <section data-testid="picker-recent">
                  <h3 className="label mb-1.5">{t('coachEditor.recentlyUsed')}</h3>
                  <div className="card divide-y divide-line-soft">{recent.map(row)}</div>
                </section>
              )}
              {filtered.length > 0 ? (
                <section>
                  {!filtering && recent.length > 0 && <h3 className="label mb-1.5">{t('coachEditor.allExercises')}</h3>}
                  <div className="card divide-y divide-line-soft">{visible.map(row)}</div>
                </section>
              ) : (
                <p className="py-4 text-center text-sm text-earth-muted">{filtering ? t('coachLib.noResults') : t('coachLib.empty')}</p>
              )}
              {filtered.length > PICKER_RENDER_CAP && <p className="text-center text-[12px] text-earth-subtle">{t('coachEditor.pickerTruncated', { shown: visible.length, total: filtered.length })}</p>}
              <button type="button" className="row min-h-ui-hit w-full rounded-ui-control border border-dashed border-line text-start" data-testid="picker-quick-create" onClick={() => setMode('create')}>
                <Icon name="plus" size={18} className="text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t('coachEditor.createNewExercise')}</span>
                  <span className="block text-[12px] text-earth-subtle">{t('coachEditor.createNewHint')}</span>
                </span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <ExerciseForm initial={blankExercise()} saveLabel={t('coachEditor.addExercise')} onSave={(ex) => create.mutate(ex)} pending={create.isPending} coachId={coachId} />
          {create.isError && (
            <p className="text-sm text-danger" role="alert" data-testid="picker-create-failed">
              {t('coachEditor.createExerciseFailed')}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
