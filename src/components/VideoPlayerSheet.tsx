import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoAsset } from '@/types';
import { Sheet } from './Sheet';
import { useVideos } from '@/stores/videoStore';
import { youtubeEmbed } from '@/services/video/VideoStore';

interface VideoPlayerSheetProps {
  asset: VideoAsset | null;
  title: string;
  onClose: () => void;
}

/** Plays a video offline when downloaded, embeds YouTube online, else shows fallback. */
export function VideoPlayerSheet({ asset, title, onClose }: VideoPlayerSheetProps) {
  const { t } = useTranslation();
  const playableUrl = useVideos((s) => s.playableUrl);
  const download = useVideos((s) => s.download);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const triesRef = useRef(0);
  // Every blob URL created for the current video — all revoked together on
  // close / switching video, including ones re-resolved after a playback error.
  const madeRef = useRef<string[]>([]);

  // Resolve the playable URL ONCE per video (keyed by id) so timer-driven
  // re-renders never revoke the blob URL mid-playback.
  const assetId = asset?.id;
  useEffect(() => {
    if (!asset) {
      setUrl(null);
      return;
    }
    let active = true;
    setFailed(false);
    triesRef.current = 0;
    void playableUrl(asset).then((u) => {
      if (!active) return;
      setUrl(u);
      if (u && u.startsWith('blob:')) madeRef.current.push(u);
    });
    // Auto-save a local file to IndexedDB on first online play so it plays
    // offline afterwards (gym = no internet).
    if (asset.kind === 'file' && asset.status === 'not-downloaded' && navigator.onLine) {
      void download(asset.id);
    }
    return () => {
      active = false;
      madeRef.current.forEach((u) => URL.revokeObjectURL(u)); // only on close / switching video
      madeRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  // If playback errors (e.g. a stale/revoked blob URL), re-resolve once before
  // showing a message — handles transient blob issues without losing the video.
  const handleVideoError = async () => {
    if (asset && triesRef.current < 1) {
      triesRef.current += 1;
      const u = await playableUrl(asset);
      if (u) {
        if (u.startsWith('blob:')) madeRef.current.push(u);
        setUrl(u);
        return;
      }
    }
    setFailed(true);
  };

  if (!asset) return null;

  const embed = asset.sourceUrl ? youtubeEmbed(asset.sourceUrl) : null;
  const isFilePlayable = asset.status === 'downloaded' || asset.kind === 'file';

  return (
    <Sheet open={!!asset} onClose={onClose} title={title}>
      {asset.status === 'link-pending' || !asset.sourceUrl ? (
        <p className="rounded-xl bg-surface-raised/60 p-3 text-sm text-slate-300">{t('video.fallback')}</p>
      ) : embed && asset.status !== 'downloaded' ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl">
          <iframe
            className="h-full w-full"
            src={embed}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : isFilePlayable && url && !failed ? (
        <video
          src={url}
          controls
          playsInline
          autoPlay
          className="w-full rounded-xl"
          onError={() => void handleVideoError()}
        />
      ) : failed ? (
        <p className="rounded-xl bg-surface-raised/60 p-3 text-sm text-slate-300">
          {navigator.onLine ? t('video.missingFile') : t('video.offlineNeedsDownload')}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="rounded-xl bg-surface-raised/60 p-3 text-sm text-slate-300">{t('video.fallback')}</p>
          {asset.sourceUrl && (
            <a href={asset.sourceUrl} target="_blank" rel="noreferrer" className="btn-primary w-full">
              {t('video.openOnline')}
            </a>
          )}
        </div>
      )}
    </Sheet>
  );
}
