import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { ExerciseForm } from './ExerciseForm';
import { blankExercise, copyExercise } from '@/lib/workoutPresets';
import { listExercises, saveExercise } from '@/services/platform/coachAssetsApi';
import type { Exercise } from '@/types';

/**
 * Bottom sheet to add an exercise to a section: search the coach's library and
 * tap to add (deep-copied), or quick-create a new one (saved to the library AND
 * added to the plan as an independent copy).
 */
export function ExercisePickerSheet({
  open,
  onClose,
  coachId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  coachId: string;
  onPick: (ex: Exercise) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [search, setSearch] = useState('');

  const lib = useQuery({ queryKey: ['exerciseLibrary', coachId], queryFn: () => listExercises(coachId), enabled: open && !!coachId });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = lib.data ?? [];
    if (!q) return all;
    return all.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.targetMuscle.toLowerCase().includes(q) ||
        (e.category ?? '').toLowerCase().includes(q) ||
        (e.tags ?? []).some((tg) => tg.toLowerCase().includes(q)),
    );
  }, [lib.data, search]);

  const create = useMutation({
    mutationFn: (ex: Exercise) => saveExercise(coachId, ex),
    onSuccess: (_v, ex) => {
      void qc.invalidateQueries({ queryKey: ['exerciseLibrary', coachId] });
      onPick(copyExercise(ex)); // add an independent copy to the plan
      setMode('list');
      onClose();
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      onBack={mode === 'create' ? () => setMode('list') : undefined}
      title={mode === 'create' ? t('coachEditor.quickCreate') : t('coachEditor.addExercise')}
    >
      {mode === 'list' ? (
        <div className="space-y-3" data-testid="exercise-picker">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
              <Icon name="search" size={18} />
            </span>
            <input className="input ps-10" data-testid="picker-search" placeholder={t('coachEditor.searchLibrary')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className="btn-primary w-full" data-testid="picker-quick-create" onClick={() => setMode('create')}>
            <Icon name="plus" size={16} /> {t('coachEditor.quickCreate')}
          </button>
          {lib.isLoading ? (
            <p className="py-6 text-center text-sm text-earth-muted">{t('auth.working')}</p>
          ) : filtered.length ? (
            <div className="card max-h-[50vh] divide-y divide-line-soft overflow-y-auto">
              {filtered.map((ex) => (
                <button key={ex.id} type="button" data-testid="picker-lib-item" className="row w-full text-start" onClick={() => { onPick(copyExercise(ex)); onClose(); }}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{ex.name}</span>
                    <span className="block truncate text-[12px] text-earth-subtle">
                      {[ex.targetMuscle, ex.equipment].filter(Boolean).join(' · ') || t('coachLib.noMeta')}
                    </span>
                  </span>
                  <Icon name="plus" size={18} className="text-brand" />
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-earth-muted">{search ? t('coachLib.noResults') : t('coachLib.empty')}</p>
          )}
        </div>
      ) : (
        <ExerciseForm initial={blankExercise()} saveLabel={t('coachEditor.addExercise')} onSave={(ex) => create.mutate(ex)} />
      )}
    </Sheet>
  );
}
