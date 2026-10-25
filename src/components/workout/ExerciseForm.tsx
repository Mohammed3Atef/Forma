import { useRef, useState } from 'react';
import { isPlayableVideoUrl } from '@/lib/videoSource';
import { useTranslation } from 'react-i18next';
import { TagInput } from '@/components/TagInput';
import { TextAreaField, TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Icon } from '@/components/Icon';
import { EXERCISE_PRESETS } from '@/lib/workoutPresets';
import { uploadExercisePicture, uploadFile, useUploadConfigured, UploadError } from '@/services/platform/mediaApi';
import { FoodPhotoError, prepareDemoPicture } from '@/lib/foodImageProcess';
import { ExerciseThumb } from '@/components/library/ExerciseThumb';
import { Button } from '@/components/ui/Button';
import { alertDialog } from '@/stores/dialogStore';
import type { CatalogInstructionSet, Exercise, MediaCredit } from '@/types';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { applyLocalizedEdit, localizedEqual, secondLanguageStale, setLocalized } from '@/lib/localizedText';

/**
 * Controlled editor for one library exercise (quick-create in the picker, edit in the Library).
 * B3.7 / CO-26-R — metadata first, in this order: what the exercise is (name, muscle, equipment,
 * category, tags), its demo, how to do it (instructions EN / AR), then the defaults a plan starts
 * from (presets, sets, reps, rest, progression). Same fields as before; numbers accept Arabic
 * digits. Calls `onSave` with the assembled Exercise (id and every untouched field preserved).
 *
 * B4.2 — the coach's own copy can be customised: a picture (upload a still or a GIF, or a link; or
 * remove it), the video link / upload, and the steps in English and Arabic. A copy of a catalog
 * exercise keeps its original demonstration (`sourceMedia`): "Restore the original" brings it back.
 * The shared catalog itself is never changed. Credits follow the media that is actually shown.
 */
