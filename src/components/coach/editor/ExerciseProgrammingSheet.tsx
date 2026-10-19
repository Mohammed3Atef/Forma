import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { EXERCISE_PRESETS } from '@/lib/workoutPresets';
import { isPlayableVideoUrl } from '@/lib/videoSource';
import { applyLocalizedEdit, localizedEqual, secondLanguageStale, setLocalized } from '@/lib/localizedText';
import { uploadFile, useUploadConfigured, UploadError } from '@/services/platform/mediaApi';
import { alertDialog } from '@/stores/dialogStore';
import { warmupCountOf } from '@/stores/workoutStore';
import type { Exercise } from '@/types';

interface Form {
  name: string;
  warmup: number | null;
  sets: number | null;
  reps: string;
  rest: number | null;
  rir: string;
  tempo: string;
  notes: string;
  notesAr: string;
  notesArTouched: boolean;
  progression: string;
  video: string;
}
const formOf = (ex: Exercise): Form => ({
  name: ex.name ?? '',
  warmup: warmupCountOf(ex),
  sets: ex.workingSets ?? 0,
  reps: ex.repRange ?? '',
  rest: ex.restSec ?? 0,
  rir: ex.rir ?? '',
  tempo: ex.tempo ?? '',
  notes: ex.notes?.en ?? '',
  notesAr: ex.notes?.ar ?? '',
  notesArTouched: false,
  progression: ex.progressionNotes ?? '',
  video: ex.videoUrl ?? '',
});

/**
 * What a coach programs for one exercise of a client's plan or a template (B3.5, blueprint §6.4;
 * CO-26-R, B3-C03 / O-10): sets, warm-up sets, reps, rest, RIR, tempo, notes (English + Arabic),
 * progression notes, video. Library metadata (muscle, category, equipment, tags) is edited only in
 * the Library — it is kept untouched here.
 *
 * Applying changes only the fields the coach changed; every other field (library link, import
 * metadata, images, untouched text) is carried through exactly, so opening and applying never
 * edits anything by itself.
 */
export function ExerciseProgrammingSheet({
  exercise,
  open,
  onClose,
  onApply,
  coachId,
  libraryStatus,
}: {
  exercise: Exercise | null;
  open: boolean;
  onClose: () => void;
  onApply: (ex: Exercise) => void;
  coachId: string;
  /** The library link line ("Linked to library" + Update / Reconnect), when the exercise has one. */
  libraryStatus?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open && !!exercise} onClose={onClose} size="lg" title={exercise?.name || t('coachEditor.exercise')}>
      {exercise && <ProgrammingForm key={exercise.id} exercise={exercise} onApply={onApply} coachId={coachId} libraryStatus={libraryStatus} />}
    </Sheet>
  );
}

