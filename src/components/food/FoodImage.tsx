import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import type { LocalizedText } from '@/types';

/**
 * B4.1 — a food's picture, wherever food is listed: a fixed box (no layout shift), the light
 * thumbnail in lists and the card image in a serving chooser or detail, lazy-loaded, alt text in the
 * reader's language, and a quiet icon when there is no picture or it fails to load — never another
 * food's picture.
 */
export type FoodImageLike = { thumbUrl: string; url?: string; cardUrl?: string; alt?: LocalizedText | { en: string; ar: string } } | null | undefined;

const SIZES = { xs: 'h-9 w-9', sm: 'h-11 w-11', md: 'h-14 w-14' } as const;

export function FoodThumb({ image, size = 'sm', className = '', testId = 'food-thumb' }: { image: FoodImageLike; size?: keyof typeof SIZES; className?: string; testId?: string }) {
  const { i18n } = useTranslation();
  const [broken, setBroken] = useState(false);
  const alt = image?.alt ? (i18n.language.startsWith('ar') ? image.alt.ar || image.alt.en : image.alt.en) : '';
  const show = image?.thumbUrl && !broken;
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-soft bg-surface-raised ${SIZES[size]} ${className}`} data-testid={testId} data-has-image={show ? 'true' : 'false'}>
      {show ? (
        <img src={image.thumbUrl} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" width={160} height={160} className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <Icon name="meal" size={18} className="text-earth-subtle" />
      )}
    </span>
  );
}

/**
 * The larger picture (serving chooser, food detail): a reserved frame, card variant. `compact` is a
 * fixed-height band, so the picture never pushes a sheet's controls below the fold.
 */
export function FoodCardImage({ image, credit, compact = false, testId = 'food-card-image' }: { image: FoodImageLike; credit?: string | null; compact?: boolean; testId?: string }) {
  const { i18n } = useTranslation();
  const [broken, setBroken] = useState(false);
  const src = image?.cardUrl ?? image?.url;
  if (!image || !src || broken) return null;
  const alt = image.alt ? (i18n.language.startsWith('ar') ? image.alt.ar || image.alt.en : image.alt.en) : '';
  return (
    <figure className="space-y-1" data-testid={testId}>
      <div className={`${compact ? 'h-36 sm:h-44' : 'aspect-[4/3]'} w-full overflow-hidden rounded-ui-control border border-line-soft bg-surface-raised`}>
        <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      </div>
      {credit ? <figcaption className="text-[11.5px] text-earth-subtle">{credit}</figcaption> : null}
    </figure>
  );
}
