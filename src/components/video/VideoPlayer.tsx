import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { classifyVideoUrl, safeExternalUrl } from '@/lib/videoSource';

/** No frame after this long = treat as failed instead of a frozen 0:00 player. */
export const VIDEO_STALL_MS = 20_000;

type FileState = 'loading' | 'ready' | 'failed';

/**
 * A direct video file with honest states (B0 / CL-20, MD-07): a loading
 * overlay until the first frame, and — on a decode/network error or a stall —
 * a message with Retry and "Open video" instead of a dead 0:00 player. iPhone
 * HEVC (.mov) recordings that this device can't decode say so (no transcoding
 * in B0).
 */
export function VideoFilePlayer({
  url,
  maybeHevc = false,
  className = '',
  autoPlay = false,
}: {
  url: string;
  maybeHevc?: boolean;
  className?: string;
  autoPlay?: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<FileState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setState('loading');
    setUnsupported(false);
    timer.current = setTimeout(() => setState((s) => (s === 'loading' ? 'failed' : s)), VIDEO_STALL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [url, attempt]);

  const ready = () => {
    if (timer.current) clearTimeout(timer.current);
    setState('ready');
  };
  const fail = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (timer.current) clearTimeout(timer.current);
    // MEDIA_ERR_SRC_NOT_SUPPORTED (4) / DECODE (3): this device can't play this file.
    const code = e.currentTarget.error?.code;
    setUnsupported(code === 3 || code === 4);
    setState('failed');
  };
  const open = safeExternalUrl(url);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (state === 'failed') {
    const msg = offline ? t('trust.video.offline') : unsupported ? (maybeHevc ? t('trust.video.hevc') : t('trust.video.unsupportedFormat')) : t('trust.video.failed');
    return (
      <div className={`space-y-3 rounded-xl bg-surface-raised p-4 text-center ${className}`} role="alert" data-testid="video-failed">
        <p className="text-sm text-earth-muted">{msg}</p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" data-testid="video-retry" onClick={() => setAttempt((a) => a + 1)}>
            {t('common.retry')}
          </button>
          {open && (
            <a href={open} target="_blank" rel="noopener noreferrer" className="btn-ghost flex-1" data-testid="video-open-source">
              {t('trust.video.open')}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl bg-black ${className}`}>
      <video
        key={`${url}#${attempt}`}
        src={url}
        controls={state === 'ready'}
        playsInline
        autoPlay={autoPlay}
        preload="metadata"
        className="max-h-[80vh] w-full"
        onLoadedData={ready}
        onCanPlay={ready}
        onError={fail}
        data-testid="video-element"
      />
      {state === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white" data-testid="video-loading">
          <Icon name="video" size={22} />
          <span className="text-sm">{t('trust.video.loading')}</span>
        </div>
      )}
    </div>
  );
}

/** YouTube embed with a loading overlay until the frame loads. */
function YouTubeEmbed({ embedUrl, title, autoPlay }: { embedUrl: string; title: string; autoPlay?: boolean }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        src={`${embedUrl}?rel=0&playsinline=1${autoPlay ? '&autoplay=1' : ''}`}
        title={title}
        className="h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={() => setLoaded(true)}
        data-testid="video-youtube"
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white" data-testid="video-loading">
          {t('trust.video.loading')}
        </div>
      )}
    </div>
  );
}

/** Plays any coach/library video link honestly — or explains why it can't. */
export function VideoSourcePlayer({ url, title, autoPlay = false }: { url: string; title: string; autoPlay?: boolean }) {
  const { t } = useTranslation();
  const src = classifyVideoUrl(url);
  if (src?.kind === 'youtube') return <YouTubeEmbed embedUrl={src.embedUrl} title={title} autoPlay={autoPlay} />;
  if (src?.kind === 'file') return <VideoFilePlayer url={src.url} maybeHevc={src.maybeHevc} autoPlay={autoPlay} />;
  const open = safeExternalUrl(url);
  return (
    <div className="space-y-3 rounded-xl bg-surface-raised p-4 text-center" role="alert" data-testid="video-unsupported">
      <p className="text-sm text-earth-muted">{t('trust.video.unsupportedLink')}</p>
      {open && (
        <a href={open} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full" data-testid="video-open-source">
          {t('trust.video.openLink')}
        </a>
      )}
    </div>
  );
}
