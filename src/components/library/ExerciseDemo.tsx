import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { VideoSourcePlayer } from '@/components/video/VideoPlayer';
import type { Attribution, ExerciseDemo } from '@/lib/libraryMedia';

/**
 * How the Library shows an exercise's demo (B3.7; B0 honesty). Presentation only — what counts as
 * a demo is `lib/libraryMedia`, so a future catalog with its own media changes the mapping, not
 * these components.
 */

/** The detail sheet's demo: the player, the image, or a placeholder that says what is missing. */
export function DemoBlock({ demo, title, videoUrl }: { demo: ExerciseDemo; title: string; videoUrl?: string | null }) {
  const { t } = useTranslation();
  if (demo.kind === 'video') return <VideoSourcePlayer url={videoUrl || (demo.source.kind === 'youtube' ? demo.source.openUrl : demo.source.url)} title={title} />;
  // A stored link that can't play is explained by the player itself (with "Open link").
  const broken = demo.brokenLink && videoUrl ? <VideoSourcePlayer url={videoUrl} title={title} /> : null;
  if (demo.kind === 'image') {
    return (
      <div className="space-y-3">
        <img src={demo.url} alt={title} loading="lazy" decoding="async" className="h-44 w-full rounded-xl border border-line-soft bg-surface-raised object-cover" data-testid="demo-image-view" />
        {broken}
      </div>
    );
  }
  return (
    broken ?? (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-raised/60 px-4 py-6 text-center" data-testid="demo-placeholder">
        <Icon name="dumbbell" size={24} className="text-earth-subtle" />
        <p className="text-sm font-medium">{t('library.demo.none')}</p>
        <p className="max-w-xs text-[12.5px] text-earth-subtle">{t('library.demo.noneHint')}</p>
      </div>
    )
  );
}

/** "Source: wger.de · CC BY-SA" — only when the item says where it came from. */
export function AttributionLine({ attribution, className = '' }: { attribution: Attribution | null; className?: string }) {
  const { t } = useTranslation();
  if (!attribution) return null;
  const text = [attribution.name, attribution.license].filter(Boolean).join(' · ');
  return (
    <p className={`text-[12px] text-earth-subtle ${className}`} data-testid="attribution">
      {t('library.source')}{' '}
      {attribution.href ? (
        <a href={attribution.href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          <bdi>{text}</bdi>
        </a>
      ) : (
        <bdi>{text}</bdi>
      )}
    </p>
  );
}