function ProgrammingForm({ exercise, onApply, coachId, libraryStatus }: { exercise: Exercise; onApply: (ex: Exercise) => void; coachId: string; libraryStatus?: ReactNode }) {
  const { t } = useTranslation();
  const [f, setF] = useState<Form>(() => formOf(exercise));
  const set = (patch: Partial<Form>) => setF((cur) => ({ ...cur, ...patch }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const canUpload = useUploadConfigured() && !!coachId;
  const videoInvalid = !!f.video.trim() && !isPlayableVideoUrl(f.video);

  const onPickVideo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file, { category: 'exercise' });
      set({ video: url });
    } catch (e) {
      await alertDialog({ title: t('coachEditor.videoUrl'), message: t(`upload.${e instanceof UploadError ? e.code : 'failed'}`) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const apply = () => {
    if (videoInvalid) return;
    const o = formOf(exercise);
    const next: Exercise = { ...exercise };
    const name = f.name.trim();
    if (name !== o.name.trim()) next.name = name;
    if (f.warmup !== o.warmup) {
      const n = Math.max(0, Math.round(f.warmup ?? 0));
      next.warmupSetCount = n;
      next.warmupSets = String(n);
    }
    if (f.sets !== o.sets) next.workingSets = Math.max(0, Math.round(f.sets ?? 0));
    if (f.reps.trim() !== o.reps.trim()) next.repRange = f.reps.trim();
    if (f.rest !== o.rest) next.restSec = Math.max(0, f.rest ?? 0);
    if (f.rir.trim() !== o.rir.trim()) next.rir = f.rir.trim();
    if (f.tempo.trim() !== o.tempo.trim()) next.tempo = f.tempo.trim();
    // The Arabic notes are kept unless the coach edits them (FD-01 / EX-06).
    const notes = f.notesArTouched ? setLocalized(f.notes, f.notesAr) : applyLocalizedEdit(exercise.notes, f.notes, 'en');
    if (!localizedEqual(notes, exercise.notes ?? { en: '', ar: '' })) next.notes = notes;
    if (f.progression.trim() !== o.progression.trim()) next.progressionNotes = f.progression.trim() || undefined;
    if (f.video.trim() !== o.video.trim()) next.videoUrl = f.video.trim() || null;
    onApply(next);
  };

  return (
    <div className="space-y-4" data-testid="exercise-programming">
      <TextInput label={t('field.name')} data-testid="ex-name" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('coachEditor.exerciseName')} />
      {libraryStatus}

      <div>
        <div className="label mb-1.5">{t('coachEditor.presets')}</div>
        <div className="flex flex-wrap gap-2">
          {EXERCISE_PRESETS.map((p) => (
            <button key={p.key} type="button" className="chip" data-testid={`preset-${p.key}`} onClick={() => set({ warmup: p.warmupSetCount, sets: p.workingSets, reps: p.repRange, rest: p.restSec })}>
              {t(`coachEditor.presetNames.${p.key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumericField label={t('coachEditor.workingSets')} testId="ex-working-sets" integer min={0} max={50} value={f.sets} onChange={(v) => set({ sets: v })} />
        <NumericField label={t('coachEditor.warmupSets')} testId="ex-warmup-sets" integer min={0} max={20} value={f.warmup} onChange={(v) => set({ warmup: v })} />
        <TextInput label={t('coachEditor.reps')} data-testid="ex-reps" value={f.reps} onChange={(e) => set({ reps: e.target.value })} placeholder="8-12" dir="ltr" />
        <NumericField label={t('coachEditor.restSec')} testId="ex-rest" min={0} max={3600} value={f.rest} onChange={(v) => set({ rest: v })} suffix={t('common.secShort')} />
        <TextInput label={t('coachEditor.rir')} data-testid="ex-rir" value={f.rir} onChange={(e) => set({ rir: e.target.value })} placeholder={t('coachEditor.rirPlaceholder')} dir="ltr" />
        <TextInput label={t('coachEditor.tempo')} data-testid="ex-tempo" value={f.tempo} onChange={(e) => set({ tempo: e.target.value })} placeholder={t('coachEditor.tempoPlaceholder')} dir="ltr" />
      </div>
      <p className="text-[12px] text-earth-subtle">{t('coachEditor.setsHint')}</p>

      <TextAreaField label={t('field.notes')} className="min-h-20" data-testid="ex-notes" placeholder={t('coachEditor.instructions')} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      <SecondLanguageField lang="ar" multiline testId="ex-notes-ar" value={f.notesAr} onChange={(v) => set({ notesAr: v, notesArTouched: true })} stale={!f.notesArTouched && secondLanguageStale(exercise.notes, f.notes, 'en')} />
      <TextAreaField label={t('coachEditor.progression')} className="min-h-16" data-testid="ex-progression" value={f.progression} onChange={(e) => set({ progression: e.target.value })} />

      <div>
        <TextInput label={t('field.videoUrl')} data-testid="ex-video" placeholder={t('coachEditor.videoUrl')} value={f.video} onChange={(e) => set({ video: e.target.value })} dir="ltr" />
        {videoInvalid && (
          <p className="mt-1 text-[12px] text-danger" role="alert" data-testid="ex-video-invalid">
            {t('trust.video.coachInvalid')}
          </p>
        )}
        {canUpload && (
          <>
            <button type="button" className="chip mt-1.5 flex items-center gap-1.5" data-testid="ex-video-upload" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Icon name={uploading ? 'rotate' : 'video'} size={14} className={uploading ? 'animate-spin' : ''} />
              {uploading ? t('upload.uploading') : t('coachEditor.uploadVideo')}
            </button>
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => void onPickVideo(e.target.files?.[0])} />
          </>
        )}
      </div>

      <Button data-testid="ex-save" fullWidth disabled={!f.name.trim() || videoInvalid} onClick={apply}>
        {t('coachEditor.applyExercise')}
      </Button>
    </div>
  );
}
