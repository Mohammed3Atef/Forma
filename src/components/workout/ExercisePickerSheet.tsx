import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ExerciseForm } from './ExerciseForm';
import { blankExercise, pickFromLibrary } from '@/lib/workoutPresets';
import { listExercises, saveExercise } from '@/services/platform/coachAssetsApi';
import { parseDecimal } from '@/lib/utils';
import type { Exercise } from '@/types';

/**
 * Bottom sheet to add exercises to a section: search the coach's library,
 * multi-select any number of them (optionally overriding sets/reps/rest for
 * the whole batch), and insert them all in one "Add N exercises" action — the
 * sheet stays open while picking. Quick-create (a brand-new library exercise)
 * is a separate one-at-a-time flow that still adds+closes immediately.
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
  const [selected, setSelected] = useState<Map<string, Exercise>>(new Map());
  const [useDefaults, setUseDefaults] = useState(false);
  const [defaults, setDefaults] = useState({ workingSets: '3', repRange: '8-12', restSec: '90' });

  const lib = useQuery({ queryKey: ['exerciseLibrary', coachId], queryFn: () => listExercises(coachId), enabled: open && !!coachId });

  // PERFORMANCE CLOSEOUT: reasoned about, not blindly optimized (see chat
  // report). This still filters the full local array per keystroke, but the
  // comment below already documents the real scale — "hundreds of rows" —
  // and a substring `.includes()` over a handful of short string fields on a
  // few hundred rows is sub-millisecond; there's no measured or reasoned cost
  // here to justify debouncing/indexing. It's also already `useMemo`'d on
  // `[lib.data, search]`, so it doesn't even re-run on renders that don't
  // change either. Left as-is; add a debounce only if the realistic library
  // size grows by an order of magnitude or more.
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
  // A coach's library (starter set + their own custom exercises) can run to
  // hundreds of rows with no pagination/virtualization in this sheet — cap
  // what's actually rendered and nudge toward a narrower search instead of
  // mounting every match at once. `selected` isn't affected: it's keyed by
  // exercise id, so a previously-picked exercise outside the visible cap
  // stays selected (and shows in the footer's count) even while hidden here.
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
    onPickMany(exs);
    reset();
    onClose();
  };

  const create = useMutation({
    mutationFn: (ex: Exercise) => saveExercise(coachId, ex),
    onSuccess: (_v, ex) => {
      void qc.invalidateQueries({ queryKey: ['exerciseLibrary', coachId] });
      onPickMany([pickFromLibrary(ex)]); // add a library-linked copy to the plan
      setMode('list');
    },
  });

  return (
    <Sheet
      open={open}
      onClose={() => { reset(); onClose(); }}
      size="lg"
      onBack={mode === 'create' ? () => setMode('list') : undefined}
      title={mode === 'create' ? t('coachEditor.quickCreate') : t('coachEditor.addExercise')}
      footer={mode === 'list' ? (
        <div className="flex items-center gap-3">
          <span className="flex-1 text-[13px] text-earth-muted" data-testid="picker-selected-count">
            {t('coachEditor.nSelected', { n: selected.size })}
          </span>
          <SubmitButton type="button" data-testid="picker-add-selected" disabled={selected.size === 0} onClick={confirmAdd}>
            {t('coachEditor.addNExercises', { n: selected.size })}
          </SubmitButton>
        </div>
      ) : undefined}
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

          {/* Shared defaults for the whole batch — leaves each exercise's own baked-in sets/reps/rest untouched unless enabled. */}
          <div className="rounded-xl border border-line-soft p-3">
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={useDefaults} onChange={(e) => setUseDefaults(e.target.checked)} data-testid="picker-use-defaults" />
              {t('coachEditor.applyDefaultsToAll')}
            </label>
            {useDefaults && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className="label">{t('coachEditor.workingSets')}</label>
                  <input className="input" inputMode="numeric" value={defaults.workingSets} onChange={(e) => setDefaults({ ...defaults, workingSets: e.target.value })} />
                </div>
                <div>
                  <label className="label">{t('coachEditor.reps')}</label>
                  <input className="input" value={defaults.repRange} onChange={(e) => setDefaults({ ...defaults, repRange: e.target.value })} />
                </div>
                <div>
                  <label className="label">{t('coachEditor.restSec')}</label>
                  <input className="input" inputMode="decimal" value={defaults.restSec} onChange={(e) => setDefaults({ ...defaults, restSec: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          {lib.isLoading ? (
            <p className="py-6 text-center text-sm text-earth-muted">{t('auth.working')}</p>
          ) : filtered.length ? (
            <div className="card max-h-[45vh] divide-y divide-line-soft overflow-y-auto">
              {visible.map((ex) => {
                const isSel = selected.has(ex.id);
                return (
                  <button
                    key={ex.id}
                    type="button"
                    data-testid="picker-lib-item"
                    aria-pressed={isSel}
                    className={`row w-full text-start ${isSel ? 'bg-brand/10' : ''}`}
                    onClick={() => toggle(ex)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{ex.name}</span>
                      <span className="block truncate text-[12px] text-earth-subtle">
                        {[ex.targetMuscle, ex.equipment].filter(Boolean).join(' · ') || t('coachLib.noMeta')}
                      </span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${isSel ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                      {isSel && <Icon name="check" size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {filtered.length > PICKER_RENDER_CAP && (
            <p className="text-center text-[12px] text-earth-subtle">{t('coachEditor.pickerTruncated', { shown: visible.length, total: filtered.length })}</p>
          )}
          {!lib.isLoading && !filtered.length && (
            <p className="py-6 text-center text-sm text-earth-muted">{search ? t('coachLib.noResults') : t('coachLib.empty')}</p>
          )}
        </div>
      ) : (
        <ExerciseForm initial={blankExercise()} saveLabel={t('coachEditor.addExercise')} onSave={(ex) => create.mutate(ex)} pending={create.isPending} coachId={coachId} />
      )}
    </Sheet>
  );
}
