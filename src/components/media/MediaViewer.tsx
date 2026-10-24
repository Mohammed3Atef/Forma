import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { VideoFilePlayer, VideoSourcePlayer } from '@/components/video/VideoPlayer';
import { blobStore } from '@/data/blobStore';
import { resolveMedia, type MediaRef } from '@/lib/mediaRef';
import { safeExternalUrl } from '@/lib/videoSource';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useMediaViewer } from '@/stores/mediaViewerStore';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * The one full-screen media viewer (B1.11), mounted once at the app root and
 * opened via `viewImages` / `playVideo` / `viewMedia`. Every item shows an
 * honest state — loading, ready, failed (with Retry), offline, saved on this
 * device but not uploaded yet, or can't be previewed — never a blank or
 * broken frame. Swipe / arrows between items, tap an image to zoom, Esc or
 * the close button to leave.
 */
export function MediaViewer() {
  const { t } = useTranslation();
  const { items, index, close, setIndex } = useMediaViewer();
  const open = items.length > 0;
  const touchX = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // B3.9: the shared trap — Tab stays in the viewer, Escape closes only it (not a sheet beneath).
  useFocusTrap(panelRef, { active: open, onEscape: close });

  useEffect(() => {
    if (!open) return;
    // In RTL the "next" item is to the LEFT (keys and swipes follow reading direction).
    const step = document.documentElement.dir === 'rtl' ? -1 : 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex(index + step);
      else if (e.key === 'ArrowLeft') setIndex(index - step);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, index, close, setIndex]);

  if (!open) return null;
  const item = items[Math.min(index, items.length - 1)];
  const multi = items.length > 1;
  // The legacy test ids stay meaningful: an image set is "the image viewer", a video "the video popup".
  const legacy = item.kind === 'video' ? 'video-popup' : 'image-viewer';

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="fixed inset-0 z-ui-media flex items-center justify-center bg-black/95 px-4 outline-none"
      data-testid={legacy}
      data-media-kind={item.kind}
      role="dialog"
      aria-modal="true"
      aria-label={item.name || t(`media.kind.${item.kind}`)}
      onClick={() => close()}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
        const rtl = document.documentElement.dir === 'rtl';
        if (Math.abs(dx) > 50 && multi) setIndex(index + ((dx < 0) !== rtl ? 1 : -1));
        touchX.current = null;
      }}
    >
      <button
        type="button"
        aria-label={t('imageViewer.close')}
        data-testid={`${legacy}-close`}
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        className="absolute end-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <Icon name="close" size={22} />
      </button>

      <div className="flex max-h-full w-full max-w-2xl items-center justify-center" onClick={(e) => e.stopPropagation()} data-testid="media-viewer">
        <MediaItem key={`${index}:${item.ref}`} item={item} />
      </div>

      {multi && (
        <>
          <button
            type="button"
            aria-label={t('common.previous')}
            onClick={(e) => {
              e.stopPropagation();
              setIndex(index - 1);
            }}
            className="absolute start-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <Icon name="chevronLeft" size={24} />
          </button>
          <button
            type="button"
            aria-label={t('common.next')}
            onClick={(e) => {
              e.stopPropagation();
              setIndex(index + 1);
            }}
            className="absolute end-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <Icon name="chevron" size={24} />
          </button>
          <div className="t-numeric absolute bottom-6 text-xs text-white/70" dir="ltr">
            {index + 1} / {items.length}
          </div>
        </>
      )}
    </div>
  );
}

/** Object URL for a blob saved on this device (revoked when done); `undefined` while reading, `null` if it's gone. */
function useLocalBlobUrl(key: string | null): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!key) return;
    let made: string | null = null;
    let cancelled = false;
    setUrl(undefined);
    void blobStore
      .objectUrl(key)
      .catch(() => null)
      .then((u) => {
        made = u;
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
        } else setUrl(u);
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]);
  return key ? url : null;
}

/** One item, resolved through the media seam. */
export function MediaItem({ item }: { item: MediaRef }) {
  const { t } = useTranslation();
  const resolved = resolveMedia(item);
  const localUrl = useLocalBlobUrl(resolved.status === 'not_uploaded' ? resolved.localKey : null);

  if (resolved.status === 'not_uploaded') {
    if (localUrl === undefined) return <MediaNotice state="loading" text={t('media.loading')} />;
    if (localUrl === null) return <MediaNotice state="failed" text={t('media.missingLocal')} />;
    return (
      <div className="relative w-full" data-testid="media-not-uploaded">
        <MediaBody kind={item.kind} src={localUrl} name={item.name} />
        <p className="mt-3 text-center text-xs text-white/70">{t('media.notUploaded')}</p>
      </div>
    );
  }
  // Remote video keeps the B0-certified honest player (YouTube / file / unsupported link, CL-20).
  if (item.kind === 'video') return <VideoSourcePlayer url={item.ref} title={item.name || t('workout.watchVideo')} autoPlay />;
  if (resolved.status === 'unsupported') {
    const href = safeExternalUrl(item.ref);
    return (
      <MediaNotice state="unsupported" text={t('media.unsupported')}>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full" data-testid="media-open">
            {t('media.open')}
          </a>
        )}
      </MediaNotice>
    );
  }
  if (resolved.kind === 'video') return null; // handled above
  return <MediaBody kind={resolved.kind} src={resolved.src} name={item.name} />;
}

/** A loaded image / audio / file with its runtime states. */
function MediaBody({ kind, src, name }: { kind: MediaRef['kind']; src: string; name?: string }) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(kind === 'file' ? 'ready' : 'loading');
  const [attempt, setAttempt] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  if (kind === 'video') return <VideoFilePlayer url={src} autoPlay />;
  if (kind === 'file') {
    const href = safeExternalUrl(src) ?? (src.startsWith('blob:') ? src : null);
    return (
      <MediaNotice state="unsupported" text={t('media.unsupported')} detail={name}>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" download={name} className="btn-ghost w-full" data-testid="media-open">
            {t('media.open')}
          </a>
        )}
      </MediaNotice>
    );
  }
  if (state === 'failed') {
    return (
      <MediaNotice state={online ? 'failed' : 'offline'} text={online ? t('media.failed') : t('media.offline')}>
        <button type="button" className="btn-ghost w-full" data-testid="media-retry" onClick={() => { setState('loading'); setAttempt((a) => a + 1); }}>
          {t('common.retry')}
        </button>
      </MediaNotice>
    );
  }
  return (
    <div className="relative flex w-full items-center justify-center" data-testid="media-item" data-state={state}>
      {kind === 'image' ? (
        <img
          key={attempt}
          src={src}
          alt={name ?? ''}
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
          onClick={() => setZoomed((z) => !z)}
          className={`max-h-[85vh] max-w-full select-none object-contain transition-transform duration-200 ${zoomed ? 'scale-[1.8]' : 'scale-100'}`}
        />
      ) : (
        <audio key={attempt} src={src} controls className="w-full" onCanPlay={() => setState('ready')} onLoadedData={() => setState('ready')} onError={() => setState('failed')} />
      )}
      {state === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/80" data-testid="media-loading">
          {t('media.loading')}
        </div>
      )}
    </div>
  );
}

function MediaNotice({ state, text, detail, children }: { state: string; text: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm space-y-3 rounded-ui-surface bg-surface-raised p-4 text-center" role={state === 'loading' ? 'status' : 'alert'} data-testid={`media-${state}`}>
      <p className="text-sm text-earth-muted">{text}</p>
      {detail && <p className="truncate text-xs text-earth-subtle">{detail}</p>}
      {children}
    </div>
  );
}
