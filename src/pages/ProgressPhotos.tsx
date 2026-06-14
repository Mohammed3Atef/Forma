import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PhotoPose, ProgressPhoto } from '@/types';
import { useNavigate } from 'react-router-dom';
import { usePhotos } from '@/stores/photoStore';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';

const POSES: PhotoPose[] = ['front', 'side', 'back'];

/** Resolves a stored photo blob to an object URL and renders it. */
function PhotoImg({ photo, className }: { photo: ProgressPhoto; className?: string }) {
  const { t } = useTranslation();
  const url = usePhotos((s) => s.url);
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
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
      <div className={`flex flex-col items-center justify-center gap-1 bg-surface-raised text-slate-500 ${className}`}>
        <Icon name="image" size={20} />
        <span className="text-[10px]">{t(`progress.${photo.pose}`)}</span>
      </div>
    );
  }
  if (!src) return <div className={`animate-pulse bg-surface-raised ${className}`} />;
  return <img src={src} alt={photo.pose} className={className} />;
}

export function ProgressPhotos() {
  const { t } = useTranslation();
  const photos = usePhotos((s) => s.photos);
  const load = usePhotos((s) => s.load);
  const add = usePhotos((s) => s.add);
  const remove = usePhotos((s) => s.remove);
  const loaded = usePhotos((s) => s.loaded);

  const navigate = useNavigate();
  const [pose, setPose] = useState<PhotoPose>('front');
  const [compare, setCompare] = useState(false);
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

  const photoFor = (date: string, p: PhotoPose) =>
    photos.find((ph) => ph.date === date && ph.pose === p) ?? null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await add(pose, file);
    e.target.value = '';
  };

  // Open the picker: camera (`capture`) or the gallery / file chooser.
  const pickPhoto = (useCamera: boolean) => {
    const input = fileRef.current;
    if (!input) return;
    if (useCamera) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  };

  return (
    <div className="anim-rise space-y-4">
      <TopBar title={t('progress.photos')} eyebrow={t('gt.body')} onBack={() => navigate('/progress')} />

      {/* Capture */}
      <div className="card">
        <div className="mb-3 flex gap-1.5">
          {POSES.map((p) => (
            <button key={p} type="button" onClick={() => setPose(p)} className={`flex-1 py-2 ${pose === p ? 'chip chip-on' : 'chip'}`}>
              {t(`progress.${p}`)}
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e)} />
        <p className="mb-2 text-xs text-slate-400">
          {t('progress.addPhoto')} — {t(`progress.${pose}`)}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => pickPhoto(false)} className="btn-primary btn-lg flex-1">
            <Icon name="image" size={18} /> {t('progress.gallery')}
          </button>
          <button type="button" onClick={() => pickPhoto(true)} className="btn-ghost btn-lg flex-1">
            <Icon name="camera" size={18} /> {t('progress.camera')}
          </button>
        </div>
      </div>

      <button type="button" onClick={() => setCompare((v) => !v)} className="btn-ghost w-full" disabled={dates.length < 2}>
        <Icon name="chart" size={18} /> {t('progress.compare')}
      </button>

      {/* Compare view */}
      {compare && dates.length >= 2 && (
        <div className="card space-y-3">
          <div className="flex gap-2">
            <select value={dateA} onChange={(e) => setDateA(e.target.value)} className="input h-10 flex-1 py-1 text-sm">
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={dateB} onChange={(e) => setDateB(e.target.value)} className="input h-10 flex-1 py-1 text-sm">
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {POSES.map((p) => {
            const a = photoFor(dateA, p);
            const b = photoFor(dateB, p);
            if (!a && !b) return null;
            return (
              <div key={p}>
                <p className="mb-1 text-xs uppercase text-slate-400">{t(`progress.${p}`)}</p>
                <div className="grid grid-cols-2 gap-2">
                  {a ? <PhotoImg photo={a} className="aspect-[3/4] w-full rounded-xl object-cover" /> : <div className="aspect-[3/4] rounded-xl bg-surface-raised" />}
                  {b ? <PhotoImg photo={b} className="aspect-[3/4] w-full rounded-xl object-cover" /> : <div className="aspect-[3/4] rounded-xl bg-surface-raised" />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gallery by date */}
      {byDate.map(([date, items]) => (
        <div key={date} className="card">
          <h2 className="mb-2 font-bold">{date}</h2>
          <div className="grid grid-cols-3 gap-2">
            {items.map((ph) => (
              <div key={ph.id} className="relative">
                <PhotoImg photo={ph} className="aspect-[3/4] w-full rounded-xl object-cover" />
                <span className="absolute bottom-1 start-1 rounded bg-black/60 px-1 text-[10px]">{t(`progress.${ph.pose}`)}</span>
                <button type="button" onClick={() => void remove(ph.id)} className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-danger">
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {byDate.length === 0 && <p className="text-sm text-slate-500">{t('progress.noData')}</p>}
    </div>
  );
}
