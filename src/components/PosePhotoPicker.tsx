import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { downscaleImage } from '@/lib/image';
import { isBunnyConfigured, uploadImageToBunny, UploadError } from '@/services/platform/bunnyUploadApi';

/**
 * Single front/side/back photo picker that downscales + uploads to Bunny CDN and
 * returns the public URL. Mirrors the assessment wizard's uploader; reused by the
 * weekly check-in form.
 */
export function PosePhotoPicker({ pose, folder, url, onChange }: { pose: 'front' | 'side' | 'back'; folder: string; url?: string; onChange: (url?: string) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await downscaleImage(file);
      const { url: uploaded } = await uploadImageToBunny(blob, { folder });
      onChange(uploaded);
    } catch (err) {
      setError(t(`upload.${err instanceof UploadError ? err.code : 'failed'}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{t(`progress.${pose}`)}</span>
        <div className="flex items-center gap-2">
          {url && <img src={url} alt={pose} className="h-12 w-9 rounded object-cover" />}
          <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e)} />
          <button type="button" disabled={busy || !isBunnyConfigured()} className="chip disabled:opacity-40" onClick={() => ref.current?.click()}>
            {busy ? t('upload.uploading') : url ? t('upload.replace') : t('upload.addPhoto')}
          </button>
          {url && (
            <button type="button" className="text-danger" aria-label={t('upload.remove')} onClick={() => onChange(undefined)}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
