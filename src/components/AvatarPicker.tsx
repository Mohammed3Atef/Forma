import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { AvatarCropper } from '@/components/AvatarCropper';
import { Icon } from '@/components/Icon';
import { downscaleImage } from '@/lib/image';
import { isBunnyConfigured, uploadImageToBunny, UploadError } from '@/services/platform/bunnyUploadApi';

/**
 * Modern avatar editor: a circular photo with a hover/focus camera overlay (no
 * text buttons) and a corner remove badge. Picking a photo opens a square cropper
 * so the user controls exactly what shows, then uploads to the CDN and reports the
 * URL via `onChange`. Degrades to initials when Bunny isn't configured.
 */
export function AvatarPicker({ name, photoUrl, folder, onChange }: { name?: string; photoUrl?: string; folder: string; onChange: (url?: string) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const configured = isBunnyConfigured();

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setCropFile(file);
  };

  const onCropped = async (blob: Blob) => {
    setCropFile(null);
    setBusy(true);
    setError(null);
    try {
      const small = await downscaleImage(blob, 512, 0.85);
      const { url } = await uploadImageToBunny(small, { folder });
      onChange(url);
    } catch (err) {
      setError(t(`upload.${err instanceof UploadError ? err.code : 'failed'}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-16 w-16 shrink-0">
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onPick} />
        {/* The avatar IS the change button — hover/focus reveals a camera overlay. */}
        <button
          type="button"
          data-testid="avatar-upload"
          disabled={busy || !configured}
          onClick={() => ref.current?.click()}
          aria-label={photoUrl ? t('upload.replace') : t('upload.addPhoto')}
          className="group relative block h-16 w-16 overflow-hidden rounded-full disabled:opacity-50"
        >
          <Avatar name={name} photoUrl={photoUrl} size="lg" rounded="rounded-full" className="h-16 w-16" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
            <Icon name={busy ? 'timer' : 'camera'} size={22} />
          </span>
        </button>
        {photoUrl && !busy && (
          <button
            type="button"
            data-testid="avatar-remove"
            aria-label={t('upload.remove')}
            onClick={() => onChange(undefined)}
            className="absolute -bottom-0.5 -end-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-danger text-white transition-transform hover:scale-105 active:scale-95"
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      <div className="min-w-0 text-[12px] leading-relaxed text-earth-muted">
        <p>{t('upload.avatarHint')}</p>
        {error && <p className="text-danger" data-testid="avatar-error">{error}</p>}
        {!configured && <p className="text-earth-subtle">{t('upload.notConfigured')}</p>}
      </div>

      {cropFile && <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onCropped={(b) => void onCropped(b)} />}
    </div>
  );
}
