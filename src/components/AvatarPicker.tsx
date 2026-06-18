import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { downscaleImage } from '@/lib/image';
import { isBunnyConfigured, uploadImageToBunny, UploadError } from '@/services/platform/bunnyUploadApi';

/**
 * Avatar with a "change photo" control: downscales + uploads to Bunny CDN and
 * reports the public URL via `onChange`. Reuses the same upload path as the
 * progress-photo picker. Degrades to initials when Bunny isn't configured.
 */
export function AvatarPicker({ name, photoUrl, folder, onChange }: { name?: string; photoUrl?: string; folder: string; onChange: (url?: string) => void }) {
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
      const blob = await downscaleImage(file, 512, 0.85);
      const { url } = await uploadImageToBunny(blob, { folder });
      onChange(url);
    } catch (err) {
      setError(t(`upload.${err instanceof UploadError ? err.code : 'failed'}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} photoUrl={photoUrl} size="lg" rounded="rounded-full" />
      <div className="space-y-1">
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e)} />
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy || !isBunnyConfigured()} className="chip disabled:opacity-40" data-testid="avatar-upload" onClick={() => ref.current?.click()}>
            {busy ? t('upload.uploading') : photoUrl ? t('upload.replace') : t('upload.addPhoto')}
          </button>
          {photoUrl && (
            <button type="button" className="text-danger" aria-label={t('upload.remove')} onClick={() => onChange(undefined)}>
              {t('upload.remove')}
            </button>
          )}
        </div>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        {!isBunnyConfigured() && <p className="text-[12px] text-earth-subtle">{t('upload.notConfigured')}</p>}
      </div>
    </div>
  );
}
