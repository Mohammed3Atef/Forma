import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TagInput } from '@/components/TagInput';
import { TextAreaField, TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Icon } from '@/components/Icon';
import { EXERCISE_PRESETS } from '@/lib/workoutPresets';
import { parseDecimal } from '@/lib/utils';
import { isBunnyConfigured, uploadFileToBunny, UploadError } from '@/services/platform/bunnyUploadApi';
import { alertDialog } from '@/stores/dialogStore';
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
  pending = false,
  coachId,
}: {
  initial: Exercise;
  onSave: (ex: Exercise) => void;
  saveLabel?: string;
  extra?: React.ReactNode;
  /** Mutation-in-flight state from the caller — this form has no mutation of its own. */
  pending?: boolean;
  /** When provided (and Bunny is configured), shows an "Upload video" button next to the URL field. */
  coachId?: string;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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

  const canUpload = !!coachId && isBunnyConfigured();
  const onPickVideo = async (file: File | undefined) => {
    if (!file || !coachId) return;
    setUploading(true);
    try {
      const { url } = await uploadFileToBunny(file, { folder: `Forma/${coachId}/exercises` });
      setF((cur) => ({ ...cur, videoUrl: url }));
    } catch (e) {
      await alertDialog({ title: t('coachEditor.videoUrl'), message: t(`upload.${e instanceof UploadError ? e.code : 'failed'}`) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
      <TextInput label={t('field.name')} data-testid="ex-name" placeholder={t('coachEditor.exerciseName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <TextInput label={t('field.muscle')} data-testid="ex-target" placeholder={t('coachEditor.targetMuscle')} value={f.targetMuscle} onChange={(e) => setF({ ...f, targetMuscle: e.target.value })} />
        <TextInput label={t('field.category')} placeholder={t('coachLib.category')} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
      </div>
      <TextInput label={t('field.equipment')} placeholder={t('coachLib.equipment')} value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} />

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

      <div>
        <TextInput label={t('field.videoUrl')} data-testid="ex-video" placeholder={t('coachEditor.videoUrl')} value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} />
        {canUpload && (
          <>
            <button type="button" className="chip mt-1.5 flex items-center gap-1.5" data-testid="ex-video-upload" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Icon name="rotate" size={14} className="animate-spin" /> : <Icon name="video" size={14} />}
              {uploading ? t('upload.uploading') : t('coachEditor.uploadVideo')}
            </button>
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => void onPickVideo(e.target.files?.[0])} />
          </>
        )}
      </div>
      <TextAreaField label={t('field.notes')} className="min-h-20" data-testid="ex-notes" placeholder={t('coachEditor.instructions')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <TextAreaField label={t('coachEditor.progression')} className="min-h-16" value={f.progressionNotes} onChange={(e) => setF({ ...f, progressionNotes: e.target.value })} />
      <div>
        <div className="label mb-1.5">{t('coachLib.tags')}</div>
        <TagInput values={f.tags} onChange={(v) => setF({ ...f, tags: v })} placeholder={t('coachLib.tagsPlaceholder')} />
      </div>

      {extra}

      <SubmitButton type="button" data-testid="ex-save" disabled={!f.name.trim()} pending={pending} onClick={save} fullWidth>
        {saveLabel ?? t('common.save')}
      </SubmitButton>
    </div>
  );
}