const EMPTY_SET: CatalogInstructionSet = { setup: [], steps: [], cues: [], mistakes: [], safety: [] };
const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
const sameList = (a: string[] | undefined, b: string[] | undefined) => (a ?? []).join('\n') === (b ?? []).join('\n');
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
    imageUrl: initial.imageUrl ?? '',
    thumbUrl: initial.thumbUrl ?? null,
    stepsEn: (initial.instructions?.en.steps ?? []).join('\n'),
    stepsAr: (initial.instructions?.ar?.steps ?? []).join('\n'),
  });
  const [picturing, setPicturing] = useState(false);
  const pictureRef = useRef<HTMLInputElement>(null);
  const source = initial.sourceMedia;
  const mediaChanged = !!source && ((f.imageUrl || null) !== source.imageUrl || (f.videoUrl.trim() || null) !== source.videoUrl);

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

  const onPickPicture = async (file: File | undefined) => {
    if (!file || !coachId) return;
    setPicturing(true);
    try {
      // A still is scaled and re-encoded on the device; a GIF is kept (its frames are the demonstration).
      const { url, thumbUrl } = await uploadExercisePicture(await prepareDemoPicture(file));
      setF((cur) => ({ ...cur, imageUrl: url, thumbUrl }));
    } catch (e) {
      const code = e instanceof FoodPhotoError ? `foodImage.error.${e.code}` : e instanceof UploadError ? `foodImage.error.${['badType', 'badDimensions', 'tooLarge', 'notConfigured', 'forbidden'].includes(e.code) ? e.code : 'failed'}` : 'foodImage.error.failed';
      await alertDialog({ title: t('library.form.picture'), message: t(code) });
    } finally {
      setPicturing(false);
      if (pictureRef.current) pictureRef.current.value = '';
    }
  };
  const restoreOriginal = () =>
    source && setF((cur) => ({ ...cur, imageUrl: source.imageUrl ?? '', thumbUrl: source.thumbUrl, videoUrl: source.videoUrl ?? '' }));

  // Only links that can actually play inside Forma (B0 / CL-20, MD-09).
  const videoInvalid = !!f.videoUrl.trim() && !isPlayableVideoUrl(f.videoUrl);
  // The same links the server accepts (`MediaUrlSchema`): https — or loopback http, the local test CDN.
  const imageInvalid = !!f.imageUrl.trim() && !/^https:\/\/[^\s]+$/i.test(f.imageUrl.trim()) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/[^\s]*$/i.test(f.imageUrl.trim()) && f.imageUrl !== initial.imageUrl;
  const save = () => {
    if (videoInvalid || imageInvalid) return;
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
      ...media(),
      ...steps(),
    });
  };

  /**
   * The picture fields: only what changed is written. An untouched picture keeps its fields exactly
   * (a video-only edit never touches them); a removed picture leaves its fields ABSENT, never null —
   * library sync copies these fields into linked templates (no null there, e2e 22). Credits list only
   * the media still shown, and stay exactly as they were when that list is unchanged.
   */
  function media(): Partial<Exercise> {
    const imageUrl = f.imageUrl.trim() || null;
    const videoUrl = f.videoUrl.trim() || null;
    const imageSame = imageUrl === (initial.imageUrl ?? null) && f.thumbUrl === (initial.thumbUrl ?? null);
    const videoSame = videoUrl === (initial.videoUrl?.trim() || null);
    if (imageSame && videoSame) return {};
    const restored = !!source && imageUrl === source.imageUrl && videoUrl === source.videoUrl;
    const out: Partial<Exercise> = {};
    let images = initial.images ?? [];
    if (!imageSame || restored) {
      images = restored ? source!.images : imageUrl ? (imageUrl === initial.imageUrl ? (initial.images ?? [imageUrl]) : [imageUrl]) : [];
      out.imageUrl = imageUrl ?? undefined;
      out.images = images.length ? images : undefined;
      out.thumbUrl = (restored ? source!.thumbUrl : imageUrl ? f.thumbUrl : null) ?? undefined;
      if (restored) out.videoPosterUrl = source!.videoPosterUrl ?? undefined;
    }
    const shown = new Set([imageUrl, ...images, videoUrl].filter(Boolean) as string[]);
    const pool: MediaCredit[] = [...(initial.mediaCredits ?? []), ...(source?.mediaCredits ?? [])];
    const credits = pool.filter((c, i) => shown.has(c.url) && pool.findIndex((x) => x.url === c.url) === i);
    const sameCredits = credits.length === (initial.mediaCredits ?? []).length && credits.every((c, i) => c.url === initial.mediaCredits![i].url);
    if (!sameCredits) out.mediaCredits = credits.length ? credits : undefined;
    return out;
  }

  /** The steps, edited in either language; a language with no steps stays as it was (Arabic: null when none). */
  function steps(): Partial<Exercise> {
    const en = lines(f.stepsEn);
    const ar = lines(f.stepsAr);
    const cur = initial.instructions;
    if (sameList(en, cur?.en.steps) && sameList(ar, cur?.ar?.steps)) return {};
    if (!en.length && !ar.length && !cur) return {};
    const arChanged = !sameList(ar, cur?.ar?.steps);
    return {
      instructions: {
        en: { ...(cur?.en ?? EMPTY_SET), steps: en },
        // Arabic cleared → no Arabic steps (the reader then sees the English, labelled).
        ar: !arChanged ? (cur?.ar ?? null) : ar.length ? { ...(cur?.ar ?? EMPTY_SET), steps: ar } : null,
      },
    };
  }

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
        <div className="space-y-3">
          <div data-testid="ex-picture">
            <p className="label mb-1.5 block">{t('library.form.picture')}</p>
            <div className="flex items-start gap-3">
              <ExerciseThumb ex={{ thumbUrl: f.thumbUrl, imageUrl: f.imageUrl || null }} size="md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <TextInput label={t('library.form.pictureUrl')} srOnlyLabel data-testid="ex-image-url" placeholder={t('library.form.pictureUrl')} value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value, thumbUrl: null })} dir="ltr" />
                {imageInvalid && (
                  <p className="text-[12px] text-danger" role="alert" data-testid="ex-image-invalid">
                    {t('library.form.pictureInvalid')}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {canUpload && (
                    <Button variant="secondary" size="sm" icon="image" pending={picturing} onClick={() => pictureRef.current?.click()} data-testid="ex-image-upload">
                      {f.imageUrl ? t('library.form.replacePicture') : t('library.form.uploadPicture')}
                    </Button>
                  )}
                  {f.imageUrl && (
                    <Button variant="ghost" size="sm" icon="trash" className="text-danger" onClick={() => setF({ ...f, imageUrl: '', thumbUrl: null })} data-testid="ex-image-remove">
                      {t('library.form.removePicture')}
                    </Button>
                  )}
                  {mediaChanged && (
                    <Button variant="ghost" size="sm" icon="rotate" onClick={restoreOriginal} data-testid="ex-media-restore">
                      {t('library.form.restoreOriginal')}
                    </Button>
                  )}
                </div>
                <input ref={pictureRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => void onPickPicture(e.target.files?.[0])} data-testid="ex-image-file" />
              </div>
            </div>
          </div>
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
          <TextAreaField label={t('library.form.stepsEn')} helper={t('library.form.stepsHint')} className="min-h-24" data-testid="ex-steps-en" value={f.stepsEn} onChange={(e) => setF({ ...f, stepsEn: e.target.value })} dir="ltr" lang="en" />
          <TextAreaField label={t('library.form.stepsAr')} className="min-h-24" data-testid="ex-steps-ar" value={f.stepsAr} onChange={(e) => setF({ ...f, stepsAr: e.target.value })} dir="rtl" lang="ar" />
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

      <SubmitButton type="button" data-testid="ex-save" disabled={!f.name.trim() || videoInvalid || imageInvalid || picturing} pending={pending} onClick={save} fullWidth>
        {saveLabel ?? t('common.save')}
      </SubmitButton>
    </div>
  );
}
