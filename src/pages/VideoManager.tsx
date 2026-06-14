import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { VideoAsset, VideoStatus } from '@/types';
import { useVideos } from '@/stores/videoStore';
import { useWorkout } from '@/stores/workoutStore';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { VideoPlayerSheet } from '@/components/VideoPlayerSheet';

const STATUS_LABEL: Record<VideoStatus, string> = {
  'link-pending': 'video.linkPending',
  'not-downloaded': 'video.notDownloaded',
  downloading: 'video.downloading',
  downloaded: 'video.downloaded',
  failed: 'video.failed',
};

const STATUS_COLOR: Record<VideoStatus, string> = {
  'link-pending': 'bg-slate-600',
  'not-downloaded': 'bg-surface-raised',
  downloading: 'bg-accent/30 text-accent',
  downloaded: 'bg-brand/20 text-brand',
  failed: 'bg-danger/20 text-danger',
};

export function VideoManager() {
  const { t } = useTranslation();
  const assets = useVideos((s) => s.assets);
  const progress = useVideos((s) => s.progress);
  const download = useVideos((s) => s.download);
  const downloadAll = useVideos((s) => s.downloadAll);
  const downloadingAll = useVideos((s) => s.downloadingAll);
  const remove = useVideos((s) => s.remove);
  const setUrl = useVideos((s) => s.setUrl);
  const plan = useWorkout((s) => s.plan);
  const navigate = useNavigate();

  const downloadable = assets.filter((a) => a.kind === 'file');
  const downloadedCount = assets.filter((a) => a.status === 'downloaded').length;

  const [editing, setEditing] = useState<VideoAsset | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [playing, setPlaying] = useState<VideoAsset | null>(null);

  const nameFor = (a: VideoAsset) => plan?.exercises[a.exerciseId]?.name ?? a.title;

  const saveUrl = async () => {
    if (editing && urlInput.trim()) await setUrl(editing.id, urlInput.trim());
    setEditing(null);
    setUrlInput('');
  };

  return (
    <div className="anim-rise space-y-3">
      <TopBar title={t('video.title')} eyebrow={t('settings.videos')} onBack={() => navigate('/settings')} />

      {downloadable.length > 0 && (
        <div className="card flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t('video.offlineSaved', { done: downloadedCount, total: downloadable.length })}</p>
            <p className="text-xs text-slate-400">{t('video.offlineHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => void downloadAll()}
            disabled={downloadingAll || downloadedCount === downloadable.length}
            className="btn-primary h-11 shrink-0 px-4 text-sm disabled:opacity-50"
          >
            <Icon name="download" size={18} />
            {downloadingAll ? t('video.downloading') : t('video.downloadAll')}
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {assets.map((a) => (
          <li key={a.id} className="card flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{nameFor(a)}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] ${STATUS_COLOR[a.status]}`}>
                {t(STATUS_LABEL[a.status])}
                {a.status === 'downloading' && progress[a.id] != null ? ` ${progress[a.id]}%` : ''}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setPlaying(a)} className="icon-btn h-9 w-9" aria-label="play">
                <Icon name="play" size={16} />
              </button>
              <button
                type="button"
                onClick={() => { setEditing(a); setUrlInput(a.sourceUrl ?? ''); }}
                className="icon-btn h-9 w-9"
                aria-label={t('video.setUrl')}
              >
                <Icon name="edit" size={16} />
              </button>
              {a.status === 'downloaded' ? (
                <button type="button" onClick={() => void remove(a.id)} className="icon-btn h-9 w-9 text-danger" aria-label={t('video.remove')}>
                  <Icon name="close" size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void download(a.id)}
                  disabled={a.kind !== 'file' || a.status === 'downloading'}
                  className="icon-btn h-9 w-9"
                  aria-label={t('video.download')}
                >
                  <Icon name="download" size={16} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('video.setUrl')}>
        <div className="space-y-3">
          <input className="input" placeholder="https://…/video.mp4" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
          <p className="text-xs text-slate-500">{t('video.fallback')}</p>
          <button type="button" onClick={() => void saveUrl()} className="btn-primary w-full">{t('common.save')}</button>
        </div>
      </Sheet>

      <VideoPlayerSheet asset={playing} title={playing ? nameFor(playing) : ''} onClose={() => setPlaying(null)} />
    </div>
  );
}
