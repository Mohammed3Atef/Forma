import { useRef, useState } from 'react';
import { isPlayableVideoUrl } from '@/lib/videoSource';
import { useTranslation } from 'react-i18next';
import { TagInput } from '@/components/TagInput';
import { TextAreaField, TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Icon } from '@/components/Icon';
import { EXERCISE_PRESETS } from '@/lib/workoutPresets';
import { uploadFile, useUploadConfigured, UploadError } from '@/services/platform/mediaApi';
import { alertDialog } from '@/stores/dialogStore';
import type { Exercise } from '@/types';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { applyLocalizedEdit, localizedEqual, secondLanguageStale, setLocalized } from '@/lib/localizedText';

/**
 * Controlled editor for one library exercise (quick-create in the picker, edit in the Library).
 * B3.7 / CO-26-R — metadata first, in this order: what the exercise is (name, muscle, equipment,
 * category, tags), its demo, how to do it (instructions EN / AR), then the defaults a plan starts
 * from (presets, sets, reps, rest, progression). Same fields as before; numbers accept Arabic
 * digits. Calls `onSave` with the assembled Exercise (id and every untouched field preserved).
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
  /** When provided (and media uploads are configured), shows an "Upload video" button next to the URL field. */
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
    warmupSets: (initial.warmupSetCount ?? (Number(initial.warmupSets) || 0)) as number | null,
    workingSets: (Number(initial.workingSets) || 0) as number | null,
    repRange: initial.repRange,
    restSec: (Number(initial.restSec) || 0) as number | null,
    videoUrl: initial.videoUrl ?? '',
    notes: initial.notes.en,
    notesAr: initial.notes.ar ?? '',
    notesArTouched: false,
    progressionNotes: initial.progressionNotes ?? '',
    tags: initial.tags ?? [],
  });

  // Set counts stay integer (they render N set rows); rest seconds allow decimals.
  const int = (n: number | null) => Math.max(0, Math.round(n ?? 0));
  const dec = (n: number | null) => Math.max(0, n ?? 0);
  const applyPreset = (p: (typeof EXERCISE_PRESETS)[number]) =>
    setF((cur) => ({ ...cur, warmupSets: p.warmupSetCount, workingSets: p.workingSets, repRange: p.repRange, restSec: p.restSec }));

  const uploadsConfigured = useUploadConfigured();
  const canUpload = !!coachId && uploadsConfigured;
  const onPickVideo = async (file: File | undefined) => {
    if (!file || !coachId) return;
    setUploading(true);
    try {
      // Stored under the signed-in coach's own `exercises/` folder (server-derived).
      const { url } = await uploadFile(file, { category: 'exercise' });
      setF((cur) => ({ ...cur, videoUrl: url }));
    } catch (e) {
      await alertDialog({ title: t('coachEditor.videoUrl'), message: t(`upload.${e instanceof UploadError ? e.code : 'failed'}`) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Only links that can actually play inside Forma (B0 / CL-20, MD-09).
  const videoInvalid = !!f.videoUrl.trim() && !isPlayableVideoUrl(f.videoUrl);
  const save = () => {
    if (videoInvalid) return;
    const warmupSetCount = int(f.warmupSets);
    // Untouched fields keep their ORIGINAL value exactly (B1.8 / EX-06): a
    // normalised copy (trimmed name, `null` for an absent link, the English
    // notes copied into Arabic) used to look like an edit of a library field and
    // silently detached the exercise from the library.
    const keep = <T,>(orig: T, next: T, same: boolean): T => (same ? orig : next);
    const opt = (v: string | undefined | null) => v?.trim() || undefined;
    // The Arabic notes are kept unless the coach edits them (or they were only a copy of the English).
    const notes = f.notesArTouched ? setLocalized(f.notes, f.notesAr) : applyLocalizedEdit(initial.notes, f.notes, 'en');
    onSave({
      ...initial,
      name: keep(initial.name, f.name.trim(), f.name.trim() === (initial.name ?? '').trim()),
      targetMuscle: keep(initial.targetMuscle, f.targetMuscle.trim(), f.targetMuscle.trim() === (initial.targetMuscle ?? '').trim()),
      category: keep(initial.category, opt(f.category), opt(f.category) === opt(initial.category)),
      equipment: keep(initial.equipment, opt(f.equipment), opt(f.equipment) === opt(initial.equipment)),
      warmupSets: String(warmupSetCount),
      warmupSetCount,
      workingSets: int(f.workingSets),
      repRange: f.repRange.trim(),
      restSec: dec(f.restSec),
      videoUrl: keep(initial.videoUrl, f.videoUrl.trim() || null, (f.videoUrl.trim() || null) === (initial.videoUrl?.trim() || null)),
      notes: keep(initial.notes, notes, localizedEqual(notes, initial.notes)),
      progressionNotes: f.progressionNotes.trim() || undefined,
      tags: f.tags,
    });
  };

  const group = (title: string, children: React.ReactNode, hint?: string) => (
    <fieldset className="space-y-3 rounded-ui-surface border border-line-soft p-3.5">
      <legend className="px-1 text-[12px] font-semibold uppercase tracking-wide text-earth-subtle">{title}</legend>
      {hint ? <p className="-mt-1 text-[12.5px] text-earth-subtle">{hint}</p> : null}
      {children}
    </fieldset>
  );

  return (
    <div className="space-y-4" data-testid="exercise-form">
      {group(
        t('library.form.about'),
        <>
          <TextInput label={t('field.name')} data-testid="ex-name" placeholder={t('coachEditor.exerciseName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} dir="auto" />
          <div className="grid grid-cols-2 gap-2">
            <TextInput label={t('field.muscle')} data-testid="ex-target" placeholder={t('coachEditor.targetMuscle')} value={f.targetMuscle} onChange={(e) => setF({ ...f, targetMuscle: e.target.value })} dir="auto" />
            <TextInput label={t('field.equipment')} data-testid="ex-equipment" placeholder={t('library.form.equipmentHint')} value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} dir="auto" />
          </div>
          <TextInput label={t('field.category')} data-testid="ex-category" placeholder={t('library.form.categoryHint')} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} dir="auto" />
          <div>
            <div className="label mb-1.5">{t('coachLib.tags')}</div>
            <TagInput values={f.tags} onChange={(v) => setF({ ...f, tags: v })} placeholder={t('coachLib.tagsPlaceholder')} />
          </div>
        </>,
      )}

      {group(
        t('library.form.demo'),
        <div>
          <TextInput label={t('field.videoUrl')} data-testid="ex-video" placeholder={t('coachEditor.videoUrl')} value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} dir="ltr" />
          {videoInvalid && (
            <p className="mt-1 text-[12px] text-danger" role="alert" data-testid="ex-video-invalid">
              {t('trust.video.coachInvalid')}
            </p>
          )}
          {canUpload && (
            <>
              <button type="button" className="chip mt-1.5 flex items-center gap-1.5" data-testid="ex-video-upload" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Icon name="rotate" size={14} className="animate-spin" /> : <Icon name="video" size={14} />}
                {uploading ? t('upload.uploading') : t('coachEditor.uploadVideo')}
              </button>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => void onPickVideo(e.target.files?.[0])} />
            </>
          )}
        </div>,
        t('library.form.demoHint'),
      )}

      {group(
        t('coachEditor.instructions'),
        <>
          <TextAreaField label={t('field.notes')} className="min-h-20" data-testid="ex-notes" placeholder={t('coachEditor.instructions')} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} dir="auto" />
          <SecondLanguageField lang="ar" multiline testId="ex-notes-ar" value={f.notesAr} onChange={(v) => setF({ ...f, notesAr: v, notesArTouched: true })} stale={!f.notesArTouched && secondLanguageStale(initial.notes, f.notes, 'en')} />
        </>,
      )}

      {group(
        t('library.defaults'),
        <>
          <div className="flex flex-wrap gap-2">
            {EXERCISE_PRESETS.map((p) => (
              <button key={p.key} type="button" className="chip" data-testid={`preset-${p.key}`} onClick={() => applyPreset(p)}>
                {t(`coachEditor.presetNames.${p.key}`)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumericField label={t('coachEditor.warmupSets')} testId="ex-warmup-sets" integer min={0} max={20} value={f.warmupSets} onChange={(v) => setF({ ...f, warmupSets: v })} />
            <NumericField label={t('coachEditor.workingSets')} testId="ex-working-sets" integer min={0} max={50} value={f.workingSets} onChange={(v) => setF({ ...f, workingSets: v })} />
            <TextInput label={t('coachEditor.reps')} data-testid="ex-reps" value={f.repRange} onChange={(e) => setF({ ...f, repRange: e.target.value })} dir="ltr" />
            <NumericField label={t('coachEditor.restSec')} testId="ex-rest" min={0} max={3600} value={f.restSec} onChange={(v) => setF({ ...f, restSec: v })} />
          </div>
          <TextAreaField label={t('coachEditor.progression')} className="min-h-16" data-testid="ex-progression" value={f.progressionNotes} onChange={(e) => setF({ ...f, progressionNotes: e.target.value })} dir="auto" />
        </>,
        t('library.form.defaultsHint'),
      )}

      {extra}

      <SubmitButton type="button" data-testid="ex-save" disabled={!f.name.trim() || videoInvalid} pending={pending} onClick={save} fullWidth>
        {saveLabel ?? t('common.save')}
      </SubmitButton>
    </div>
  );
}
