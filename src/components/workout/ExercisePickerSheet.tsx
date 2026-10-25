import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { LoadingState } from '@/components/ui/LoadingState';
import { ExerciseForm } from './ExerciseForm';
import { LibraryExerciseBrowser, exerciseRowKey } from '@/components/library/LibraryExerciseBrowser';
import { LazyCatalogExercisePreview } from '@/components/catalog/LazyCatalog';
import { blankExercise, pickFromLibrary } from '@/lib/workoutPresets';
import { planExercisesFrom } from '@/lib/libraryUse';
import { saveExercise } from '@/services/platform/coachAssetsApi';
import { LIBRARY_KEY, type LibraryExerciseRow } from '@/services/platform/libraryApi';
import { useCatalogMeta } from '@/hooks/useCatalog';
import { parseDecimal } from '@/lib/utils';
import type { Exercise } from '@/types';

/**
 * Add exercises to a plan or template (B3.5, blueprint §6.4; B4.3): the coach's ONE library — Forma's
 * exercises and their own, together (All · Favourites · My exercises), searched in English, Arabic
 * and Egyptian gym words, with muscle / equipment / demonstration filters. Multi-select with optional
 * shared sets / reps / rest, inserted in one action; "Create new" is the last row.
 *
 * Picked Forma exercises are fetched in full and copied (names, steps, media, credits) — no "save to
 * my library" first; the coach's own exercises go in library-linked (`libraryUse.planExercisesFrom`).
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
  const catalog = useCatalogMeta();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [selected, setSelected] = useState<Map<string, LibraryExerciseRow>>(new Map());
  const [preview, setPreview] = useState<Extract<LibraryExerciseRow, { kind: 'shared' }> | null>(null);
  const [useDefaults, setUseDefaults] = useState(false);
  const [defaults, setDefaults] = useState({ workingSets: '3', repRange: '8-12', restSec: '90' });

  const toggle = (row: LibraryExerciseRow) =>
    setSelected((cur) => {
      const next = new Map(cur);
      const key = exerciseRowKey(row);
      if (next.has(key)) next.delete(key);
      else next.set(key, row);
      return next;
    });

  const reset = () => {
    setSelected(new Map());
    setPreview(null);
    setUseDefaults(false);
    setMode('list');
  };

  const add = useMutation({
    mutationFn: () => planExercisesFrom([...selected.values()], catalog.taxonomy!),
    onSuccess: (copies) => {
      if (!copies.length) return;
      const override = useDefaults
        ? { workingSets: Math.max(0, Math.round(parseDecimal(defaults.workingSets))), repRange: defaults.repRange.trim(), restSec: Math.max(0, parseDecimal(defaults.restSec)) }
        : null;
      onPickMany(
        copies.map((copy) => {
          if (override) {
            copy.workingSets = override.workingSets;
            copy.repRange = override.repRange || copy.repRange;
            copy.restSec = override.restSec;
          }
          return copy;
        }),
      );
      reset();
      onClose();
    },
  });

  const create = useMutation({
    mutationFn: (ex: Exercise) => saveExercise(coachId, ex),
    onSuccess: (_v, ex) => {
      void qc.invalidateQueries({ queryKey: LIBRARY_KEY });
      onPickMany([pickFromLibrary(ex)]); // add a library-linked copy to the plan
      setMode('list');
    },
  });

  const total = selected.size;
  const previewKey = preview ? exerciseRowKey(preview) : '';

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      onBack={mode === 'create' ? () => setMode('list') : preview ? () => setPreview(null) : undefined}
      title={mode === 'create' ? t('coachEditor.quickCreate') : preview ? t('catalog.preview') : t('coachEditor.addExercise')}
      footer={
        mode === 'list' ? (
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[13px] text-earth-muted" data-testid="picker-selected-count">
              {add.isError ? (
                <span className="text-danger-text" role="alert" data-testid="picker-add-failed">
                  {t('catalog.addFailed')}
                </span>
              ) : (
                t('coachEditor.nSelected', { n: total })
              )}
            </span>
            <SubmitButton type="button" data-testid="picker-add-selected" disabled={total === 0 || !catalog.taxonomy} pending={add.isPending} onClick={() => add.mutate()}>
              {t('coachEditor.addNExercises', { n: total })}
            </SubmitButton>
          </div>
        ) : undefined
      }
    >
      {mode === 'list' && preview && catalog.taxonomy ? (
        <LazyCatalogExercisePreview
          id={preview.id}
          taxonomy={catalog.taxonomy}
          actions={() => (
            <SubmitButton type="button" variant={selected.has(previewKey) ? 'secondary' : 'primary'} data-testid="catalog-preview-select" aria-pressed={selected.has(previewKey)} onClick={() => toggle(preview)}>
              {selected.has(previewKey) ? t('catalog.selected') : t('catalog.select')}
            </SubmitButton>
          )}
        />
      ) : mode === 'list' ? (
        <div className="space-y-3" data-testid="exercise-picker">
          {/* Shared defaults for the whole batch — each exercise keeps its own sets/reps/rest unless enabled. */}
          <div className="rounded-xl border border-line-soft p-3">
            <label className="flex min-h-ui-hit items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={useDefaults} onChange={(e) => setUseDefaults(e.target.checked)} data-testid="picker-use-defaults" />
              {t('coachEditor.applyDefaultsToAll')}
            </label>
            {useDefaults && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className="label" htmlFor="picker-def-sets">
                    {t('coachEditor.workingSets')}
                  </label>
                  <input id="picker-def-sets" className="input" inputMode="numeric" value={defaults.workingSets} onChange={(e) => setDefaults({ ...defaults, workingSets: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="picker-def-reps">
                    {t('coachEditor.reps')}
                  </label>
                  <input id="picker-def-reps" className="input" value={defaults.repRange} onChange={(e) => setDefaults({ ...defaults, repRange: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="picker-def-rest">
                    {t('coachEditor.restSec')}
                  </label>
                  <input id="picker-def-rest" className="input" inputMode="decimal" value={defaults.restSec} onChange={(e) => setDefaults({ ...defaults, restSec: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          {catalog.taxonomy ? (
            <LibraryExerciseBrowser
              taxonomy={catalog.taxonomy}
              mode="pick"
              selected={new Set(selected.keys())}
              onToggle={toggle}
              onOpen={(r) => r.kind === 'shared' && setPreview(r)}
              testId="picker-library"
            />
          ) : (
            <LoadingState count={3} />
          )}
          {/* "Create new" is always the last row. */}
          <button type="button" className="row min-h-ui-hit w-full rounded-ui-control border border-dashed border-line text-start" data-testid="picker-quick-create" onClick={() => setMode('create')}>
            <Icon name="plus" size={18} className="text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t('coachEditor.createNewExercise')}</span>
              <span className="block text-[12px] text-earth-subtle">{t('coachEditor.createNewHint')}</span>
            </span>
          </button>
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
