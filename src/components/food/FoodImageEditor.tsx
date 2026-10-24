import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { FoodPhotoError, prepareFoodPhoto, type PreparedFoodPhoto } from '@/lib/foodImageProcess';
import { uploadFoodPhoto, useUploadConfigured, UploadError } from '@/services/platform/mediaApi';
import type { FoodImageRef, LocalizedText } from '@/types';

/**
 * B4.1 — the picture of a coach's food (library food, plan item): add, replace, remove, preview,
 * progress with cancel, a useful error with Retry (the prepared photo is kept, nothing is picked
 * again), and — for a catalog food — "use the Forma photo". An upload is the coach's own copy, in
 * their own folder: it never changes the shared catalog picture, and a replacement is a new file,
 * so plans saved earlier keep the picture they were saved with. The server checks every picture
 * again on save (`api/coach-assets/_lib/foodImage.ts`).
 */
export function FoodImageEditor({
  value,
  onChange,
  formaImage = null,
  name,
  testId = 'food-image',
}: {
  value: FoodImageRef | null;
  onChange: (next: FoodImageRef | null) => void;
  /** The approved Forma picture of the catalog food this row came from, when there is one. */
  formaImage?: FoodImageRef | null;
  /** The food's name — the alt text of a new upload. */
  name: LocalizedText;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const configured = useUploadConfigured();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PreparedFoodPhoto | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [value?.thumbUrl]);
  useEffect(() => () => abort.current?.abort(), []);

  const busy = progress !== null;
  const ar = i18n.language.startsWith('ar');
  const usingForma = value?.source === 'forma-catalog';
  const canUseForma = !!formaImage && !(usingForma && value?.url === formaImage.url);

  const upload = async (photo: PreparedFoodPhoto) => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setPending(photo);
    setProgress(0);
    try {
      const { url, thumbUrl } = await uploadFoodPhoto(photo, { signal: ctrl.signal, onProgress: setProgress });
      setPending(null);
      onChange({ source: 'upload', url, thumbUrl, width: photo.width, height: photo.height, alt: { en: name.en, ar: name.ar || name.en }, rev: (value?.source === 'upload' ? value.rev : 0) + 1, uploadedAt: Date.now() });
    } catch (e) {
      if (e instanceof UploadError && e.code === 'cancelled') {
        setPending(null);
      } else {
        const code = e instanceof UploadError ? e.code : 'failed';
        setError(t(`foodImage.error.${['badType', 'badDimensions', 'tooLarge', 'notConfigured', 'forbidden', 'planLapsed', 'planSuspended', 'noPlan'].includes(code) ? code : 'failed'}`));
        // Only a failure that may pass on a second try keeps the photo for Retry.
        if (!['failed', 'notConfigured'].includes(code)) setPending(null);
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      await upload(await prepareFoodPhoto(file));
    } catch (err) {
      setError(t(`foodImage.error.${err instanceof FoodPhotoError ? err.code : 'unreadable'}`));
    }
  };

  const credit = value?.source === 'forma-catalog' && value.author ? t('foodImage.credit', { author: value.author, license: value.license ?? '' }) : null;
  const show = value && !broken;

  return (
    <div className="space-y-2" data-testid={testId} data-source={value?.source ?? 'none'}>
      <p className="label block">{t('foodImage.title')}</p>
      <div className="flex items-start gap-3">
        <span className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-ui-control border border-line-soft bg-surface-raised">
          {show ? (
            <img src={value.thumbUrl} alt={value.alt ? (ar ? value.alt.ar || value.alt.en : value.alt.en) : ''} className="h-full w-full object-cover" onError={() => setBroken(true)} data-testid={`${testId}-preview`} />
          ) : (
            <Icon name="meal" size={26} className="text-earth-subtle" />
          )}
          {busy && (
            <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30" role="progressbar" aria-label={t('foodImage.uploading')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} data-testid={`${testId}-progress`}>
              <span className="block h-full bg-brand transition-[width]" style={{ width: `${progress ?? 0}%` }} />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(e) => void onFile(e)} data-testid={`${testId}-file`} />
          {busy ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-earth-muted" aria-live="polite">
                {t('foodImage.uploadingPct', { pct: progress ?? 0 })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => abort.current?.abort()} data-testid={`${testId}-cancel`}>
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon="image" disabled={!configured} onClick={() => input.current?.click()} data-testid={`${testId}-pick`}>
                {value ? t('foodImage.replace') : t('foodImage.add')}
              </Button>
              {canUseForma && (
                <Button variant="ghost" size="sm" onClick={() => onChange(formaImage)} data-testid={`${testId}-use-forma`}>
                  {t('foodImage.useForma')}
                </Button>
              )}
              {value && (
                <Button variant="ghost" size="sm" icon="trash" className="text-danger" onClick={() => onChange(null)} data-testid={`${testId}-remove`}>
                  {t('foodImage.remove')}
                </Button>
              )}
            </div>
          )}
          {credit && (
            <p className="text-[11.5px] text-earth-subtle" data-testid={`${testId}-credit`}>
              {credit}
            </p>
          )}
          {!configured ? <p className="text-[12px] text-earth-subtle">{t('foodImage.notConfigured')}</p> : <p className="text-[12px] text-earth-subtle">{t('foodImage.hint')}</p>}
        </div>
      </div>
      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px]" role="alert" data-testid={`${testId}-error`}>
          <span className="min-w-0 flex-1">{error}</span>
          {pending && (
            <Button variant="ghost" size="sm" icon="rotate" onClick={() => void upload(pending)} data-testid={`${testId}-retry`}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
