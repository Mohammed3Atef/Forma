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
 *
 * B4.2: ExerciseDB GIFs are demonstrations too (after the videos): only the chosen one loads — from
 * its original address, when the exercise is opened — and a broken link falls back to its light
 * still, said honestly. ExerciseDB items credit AscendAPI and show their English steps.
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
  const name = ar ? e.name.ar || e.name.en : e.name.en;
  const other = ar ? e.name.en : e.name.ar;
  // Demonstrations: videos first, then GIFs (served in that order); still images only when there is no demonstration.
  const demos = e.media.filter((m) => m.kind === 'video' || m.format === 'gif');
  const images = e.media.filter((m) => m.kind === 'image' && m.format !== 'gif');
  const [demo, setDemo] = useState(0);
  const current = demos[Math.min(demo, demos.length - 1)];
  const demoName = (i: number) => {
    const l = demos[i]?.label;
    return l ? (ar ? l.ar : l.en) : t('catalog.demoN', { n: i + 1 });
  };
  const chips = [
    ...e.primaryMuscles.map((m) => label(taxonomy, 'muscles', m)),
    ...e.equipment.map((q) => label(taxonomy, 'equipment', q)),
    ...(e.difficulty ? [label(taxonomy, 'difficulty', e.difficulty)] : []),
  ];
  return (
    <article className="space-y-4" data-testid="catalog-exercise-view" data-id={e.id}>
      {current ? (
        <div className="space-y-2" data-testid="catalog-demo" data-demo={current.id}>
          {current.kind === 'video' ? (
            <VideoFilePlayer
              url={current.url}
              poster={current.posterUrl}
              lazy
              muted
              loop
              aspect={current.width && current.height ? current.width / current.height : 16 / 9}
              playLabel={t('catalog.playDemo', { name, demo: demoName(Math.min(demo, demos.length - 1)) })}
              testId="catalog-video"
            />
          ) : (
            <DemoGif key={current.id} url={current.url} still={current.thumbUrl} alt={t('catalog.demoOf', { name })} />
          )}
          {demos.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('catalog.demos')} data-testid="catalog-demo-switch">
              {demos.map((v, i) => (
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
        {other && other !== name ? (
          <p className="text-[12.5px] text-earth-subtle">
            <bdi>{other}</bdi>
          </p>
        ) : null}
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
      <p className="text-[12px] text-earth-subtle" data-testid="catalog-text-credit">
        {e.origin === 'exercisedb' ? t('catalog.fromExerciseDb') : t('catalog.writtenBy')}
      </p>
    </article>
  );
}

/**
 * An ExerciseDB GIF: loaded when shown (the exercise was opened), square, on white like the
 * provider's frames. A broken link shows the light still instead and says so — never another
 * exercise's picture, never an empty frame.
 */
function DemoGif({ url, still, alt }: { url: string; still: string | null; alt: string }) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const [stillBroken, setStillBroken] = useState(false);
  return (
    <figure className="mx-auto w-full max-w-xs" data-testid="catalog-gif" data-broken={broken || undefined}>
      <div className="aspect-square w-full overflow-hidden rounded-xl border border-line-soft bg-white">
        {!broken ? (
          <img src={url} alt={alt} decoding="async" className="h-full w-full object-contain" onError={() => setBroken(true)} />
        ) : still && !stillBroken ? (
          <img src={still} alt={alt} className="h-full w-full object-contain" onError={() => setStillBroken(true)} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-earth-subtle">
            <Icon name="dumbbell" size={28} />
          </span>
        )}
      </div>
      {broken && (
        <figcaption className="mt-1 text-center text-[12px] text-earth-subtle" data-testid="catalog-gif-unavailable">
          {t('catalog.demoUnavailable')}
        </figcaption>
      )}
    </figure>
  );
}
