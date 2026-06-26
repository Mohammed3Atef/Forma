import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TagInput } from '@/components/TagInput';
import { EXERCISE_PRESETS } from '@/lib/workoutPresets';
import { parseDecimal } from '@/lib/utils';
import type { Exercise } from '@/types';

/**
 * Controlled editor for a single exercise's details, used inside a bottom sheet
 * (quick-create + edit). Quick presets fill set/rep/rest but everything stays
 * editable. Calls `onSave` with the assembled Exercise (id preserved).
 */
export function ExerciseForm({
  initial,
  onSave,
  saveLabel,
  extra,
}: {
  initial: Exercise;
  onSave: (ex: Exercise) => void;
  saveLabel?: string;
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    name: initial.name,
    targetMuscle: initial.targetMuscle,
    category: initial.category ?? '',
    equipment: initial.equipment ?? '',
    warmupSets: String(initial.warmupSetCount ?? (Number(initial.warmupSets) || 0)),
    workingSets: String(initial.workingSets),
    repRange: initial.repRange,
    restSec: String(initial.restSec),
    videoUrl: initial.videoUrl ?? '',
    notes: initial.notes.en,
    progressionNotes: initial.progressionNotes ?? '',
    tags: initial.tags ?? [],
  });

  // Set counts stay integer (they render N set rows); rest seconds allow decimals.
  const int = (s: string) => Math.max(0, Math.round(parseDecimal(s)));
  const dec = (s: string) => Math.max(0, parseDecimal(s));
  const applyPreset = (p: (typeof EXERCISE_PRESETS)[number]) =>
    setF((cur) => ({ ...cur, warmupSets: String(p.warmupSetCount), workingSets: String(p.workingSets), repRange: p.repRange, restSec: String(p.restSec) }));

  const save = () => {
    const warmupSetCount = int(f.warmupSets);
    onSave({
      ...initial,
      name: f.name.trim(),
      targetMuscle: f.targetMuscle.trim(),
      category: f.category.trim() || undefined,
      equipment: f.equipment.trim() || undefined,
      warmupSets: String(warmupSetCount),
      warmupSetCount,
      workingSets: int(f.workingSets),
      repRange: f.repRange.trim(),
      restSec: dec(f.restSec),
      videoUrl: f.videoUrl.trim() || null,
      notes: { en: f.notes.trim(), ar: f.notes.trim() },
      progressionNotes: f.progressionNotes.trim() || undefined,
      tags: f.tags,
    });
  };

  return (
    <div className="space-y-3" data-testid="exercise-form">
      <input className="input" data-testid="ex-name" placeholder={t('coachEditor.exerciseName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input" data-testid="ex-target" placeholder={t('coachEditor.targetMuscle')} value={f.targetMuscle} onChange={(e) => setF({ ...f, targetMuscle: e.target.value })} />
        <input className="input" placeholder={t('coachLib.category')} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
      </div>
      <input className="input" placeholder={t('coachLib.equipment')} value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} />

      <div>
        <div className="label mb-1.5">{t('coachEditor.presets')}</div>
        <div className="flex flex-wrap gap-2">
          {EXERCISE_PRESETS.map((p) => (
            <button key={p.key} type="button" className="chip" data-testid={`preset-${p.key}`} onClick={() => applyPreset(p)}>
              {t(`coachEditor.presetNames.${p.key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('coachEditor.warmupSets')}</label>
          <input className="input" data-testid="ex-warmup-sets" inputMode="numeric" value={f.warmupSets} onChange={(e) => setF({ ...f, warmupSets: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('coachEditor.workingSets')}</label>
          <input className="input" data-testid="ex-working-sets" inputMode="numeric" value={f.workingSets} onChange={(e) => setF({ ...f, workingSets: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('coachEditor.reps')}</label>
          <input className="input" data-testid="ex-reps" value={f.repRange} onChange={(e) => setF({ ...f, repRange: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('coachEditor.restSec')}</label>
          <input className="input" data-testid="ex-rest" inputMode="decimal" value={f.restSec} onChange={(e) => setF({ ...f, restSec: e.target.value })} />
        </div>
      </div>
      <p className="text-[12px] text-earth-subtle">{t('coachEditor.setsHint')}</p>

      <input className="input" data-testid="ex-video" placeholder={t('coachEditor.videoUrl')} value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} />
      <textarea className="input min-h-20" data-testid="ex-notes" placeholder={t('coachEditor.instructions')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <textarea className="input min-h-16" placeholder={t('coachEditor.progression')} value={f.progressionNotes} onChange={(e) => setF({ ...f, progressionNotes: e.target.value })} />
      <div>
        <div className="label mb-1.5">{t('coachLib.tags')}</div>
        <TagInput values={f.tags} onChange={(v) => setF({ ...f, tags: v })} placeholder={t('coachLib.tagsPlaceholder')} />
      </div>

      {extra}

      <button type="button" data-testid="ex-save" disabled={!f.name.trim()} onClick={save} className="btn-primary w-full disabled:opacity-40">
        {saveLabel ?? t('common.save')}
      </button>
    </div>
  );
}
