import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, useQueryScreen } from '@/components/ui/ScreenState';
import { VideoFilePlayer } from '@/components/video/VideoPlayer';
import { ExerciseInstructions, MediaCredits } from '@/components/library/ExerciseInstructions';
import { useTaxonomyLabel } from '@/hooks/useCatalog';
import { getCatalogExercise, type CatalogExercise, type CatalogTaxonomy } from '@/services/platform/catalogApi';

/**
 * B4 — one catalog exercise in full: the demonstration (a browser-safe video, the reviewed images,
 * or an honest "no demonstration yet"), what it trains, and Forma's instructions — with the media
 * credits the licence requires. Used by the plan picker and the Library.
 *
 * B4.1: every approved demonstration of THIS exercise (primary first) can be chosen; one video at a
 * time, loaded only when Play is tapped (poster until then), muted, looping and inline. The
 * instructions stay below, visible while it plays.
 */
export function CatalogExercisePreview({ id, taxonomy, actions }: { id: string; taxonomy: CatalogTaxonomy; actions?: (e: CatalogExercise) => React.ReactNode }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['catalog', 'exercise', id], queryFn: () => getCatalogExercise(id), staleTime: 60 * 60_000 });
  const screen = useQueryScreen(q);
  if (screen.status === 'loading') return <p className="py-6 text-center text-sm text-earth-muted">{t('auth.working')}</p>;
  if (screen.status === 'offline') return <OfflineState message={t('catalog.offline')} onRetry={screen.retry} />;
  if (screen.status === 'error' || !q.data) return <ErrorState message={t('catalog.loadFailed')} onRetry={screen.retry} />;
  return <CatalogExerciseView e={q.data} taxonomy={taxonomy} actions={actions} />;
}

export function CatalogExerciseView({ e, taxonomy, actions }: { e: CatalogExercise; taxonomy: CatalogTaxonomy; actions?: (e: CatalogExercise) => React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const label = useTaxonomyLabel();
  const name = ar ? e.name.ar : e.name.en;
  const videos = e.media.filter((m) => m.kind === 'video');
  const images = e.media.filter((m) => m.kind === 'image');
  const [demo, setDemo] = useState(0);
  const video = videos[Math.min(demo, videos.length - 1)];
  const demoName = (i: number) => {
    const l = videos[i]?.label;
    return l ? (ar ? l.ar : l.en) : t('catalog.demoN', { n: i + 1 });
  };
  const chips = [
    ...e.primaryMuscles.map((m) => label(taxonomy, 'muscles', m)),
    ...e.equipment.map((q) => label(taxonomy, 'equipment', q)),
    label(taxonomy, 'difficulty', e.difficulty),
  ];
  return (
    <article className="space-y-4" data-testid="catalog-exercise-view" data-id={e.id}>
      {video ? (
        <div className="space-y-2" data-testid="catalog-demo" data-demo={video.id}>
          <VideoFilePlayer
            url={video.url}
            poster={video.posterUrl}
            lazy
            muted
            loop
            aspect={video.width && video.height ? video.width / video.height : 16 / 9}
            playLabel={t('catalog.playDemo', { name, demo: demoName(Math.min(demo, videos.length - 1)) })}
            testId="catalog-video"
          />
          {videos.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('catalog.demos')} data-testid="catalog-demo-switch">
              {videos.map((v, i) => (
                <button key={v.id} type="button" className={`chip min-h-ui-hit ${i === demo ? 'chip-on' : ''}`} aria-pressed={i === demo} onClick={() => setDemo(i)} data-testid="catalog-demo-option">
                  {demoName(i)}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : images.length ? (
        <div className={`grid gap-2 ${images.length > 1 ? 'grid-cols-2' : ''}`}>
          {images.map((m) => (
            <img key={m.id} src={m.url} alt={name} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-xl border border-line-soft bg-white object-contain" data-testid="catalog-image" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-raised/60 px-4 py-6 text-center" data-testid="catalog-no-demo">
          <Icon name="dumbbell" size={24} className="text-earth-subtle" />
          <p className="text-sm font-medium">{t('library.demo.none')}</p>
          <p className="max-w-xs text-[12.5px] text-earth-subtle">{t('catalog.noDemoHint')}</p>
        </div>
      )}
      <header className="space-y-2">
        <h2 className="text-[20px] font-semibold leading-tight">
          <bdi>{name}</bdi>
        </h2>
        <p className="text-[12.5px] text-earth-subtle">
          <bdi>{ar ? e.name.en : e.name.ar}</bdi>
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label={t('catalog.trains')}>
          {chips.map((c, i) => (
            <li key={`${c}-${i}`} className="pill">
              {c}
            </li>
          ))}
        </ul>
      </header>
      {actions?.(e)}
      <ExerciseInstructions instructions={e.instructions} />
      <MediaCredits credits={e.media.map((m) => ({ url: m.url, kind: m.kind, author: m.author, license: m.license, sourcePage: m.sourcePage }))} />
      <p className="text-[12px] text-earth-subtle">{t('catalog.writtenBy')}</p>
    </article>
  );
}
