import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PhotoPose, ProgressPhoto } from '@/types';
import { usePhotos } from '@/stores/photoStore';
import { Icon } from '@/components/Icon';
import { EntityNotes } from '@/components/EntityNotes';
import { Button } from '@/components/ui/Button';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SegmentedControl } from '@/components/ui/Tabs';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { viewImages } from '@/stores/mediaViewerStore';
import { formatDate } from '@/lib/format';
import { useMediaSrc } from '@/services/platform/mediaDelivery';

const POSES: PhotoPose[] = ['front', 'side', 'back'];

/** Resolves a stored photo blob to an object URL and renders it. */
function PhotoImg({ photo, className, onView }: { photo: ProgressPhoto; className?: string; onView?: (url: string) => void }) {
  const { t } = useTranslation();
  const url = usePhotos((s) => s.url);
  const [stored, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  // MD-02: the uploaded copy through a signed URL when the server signs personal media.
  const src = useMediaSrc(stored);
  useEffect(() => {
    let active = true;
    let made: string | null = null;
    setMissing(false);
    void url(photo).then((u) => {
      if (!active) {
        // Resolved after unmount — revoke right away so the object URL doesn't leak.
        if (u) URL.revokeObjectURL(u);
        return;
      }
      made = u;
      setSrc(u);
      setMissing(u == null);
    });
    return () => {
      active = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [photo, url]);
  // Blob missing locally (e.g. record synced from another device) — neutral placeholder.
  if (missing) {
    return (
      <div className={`flex flex-col items-center justify-center gap-1 bg-surface-raised text-earth-subtle ${className}`}>
        <Icon name="image" size={20} />
        <span className="text-[11px]">{t(`progress.${photo.pose}`)}</span>
      </div>
    );
  }
  if (!src) return <div className={`sk ${className}`} />;
  if (!photo.cdnUrl) {
    // Still only on this device — the coach can't see it yet.
    return (
      <span className="relative block">
        <img src={src} alt={photo.pose} loading="lazy" className={className} onClick={onView ? () => onView(src) : undefined} />
        <span className="absolute bottom-1.5 start-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-warn" data-testid="photo-not-uploaded">
          {t('trust.upload.notUploaded')}
        </span>
      </span>
    );
  }
  return <img src={src} alt={photo.pose} loading="lazy" className={className} onClick={onView ? () => onView(src) : undefined} />;
}

/**
 * Progress › Body › Photos (B2.5). Capture by pose, compare two dates, the
 * dated gallery. Upload honesty is unchanged (B0): only a server-acknowledged
 * upload says "Saved"; a photo still only on this device is marked so.
 * Removing a photo takes it out of the gallery and the coach's view; it does
 * NOT claim the stored file is erased (MD-03 is still open).
 */
export function ProgressPhotosBody() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const photos = usePhotos((s) => s.photos);
  const load = usePhotos((s) => s.load);
  const add = usePhotos((s) => s.add);
  const remove = usePhotos((s) => s.remove);
  const loaded = usePhotos((s) => s.loaded);

  const [pose, setPose] = useState<PhotoPose>('front');
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // Group by date (newest first).
  const byDate = useMemo(() => {
    const map = new Map<string, ProgressPhoto[]>();
    for (const p of photos) {
      const arr = map.get(p.date) ?? [];
      arr.push(p);
      map.set(p.date, arr);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [photos]);

  const dates = byDate.map(([d]) => d);
  const [dateA, setDateA] = useState('');
  const [dateB, setDateB] = useState('');
  useEffect(() => {
    if (dates.length && !dateA) setDateA(dates[dates.length - 1]);
    if (dates.length && !dateB) setDateB(dates[0]);
  }, [dates, dateA, dateB]);

  const photoFor = (date: string, p: PhotoPose) => photos.find((ph) => ph.date === date && ph.pose === p) ?? null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { uploaded } = await add(pose, file);
      // Honest status: only an acknowledged upload is "saved" for the coach.
      if (uploaded) showToast({ title: t('common.saved'), variant: 'success' });
      else showToast({ title: t('trust.upload.localOnlyTitle'), body: t('trust.upload.localOnlyBody'), variant: 'warning' });
    } catch {
      await alertDialog({ title: t('progress.photos'), message: t('common.savedFailed') });
    } finally {
      setBusy(false);
    }
  };

  // Open the picker: camera (`capture`) or the gallery / file chooser.
  const pickPhoto = (useCamera: boolean) => {
    const input = fileRef.current;
    if (!input) return;
    if (useCamera) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  };

  const removePhoto = async (ph: ProgressPhoto) => {
    const ok = await confirmDialog({ title: t('progress.removePhotoTitle'), message: t('progress.removePhotoBody'), confirmLabel: t('progress.removePhoto'), cancelLabel: t('common.cancel'), danger: true });
    if (ok) void remove(ph.id);
  };

  const dateSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="input min-h-ui-hit flex-1 py-1 text-[14px]">
      {dates.map((d) => (
        <option key={d} value={d}>
          {formatDate(d, lang, 'medium')}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      {/* Capture */}
      <div className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
        <SegmentedControl<PhotoPose> className="seg-quiet" label={t('progress.pose')} value={pose} onChange={setPose} options={POSES.map((p) => ({ value: p, label: t(`progress.${p}`) }))} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e)} />
        <p className="mb-3 mt-3 text-[13px] text-earth-muted">{t('progress.photoHint', { pose: t(`progress.${pose}`) })}</p>
        <div className="flex gap-2">
          <Button variant="secondary" icon="image" className="flex-1" disabled={busy} onClick={() => pickPhoto(false)}>
            {t('progress.gallery')}
          </Button>
          <Button variant="secondary" icon="camera" className="flex-1" disabled={busy} onClick={() => pickPhoto(true)}>
            {t('progress.camera')}
          </Button>
        </div>
        {busy && (
          <p className="mt-2 text-center text-[13px] text-earth-muted" role="status">
            {t('upload.uploading')}
          </p>
        )}
      </div>

      {dates.length >= 2 && (
        <Button variant="ghost" icon="columns" className="w-full" aria-pressed={compare} onClick={() => setCompare((v) => !v)}>
          {t('progress.compare')}
        </Button>
      )}

      {/* Compare view */}
      {compare && dates.length >= 2 && (
        <div className="space-y-3 rounded-ui-surface border border-white/[0.07] bg-surface-card p-4" data-testid="photo-compare">
          <div className="flex gap-2">
            {dateSelect(dateA, setDateA, t('progress.compareFrom'))}
            {dateSelect(dateB, setDateB, t('progress.compareTo'))}
          </div>
          {POSES.map((p) => {
            const a = photoFor(dateA, p);
            const b = photoFor(dateB, p);
            if (!a && !b) return null;
            return (
              <div key={p}>
                <p className="mb-1 text-[13px] text-earth-muted">{t(`progress.${p}`)}</p>
                <div className="grid grid-cols-2 gap-2">
                  {a ? <PhotoImg photo={a} className="aspect-[3/4] w-full rounded-ui-control object-cover" onView={(url) => viewImages(url)} /> : <div className="aspect-[3/4] rounded-ui-control bg-surface-raised" />}
                  {b ? <PhotoImg photo={b} className="aspect-[3/4] w-full rounded-ui-control object-cover" onView={(url) => viewImages(url)} /> : <div className="aspect-[3/4] rounded-ui-control bg-surface-raised" />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gallery by date */}
      {byDate.map(([date, items]) => (
        <div key={date}>
          <p className="mb-2 text-[13px] font-medium text-earth-muted">{formatDate(date, lang, 'weekdayShort')}</p>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
            {items.map((ph) => (
              <div key={ph.id} className="relative">
                <PhotoImg photo={ph} className="aspect-[3/4] w-full cursor-zoom-in rounded-ui-control object-cover" onView={(url) => viewImages(url)} />
                <span className="pointer-events-none absolute bottom-1.5 end-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px]">{t(`progress.${ph.pose}`)}</span>
                <div className="absolute end-1 top-1 rounded-full bg-black/55">
                  <ActionMenu
                    size="sm"
                    label={t('progress.photoOptions', { pose: t(`progress.${ph.pose}`) })}
                    items={[{ key: 'remove', label: t('progress.removePhoto'), icon: 'trash', danger: true, onSelect: () => void removePhoto(ph) }]}
                  />
                </div>
              </div>
            ))}
          </div>
          {items.map((ph) => (
            <EntityNotes key={`n-${ph.id}`} screen="photos" date={date} entityType="progress_photo" entityId={ph.id} />
          ))}
        </div>
      ))}

      {byDate.length === 0 && <p className="text-[14px] text-earth-muted">{t('progressPhotos.emptyMessage')}</p>}
    </div>
  );
}
