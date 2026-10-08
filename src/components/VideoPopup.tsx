import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useVideoPopup } from '@/stores/videoPopupStore';
import { VideoSourcePlayer } from '@/components/video/VideoPlayer';

/**
 * In-app video player popup, mounted once at the app root. Opened via
 * `playVideo(url)`. Embeds YouTube (incl. Shorts / youtu.be) inline, or plays a
 * direct file URL — instead of window.open, which sends a standalone PWA out to
 * an external browser. Tap the backdrop / Esc / button to close. Sits on top
 * (z-[70]).
 */
export function VideoPopup() {
  const { t } = useTranslation();
  const { url, close } = useVideoPopup();

  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [url, close]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 px-4"
      data-testid="video-popup"
      onClick={() => close()}
    >
      <button
        type="button"
        aria-label={t('imageViewer.close')}
        data-testid="video-popup-close"
        onClick={(e) => { e.stopPropagation(); close(); }}
        className="absolute end-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <Icon name="close" size={22} />
      </button>

      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Loading, unsupported link and failed playback are all explicit (B0 / CL-20). */}
        <VideoSourcePlayer url={url} title={t('workout.watchVideo')} autoPlay />
      </div>
    </div>
  );
}
