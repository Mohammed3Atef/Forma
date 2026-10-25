import { classifyVideoUrl, type VideoSource } from './videoSource';
import type { Exercise } from '@/types';

/**
 * What a library exercise can honestly show as its demo (B3.7, blueprint §6.6; B0 / CL-20).
 *
 * The Library's rows, filters and detail sheet read this — never `videoUrl` / `imageUrl` directly —
 * so a later catalog (B4: a curated / owned exercise library with its own videos, posters and
 * metadata) only has to change this mapping, not the screens.
 *
 *  - `video`  a link Forma can play (`lib/videoSource`): a YouTube video or an https video file.
 *             A file can still be a codec this device can't decode; the player says so when it
 *             happens (it never pretends).
 *  - `image`  no playable video, but a still image exists.
 *  - `none`   nothing to show → "No demo yet". `brokenLink` = a video link is stored but can't play
 *             in Forma (e.g. a Drive / Vimeo page), so the coach can fix it.
 */
export type ExerciseDemo =
  | { kind: 'video'; source: Exclude<VideoSource, { kind: 'unsupported' }>; image: string | null }
  | { kind: 'image'; url: string; brokenLink: boolean }
  | { kind: 'none'; brokenLink: boolean };

type DemoFields = Pick<Exercise, 'videoUrl' | 'imageUrl' | 'images'>;

function firstImage(ex: DemoFields): string | null {
  const candidates = [ex.imageUrl, ...(ex.images ?? [])];
  for (const c of candidates) {
    const v = c?.trim();
    if (v && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

export function exerciseDemo(ex: DemoFields): ExerciseDemo {
  const source = classifyVideoUrl(ex.videoUrl);
  const image = firstImage(ex);
  if (source && source.kind !== 'unsupported') return { kind: 'video', source, image };
  const brokenLink = source?.kind === 'unsupported';
  return image ? { kind: 'image', url: image, brokenLink } : { kind: 'none', brokenLink };
}

/**
 * Where an exercise's content came from, for the attribution line. Known providers carry their
 * licence; any other provider string is shown by name only (a future catalog adds itself here).
 */
export interface Attribution {
  provider: string;
  name: string;
  license?: string;
  href?: string;
}

const PROVIDERS: Record<string, Omit<Attribution, 'provider'>> = {
  wger: { name: 'wger.de', license: 'CC BY-SA', href: 'https://wger.de' },
};

export function attributionOf(ex: Pick<Exercise, 'sourceProvider'>): Attribution | null {
  const p = (ex.sourceProvider as string | undefined)?.trim();
  if (!p) return null;
  const known = PROVIDERS[p];
  return known ? { provider: p, ...known } : { provider: p, name: p };
}
