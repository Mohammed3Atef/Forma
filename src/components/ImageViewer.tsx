import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useImageViewer } from '@/stores/imageViewerStore';

/**
 * Full-screen image viewer mounted once at the app root. Opened via
 * `useImageViewer`/`viewImages`. Swipe or arrow between photos, tap to toggle
 * zoom, Esc / button to close. Mobile-first; sits above everything (z-[70]).
 */
export function ImageViewer() {
  const { t } = useTranslation();
  const { open, photos, index, close, setIndex } = useImageViewer();
  const [zoomed, setZoomed] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    setZoomed(false);
  }, [index, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') setIndex(index + 1);
      else if (e.key === 'ArrowLeft') setIndex(index - 1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, index, close, setIndex]);

  if (!open || photos.length === 0) return null;
  const multi = photos.length > 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95"
      data-testid="image-viewer"
      onClick={() => close()}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
        if (Math.abs(dx) > 50 && multi) setIndex(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <button
        type="button"
        aria-label={t('imageViewer.close')}
        data-testid="image-viewer-close"
        onClick={(e) => { e.stopPropagation(); close(); }}
        className="absolute end-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <Icon name="close" size={22} />
      </button>

      <img
        src={photos[index]}
        alt=""
        onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}
        className={`max-h-full max-w-full select-none object-contain transition-transform duration-200 ${zoomed ? 'scale-[1.8]' : 'scale-100'}`}
      />

      {multi && (
        <>
          <button type="button" aria-label={t('common.previous')} onClick={(e) => { e.stopPropagation(); setIndex(index - 1); }} className="absolute start-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
            <Icon name="chevronLeft" size={24} />
          </button>
          <button type="button" aria-label={t('common.next')} onClick={(e) => { e.stopPropagation(); setIndex(index + 1); }} className="absolute end-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
            <Icon name="chevron" size={24} />
          </button>
          <div className="absolute bottom-6 font-mono text-xs text-white/70">{index + 1} / {photos.length}</div>
        </>
      )}
    </div>
  );
}
