import { useState } from 'react';
import { Icon } from '@/components/Icon';
import type { Exercise } from '@/types';

/**
 * B4.2 — an exercise's picture in a list: the light still (`thumbUrl`, e.g. an ExerciseDB GIF's
 * WebP), else a still `imageUrl` — never an animated GIF in a list (those load only on the exercise
 * page). Fixed box, lazy, a quiet icon when there is none or it fails to load.
 */
export function ExerciseThumb({ ex, size = 'sm', className = '' }: { ex: Pick<Exercise, 'thumbUrl' | 'imageUrl'>; size?: 'sm' | 'md'; className?: string }) {
  const [broken, setBroken] = useState(false);
  const still = ex.thumbUrl || (ex.imageUrl && !/\.gif(\?|$)/i.test(ex.imageUrl) ? ex.imageUrl : null);
  const box = size === 'md' ? 'h-12 w-12' : 'h-9 w-9';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-soft ${still && !broken ? 'bg-white' : 'bg-surface-raised'} ${box} ${className}`} data-testid="exercise-thumb" data-has-image={still && !broken ? 'true' : 'false'}>
      {still && !broken ? <img src={still} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={() => setBroken(true)} /> : <Icon name="dumbbell" size={16} className="text-earth-subtle" />}
    </span>
  );
}
