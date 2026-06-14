import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVideos } from '@/stores/videoStore';
import { useWorkout } from '@/stores/workoutStore';
import { TopBar } from '@/components/TopBar';
import { parseVideoLinks, normaliseName, type VideoLinkRow } from '@/services/sheetParser';

interface Match {
  row: VideoLinkRow;
  assetId: string | null;
  exerciseName: string | null;
}

export function ImportData() {
  const { t } = useTranslation();
  const assets = useVideos((s) => s.assets);
  const setUrl = useVideos((s) => s.setUrl);
  const plan = useWorkout((s) => s.plan);

  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [done, setDone] = useState(0);

  const { matches, error } = useMemo<{ matches: Match[]; error: string | null }>(() => {
    if (!text.trim()) return { matches: [], error: null };
    try {
      const rows = parseVideoLinks(text);
      const result = rows.map((row) => {
        // Match priority: videoId -> exerciseId -> fuzzy name.
        let asset = row.videoId ? assets.find((a) => a.id === row.videoId) : undefined;
        if (!asset && row.exerciseId) asset = assets.find((a) => a.exerciseId === row.exerciseId);
        if (!asset && row.name && plan) {
          const target = normaliseName(row.name);
          const ex = Object.values(plan.exercises).find((e) => normaliseName(e.name) === target)
            ?? Object.values(plan.exercises).find((e) => normaliseName(e.name).includes(target) || target.includes(normaliseName(e.name)));
          if (ex) asset = assets.find((a) => a.exerciseId === ex.id);
        }
        return {
          row,
          assetId: asset?.id ?? null,
          exerciseName: asset ? plan?.exercises[asset.exerciseId]?.name ?? null : null,
        };
      });
      return { matches: result, error: null };
    } catch {
      return { matches: [], error: t('import.invalid') };
    }
  }, [text, assets, plan, t]);

  const matched = matches.filter((m) => m.assetId);

  const apply = async () => {
    let n = 0;
    for (const m of matched) {
      if (m.assetId) {
        await setUrl(m.assetId, m.row.url);
        n += 1;
      }
    }
    setDone(n);
    setText('');
  };

  return (
    <div className="anim-rise space-y-4">
      <TopBar title={t('import.title')} eyebrow={t('settings.data')} onBack={() => navigate('/settings')} />
      <p className="text-sm text-earth-muted">{t('import.help')}</p>

      <textarea
        className="input h-40 font-mono text-xs"
        placeholder='[{ "name": "incline db press", "url": "https://.../video.mp4" }]'
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(0); }}
      />

      {error && <p className="text-sm text-danger">{error}</p>}
      {done > 0 && <p className="text-sm text-brand">{t('import.success')} ({done})</p>}

      {matches.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t('import.preview')} — {matched.length}/{matches.length}</h2>
          <ul className="space-y-1 text-sm">
            {matches.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">{m.row.name ?? m.row.exerciseId ?? m.row.videoId}</span>
                <span className={m.assetId ? 'text-brand' : 'text-danger'}>
                  {m.exerciseName ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={() => void apply()} disabled={matched.length === 0} className="btn-primary w-full disabled:opacity-40">
        {t('import.apply')} ({matched.length})
      </button>
    </div>
  );
}
